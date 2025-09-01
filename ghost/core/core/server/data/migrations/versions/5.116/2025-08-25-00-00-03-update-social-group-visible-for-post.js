const logging = require('@tryghost/logging');
const {createTransactionalMigration} = require('../../utils');
const DatabaseInfo = require('@tryghost/database-info');

module.exports = createTransactionalMigration(
    async function up(knex) {
        if (DatabaseInfo.isSQLite(knex)) {
            logging.warn('Skipping migration for SQLite3');
            return;
        }

        logging.info('Migration group status to group_visible in posts table');

        await knex.raw(`
                UPDATE posts p
                    LEFT OUTER JOIN social_groups g ON p.group_id = g.id
                        SET p.group_visible = 
                            CASE 
                                WHEN p.group_id IS NULL THEN 'none'
                                WHEN g.type = 'public' THEN 'public'
                                ELSE 'private'
                            END;
        `);
    },

    async function down(knex) {
        if (DatabaseInfo.isSQLite(knex)) {
            logging.warn('Skipping migration for SQLite3');
            return;
        }
    }
);
