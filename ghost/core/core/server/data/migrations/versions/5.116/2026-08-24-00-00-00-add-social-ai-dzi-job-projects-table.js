const logging = require('@tryghost/logging');
const {createNonTransactionalMigration} = require('../../utils');

const TABLE = 'social_ai_dzi_job_projects';

module.exports = createNonTransactionalMigration(
    async function up(knex) {
        const exists = await knex.schema.hasTable(TABLE);
        if (exists) {
            logging.info(`Table ${TABLE} already exists — skipping`);
            return;
        }
        await knex.schema.createTable(TABLE, (table) => {
            table.string('id', 24).notNullable().primary();
            table.string('dzi_job_id', 24).notNullable().index();
            table.string('project_id', 24).notNullable().index();
            table.dateTime('created_at').notNullable();
            table.unique(['dzi_job_id', 'project_id'], 'social_ai_dzi_job_projects_unique');
        });
        logging.info(`Created table ${TABLE}`);
    },
    async function down(knex) {
        await knex.schema.dropTableIfExists(TABLE);
        logging.info(`Dropped table ${TABLE}`);
    }
);
