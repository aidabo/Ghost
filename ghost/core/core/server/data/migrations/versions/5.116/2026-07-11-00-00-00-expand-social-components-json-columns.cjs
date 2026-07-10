const logging = require('@tryghost/logging');
const DatabaseInfo = require('@tryghost/database-info');
const {createTransactionalMigration} = require('../../utils');

// social_components stores large JSON in attributes / layout / source. These were
// created as plain TEXT (64KB) because the schema omitted `fieldtype: 'long'`, so a
// rich StackPage layout (>64KB) fails to save with "Data too long for column
// 'layout'". Expand them to LONGTEXT to match the schema intent (maxlength 1e9) and
// Ghost's own convention for large JSON columns (e.g. posts.lexical).
async function alterToLongText(knex, table, column) {
    await knex.raw(`ALTER TABLE \`${table}\` MODIFY COLUMN \`${column}\` LONGTEXT NULL;`);
}

async function alterToText(knex, table, column) {
    await knex.raw(`ALTER TABLE \`${table}\` MODIFY COLUMN \`${column}\` TEXT NULL;`);
}

module.exports = createTransactionalMigration(
    async function up(knex) {
        if (DatabaseInfo.isSQLite(knex)) {
            logging.warn('Skipping social_components longtext migration for SQLite3');
            return;
        }

        await alterToLongText(knex, 'social_components', 'attributes');
        await alterToLongText(knex, 'social_components', 'layout');
        await alterToLongText(knex, 'social_components', 'source');
    },
    async function down(knex) {
        if (DatabaseInfo.isSQLite(knex)) {
            logging.warn('Skipping social_components longtext rollback for SQLite3');
            return;
        }

        await alterToText(knex, 'social_components', 'attributes');
        await alterToText(knex, 'social_components', 'layout');
        await alterToText(knex, 'social_components', 'source');
    }
);
