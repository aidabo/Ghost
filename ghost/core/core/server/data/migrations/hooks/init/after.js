// Runs after every migrations/init/* task, so tables and fixtures exist.
//
// Why this lives here and not in migrations/versions:
// knex-migrator's init() only *runs* migrations/init/* (1-create-tables.js builds
// the tables from schema.js, 2-create-fixtures.js inserts fixtures.json). It then
// INSERTs every versions/** filename into the `migrations` table WITHOUT running
// them. So anything that exists only in a versions/ migration is missing on a
// fresh database, and nothing complains — production was built up by applying
// migrations in order and never noticed. Tenant automation creates a fresh
// database every time, so it hit this immediately.
//
// Why not in schema.js:
// schema.js covers tables, plain indexes (@@INDEXES@@) and composite UNIQUE
// constraints (@@UNIQUE_CONSTRAINTS@@), but it cannot express:
//   - FULLTEXT at all, and
//   - an explicit index name — commands.js does a bare `t.index(columns)`, so
//     knex auto-generates `<table>_<cols joined by _>_index`. For the estate
//     composites that name is 68-76 characters, and MySQL caps identifiers at
//     64, so CREATE TABLE would fail with ER_TOO_LONG_IDENT.
// Using the migrations' own short names here also keeps a fresh database
// identical to a migrated one, which is what the tenant verification diffs.
//
// Why a hook and not migrations/init/3-*.js:
// knex-migrator never sorts the files it lists (utils.listFiles is a bare
// fs.readdirSync), so a 3-*.js could run before 1-create-tables.js and silently
// skip via its own guard. Adding a file there would also raise the init-task
// count in the integrity check, forcing init() to re-run on every existing
// database. Hooks are ordered and are not counted.
//
// Mirrors, and must stay in sync with:
//   versions/5.116/2026-06-12-00-00-01-add-estate-search-performance-indexes.js
//   versions/5.116/2026-07-22-00-00-00-add-estate-search-featured-flag.cjs
//   versions/5.116/2026-07-26-00-00-01-add-post-search-index-fulltext.js

// FULLTEXT(ngram) indexes for CJK keyword search:
// - idx_psi_ft_search: the combined `search_text` blob for "search everything".
// - one per field so callers can restrict a search to a single field via
//   MATCH(<col>) AGAINST(...) — each MATCH column set needs its own index.
// ngram_token_size stays at the MySQL server default (2); no server config here.
const INDEXES = [
    {table: 'estate_property_search_index', name: 'idx_esi_price_area', columns: ['price_search_num', 'floor_area_sqm_num']},
    {table: 'estate_property_search_index', name: 'idx_esi_rent_area', columns: ['price_rent_monthly_num', 'floor_area_sqm_num']},
    {table: 'estate_property_search_index', name: 'idx_esi_area_price', columns: ['floor_area_sqm_num', 'price_search_num']},
    {table: 'estate_property_search_index', name: 'idx_esi_age_price', columns: ['building_age_num', 'price_search_num']},
    {table: 'estate_property_search_index', name: 'idx_esi_featured_status_type', columns: ['featured', 'status', 'property_type']},
    {table: 'estate_property_station_index', name: 'idx_esti_line_station_walk', columns: ['railway_line', 'station_name', 'walk_minutes']},
    {table: 'estate_property_station_index', name: 'idx_esti_walk_property', columns: ['walk_minutes', 'property_id']},
    {table: 'post_search_index', name: 'idx_psi_ft_search', columns: ['search_text'], type: 'fulltext'},
    {table: 'post_search_index', name: 'idx_psi_ft_title', columns: ['title_text'], type: 'fulltext'},
    {table: 'post_search_index', name: 'idx_psi_ft_excerpt', columns: ['excerpt_text'], type: 'fulltext'},
    {table: 'post_search_index', name: 'idx_psi_ft_tag', columns: ['tag_text'], type: 'fulltext'},
    {table: 'post_search_index', name: 'idx_psi_ft_author', columns: ['author_text'], type: 'fulltext'}
];

function quoteId(value) {
    return `\`${String(value).replace(/`/g, '``')}\``;
}

async function indexExists(knex, table, name) {
    const result = await knex.raw(
        'SELECT COUNT(*) AS total FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?',
        [table, name]
    );
    const rows = Array.isArray(result) ? result[0] : result?.rows;
    return Number(rows?.[0]?.total || 0) > 0;
}

// A missing table or column means the schema is not what we expect; skip rather
// than abort boot. A failing ALTER is a real error and is left to propagate —
// silently booting without the index is the exact bug this hook exists to fix.
async function hasColumns(knex, table, columns) {
    for (const column of columns) {
        if (!await knex.schema.hasColumn(table, column)) {
            return false;
        }
    }
    return true;
}

module.exports = async function after(options = {}) {
    const knex = options.connection;

    if (!knex || typeof knex.raw !== 'function') {
        return;
    }

    for (const index of INDEXES) {
        if (!await knex.schema.hasTable(index.table)) {
            continue;
        }

        // Matched by name, which is also how the mirrored migrations guard, so a
        // database that already ran them is left untouched.
        if (await indexExists(knex, index.table, index.name)) {
            continue;
        }

        if (!await hasColumns(knex, index.table, index.columns)) {
            // eslint-disable-next-line no-console
            console.warn(`[ghost] skipping index ${index.name}: ${index.table} is missing one of (${index.columns.join(', ')})`);
            continue;
        }

        const columns = index.columns.map(column => quoteId(column)).join(', ');
        const table = quoteId(index.table);
        const name = quoteId(index.name);

        if (index.type === 'fulltext') {
            await knex.raw(`ALTER TABLE ${table} ADD FULLTEXT INDEX ${name} (${columns}) WITH PARSER ngram`);
        } else {
            await knex.raw(`ALTER TABLE ${table} ADD INDEX ${name} (${columns})`);
        }
    }
};
