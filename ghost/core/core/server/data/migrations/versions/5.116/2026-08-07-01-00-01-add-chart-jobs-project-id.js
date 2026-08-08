const {createNonTransactionalMigration} = require('../../utils');
const {addColumn, dropColumn, addIndex, dropIndex} = require('../../../schema/commands');

// Chart Job Agent — P1: attach jobs to a generic project (plan §0-1/§3-2).
// Plain indexed column, NOT a FK: project deletion cascades EXPLICITLY through
// the project destroy endpoint (job rows + asset rows + S3, review M7), so a
// DB-level FK is neither needed nor desirable here (playbook §4 pattern).
const PROJECT_ID_COLUMN = {
    type: 'string',
    maxlength: 24,
    nullable: true
};

module.exports = createNonTransactionalMigration(
    async function up(knex) {
        const hasColumn = await knex.schema.hasColumn('social_ai_chart_jobs', 'project_id');
        if (!hasColumn) {
            await addColumn('social_ai_chart_jobs', 'project_id', knex, PROJECT_ID_COLUMN);
        }

        try {
            await addIndex('social_ai_chart_jobs', ['project_id'], knex);
        } catch (err) {
            // Idempotent: a partial prior run may already have created the index.
        }
    },
    async function down(knex) {
        // Guard first: dropping an index on a non-existent column errors.
        const hasColumn = await knex.schema.hasColumn('social_ai_chart_jobs', 'project_id');
        if (!hasColumn) {
            return;
        }

        try {
            await dropIndex('social_ai_chart_jobs', ['project_id'], knex);
        } catch (err) {
            // Index may already be gone.
        }

        await dropColumn('social_ai_chart_jobs', 'project_id', knex, PROJECT_ID_COLUMN);
    }
);
