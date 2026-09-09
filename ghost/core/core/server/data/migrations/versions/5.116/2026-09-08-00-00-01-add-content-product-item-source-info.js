const {createNonTransactionalMigration} = require('../../utils');

module.exports = createNonTransactionalMigration(
    async function up(knex) {
        if (!await knex.schema.hasTable('content_product_items')) {
            return;
        }
        await knex.schema.alterTable('content_product_items', (table) => {
            table.string('source_title', 500).nullable();
            table.string('source_slug', 191).nullable();
            table.string('source_url', 2000).nullable();
        });
    },
    async function down(knex) {
        if (!await knex.schema.hasTable('content_product_items')) {
            return;
        }
        await knex.schema.alterTable('content_product_items', (table) => {
            table.dropColumn('source_title');
            table.dropColumn('source_slug');
            table.dropColumn('source_url');
        });
    }
);
