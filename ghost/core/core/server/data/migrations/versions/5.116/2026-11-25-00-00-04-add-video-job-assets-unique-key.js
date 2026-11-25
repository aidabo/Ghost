const logging = require('@tryghost/logging');
const {createNonTransactionalMigration} = require('../../utils');
const {addUnique, dropUnique} = require('../../../schema/commands');

// Idempotency key for the video link-assets call: (video_job_id, storage_key_hash)
// is unique so a retried job never duplicates asset rows. video_job_id is nullable
// and MySQL unique indexes allow many NULLs, so other families are unaffected.
//
// The index keeps knex's DEFAULT name on purpose: schema.js declares the same
// pair in @@UNIQUE_CONSTRAINTS@@ (t.unique without a name), so a fresh database
// (init) and a migrated one carry the same index name. The column is new in this
// release, so there are no duplicate rows to clean up first. addUnique skips an
// index that already exists (ER_DUP_KEYNAME).
const COLUMNS = ['video_job_id', 'storage_key_hash'];

module.exports = createNonTransactionalMigration(
    async function up(knex) {
        if (!(await knex.schema.hasColumn('social_media_assets', 'video_job_id'))) {
            logging.warn('social_media_assets.video_job_id does not exist; skipping unique index');
            return;
        }
        await addUnique('social_media_assets', COLUMNS, knex);
    },
    async function down(knex) {
        await dropUnique('social_media_assets', COLUMNS, knex);
    }
);
