const logging = require('@tryghost/logging');
const {createNonTransactionalMigration} = require('../../utils');
const {addForeign} = require('../../../schema/commands');

module.exports = createNonTransactionalMigration(
    async function up(knex) {
        // Existing tenants must not receive a new constraint as a side effect
        // of upgrading the shared Ghost image. Enable this only for a new
        // tenant whose schema was created with the FK-less initial definition.
        if (process.env.GHOST_ENABLE_SOCIAL_MEDIA_ASSETS_JOB_FK !== 'true') {
            logging.info('Skipped social_media_assets.job_id FK; opt-in is disabled');
            return;
        }

        const hasAssetsTable = await knex.schema.hasTable('social_media_assets');
        const hasJobsTable = await knex.schema.hasTable('social_ai_media_jobs');
        const hasJobIdColumn = hasAssetsTable && await knex.schema.hasColumn('social_media_assets', 'job_id');

        if (!hasAssetsTable || !hasJobsTable || !hasJobIdColumn) {
            logging.warn('Skipped social_media_assets.job_id FK because the required table or column is missing');
            return;
        }

        await addForeign({
            fromTable: 'social_media_assets',
            fromColumn: 'job_id',
            toTable: 'social_ai_media_jobs',
            toColumn: 'id',
            setNullDelete: true,
            transaction: knex
        });
    },
    async function down(knex) {
        const hasAssetsTable = await knex.schema.hasTable('social_media_assets');
        const hasJobIdColumn = hasAssetsTable && await knex.schema.hasColumn('social_media_assets', 'job_id');
        if (!hasAssetsTable || !hasJobIdColumn) {
            return;
        }

        await knex.schema.alterTable('social_media_assets', function (table) {
            table.dropForeign(['job_id']);
        });
    }
);
