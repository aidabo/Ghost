const logging = require('@tryghost/logging');
const {createTransactionalMigration} = require('../../utils');
const DatabaseInfo = require('@tryghost/database-info');

module.exports = createTransactionalMigration(
    async function up(knex) {
        if (DatabaseInfo.isSQLite(knex)) {
            logging.warn('Skipping migration for SQLite3');
            return;
        }
        logging.info('Backfilling the members.last_seen_at column from members_login_events.');
        await knex.raw(`
            UPDATE settings
            SET
                settings.value='all'
            WHERE
                settings.group='comments'
                AND settings.key='comments_enabled'
        `);
    },

    async function down(knex) {
        if (DatabaseInfo.isSQLite(knex)) {
            logging.warn('Skipping migration for SQLite3');
            return;
        }
    }
);
