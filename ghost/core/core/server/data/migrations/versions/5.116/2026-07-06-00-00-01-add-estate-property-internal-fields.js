const logging = require('@tryghost/logging');
const {createNonTransactionalMigration} = require('../../utils');

module.exports = createNonTransactionalMigration(
    async function up(knex) {
        const hasEstateProperties = await knex.schema.hasTable('estate_properties');
        if (!hasEstateProperties) {
            logging.warn('estate_properties table does not exist, skipping internal inquiry columns');
            return;
        }

        const columns = await knex('estate_properties').columnInfo();

        if (!columns.internal_inquiry_id) {
            await knex.schema.alterTable('estate_properties', (table) => {
                table.string('internal_inquiry_id', 100).nullable().index('estate_properties_internal_inquiry_id_index');
            });
        }

        if (!columns.registrant_notes) {
            await knex.schema.alterTable('estate_properties', (table) => {
                table.text('registrant_notes').nullable();
            });
        }

        await knex('estate_properties')
            .whereNull('internal_inquiry_id')
            .orWhere('internal_inquiry_id', '')
            .select('id')
            .then(async (rows) => {
                for (const row of rows) {
                    await knex('estate_properties')
                        .where({id: row.id})
                        .update({internal_inquiry_id: `INQ-${row.id}`});
                }
            });
    },
    async function down(knex) {
        const hasEstateProperties = await knex.schema.hasTable('estate_properties');
        if (!hasEstateProperties) {
            return;
        }

        const columns = await knex('estate_properties').columnInfo();
        if (columns.internal_inquiry_id) {
            try {
                await knex.schema.alterTable('estate_properties', (table) => {
                    table.dropIndex('internal_inquiry_id', 'estate_properties_internal_inquiry_id_index');
                });
            } catch (_) {
                // Older/local databases may have the column without this index.
            }
            await knex.schema.alterTable('estate_properties', (table) => {
                table.dropColumn('internal_inquiry_id');
            });
        }

        if (columns.registrant_notes) {
            await knex.schema.alterTable('estate_properties', (table) => {
                table.dropColumn('registrant_notes');
            });
        }
    }
);
