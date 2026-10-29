const {createNonTransactionalMigration} = require('../../utils');

module.exports = createNonTransactionalMigration(
    async function up(knex) {
        if (await knex.schema.hasTable('estate_property_translations')) {
            await knex.schema.alterTable('estate_property_translations', (table) => {
                table.unique(['property_id', 'field', 'locale'], 'estate_property_translations_unique');
                table.index(['property_id', 'locale'], 'estate_property_translations_property_locale_index');
            });
        }
    },
    async function down(knex) {
        try {
            await knex.schema.alterTable('estate_property_translations', (table) => {
                table.dropUnique(null, 'estate_property_translations_unique');
                table.dropIndex(null, 'estate_property_translations_property_locale_index');
            });
        } catch (_) { /* migration rollback is best effort */ }
    }
);
