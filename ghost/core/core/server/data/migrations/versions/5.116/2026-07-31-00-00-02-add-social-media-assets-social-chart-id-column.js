const logging = require('@tryghost/logging');
const {createNonTransactionalMigration} = require('../../utils');
const {addColumn, dropColumn, addIndex, dropIndex} = require('../../../schema/commands');

// Plain indexed link from social_media_assets to social_charts.
// NOT a FK: chart thumbnail assets are created during the presign/finalize flow
// before the thumbnail URL is written back to social_charts, so a FK would cause
// referential failures. Cleanup of stale thumbnails is handled explicitly by the
// host (delete assets WHERE social_chart_id = <id>), not via ON DELETE CASCADE.
// Mirrors the existing dzi_job_id pattern exactly.
const SOCIAL_CHART_ID_COLUMN = {
    type: 'string',
    maxlength: 24,
    nullable: true
};

module.exports = createNonTransactionalMigration(
    async function up(knex) {
        const hasColumn = await knex.schema.hasColumn('social_media_assets', 'social_chart_id');
        if (!hasColumn) {
            await addColumn('social_media_assets', 'social_chart_id', knex, SOCIAL_CHART_ID_COLUMN);
        }

        await addIndex('social_media_assets', ['social_chart_id'], knex);
    },
    async function down(knex) {
        await dropIndex('social_media_assets', ['social_chart_id'], knex);

        const hasColumn = await knex.schema.hasColumn('social_media_assets', 'social_chart_id');
        if (!hasColumn) {
            logging.warn('social_chart_id column already removed from social_media_assets');
            return;
        }

        await dropColumn('social_media_assets', 'social_chart_id', knex, SOCIAL_CHART_ID_COLUMN);
    }
);
