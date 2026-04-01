const logging = require('@tryghost/logging');
const {createTransactionalMigration} = require('../../utils');
const DatabaseInfo = require('@tryghost/database-info');

module.exports = createTransactionalMigration(    
    async function up(knex) {
        if (DatabaseInfo.isSQLite(knex)) {
            logging.warn('Skipping migration for SQLite3');
            return;
        }

        logging.info('Alter public_post, post_approved to not null');

        await knex.raw(`alter table posts modify column public_post boolean not null default true;`);

        await knex.raw(`alter table posts modify column post_approved boolean not null default true;`);
    },

    async function down(knex) {
        if (DatabaseInfo.isSQLite(knex)) {
            logging.warn('Skipping migration for SQLite3');
            return;
        }
    }

);
