const logging = require('@tryghost/logging');
const {createNonTransactionalMigration} = require('../../utils');
const {dropIndex} = require('../../../schema/commands');

// Idempotency key for the news link-assets call, mirroring
// 2026-08-07-00-00-03-add-chart-job-assets-unique-key.js: (news_job_id,
// storage_key_hash) must be unique so a retried or re-run job never duplicates
// asset rows. news_job_id is nullable and MySQL unique indexes allow multiple
// NULLs, so rows belonging to other families are unaffected.
//
// The same constraint is declared in schema.js @@UNIQUE_CONSTRAINTS@@ because
// init() records versions/** without running them — a fresh database would
// otherwise have no such constraint at all.
module.exports = createNonTransactionalMigration(
    async function up(knex) {
        const exists = await knex.schema.hasColumn('social_media_assets', 'news_job_id');
        if (!exists) {
            logging.warn('social_media_assets.news_job_id does not exist; skipping unique index');
            return;
        }
        try {
            await knex.schema.alterTable('social_media_assets', (t) => {
                t.unique(['news_job_id', 'storage_key_hash'], 'social_media_assets_news_job_key_hash_unique');
            });
        } catch (err) {
            // Duplicate rows would make the unique index creation fail — dedupe
            // keeping the newest row per key, then retry.
            if (String(err?.code || '').toUpperCase() === 'ER_DUP_ENTRY') {
                await knex.raw(
                    'DELETE a FROM social_media_assets a JOIN social_media_assets b ON ' +
                    'a.news_job_id = b.news_job_id AND a.storage_key_hash = b.storage_key_hash ' +
                    'AND a.id < b.id WHERE a.news_job_id IS NOT NULL'
                );
                await knex.schema.alterTable('social_media_assets', (t) => {
                    t.unique(['news_job_id', 'storage_key_hash'], 'social_media_assets_news_job_key_hash_unique');
                });
            } else {
                throw err;
            }
        }
    },
    async function down(knex) {
        await dropIndex('social_media_assets', ['news_job_id', 'storage_key_hash'], knex, {
            indexName: 'social_media_assets_news_job_key_hash_unique'
        }).catch(() => {
            logging.warn('unique index already removed from social_media_assets');
        });
    }
);
