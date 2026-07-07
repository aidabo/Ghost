const logging = require('@tryghost/logging');
const {createNonTransactionalMigration} = require('../../utils');

// Short customer-facing reference code for an inquiry (e.g. R-482913). Generated
// on create; unique. Existing rows stay NULL (nullable + unique allows many NULLs).
module.exports = createNonTransactionalMigration(
    async function up(knex) {
        const hasTable = await knex.schema.hasTable('estate_inquiries');
        if (!hasTable) {
            logging.warn('estate_inquiries table does not exist, skipping reference_code column');
            return;
        }

        const columns = await knex('estate_inquiries').columnInfo();
        if (!columns.reference_code) {
            await knex.schema.alterTable('estate_inquiries', (table) => {
                table.string('reference_code', 20).nullable().unique('estate_inquiries_reference_code_unique');
            });
        }
    },
    async function down(knex) {
        const hasTable = await knex.schema.hasTable('estate_inquiries');
        if (!hasTable) {
            return;
        }

        const columns = await knex('estate_inquiries').columnInfo();
        if (columns.reference_code) {
            try {
                await knex.schema.alterTable('estate_inquiries', (table) => {
                    table.dropUnique('reference_code', 'estate_inquiries_reference_code_unique');
                });
            } catch (_) {
                // Unique index may not exist on some local databases.
            }
            await knex.schema.alterTable('estate_inquiries', (table) => {
                table.dropColumn('reference_code');
            });
        }
    }
);
