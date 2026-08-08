const logging = require('@tryghost/logging');
const {createNonTransactionalMigration} = require('../../utils');
const {dropIndex} = require('../../../schema/commands');

// Idempotency key for link-assets (M6, review 2026-08-07): (chart_job_id,
// storage_key_hash) must be unique so concurrent/retried registrations never
// duplicate asset rows. chart_job_id is nullable — MySQL unique indexes allow
// multiple NULLs, so non-chart assets are unaffected.
module.exports = createNonTransactionalMigration(
    async function up(knex) {
        const exists = await knex.schema.hasColumn('social_media_assets', 'chart_job_id');
        if (!exists) {
            logging.warn('social_media_assets.chart_job_id does not exist; skipping unique index');
            return;
        }
        try {
            await knex.schema.alterTable('social_media_assets', (t) => {
                t.unique(['chart_job_id', 'storage_key_hash'], 'social_media_assets_chart_job_key_hash_unique');
            });
        } catch (err) {
            // Duplicate rows would make the unique index creation fail — dedupe
            // keeping the newest row per key, then retry.
            if (String(err?.code || '').toUpperCase() === 'ER_DUP_ENTRY') {
                await knex.raw(
                    'DELETE a FROM social_media_assets a JOIN social_media_assets b ON ' +
                    'a.chart_job_id = b.chart_job_id AND a.storage_key_hash = b.storage_key_hash ' +
                    'AND a.id < b.id WHERE a.chart_job_id IS NOT NULL'
                );
                await knex.schema.alterTable('social_media_assets', (t) => {
                    t.unique(['chart_job_id', 'storage_key_hash'], 'social_media_assets_chart_job_key_hash_unique');
                });
            } else {
                throw err;
            }
        }
    },
    async function down(knex) {
        await dropIndex('social_media_assets', ['chart_job_id', 'storage_key_hash'], knex, {
            indexName: 'social_media_assets_chart_job_key_hash_unique'
        }).catch(() => {
            logging.warn('unique index already removed from social_media_assets');
        });
    }
);
