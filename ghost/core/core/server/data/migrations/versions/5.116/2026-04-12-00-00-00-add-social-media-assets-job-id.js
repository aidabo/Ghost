const logging = require('@tryghost/logging');
const {createNonTransactionalMigration} = require('../../utils');
const {addColumn, dropColumn, addIndex, dropIndex} = require('../../../schema/commands');

const JOB_ID_COLUMN = {
    type: 'string',
    maxlength: 24,
    nullable: true,
    references: 'social_ai_media_jobs.id',
    setNullDelete: true
};

module.exports = createNonTransactionalMigration(
    async function up(knex) {
        const hasJobIdColumn = await knex.schema.hasColumn('social_media_assets', 'job_id');
        if (!hasJobIdColumn) {
            await addColumn('social_media_assets', 'job_id', knex, JOB_ID_COLUMN);
        }

        await addIndex('social_media_assets', ['job_id'], knex);
        await addIndex('social_media_assets', ['job_id', 'created_at'], knex);
    },
    async function down(knex) {
        await dropIndex('social_media_assets', ['job_id', 'created_at'], knex);
        await dropIndex('social_media_assets', ['job_id'], knex);

        const hasJobIdColumn = await knex.schema.hasColumn('social_media_assets', 'job_id');
        if (!hasJobIdColumn) {
            logging.warn('job_id column already removed from social_media_assets');
            return;
        }

        await dropColumn('social_media_assets', 'job_id', knex, JOB_ID_COLUMN);
    }
);
