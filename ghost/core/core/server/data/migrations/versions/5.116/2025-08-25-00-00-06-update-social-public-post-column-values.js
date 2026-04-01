const logging = require('@tryghost/logging');
const {createTransactionalMigration} = require('../../utils');
const DatabaseInfo = require('@tryghost/database-info');

module.exports = createTransactionalMigration(    
    async function up(knex) {
        if (DatabaseInfo.isSQLite(knex)) {
            logging.warn('Skipping migration for SQLite3');
            return;
        }

        logging.info('Update public_post');

        await knex.raw(`
            UPDATE posts p
                LEFT OUTER JOIN social_groups g ON p.group_id = g.id
                    SET p.public_post = CASE
                        WHEN p.group_id IS NULL THEN TRUE
                        WHEN g.type = 'public' THEN TRUE
                        ELSE FALSE
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

