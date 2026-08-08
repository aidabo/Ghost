const logging = require('@tryghost/logging');
const {createNonTransactionalMigration} = require('../../utils');
const {addColumn, dropColumn, addIndex, dropIndex} = require('../../../schema/commands');

// Plain indexed link from social_media_assets to social_ai_chart_jobs.
// NOT a FK: chart-job artifacts are written by the worker BEFORE the job's asset
// rows are linked (worker has no browser session), so a FK would cause referential
// failures. Cleanup of stale assets is handled explicitly by the job destroy
// handler. Mirrors the dzi_job_id / social_chart_id patterns exactly.
const CHART_JOB_ID_COLUMN = {
    type: 'string',
    maxlength: 24,
    nullable: true
};

module.exports = createNonTransactionalMigration(
    async function up(knex) {
        const hasColumn = await knex.schema.hasColumn('social_media_assets', 'chart_job_id');
        if (!hasColumn) {
            await addColumn('social_media_assets', 'chart_job_id', knex, CHART_JOB_ID_COLUMN);
        }

        await addIndex('social_media_assets', ['chart_job_id'], knex);
    },
    async function down(knex) {
        await dropIndex('social_media_assets', ['chart_job_id'], knex);

        const hasColumn = await knex.schema.hasColumn('social_media_assets', 'chart_job_id');
        if (!hasColumn) {
            logging.warn('chart_job_id column already removed from social_media_assets');
            return;
        }

        await dropColumn('social_media_assets', 'chart_job_id', knex, CHART_JOB_ID_COLUMN);
    }
);
