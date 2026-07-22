const {createNonTransactionalMigration} = require('../../utils');

const TABLE = 'estate_property_search_index';
const INDEX = 'idx_esi_featured_status_type';

module.exports = createNonTransactionalMigration(
    async function up(knex) {
        if (!await knex.schema.hasTable(TABLE)) {
            return;
        }

        const columns = await knex(TABLE).columnInfo();
        if (!columns.featured) {
            await knex.schema.alterTable(TABLE, (table) => {
                table.boolean('featured').notNullable().defaultTo(false);
            });
        }

        await knex.raw(
            `UPDATE \`${TABLE}\` AS si INNER JOIN \`estate_properties\` AS ep ON si.property_id = ep.id SET si.featured = COALESCE(ep.featured, FALSE)`
        );

        const indexes = await knex.raw(
            'SELECT COUNT(*) AS total FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?',
            [TABLE, INDEX]
        );
        const rows = Array.isArray(indexes) ? indexes[0] : indexes?.rows;
        if (!Number(rows?.[0]?.total || 0)) {
            await knex.schema.alterTable(TABLE, (table) => {
                table.index(['featured', 'status', 'property_type'], INDEX);
            });
        }
    },
    async function down(knex) {
        if (!await knex.schema.hasTable(TABLE)) {
            return;
        }

        const columns = await knex(TABLE).columnInfo();
        try {
            await knex.schema.alterTable(TABLE, (table) => {
                table.dropIndex(['featured', 'status', 'property_type'], INDEX);
            });
        } catch (_) {
            // Older/local databases may not have the optional index.
        }
        if (columns.featured) {
            await knex.schema.alterTable(TABLE, (table) => {
                table.dropColumn('featured');
            });
        }
    }
);
