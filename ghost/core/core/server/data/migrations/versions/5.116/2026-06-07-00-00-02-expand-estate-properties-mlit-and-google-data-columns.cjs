const logging = require('@tryghost/logging');
const DatabaseInfo = require('@tryghost/database-info');
const {createTransactionalMigration} = require('../../utils');

async function alterToLongText(knex, table, column) {
    await knex.raw(`ALTER TABLE \`${table}\` MODIFY COLUMN \`${column}\` LONGTEXT NULL;`);
}

module.exports = createTransactionalMigration(
    async function up(knex) {
        if (DatabaseInfo.isSQLite(knex)) {
            logging.warn('Skipping estate_properties longtext migration for SQLite3');
            return;
        }

        await alterToLongText(knex, 'estate_properties', 'mlit_data');
        await alterToLongText(knex, 'estate_properties', 'google_places_data');
    },
    async function down(knex) {
        if (DatabaseInfo.isSQLite(knex)) {
            logging.warn('Skipping estate_properties longtext rollback for SQLite3');
            return;
        }

        await knex.raw(`ALTER TABLE \`estate_properties\` MODIFY COLUMN \`mlit_data\` TEXT NULL;`);
        await knex.raw(`ALTER TABLE \`estate_properties\` MODIFY COLUMN \`google_places_data\` TEXT NULL;`);
    }
);
