const {createNonTransactionalMigration} = require('../../utils');
const {addColumn, dropColumn, addIndex, dropIndex} = require('../../../schema/commands');

// Project Content Links — Phase 3: attach media jobs to a generic project
// (same pattern as chart_jobs.project_id from 2026-08-07-01-00-01).
// Plain indexed column, NOT a DB FK — project deletion cascades explicitly
// through the project destroy endpoint. Nullable so existing jobs are unaffected.
const PROJECT_ID_COLUMN = {
    type: 'string',
    maxlength: 24,
    nullable: true
};

module.exports = createNonTransactionalMigration(
    async function up(knex) {
        const hasColumn = await knex.schema.hasColumn('social_ai_media_jobs', 'project_id');
        if (!hasColumn) {
            await addColumn('social_ai_media_jobs', 'project_id', knex, PROJECT_ID_COLUMN);
        }

        try {
            await addIndex('social_ai_media_jobs', ['project_id'], knex);
        } catch (err) {
            // Idempotent: partial prior run may already have created the index.
        }
    },
    async function down(knex) {
        const hasColumn = await knex.schema.hasColumn('social_ai_media_jobs', 'project_id');
        if (!hasColumn) {
            return;
        }

        try {
            await dropIndex('social_ai_media_jobs', ['project_id'], knex);
        } catch (err) {
            // Index may already be gone.
        }

        await dropColumn('social_ai_media_jobs', 'project_id', knex, PROJECT_ID_COLUMN);
    }
);
