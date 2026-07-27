const {createNonTransactionalMigration} = require('../../utils');

// FULLTEXT(ngram) indexes on post_search_index for CJK keyword search.
// - idx_psi_ft_search: the combined `search_text` blob (title+excerpt+tags+author+
//   body) for "search everything".
// - one per field (title/excerpt/tag/author) so callers can restrict a search to a
//   single field via `MATCH(<col>) AGAINST(...)` (each MATCH column set needs its
//   own FULLTEXT index).
// ngram_token_size stays at the server default (2) — this migration adds no server
// config. Mirrors the estate raw-index migration's guarded ALTER pattern.
const TABLE = 'post_search_index';

const FT_INDEXES = [
    {name: 'idx_psi_ft_search', columns: ['search_text']},
    {name: 'idx_psi_ft_title', columns: ['title_text']},
    {name: 'idx_psi_ft_excerpt', columns: ['excerpt_text']},
    {name: 'idx_psi_ft_tag', columns: ['tag_text']},
    {name: 'idx_psi_ft_author', columns: ['author_text']}
];

async function tableExists(knex, table) {
    return knex.schema.hasTable(table);
}

async function indexExists(knex, table, name) {
    const result = await knex.raw(
        'SELECT COUNT(*) AS total FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?',
        [table, name]
    );
    const rows = Array.isArray(result) ? result[0] : result?.rows;
    return Number(rows?.[0]?.total || 0) > 0;
}

function quoteId(value) {
    return `\`${String(value).replace(/`/g, '``')}\``;
}

async function addFulltextIfMissing(knex, index) {
    if (!await tableExists(knex, TABLE)) {
        return;
    }
    if (await indexExists(knex, TABLE, index.name)) {
        return;
    }
    const columns = index.columns.map(column => quoteId(column)).join(', ');
    await knex.raw(
        `ALTER TABLE ${quoteId(TABLE)} ADD FULLTEXT INDEX ${quoteId(index.name)} (${columns}) WITH PARSER ngram`
    );
}

async function dropIndexIfExists(knex, index) {
    if (!await tableExists(knex, TABLE)) {
        return;
    }
    if (!await indexExists(knex, TABLE, index.name)) {
        return;
    }
    await knex.raw(`ALTER TABLE ${quoteId(TABLE)} DROP INDEX ${quoteId(index.name)}`);
}

module.exports = createNonTransactionalMigration(
    async function up(knex) {
        for (const index of FT_INDEXES) {
            await addFulltextIfMissing(knex, index);
        }
    },
    async function down(knex) {
        for (const index of [...FT_INDEXES].reverse()) {
            await dropIndexIfExists(knex, index);
        }
    }
);
