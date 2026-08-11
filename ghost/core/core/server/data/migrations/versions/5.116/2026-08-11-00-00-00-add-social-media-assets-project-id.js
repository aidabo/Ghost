const logging = require('@tryghost/logging');
const {createNonTransactionalMigration} = require('../../utils');
const {addColumn, dropColumn, addIndex, dropIndex} = require('../../../schema/commands');

// Plain indexed link from social_media_assets to social_ai_chart_projects.
// NOT a FK (same reasoning as chart_job_id): artifacts may be written before the
// project link is resolved, and cleanup is explicit (project clear/destroy). This
// lets project-scoped gallery listing, direct uploads into a project, and the
// "clear a project's artifacts" action target rows by project_id directly instead
// of always joining through chart_job_id -> job.project_id. Mirrors chart_job_id.
const PROJECT_ID_COLUMN = {
    type: 'string',
    maxlength: 24,
    nullable: true
};

module.exports = createNonTransactionalMigration(
    async function up(knex) {
        const hasColumn = await knex.schema.hasColumn('social_media_assets', 'project_id');
        if (!hasColumn) {
            await addColumn('social_media_assets', 'project_id', knex, PROJECT_ID_COLUMN);
        }

        await addIndex('social_media_assets', ['project_id'], knex);
    },
    async function down(knex) {
        await dropIndex('social_media_assets', ['project_id'], knex);

        const hasColumn = await knex.schema.hasColumn('social_media_assets', 'project_id');
        if (!hasColumn) {
            logging.warn('project_id column already removed from social_media_assets');
            return;
        }

        await dropColumn('social_media_assets', 'project_id', knex, PROJECT_ID_COLUMN);
    }
);
