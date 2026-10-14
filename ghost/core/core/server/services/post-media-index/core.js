// Pure index logic shared by the live service (index.js) and the reindex migration:
// no job queue, no events, no global db — the caller passes its knex. Keep it that way,
// or the migration starts pulling the job service in.
const crypto = require('crypto');

const TABLE = 'post_media';
const MEDIA_TYPES = new Set(['image', 'video', 'audio']);

function hasTable(knex) {
    return knex.schema.hasTable(TABLE).catch(() => false);
}

function normalizeUrl(value) {
    return String(value || '').trim();
}

function hashUrl(value) {
    return crypto.createHash('sha256').update(normalizeUrl(value)).digest('hex');
}

// Every newsroom post (public_post = true), whatever its status or visibility: the
// staff desk (/dashboard/news 素材) lists the media of drafts and members-only posts too.
// A media row's "published" state is its post's state. The public read
// (post-media-public.js) still narrows to status = published + visibility = public itself.
// Family / private-group posts (public_post = false) are never indexed.
function isIndexablePost(post) {
    return Boolean(post && post.type === 'post' && post.public_post);
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

async function syncPostMediaIndex(postId, knex) {
    if (!postId || !await hasTable(knex)) {
        return false;
    }

    const post = await loadLatestPost(knex, postId);
    if (!isIndexablePost(post)) {
        // No longer a newsroom post (moved into a family / private group, or not a
        // post): drop rows left from when it was, so they never outlive it.
        if (post) {
            await knex(TABLE).where({post_id: post.id}).del();
        }
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

module.exports = {
    TABLE,
    MEDIA_TYPES,
    hasTable,
    normalizeUrl,
    isIndexablePost,
    extractMediaFromPost,
    syncPostMediaIndex
};
