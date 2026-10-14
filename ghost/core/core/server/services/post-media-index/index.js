/* eslint-disable max-lines */
const logging = require('@tryghost/logging');
const events = require('../../lib/common/events');
const db = require('../../data/db');
const jobs = require('../jobs');

const core = require('./core');

const {TABLE, hasTable, isIndexablePost, extractMediaFromPost} = core;
const BACKFILL_BATCH_SIZE = 25;

async function syncPostMediaIndex(postId) {
    return core.syncPostMediaIndex(postId, db.knex);
}

async function deletePostMediaIndex(postId) {
    const knex = db.knex;
    if (!postId || !await hasTable(knex)) {
        return false;
    }

    await knex(TABLE).where({post_id: postId}).del();
    return true;
}

const yieldToEventLoop = () => new Promise((resolve) => {
    setImmediate(resolve);
});

async function backfillPostMediaIndex({batchSize = BACKFILL_BATCH_SIZE} = {}) {
    const knex = db.knex;
    if (!await hasTable(knex)) {
        return {processed: 0, failed: 0};
    }

    const safeBatchSize = Math.floor(Math.max(1, Math.min(100, Number(batchSize) || BACKFILL_BATCH_SIZE)));
    let cursor = '';
    let hasMore = true;
    let processed = 0;
    let failed = 0;

    while (hasMore) {
        const posts = await knex('posts')
            .select('id')
            .where('type', 'post')
            .where('public_post', true)
            .modify((query) => {
                if (cursor) {
                    query.where('id', '>', cursor);
                }
            })
            .orderBy('id', 'asc')
            .limit(safeBatchSize);

        if (!posts.length) {
            hasMore = false;
            continue;
        }

        for (const post of posts) {
            if (pending.has(post.id)) {
                dirty.add(post.id);
                continue;
            }
            pending.add(post.id);
            try {
                await syncPostMediaIndex(post.id);
                processed += 1;
            } catch (err) {
                failed += 1;
                logging.warn(`[post-media-index] backfill failed for ${post.id}: ${err.message}`);
            } finally {
                pending.delete(post.id);
                if (dirty.delete(post.id)) {
                    onPostChanged({id: post.id});
                }
            }
        }

        cursor = posts[posts.length - 1].id;
        await yieldToEventLoop();
    }

    return {processed, failed};
}

async function backfillIfEmpty() {
    const knex = db.knex;
    if (!await hasTable(knex)) {
        return;
    }
    const existing = await knex(TABLE).count({total: 'id'}).first();
    if (Number(existing?.total || 0) > 0) {
        return;
    }

    const result = await backfillPostMediaIndex();
    logging.info(`[post-media-index] initial backfill processed ${result.processed} posts with ${result.failed} failures`);
}

const pending = new Set();
const dirty = new Set();

function onPostChanged(model) {
    const postId = model?.id || (typeof model?.get === 'function' ? model.get('id') : null);
    if (!postId) {
        return;
    }
    if (pending.has(postId)) {
        dirty.add(postId);
        return;
    }
    pending.add(postId);
    try {
        jobs.addJob({
            name: `post-media-sync-${postId}`,
            data: {postId},
            offloaded: false,
            job: async ({postId: queuedPostId}) => {
                try {
                    await syncPostMediaIndex(queuedPostId);
                } catch (err) {
                    logging.warn(`[post-media-index] sync failed for ${queuedPostId}: ${err.message}`);
                } finally {
                    pending.delete(queuedPostId);
                    if (dirty.delete(queuedPostId)) {
                        onPostChanged({id: queuedPostId});
                    }
                }
            }
        });
    } catch (err) {
        pending.delete(postId);
        logging.warn(`[post-media-index] enqueue failed for ${postId}: ${err.message}`);
    }
}

function onPostDeleted(model) {
    const postId = model?.id || (typeof model?.get === 'function' ? model.get('id') : null);
    if (!postId) {
        return;
    }

    deletePostMediaIndex(postId).catch((err) => {
        logging.warn(`[post-media-index] delete failed for ${postId}: ${err.message}`);
    });
}

// Drafts (and every other non-published newsroom Post) are indexed too, but never once per
// autosave: an edit only (re)arms a per-Post timer, and the sync runs once the editor has
// been quiet for DRAFT_SYNC_DELAY_MS. Measured 2026-10-14 on the dev DB: extracting the
// largest Post (5.9 MB lexical) takes ~7 ms, all 447 newsroom Posts ~67 ms — so one sync
// per quiet period is negligible next to the autosave itself.
const DRAFT_SYNC_DELAY_MS = Math.max(1000, Number(process.env.POST_MEDIA_DRAFT_SYNC_DELAY_MS) || 30000);
const draftTimers = new Map();

function postStatusOf(model) {
    return typeof model?.get === 'function' ? model.get('status') : model?.status;
}

function onDraftChanged(model) {
    const postId = model?.id || (typeof model?.get === 'function' ? model.get('id') : null);
    // Published Posts are synced by post.published / post.published.edited right away.
    if (!postId || postStatusOf(model) === 'published') {
        return;
    }
    clearTimeout(draftTimers.get(postId));
    const timer = setTimeout(() => {
        draftTimers.delete(postId);
        onPostChanged({id: postId});
    }, DRAFT_SYNC_DELAY_MS);
    if (typeof timer.unref === 'function') {
        timer.unref();
    }
    draftTimers.set(postId, timer);
}

let listening = false;
function listen() {
    if (listening) {
        return;
    }
    listening = true;

    events.on('post.published', onPostChanged);
    events.on('post.published.edited', onPostChanged);
    // Drafts / scheduled / unpublished: debounced, see onDraftChanged.
    events.on('post.added', onDraftChanged);
    events.on('post.edited', onDraftChanged);
    // Keep derived rows on unpublish. The public query joins the current Post
    // status/visibility, so the item disappears without touching this index; the
    // post.edited that comes with it re-syncs the rows (debounced) for the staff desk.
    events.on('post.unpublished', () => {});
    events.on('post.deleted', onPostDeleted);

    if (process.env.POST_MEDIA_BACKFILL_ON_BOOT !== 'false') {
        // Initial historical indexing is fire-and-forget and yields between small
        // batches, so Ghost boot and Editor requests never wait for it.
        backfillIfEmpty().catch((err) => {
            logging.warn(`[post-media-index] initial backfill failed: ${err.message}`);
        });
    }
}

module.exports = {
    TABLE,
    listen,
    syncPostMediaIndex,
    deletePostMediaIndex,
    backfillPostMediaIndex,
    isIndexablePost,
    extractMediaFromPost,
    onDraftChanged,
    DRAFT_SYNC_DELAY_MS
};
