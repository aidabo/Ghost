const {createNonTransactionalMigration} = require('../../utils');

const INDEXES = [
    {
        table: 'estate_property_search_index',
        name: 'idx_esi_price_area',
        columns: ['price_search_num', 'floor_area_sqm_num']
    },
    {
        table: 'estate_property_search_index',
        name: 'idx_esi_rent_area',
        columns: ['price_rent_monthly_num', 'floor_area_sqm_num']
    },
    {
        table: 'estate_property_search_index',
        name: 'idx_esi_area_price',
        columns: ['floor_area_sqm_num', 'price_search_num']
    },
    {
        table: 'estate_property_search_index',
        name: 'idx_esi_age_price',
        columns: ['building_age_num', 'price_search_num']
    },
    {
        table: 'estate_property_station_index',
        name: 'idx_esti_line_station_walk',
        columns: ['railway_line', 'station_name', 'walk_minutes']
    },
    {
        table: 'estate_property_station_index',
        name: 'idx_esti_walk_property',
        columns: ['walk_minutes', 'property_id']
    }
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

async function addIndexIfMissing(knex, index) {
    if (!await tableExists(knex, index.table)) {
        return;
    }
    if (await indexExists(knex, index.table, index.name)) {
        return;
    }
    const columns = index.columns.map(column => quoteId(column)).join(', ');
    await knex.raw(`ALTER TABLE ${quoteId(index.table)} ADD INDEX ${quoteId(index.name)} (${columns})`);
}

async function dropIndexIfExists(knex, index) {
    if (!await tableExists(knex, index.table)) {
        return;
    }
    if (!await indexExists(knex, index.table, index.name)) {
        return;
    }
    await knex.raw(`ALTER TABLE ${quoteId(index.table)} DROP INDEX ${quoteId(index.name)}`);
}

module.exports = createNonTransactionalMigration(
    async function up(knex) {
        for (const index of INDEXES) {
            await addIndexIfMissing(knex, index);
        }
    },
    async function down(knex) {
        for (const index of [...INDEXES].reverse()) {
            await dropIndexIfExists(knex, index);
        }
    }
);
