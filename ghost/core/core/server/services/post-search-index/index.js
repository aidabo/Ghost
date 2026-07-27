// Post search index population service.
//
// Keeps the denormalized `post_search_index` table in sync with core posts, so the
// post keyword search can run a fast FULLTEXT(ngram) query instead of an in-memory
// scan. Non-invasive: subscribes to post.* model events (like slack.js/xmlrpc.js)
// rather than editing the core Post model. Every operation is guarded by a
// hasTable() check and is non-fatal (a failure here must never break a post save).
//
// One row per post:
//   search_text  = title + excerpt + tags + author + body (the "search everything"
//                  blob; body is included in full by default — set
//                  POST_SEARCH_BODY_CHAR_LIMIT to cap it after watching prod size).
//   title_text / excerpt_text / tag_text / author_text = per-field search columns.
const logging = require('@tryghost/logging');
const events = require('../../lib/common/events');
const db = require('../../data/db');
const {invalidatePostSearchCache} = require('./search');

const TABLE = 'post_search_index';

// 0 = include the full body. A positive value caps the body portion of search_text
// (title/excerpt/tags/author are always included in full — they are short).
const BODY_CHAR_LIMIT = Math.max(0, Number(process.env.POST_SEARCH_BODY_CHAR_LIMIT || 0) || 0);

// Normalize text for indexing: drop base64 image blobs, NFKC-fold, lowercase, and
// collapse whitespace. Mirrors the estate normalizeSearchText intent.
function normalizeText(value) {
    return String(value || '')
        .replace(/data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+/g, ' ')
        .normalize('NFKC')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
}

async function hasIndexTable(knex) {
    try {
        return await knex.schema.hasTable(TABLE);
    } catch (err) {
        return false;
    }
}

// Build the index row for a post from the DB (fresh read — do not trust relations
// on the event model). Returns null for non-posts (pages) or a missing post.
async function buildRow(knex, postId) {
    const post = await knex('posts')
        .where({id: postId})
        .first('id', 'type', 'title', 'custom_excerpt', 'plaintext', 'status', 'visibility', 'featured', 'published_at', 'updated_at', 'group_id');
    if (!post || post.type !== 'post') {
        return null;
    }

    const tags = await knex('posts_tags as pt')
        .join('tags as t', 't.id', 'pt.tag_id')
        .where('pt.post_id', postId)
        .select('t.name', 't.slug');
    const authors = await knex('posts_authors as pa')
        .join('users as u', 'u.id', 'pa.author_id')
        .where('pa.post_id', postId)
        .select('u.name', 'u.slug', 'pa.author_id');
    // Comma-separated author ids (no spaces) so the search can filter "posts authored
    // by user X" with FIND_IN_SET — used by the session/my-home datasource.
    const authorIds = authors.map(a => a.author_id).filter(Boolean).join(',');

    // Group name → indexed into search_text so a keyword can match a group by name
    // (the group_id column handles exact-group filtering separately).
    let groupName = '';
    if (post.group_id) {
        const group = await knex('social_groups').where({id: post.group_id}).first('group_name');
        groupName = group && group.group_name ? group.group_name : '';
    }

    const titleText = normalizeText(post.title);
    const excerptText = normalizeText(post.custom_excerpt);
    const tagText = normalizeText(tags.map(t => `${t.name || ''} ${t.slug || ''}`).join(' '));
    const authorText = normalizeText(authors.map(a => `${a.name || ''} ${a.slug || ''}`).join(' '));
    const groupText = normalizeText(groupName);
    let bodyText = normalizeText(post.plaintext);
    if (BODY_CHAR_LIMIT > 0 && bodyText.length > BODY_CHAR_LIMIT) {
        bodyText = bodyText.slice(0, BODY_CHAR_LIMIT);
    }
    const searchText = [titleText, excerptText, tagText, authorText, groupText, bodyText].filter(Boolean).join(' ');

    return {
        post_id: post.id,
        search_text: searchText,
        title_text: titleText || null,
        excerpt_text: excerptText || null,
        tag_text: tagText || null,
        author_text: authorText || null,
        status: post.status || 'draft',
        visibility: post.visibility || null,
        featured: !!post.featured,
        published_at: post.published_at || null,
        updated_at: post.updated_at || null,
        group_id: post.group_id || null,
        author_ids: authorIds || null
    };
}

async function upsertPostSearchIndex(postId, {invalidate = true} = {}) {
    const knex = db.knex;
    if (!postId || !await hasIndexTable(knex)) {
        return false;
    }
    const row = await buildRow(knex, postId);
    if (!row) {
        // Not a post (or deleted) → remove any stale index row.
        await knex(TABLE).where({post_id: postId}).del();
        return false;
    }
    // Atomic upsert. A single post save fires several events in quick succession
    // (e.g. added + published, or unpublished + edited), each running this
    // fire-and-forget for the SAME post_id. A check-then-insert would let two of them
    // both see "no row" and both INSERT — the loser hitting a duplicate-key error
    // (harmless but log-noisy). ON DUPLICATE KEY UPDATE (via onConflict().merge())
    // does insert-or-replace in one atomic statement, so the race can't happen.
    await knex(TABLE).insert(row).onConflict('post_id').merge();
    // An edit must never serve stale cached results. A batch caller (tag re-index)
    // sets invalidate:false and flushes once for the whole batch instead.
    if (invalidate) {
        await invalidatePostSearchCache().catch(() => {});
    }
    return true;
}

async function deletePostSearchIndex(postId) {
    const knex = db.knex;
    if (!postId || !await hasIndexTable(knex)) {
        return false;
    }
    await knex(TABLE).where({post_id: postId}).del();
    await invalidatePostSearchCache().catch(() => {});
    return true;
}

// One-off backfill of existing posts. Idempotent (upsert). Safe to re-run.
// Keyset pagination on id so it scales without large OFFSETs.
async function backfillPostSearchIndex({batchSize = 200} = {}) {
    const knex = db.knex;
    if (!await hasIndexTable(knex)) {
        return {indexed: 0, skipped: true};
    }
    let lastId = '';
    let indexed = 0;
    for (;;) {
        const ids = await knex('posts')
            .where('type', 'post')
            .andWhere('id', '>', lastId)
            .orderBy('id')
            .limit(batchSize)
            .pluck('id');
        if (!ids.length) {
            break;
        }
        for (const id of ids) {
            try {
                if (await upsertPostSearchIndex(id)) {
                    indexed += 1;
                }
            } catch (err) {
                logging.warn(`[post-search-index] backfill failed for ${id}: ${err.message}`);
            }
        }
        lastId = ids[ids.length - 1];
    }
    logging.info(`[post-search-index] backfill indexed ${indexed} posts`);
    return {indexed};
}

// Run the backfill once if the index table exists but is empty (e.g. right after
// the migration). Non-blocking and self-limiting: does nothing once populated.
// Disable with POST_SEARCH_BACKFILL_ON_BOOT=false.
async function backfillIfEmpty() {
    const knex = db.knex;
    if (!await hasIndexTable(knex)) {
        return;
    }
    const row = await knex(TABLE).count({c: 'post_id'}).first();
    const count = Number((row && row.c) || 0);
    if (count > 0) {
        return;
    }
    logging.info('[post-search-index] index empty — running initial backfill');
    await backfillPostSearchIndex();
}

function idFrom(model) {
    if (!model) {
        return null;
    }
    if (typeof model.get === 'function') {
        return model.get('id') || model.id || null;
    }
    return model.id || null;
}

function onPostChanged(model) {
    const id = idFrom(model);
    if (!id) {
        return;
    }
    upsertPostSearchIndex(id).catch((err) => {
        logging.warn(`[post-search-index] upsert failed for ${id}: ${err.message}`);
    });
}

function onPostDeleted(model) {
    const id = idFrom(model);
    if (!id) {
        return;
    }
    deletePostSearchIndex(id).catch((err) => {
        logging.warn(`[post-search-index] delete failed for ${id}: ${err.message}`);
    });
}

// Re-index every post carrying a tag. Attaching/detaching a tag to a single post
// already fires post.edited (handled above); this covers the tag-level changes that
// do NOT touch the post rows — renaming a tag (tag.edited) and deleting it
// (tag.deleted) — which alter tag_text for every post that referenced the tag.
// NOTE: on tag.deleted the posts_tags rows may already be cascade-removed by the
// time the (post-commit) event fires, leaving nothing to look up; those posts then
// self-heal on their next edit. Renames (the common case) are always caught because
// the tag_id association is unchanged.
async function reindexPostsForTag(tagId) {
    const knex = db.knex;
    if (!tagId || !await hasIndexTable(knex)) {
        return;
    }
    const rows = await knex('posts_tags').where('tag_id', tagId).select('post_id');
    if (!rows.length) {
        return;
    }
    for (const {post_id} of rows) {
        // Skip per-row cache flush; invalidate once for the whole batch below.
        await upsertPostSearchIndex(post_id, {invalidate: false});
    }
    await invalidatePostSearchCache().catch(() => {});
}

function onTagChanged(model) {
    const id = idFrom(model);
    if (!id) {
        return;
    }
    reindexPostsForTag(id).catch((err) => {
        logging.warn(`[post-search-index] tag reindex failed for ${id}: ${err.message}`);
    });
}

let listening = false;
function listen() {
    if (listening) {
        return;
    }
    listening = true;
    events.on('post.added', onPostChanged);
    events.on('post.edited', onPostChanged);
    events.on('post.published', onPostChanged);
    events.on('post.unpublished', onPostChanged);
    events.on('post.scheduled', onPostChanged);
    events.on('post.unscheduled', onPostChanged);
    events.on('post.deleted', onPostDeleted);
    // Tag-level changes (rename/delete) update tag_text for every post using the tag.
    events.on('tag.edited', onTagChanged);
    events.on('tag.deleted', onTagChanged);

    if (process.env.POST_SEARCH_BACKFILL_ON_BOOT !== 'false') {
        // Fire-and-forget: never block boot on the backfill.
        backfillIfEmpty().catch((err) => {
            logging.warn(`[post-search-index] initial backfill failed: ${err.message}`);
        });
    }
}

module.exports = {
    listen,
    upsertPostSearchIndex,
    deletePostSearchIndex,
    reindexPostsForTag,
    backfillPostSearchIndex,
    buildRow,
    normalizeText,
    hasIndexTable,
    TABLE
};
