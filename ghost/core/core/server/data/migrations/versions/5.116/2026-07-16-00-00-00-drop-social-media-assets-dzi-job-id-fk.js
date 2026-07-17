const logging = require('@tryghost/logging');
const {createNonTransactionalMigration} = require('../../utils');

// The earlier migration added social_media_assets.dzi_job_id as a FK to
// social_ai_dzi_jobs with ON DELETE CASCADE. That turned out to be unworkable:
// the Deep Zoom upload flow finalizes the source-PDF asset BEFORE the
// social_ai_dzi_jobs row exists, so the FK's referential check fails at insert
// time and dzi_job_id could never be persisted. Drop the FK constraint but keep
// the column + index as a plain link; cleanup on job delete is done explicitly
// in the DZI destroy endpoint.
module.exports = createNonTransactionalMigration(
    async function up(knex) {
        const hasColumn = await knex.schema.hasColumn('social_media_assets', 'dzi_job_id');
        if (!hasColumn) {
            return;
        }
        try {
            await knex.schema.alterTable('social_media_assets', function (table) {
                table.dropForeign(['dzi_job_id']);
            });
            logging.info('Dropped FK constraint on social_media_assets.dzi_job_id');
        } catch (err) {
            // The FK may already be absent (fresh installs use the FK-less schema).
            logging.warn(`Could not drop FK on social_media_assets.dzi_job_id: ${err.message}`);
        }
        // dropForeign may drop the FK's backing index on some engines; make sure
        // a plain index remains for the destroy-time lookup.
        try {
            await knex.schema.alterTable('social_media_assets', function (table) {
                table.index(['dzi_job_id']);
            });
        } catch (err) {
            // Index already present — expected in most cases.
        }
    },
    async function down(knex) {
        const hasColumn = await knex.schema.hasColumn('social_media_assets', 'dzi_job_id');
        if (!hasColumn) {
            return;
        }
        try {
            await knex.schema.alterTable('social_media_assets', function (table) {
                table.foreign('dzi_job_id').references('id').inTable('social_ai_dzi_jobs');
            });
        } catch (err) {
            logging.warn(`Could not re-add FK on social_media_assets.dzi_job_id: ${err.message}`);
        }
    }
);
