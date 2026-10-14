const logging = require('@tryghost/logging');
const {createNonTransactionalMigration} = require('../../utils');
const postMediaIndex = require('../../../../services/post-media-index/core');

// post_media used to index only published + public Posts (a public-search index).
// Since 2026-10-14 every newsroom Post (public_post = true) is indexed whatever its
// status / visibility, so the staff desk (/dashboard/news 素材) sees drafts too.
// Existing databases need one reindex: the boot-time backfill only runs when the
// table is empty. A fresh database is covered by that boot backfill (init records
// this migration without running it), so nothing else is needed there.
//
// Per Post the rows are replaced in one transaction (delete + insert), exactly like
// the live sync, so a reader never sees a half-written Post. Derived data only —
// no source table is touched. Measured on the dev DB: 447 Posts in ~6 s.
module.exports = createNonTransactionalMigration(
    async function up(knex) {
        if (!await postMediaIndex.hasTable(knex)) {
            logging.warn('post_media table does not exist, skipping reindex');
            return;
        }

        // Ids only (a few hundred short strings); each Post's lexical is read one at a
        // time inside the sync, so memory stays flat however large the bodies are.
        const posts = await knex('posts')
            .select('id')
            .where('type', 'post')
            .where('public_post', true)
            .orderBy('id', 'asc');

        let processed = 0;
        let failed = 0;
        // Strictly one Post after another (a promise chain, not Promise.all) so the
        // migration never holds more than one Post's transaction open.
        await posts.reduce((chain, post) => chain.then(async () => {
            try {
                await postMediaIndex.syncPostMediaIndex(post.id, knex);
                processed += 1;
            } catch (err) {
                // One bad Post must not block Ghost from booting; its rows are
                // rebuilt on its next save.
                failed += 1;
                logging.warn(`post_media reindex failed for ${post.id}: ${err.message}`);
            }
        }), Promise.resolve());
        logging.info(`post_media reindex: ${processed} Posts, ${failed} failures`);
    },
    async function down() {
        // Derived index: nothing to undo (rows of drafts are harmless to the public read,
        // which narrows to published + public itself).
        logging.info('post_media reindex has no down step');
    }
);
