/* eslint-disable max-lines */
const crypto = require('crypto');
const logging = require('@tryghost/logging');
const events = require('../../lib/common/events');
const db = require('../../data/db');
const jobs = require('../jobs');

const TABLE = 'post_media';
const MEDIA_TYPES = new Set(['image', 'video', 'audio']);
const BACKFILL_BATCH_SIZE = 25;

function hasTable(knex) {
    return knex.schema.hasTable(TABLE).catch(() => false);
}

function normalizeUrl(value) {
    return String(value || '').trim();
}

function hashUrl(value) {
    return crypto.createHash('sha256').update(normalizeUrl(value)).digest('hex');
}

function isIndexablePost(post) {
    return Boolean(post && post.type === 'post' && post.status === 'published' && post.visibility === 'public' && post.public_post);
}

function mediaTypeFromNode(node, sourceUrl, fallback = 'image') {
    const explicitType = String(node?.type || '').toLowerCase();
    if (MEDIA_TYPES.has(explicitType)) {
        return explicitType;
    }

    const url = normalizeUrl(sourceUrl);
    if (/\.(mp4|mov|webm|m4v|ogv|mkv)(?:[?#].*)?$/i.test(url)) {
        return 'video';
    }
    if (/\.(mp3|m4a|aac|wav|ogg|oga)(?:[?#].*)?$/i.test(url)) {
        return 'audio';
    }
    if (/\.(png|jpe?g|gif|webp|avif|svg)(?:[?#].*)?$/i.test(url)) {
        return 'image';
    }

    return fallback;
}

function getNodeUrl(node) {
    return normalizeUrl(node?.src || node?.url || node?.mediaUrl || node?.thumbnailUrl || '');
}

function extractLexicalMedia(lexical, push, path = 'root') {
    let node = lexical;
    if (typeof lexical === 'string') {
        try {
            node = JSON.parse(lexical);
        } catch (err) {
            return;
        }
    }

    if (!node || typeof node !== 'object') {
        return;
    }

    if (typeof node.type === 'string') {
        const url = getNodeUrl(node);
        if (url && MEDIA_TYPES.has(node.type.toLowerCase())) {
            push({
                source_url: url,
                media_type: mediaTypeFromNode(node, url, node.type.toLowerCase()),
                thumbnail_url: normalizeUrl(node.thumbnailUrl || node.poster || ''),
                caption: typeof node.caption === 'string' ? node.caption.trim() : null,
                alt: typeof node.alt === 'string' ? node.alt.trim() : null,
                lexical_node_key: path
            });
        }
    }

    if (Array.isArray(node.children)) {
        node.children.forEach((child, index) => extractLexicalMedia(child, push, `${path}.children[${index}]`));
    }

    for (const [key, value] of Object.entries(node)) {
        if (key === 'children' || value === null || value === undefined) {
            continue;
        }
        if (Array.isArray(value) || (typeof value === 'object' && !Array.isArray(value))) {
            extractLexicalMedia(value, push, `${path}.${key}`);
        }
    }
}

function extractMediaFromPost(post) {
    const data = post && typeof post.toJSON === 'function' ? post.toJSON() : (post || {});
    const items = [];
    const seen = new Set();

    const add = (item) => {
        const sourceUrl = normalizeUrl(item.source_url);
        if (!sourceUrl) {
            return;
        }

        const role = item.role === 'feature' ? 'feature' : 'content';
        const key = hashUrl(sourceUrl);
        if (seen.has(key)) {
            return;
        }

        seen.add(key);
        items.push({
            source_url: sourceUrl,
            source_url_hash: hashUrl(sourceUrl),
            media_type: MEDIA_TYPES.has(item.media_type) ? item.media_type : mediaTypeFromNode(item, sourceUrl),
            thumbnail_url: item.thumbnail_url || null,
            caption: item.caption || null,
            alt: item.alt || null,
            role,
            lexical_node_key: item.lexical_node_key || null
        });
    };

    if (data.feature_image) {
        add({
            source_url: data.feature_image,
            media_type: 'image',
            role: 'feature',
            caption: null,
            alt: null,
            lexical_node_key: null
        });
    }

    extractLexicalMedia(data.lexical, add);

    return items;
}

function stableMediaId(postId, sourceUrlHash, role) {
    return crypto.createHash('sha1').update(`${postId}:${sourceUrlHash}:${role}`).digest('hex').slice(0, 24);
}

async function loadLatestPost(knex, postId) {
    return knex('posts')
        .where({id: postId})
        .first('id', 'title', 'slug', 'lexical', 'feature_image', 'status', 'visibility', 'public_post', 'type', 'published_at', 'updated_at');
}

async function loadAssetMap(knex, urls) {
    const normalizedUrls = [...new Set(urls.map(normalizeUrl).filter(Boolean))];
    if (!normalizedUrls.length) {
        return new Map();
    }

    const hashes = normalizedUrls.map(hashUrl);
    const rows = await knex('social_media_assets')
        .where((builder) => {
            builder.whereIn('storage_url', normalizedUrls)
                .orWhereIn('thumbnail_url', normalizedUrls)
                .orWhereIn('storage_key_hash', hashes);
        })
        .select('id', 'storage_url', 'thumbnail_url', 'storage_key_hash', 'asset_type');

    const map = new Map();
    for (const row of rows) {
        if (row.storage_url) {
            map.set(normalizeUrl(row.storage_url), row);
        }
        if (row.thumbnail_url) {
            map.set(normalizeUrl(row.thumbnail_url), row);
        }
    }
    return map;
}

async function syncPostMediaIndex(postId) {
    const knex = db.knex;
    if (!postId || !await hasTable(knex)) {
        return false;
    }

    const post = await loadLatestPost(knex, postId);
    if (!isIndexablePost(post)) {
        return false;
    }

    const extracted = extractMediaFromPost(post);
    const assetMap = await loadAssetMap(knex, extracted.map(item => item.source_url));
    const now = new Date();
    const rows = extracted.map((item, index) => {
        const asset = assetMap.get(normalizeUrl(item.source_url));
        return {
            id: stableMediaId(post.id, item.source_url_hash, item.role),
            post_id: post.id,
            media_id: asset ? asset.id : null,
            media_type: asset?.asset_type && MEDIA_TYPES.has(asset.asset_type) ? asset.asset_type : item.media_type,
            source_url: item.source_url,
            source_url_hash: item.source_url_hash,
            thumbnail_url: asset?.thumbnail_url || item.thumbnail_url || null,
            caption: item.caption || null,
            alt: item.alt || null,
            role: item.role,
            sort_order: index,
            lexical_node_key: item.lexical_node_key || null,
            created_at: post.published_at || now,
            updated_at: post.updated_at || null
        };
    });

    await knex.transaction(async (transacting) => {
        const latest = await loadLatestPost(transacting, post.id);
        if (!isIndexablePost(latest) || String(latest.updated_at) !== String(post.updated_at)) {
            return;
        }
        await transacting(TABLE).where({post_id: post.id}).del();
        if (rows.length > 0) {
            await transacting(TABLE).insert(rows);
        }
    });

    return true;
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
            .where('status', 'published')
            .where('visibility', 'public')
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

let listening = false;
function listen() {
    if (listening) {
        return;
    }
    listening = true;

    events.on('post.published', onPostChanged);
    events.on('post.published.edited', onPostChanged);
    // Keep derived rows on unpublish. The public query joins the current Post
    // status/visibility, so the item disappears without touching this index.
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
    extractMediaFromPost
};
