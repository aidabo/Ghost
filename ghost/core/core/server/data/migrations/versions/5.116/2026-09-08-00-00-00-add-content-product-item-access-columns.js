const {createNonTransactionalMigration} = require('../../utils');

module.exports = createNonTransactionalMigration(
    async function up(knex) {
        if (!await knex.schema.hasTable('content_product_items')) {
            return;
        }
        await knex.schema.alterTable('content_product_items', (table) => {
            table.string('access_mode', 20).notNullable().defaultTo('preview').index();
            table.string('source_status', 30).nullable();
            table.string('source_visibility', 30).nullable();
        });
    },
    async function down(knex) {
        if (!await knex.schema.hasTable('content_product_items')) {
            return;
        }
        await knex.schema.alterTable('content_product_items', (table) => {
            table.dropColumn('access_mode');
            table.dropColumn('source_status');
            table.dropColumn('source_visibility');
        });
    }
);
