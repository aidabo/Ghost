const logging = require('@tryghost/logging');
const {createNonTransactionalMigration} = require('../../utils');
const {addColumn, dropColumn, addIndex, dropIndex} = require('../../../schema/commands');

// Deep Zoom source-PDF link on social_media_assets. The existing job_id column
// FK-references social_ai_media_jobs, so it cannot hold a DZI job id (that lives
// in social_ai_dzi_jobs). This dedicated column references social_ai_dzi_jobs
// with ON DELETE CASCADE so deleting a DZI job also removes its source-PDF asset
// row — a PDF is uploaded per job (and often re-tried), so it has no life beyond
// its job. Additive + nullable — existing rows are unaffected.
const DZI_JOB_ID_COLUMN = {
    type: 'string',
    maxlength: 24,
    nullable: true,
    references: 'social_ai_dzi_jobs.id',
    cascadeDelete: true
};

module.exports = createNonTransactionalMigration(
    async function up(knex) {
        const hasColumn = await knex.schema.hasColumn('social_media_assets', 'dzi_job_id');
        if (!hasColumn) {
            await addColumn('social_media_assets', 'dzi_job_id', knex, DZI_JOB_ID_COLUMN);
        }

        await addIndex('social_media_assets', ['dzi_job_id'], knex);
    },
    async function down(knex) {
        await dropIndex('social_media_assets', ['dzi_job_id'], knex);

        const hasColumn = await knex.schema.hasColumn('social_media_assets', 'dzi_job_id');
        if (!hasColumn) {
            logging.warn('dzi_job_id column already removed from social_media_assets');
            return;
        }

        await dropColumn('social_media_assets', 'dzi_job_id', knex, DZI_JOB_ID_COLUMN);
    }
);
