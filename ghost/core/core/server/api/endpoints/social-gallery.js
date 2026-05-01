const path = require('path');
const tpl = require('@tryghost/tpl');
const logging = require('@tryghost/logging');
const errors = require('@tryghost/errors');
const ObjectId = require('bson-objectid').default;
const storage = require('../../adapters/storage');
const models = require('../../models');
const socialMediaAssets = require('./utils/social-media-assets');

const messages = {
    userRequired: 'No login user authentication, can not read gallery in this scope.',
    groupRequired: '`group_id` is required.',
    groupNotFound: 'Group not found: {groupId}.',
    noPermission: 'You are not allowed to read gallery in this group: {groupId}, user: {user}.',
    storageNoList: 'Configured storage adapter does not support gallery listing.',
    postIdRequired: '`post_id` is required.',
    postNotFound: 'Post not found: {postId}.',
    invalidMode: 'Invalid mode value. Allowed: primary.',
    storageNoPresign: 'Configured storage adapter does not support presigned uploads.',
    filenameRequired: '`filename` is required.',
    contentTypeRequired: '`content_type` is required.',
    originalFilenameRequired: '`original_filename` is required.',
    invalidContentLength: '`content_length` must be a positive number when provided.',
    storageKeyRequired: '`storage_key` is required.',
    storageUrlRequired: '`storage_url` is required.',
    presignFailed: 'Failed to create presigned upload URL for "{filename}".',
    finalizeFailed: 'Failed to finalize uploaded gallery asset for key "{storageKey}".',
    assetNotFound: 'Gallery asset not found for key "{storageKey}".',
    tagNotFound: 'Tag not found for the supplied tag value.'
};

const TYPE_ALL = 'all';
const TYPE_IMAGE = 'image';
const TYPE_VIDEO = 'video';
const TYPE_AUDIO = 'audio';
const TYPE_FILE = 'file';

const typeExtensions = {
    [TYPE_IMAGE]: new Set(['gif', 'jpg', 'jpeg', 'png', 'svg', 'svgz', 'webp']),
    [TYPE_VIDEO]: new Set(['mp4', 'webm', 'ogv', 'mov']),
    [TYPE_AUDIO]: new Set(['mp3', 'wav', 'ogg', 'm4a'])
};

const parseMode = (value) => {
    const normalized = String(value || 'primary').toLowerCase().trim();
    if (normalized === 'primary') {
        return normalized;
    }
    throw new errors.ValidationError({
        message: tpl(messages.invalidMode)
    });
};

const extractUrlsFromHtml = (html) => {
    const value = String(html || '');
    const urls = [];
    const regex = /https?:\/\/[^\s"'<>]+/g;
    let match = regex.exec(value);
    while (match) {
        urls.push(match[0]);
        match = regex.exec(value);
    }
    return urls;
};

const collectUrlsFromLexicalNode = (node, set) => {
    if (!node || typeof node !== 'object') {
        return;
    }

    if (typeof node.src === 'string' && /^https?:\/\//.test(node.src)) {
        set.add(node.src);
    }
    if (typeof node.href === 'string' && /^https?:\/\//.test(node.href)) {
        set.add(node.href);
    }
    if (typeof node.url === 'string' && /^https?:\/\//.test(node.url)) {
        set.add(node.url);
    }

    if (Array.isArray(node.children)) {
        node.children.forEach(child => collectUrlsFromLexicalNode(child, set));
    }

    Object.keys(node).forEach((key) => {
        if (key !== 'children' && typeof node[key] === 'object') {
            collectUrlsFromLexicalNode(node[key], set);
        }
    });
};

const extractUrlsFromLexical = (lexical) => {
    const set = new Set();
    if (!lexical) {
        return [];
    }

    try {
        const parsed = typeof lexical === 'string' ? JSON.parse(lexical) : lexical;
        collectUrlsFromLexicalNode(parsed, set);
    } catch (err) {
        return [];
    }

    return Array.from(set);
};

const normalizeUploadFilename = (value) => {
    const raw = path.basename(String(value || '').trim() || 'upload.bin');
    const deduped = raw.match(/^(.*\.[a-z0-9]+)-[a-z0-9_-]+$/i);
    return deduped ? deduped[1] : raw;
};

const inferAssetTypeByKey = (key) => {
    const ext = getExtension({ name: key });
    if (typeExtensions[TYPE_IMAGE].has(ext)) {
        return TYPE_IMAGE;
    }
    if (typeExtensions[TYPE_VIDEO].has(ext) || typeExtensions[TYPE_AUDIO].has(ext)) {
        return 'media';
    }
    return TYPE_FILE;
};

const parseLimit = (value) => {
    const parsed = Number.parseInt(value, 10);
    if (Number.isNaN(parsed) || parsed <= 0) {
        return 100;
    }
    return Math.min(parsed, 1000);
};

const parseType = (value) => {
    const normalized = String(value || TYPE_ALL).toLowerCase().trim();
    if ([TYPE_ALL, TYPE_IMAGE, TYPE_VIDEO, TYPE_AUDIO, TYPE_FILE].includes(normalized)) {
        return normalized;
    }
    return TYPE_ALL;
};

const parseOrderBy = (value) => {
    const normalized = String(value || 'created_at:desc').trim().toLowerCase();
    const [fieldRaw, directionRaw] = normalized.split(':');
    const field = fieldRaw === 'updated_at' ? 'updated_at' : 'created_at';
    const direction = directionRaw === 'asc' ? 'asc' : 'desc';
    return { field, direction };
};

const parseDbNextCursor = (value) => {
    const normalized = String(value || '').trim();
    if (!normalized) {
        return null;
    }

    const separatorIndex = normalized.indexOf('__');
    if (separatorIndex <= 0) {
        return null;
    }

    const createdAt = normalized.slice(0, separatorIndex);
    const id = normalized.slice(separatorIndex + 2);
    if (!createdAt || !id) {
        return null;
    }

    const parsedDate = new Date(createdAt);
    const normalizedDate = Number.isNaN(parsedDate.getTime()) ? createdAt : parsedDate.toISOString();

    return { createdAt: normalizedDate, id };
};

const buildDbNextCursor = (item) => {
    const createdAt = String(item?.created_at || '').trim();
    const id = String(item?.id || '').trim();
    if (!createdAt || !id) {
        return null;
    }
    const parsedDate = new Date(createdAt);
    const normalizedDate = Number.isNaN(parsedDate.getTime()) ? createdAt : parsedDate.toISOString();
    return `${normalizedDate}__${id}`;
};

const getExtension = (item) => {
    const name = normalizeUploadFilename(item?.name || item?.key || item?.path || item?.url || '').toLowerCase();
    const idx = name.lastIndexOf('.');
    if (idx < 0 || idx === name.length - 1) {
        return '';
    }
    return name.substring(idx + 1);
};

const getMimeType = (item) => {
    return String(
        item?.mimeType ||
        item?.contentType ||
        item?.mimetype ||
        item?.type ||
        ''
    ).toLowerCase().split(';')[0].trim();
};

const matchType = (item, type) => {
    if (type === TYPE_ALL) {
        return true;
    }

    const resolved = resolveGalleryItemType(item);
    return resolved === type;
};

const resolveGalleryItemType = (item) => {
    const declaredType = String(item?.asset_type || item?.type || '').toLowerCase().trim();
    if ([TYPE_IMAGE, TYPE_VIDEO, TYPE_AUDIO, TYPE_FILE].includes(declaredType)) {
        return declaredType;
    }

    const mime = getMimeType(item);
    if (mime.startsWith('image/')) return TYPE_IMAGE;
    if (mime.startsWith('video/')) return TYPE_VIDEO;
    if (mime.startsWith('audio/')) return TYPE_AUDIO;

    const ext = getExtension(item);
    if (typeExtensions[TYPE_IMAGE].has(ext)) return TYPE_IMAGE;
    if (typeExtensions[TYPE_VIDEO].has(ext)) return TYPE_VIDEO;
    if (typeExtensions[TYPE_AUDIO].has(ext)) return TYPE_AUDIO;
    return TYPE_FILE;
};

const resolveUploadedAssetType = ({ filename, contentType }) => {
    const mime = String(contentType || '').toLowerCase().split(';')[0].trim();
    if (mime.startsWith('image/')) return TYPE_IMAGE;
    if (mime.startsWith('video/')) return TYPE_VIDEO;
    if (mime.startsWith('audio/')) return TYPE_AUDIO;

    const ext = getExtension({ name: filename });
    if (typeExtensions[TYPE_IMAGE].has(ext)) return TYPE_IMAGE;
    if (typeExtensions[TYPE_VIDEO].has(ext)) return TYPE_VIDEO;
    if (typeExtensions[TYPE_AUDIO].has(ext)) return TYPE_AUDIO;
    return TYPE_FILE;
};

const wrapStorageError = (message, context, err) => {
    if (err instanceof errors.GhostError) {
        throw err;
    }

    throw new errors.InternalServerError({
        message: tpl(message, context),
        err,
        context: err?.message || undefined
    });
};

const isMissingThumbnailColumnError = (err) => {
    const message = String(err?.message || '').toLowerCase();
    return err?.code === 'ER_BAD_FIELD_ERROR' ||
        (err?.code === 'SQLITE_ERROR' && message.includes('thumbnail_')) ||
        message.includes('unknown column') ||
        message.includes('has no column named thumbnail_');
};

const sanitizeFileName = (value) => {
    const raw = String(value || '').trim();
    const base = path.basename(raw).replace(/[^\w.\-()+\u3040-\u30ff\u3400-\u9fff]/g, '_');
    return base || 'upload.bin';
};

const buildUniqueStorageKey = (targetDir, filename) => {
    const parsed = path.posix.parse(normalizeUploadFilename(filename));
    const baseName = String(parsed.name || 'upload').trim() || 'upload';
    const ext = String(parsed.ext || '').trim();
    const suffix = ObjectId().toHexString().slice(-8);
    const uniqueName = `${baseName}-${suffix}${ext}`;
    return path.posix.join(targetDir || '', uniqueName).replace(/^\/+/, '');
};

const buildThumbnailFilename = (filename) => {
    const parsed = path.posix.parse(normalizeUploadFilename(filename));
    const baseName = String(parsed.name || 'upload').trim() || 'upload';
    return `${baseName}.png`;
};

const buildThumbnailStorageKey = (storageKey) => {
    const parsed = path.posix.parse(String(storageKey || '').trim() || 'upload.bin');
    const dir = String(parsed.dir || '').trim();
    const baseName = String(parsed.name || 'upload').trim() || 'upload';
    return path.posix.join(dir, `${baseName}.png`).replace(/^\/+/, '');
};

const assertListSupported = (store) => {
    if (typeof store.list !== 'function') {
        throw new errors.ValidationError({
            message: tpl(messages.storageNoList)
        });
    }
};

const getFrameValue = (frame, key) => {
    const body = frame.data || {};
    const row = Array.isArray(body.socialgallery) ? body.socialgallery[0] : null;
    return row?.[key] || body[key] || frame.options?.[key] || null;
};

const getSyncUrls = (frame, post) => {
    const payloadUrls = getFrameValue(frame, 'urls');
    if (Array.isArray(payloadUrls) && payloadUrls.length > 0) {
        return payloadUrls.filter(url => typeof url === 'string');
    }

    const urls = new Set();
    if (post.get('feature_image')) {
        urls.add(post.get('feature_image'));
    }

    extractUrlsFromHtml(post.get('html')).forEach(url => urls.add(url));
    extractUrlsFromLexical(post.get('lexical')).forEach(url => urls.add(url));
    return Array.from(urls);
};

const getPrimaryTag = (post) => {
    const related = post.related('tags');
    const tags = related?.toJSON?.() || [];
    if (!Array.isArray(tags) || tags.length === 0) {
        return null;
    }

    const first = tags[0];
    if (!first?.id || !first?.slug) {
        return null;
    }

    return {
        id: first.id,
        slug: first.slug,
        name: first.name || null
    };
};

const assertCanSyncPost = async (frame, post) => {
    const userId = frame.options?.context?.user;
    if (!userId) {
        throw new errors.NoPermissionError({
            message: tpl(messages.userRequired)
        });
    }

    const groupId = post.get('group_id');
    if (!groupId) {
        return;
    }

    // @ts-ignore
    const group = await models.SocialGroup.findOne({ id: groupId });
    if (!group) {
        throw new errors.NotFoundError({
            message: tpl(messages.groupNotFound, { groupId })
        });
    }

    // @ts-ignore
    const allowed = await models.SocialGroup.canAccessGroup(group, userId, 'write');
    if (!allowed) {
        throw new errors.NoPermissionError({
            message: tpl(messages.noPermission, { groupId, user: userId })
        });
    }
};

const syncAssetsFromPost = async (frame) => {
    const postId = getFrameValue(frame, 'post_id');
    if (!postId) {
        throw new errors.ValidationError({
            message: tpl(messages.postIdRequired)
        });
    }

    const mode = parseMode(getFrameValue(frame, 'mode'));
    const mediaStore = storage.getStorage('media');
    assertListSupported(mediaStore);

    // @ts-ignore
    const post = await models.Post.findOne({ id: postId }, {
        context: { internal: true },
        withRelated: ['tags']
    });

    if (!post) {
        throw new errors.NotFoundError({
            message: tpl(messages.postNotFound, { postId })
        });
    }

    await assertCanSyncPost(frame, post);

    const selectedTag = mode === 'primary' ? getPrimaryTag(post) : null;
    const urls = getSyncUrls(frame, post);
    const keyToUrl = new Map();
    urls.forEach((url) => {
        if (typeof url !== 'string') {
            return;
        }
        if (!url.startsWith(mediaStore.host)) {
            return;
        }
        if (typeof mediaStore.urlToPath !== 'function') {
            return;
        }
        const key = mediaStore.urlToPath(url);
        if (key) {
            keyToUrl.set(key, url);
        }
    });

    const now = new Date();
    const keys = Array.from(keyToUrl.keys());
    const knex = models.Base.knex;

    let updated = 0;
    let inserted = 0;
    for (const key of keys) {
        const existing = await socialMediaAssets.findAssetRowByStorageKey(knex, key, ['id']);
        const patch = {
            tag_id: selectedTag?.id || null,
            tag_slug: selectedTag?.slug || null,
            updated_at: now
        };

        if (existing) {
            await knex('social_media_assets').where({ id: existing.id }).update(patch);
            updated += 1;
            continue;
        }

        const insertPayload = {
            id: ObjectId().toHexString(),
            storage_key: key,
            storage_key_hash: socialMediaAssets.buildStorageKeyHash(key),
            storage_url: keyToUrl.get(key),
            asset_type: inferAssetTypeByKey(key),
            owner_scope: post.get('group_id') ? 'group' : 'user',
            user_id: post.get('created_by') || frame.options?.context?.user || null,
            group_id: post.get('group_id') || null,
            tag_id: selectedTag?.id || null,
            tag_slug: selectedTag?.slug || null,
            created_at: now,
            updated_at: now
        };

        try {
            await knex('social_media_assets').insert(insertPayload);
        } catch (err) {
            if (!socialMediaAssets.isMissingStorageKeyHashColumnError(err)) {
                throw err;
            }

            delete insertPayload.storage_key_hash;
            await knex('social_media_assets').insert(insertPayload);
        }
        inserted += 1;
    }

    return {
        data: [{
            post_id: postId,
            synced_count: keys.length,
            updated_count: updated,
            inserted_count: inserted,
            category: selectedTag?.name || null,
            category_slug: selectedTag?.slug || null,
            mode
        }]
    };
};

const extractCategorySlugFromKey = (key) => {
    const parts = String(key || '').split('/').filter(Boolean);
    const galleryIdx = parts.indexOf('gallery');
    if (galleryIdx < 0) {
        return null;
    }

    // gallery/<scope>/<alias>/<category?>/<YYYY>/<MM>/<file>
    const categoryIdx = galleryIdx + 3;
    if (parts.length <= categoryIdx) {
        return null;
    }

    const candidate = parts[categoryIdx];
    if (/^\d{4}$/.test(candidate)) {
        return null;
    }

    return candidate || null;
};

const attachCategoryInfo = async (items) => {
    if (!Array.isArray(items) || items.length === 0) {
        return items;
    }

    const knex = models.Base.knex;
    const keys = items.map(item => item.key).filter(Boolean);
    let rows = [];

    try {
        if (keys.length > 0) {
            const keyHashes = keys
                .map(key => socialMediaAssets.buildStorageKeyHash(key))
                .filter(Boolean);
            try {
                rows = await knex('social_media_assets as sma')
                    .leftJoin('tags as t', 'sma.tag_id', 't.id')
                    .whereIn('sma.storage_key_hash', keyHashes)
                    .select(
                        'sma.storage_key as storage_key',
                        'sma.thumbnail_url as thumbnail_url',
                        'sma.storage_key_hash as storage_key_hash',
                        'sma.thumbnail_storage_key as thumbnail_storage_key',
                        'sma.original_filename as original_filename',
                        'sma.tag_slug as asset_tag_slug',
                        'sma.asset_type as asset_type',
                        'sma.created_at as created_at',
                        'sma.updated_at as updated_at',
                        't.name as tag_name',
                        't.slug as tag_slug'
                    );
            } catch (err) {
                if (
                    !isMissingThumbnailColumnError(err) &&
                    !socialMediaAssets.isMissingStorageKeyHashColumnError(err)
                ) {
                    throw err;
                }

                rows = await knex('social_media_assets as sma')
                    .leftJoin('tags as t', 'sma.tag_id', 't.id')
                    .whereIn('sma.storage_key', keys)
                    .select(
                        'sma.storage_key as storage_key',
                        'sma.original_filename as original_filename',
                        'sma.tag_slug as asset_tag_slug',
                        'sma.asset_type as asset_type',
                        'sma.created_at as created_at',
                        'sma.updated_at as updated_at',
                        't.name as tag_name',
                        't.slug as tag_slug'
                    );
            }
        } else {
            rows = [];
        }
    } catch (err) {
        if (err?.code !== 'ER_NO_SUCH_TABLE' && err?.code !== 'SQLITE_ERROR') {
            throw err;
        }
    }

    const byKey = new Map();
    rows.forEach((row) => {
        byKey.set(row.storage_key, row);
    });

    const slugSet = new Set();
    const enriched = items.map((item) => {
        const row = byKey.get(item.key);
        const categorySlug = row?.tag_slug || row?.asset_tag_slug || extractCategorySlugFromKey(item.key);
        if (categorySlug) {
            slugSet.add(categorySlug);
        }
        return {
            ...item,
            original_filename: row?.original_filename || null,
            thumbnail_url: row?.thumbnail_url || null,
            thumbnail_storage_key: row?.thumbnail_storage_key || null,
            asset_type: row?.asset_type || null,
            created_at: row?.created_at || null,
            updated_at: row?.updated_at || null,
            type: resolveGalleryItemType({
                ...item,
                asset_type: row?.asset_type || null
            }),
            category: row?.tag_name || null,
            category_slug: categorySlug || null
        };
    });

    const unresolvedSlugs = Array.from(slugSet).filter((slug) => {
        return enriched.find(i => i.category_slug === slug && !i.category);
    });

    if (unresolvedSlugs.length > 0) {
        const tagRows = await knex('tags')
            .whereIn('slug', unresolvedSlugs)
            .select('slug', 'name');
        const tagNameBySlug = new Map(tagRows.map(t => [t.slug, t.name]));

        return enriched.map((item) => {
            if (item.category || !item.category_slug) {
                return item;
            }

            return {
                ...item,
                category: tagNameBySlug.get(item.category_slug) || null
            };
        });
    }

    return enriched;
};

const listByPrefix = async (store, prefix, limit, nextCursor, type) => {
    const scanBatchLimit = Math.max(Math.min(limit, 200), 60);
    const maxScanBatches = 20;

    let cursor = nextCursor || null;
    let lastPrefix = prefix;
    let listedCount = 0;
    let batchCount = 0;
    let scanResult = null;
    const collected = [];

    do {
        scanResult = await store.list({
            prefix,
            limit: scanBatchLimit,
            next_cursor: cursor
        });

        batchCount += 1;
        lastPrefix = scanResult.prefix || prefix;
        listedCount += scanResult.count || (scanResult.items || []).length || 0;

        const enrichedItems = await attachCategoryInfo(scanResult.items || []);
        const typedItems = (enrichedItems || []).filter(item => matchType(item, type));
        collected.push(...typedItems);

        cursor = scanResult.nextCursor || null;
        if (collected.length >= limit) {
            break;
        }
    } while (cursor && batchCount < maxScanBatches);

    const items = collected
        .sort((a, b) => {
            const createdA = new Date(a?.created_at || a?.lastModified || 0).getTime() || 0;
            const createdB = new Date(b?.created_at || b?.lastModified || 0).getTime() || 0;
            if (createdB !== createdA) {
                return createdB - createdA;
            }

            const updatedA = new Date(a?.updated_at || a?.lastModified || 0).getTime() || 0;
            const updatedB = new Date(b?.updated_at || b?.lastModified || 0).getTime() || 0;
            if (updatedB !== updatedA) {
                return updatedB - updatedA;
            }

            return String(b?.key || '').localeCompare(String(a?.key || ''));
        })
        .slice(0, limit);

    return {
        data: items,
        meta: {
            prefix: lastPrefix,
            count: items.length,
            listed_count: listedCount,
            next_cursor: cursor || null
        }
    };
};

const listByAssetTable = async ({ scope, userId, groupId, jobId, limit, nextCursor, type, orderBy }) => {
    const knex = models.Base.knex;
    const cursor = parseDbNextCursor(nextCursor);
    const sortField = orderBy?.field === 'updated_at' ? 'updated_at' : 'created_at';
    const sortDirection = orderBy?.direction === 'asc' ? 'asc' : 'desc';

    const buildAssetTableQuery = (includeThumbnailColumns) => {
        const columns = [
            'sma.id as id',
            'sma.storage_key as key',
            'sma.storage_url as url',
            'sma.storage_key as path',
            'sma.original_filename as original_filename',
            'sma.asset_type as asset_type',
            'sma.job_id as job_id',
            'sma.created_at as created_at',
            'sma.updated_at as updated_at',
            't.name as tag_name',
            't.slug as tag_slug'
        ];

        if (includeThumbnailColumns) {
            columns.splice(4, 0,
                'sma.thumbnail_url as thumbnail_url',
                'sma.thumbnail_storage_key as thumbnail_storage_key'
            );
        }

        return knex('social_media_assets as sma')
            .leftJoin('tags as t', 'sma.tag_id', 't.id')
            .select(columns)
            .where('sma.owner_scope', scope)
            .limit(limit + 1)
            .orderBy(`sma.${sortField}`, sortDirection)
            .orderBy('sma.id', sortDirection);
    };

    let query = buildAssetTableQuery(true);

    if (scope === 'group') {
        query = query.andWhere('sma.group_id', groupId);
    } else {
        query = query.andWhere('sma.user_id', userId).whereNull('sma.group_id');
    }

    if (type !== TYPE_ALL) {
        query = query.andWhere('sma.asset_type', type);
    }

    if (jobId) {
        query = query.andWhere('sma.job_id', jobId);
    }

    if (cursor) {
        query = query.andWhere(function () {
            this.where(`sma.${sortField}`, sortDirection === 'asc' ? '>' : '<', cursor.createdAt)
                .orWhere(function () {
                    this.where(`sma.${sortField}`, '=', cursor.createdAt)
                        .andWhere('sma.id', sortDirection === 'asc' ? '>' : '<', cursor.id);
                });
        });
    }

    let rows;
    try {
        rows = await query;
    } catch (err) {
        if (!isMissingThumbnailColumnError(err)) {
            throw err;
        }

        query = buildAssetTableQuery(false);

        if (scope === 'group') {
            query = query.andWhere('sma.group_id', groupId);
        } else {
            query = query.andWhere('sma.user_id', userId).whereNull('sma.group_id');
        }

        if (type !== TYPE_ALL) {
            query = query.andWhere('sma.asset_type', type);
        }

        if (jobId) {
            query = query.andWhere('sma.job_id', jobId);
        }

        if (cursor) {
            query = query.andWhere(function () {
                this.where(`sma.${sortField}`, sortDirection === 'asc' ? '>' : '<', cursor.createdAt)
                    .orWhere(function () {
                        this.where(`sma.${sortField}`, '=', cursor.createdAt)
                            .andWhere('sma.id', sortDirection === 'asc' ? '>' : '<', cursor.id);
                    });
            });
        }

        rows = await query;
    }
    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;

    const items = pageRows.map((row) => ({
        key: row.key,
        url: row.url,
        path: row.path,
        thumbnail_url: row.thumbnail_url || null,
        thumbnail_storage_key: row.thumbnail_storage_key || null,
        name: String(row.original_filename || '').trim() || String(row.key || '').split('/').filter(Boolean).pop() || null,
        type: resolveGalleryItemType({
            asset_type: row.asset_type
        }),
        asset_type: row.asset_type || null,
        job_id: row.job_id || null,
        category: row.tag_name || null,
        category_slug: row.tag_slug || null,
        created_at: row.created_at || null,
        updated_at: row.updated_at || null,
        lastModified: row.updated_at || row.created_at || null
    }));

    return {
        data: items,
        meta: {
            count: items.length,
            listed_count: items.length,
            next_cursor: hasMore ? buildDbNextCursor(pageRows[pageRows.length - 1]) : null
        }
    };
};

const resolveGroupAndCheckRead = async (frame, groupId) => {
    // @ts-ignore
    const group = await models.SocialGroup.findOne({ id: groupId });
    if (!group) {
        throw new errors.NotFoundError({
            message: tpl(messages.groupNotFound, { groupId })
        });
    }

    const userId = frame.options?.context?.user;
    if (group.get('type') !== 'public') {
        if (!userId) {
            throw new errors.NoPermissionError({
                message: tpl(messages.userRequired)
            });
        }

        // @ts-ignore
        const allowed = await models.SocialGroup.canAccessGroup(group, userId, 'read');
        if (!allowed) {
            throw new errors.NoPermissionError({
                message: tpl(messages.noPermission, { groupId, user: userId })
            });
        }
    }

    return group;
};

const resolveUploadContext = async (frame) => {
    const mediaStore = storage.getStorage('media');
    const userId = frame.options?.context?.user;
    const groupId = getFrameValue(frame, 'group_id');
    const tag = await socialMediaAssets.resolveTag(models.Base.knex, frame);

    logging.info('[social-gallery] resolveUploadContext: start', {
        userId: userId || null,
        groupId: groupId || null,
        hasTag: Boolean(tag),
        hasGetTargetDir: typeof mediaStore?.getTargetDir === 'function'
    });

    if (typeof mediaStore.getTargetDir !== 'function') {
        logging.info('[social-gallery] resolveUploadContext: media store has no getTargetDir');
        return { mediaStore, targetDir: null, userId: userId || null, groupId: groupId || null, tag };
    }

    const root = mediaStore.pathPrefix || mediaStore.storagePath || '';
    logging.info('[social-gallery] resolveUploadContext: storage root resolved', {
        root
    });

    if (groupId) {
        if (!userId) {
            throw new errors.NoPermissionError({
                message: tpl(messages.userRequired)
            });
        }

        // @ts-ignore
        const group = await models.SocialGroup.findOne({ id: groupId });
        if (!group) {
            throw new errors.NotFoundError({
                message: tpl(messages.groupNotFound, { groupId })
            });
        }

        // @ts-ignore
        const allowed = await models.SocialGroup.canAccessGroup(group, userId, 'write');
        if (!allowed) {
            throw new errors.NoPermissionError({
                message: tpl(messages.noPermission, { groupId, user: userId })
            });
        }

        // @ts-ignore
        logging.info('[social-gallery] resolveUploadContext: before group alias', {
            groupId,
            userId
        });
        const groupAlias = await models.SocialGroup.ensureMediaFolderAlias(groupId);
        logging.info('[social-gallery] resolveUploadContext: group alias resolved', {
            groupId,
            groupAlias
        });
        const baseDir = path.posix.join(root, 'gallery', 'groups', groupAlias);
        return {
            mediaStore,
            targetDir: mediaStore.getTargetDir(baseDir),
            userId,
            groupId,
            tag
        };
    }

    if (!userId) {
        throw new errors.NoPermissionError({
            message: tpl(messages.userRequired)
        });
    }

    logging.info('[social-gallery] resolveUploadContext: before user alias', {
        userId
    });
    const userAlias = await models.User.ensureMediaFolderAlias(userId);
    logging.info('[social-gallery] resolveUploadContext: user alias resolved', {
        userId,
        userAlias
    });
    const baseDir = path.posix.join(root, 'gallery', 'users', userAlias);
    return {
        mediaStore,
        targetDir: mediaStore.getTargetDir(baseDir),
        userId,
        groupId: null,
        tag
    };
};

/** @type {import('@tryghost/api-framework').Controller} */
const controller = {
    docName: 'socialgallery',

    user: {
        headers: {
            cacheInvalidate: false
        },
        options: [
            'limit',
            'next_cursor',
            'type',
            'job_id',
            'include',
            'page',
            'limit',
            'fields',
            'filter',
            'order',
            'debug'
        ],
        permissions: false,
        async query(frame) {
            const userId = frame.options?.context?.user;
            if (!userId) {
                throw new errors.NoPermissionError({
                    message: tpl(messages.userRequired)
                });
            }

            const limit = parseLimit(frame.options?.limit);
            const nextCursor = frame.options?.next_cursor || null;
            const type = parseType(frame.options?.type);
            const jobId = String(frame.options?.job_id || '').trim() || null;
            const orderBy = parseOrderBy(frame.options?.orderby || frame.options?.order);

            const userAlias = await models.User.ensureMediaFolderAlias(userId);
            const listed = await listByAssetTable({
                scope: 'user',
                userId,
                groupId: null,
                jobId,
                limit,
                nextCursor,
                type,
                orderBy
            });
            listed.meta.scope = 'user';
            listed.meta.alias = userAlias;
            listed.meta.user_id = userId;
            listed.meta.job_id = jobId;
            listed.meta.type = type;
            listed.meta.orderby = `${orderBy.field}:${orderBy.direction}`;

            return listed;
        }
    },

    group: {
        headers: {
            cacheInvalidate: false
        },
        options: [
            'limit',
            'next_cursor',
            'type',
            'group_id',
            'job_id',
            'include',
            'page',
            'limit',
            'fields',
            'filter',
            'order',
            'debug'
        ],
        data: [
            'id'
        ],
        permissions: false,
        async query(frame) {
            const groupId = frame.data?.id || frame.options?.group_id;
            if (!groupId) {
                throw new errors.ValidationError({
                    message: tpl(messages.groupRequired)
                });
            }

            const group = await resolveGroupAndCheckRead(frame, groupId);
            const limit = parseLimit(frame.options?.limit);
            const nextCursor = frame.options?.next_cursor || null;
            const type = parseType(frame.options?.type);
            const jobId = String(frame.options?.job_id || '').trim() || null;
            const orderBy = parseOrderBy(frame.options?.orderby || frame.options?.order);

            // @ts-ignore
            const groupAlias = await models.SocialGroup.ensureMediaFolderAlias(groupId);
            const listed = await listByAssetTable({
                scope: 'group',
                userId: null,
                groupId,
                jobId,
                limit,
                nextCursor,
                type,
                orderBy
            });

            listed.meta.scope = 'group';
            listed.meta.alias = groupAlias;
            listed.meta.group_id = groupId;
            listed.meta.job_id = jobId;
            listed.meta.group_type = group.get('type');
            listed.meta.type = type;
            listed.meta.orderby = `${orderBy.field}:${orderBy.direction}`;

            return listed;
        }
    },

    presign: {
        headers: {
            cacheInvalidate: false
        },
        options: [
            'group_id',
            'job_id',
            'tag',
            'tag_slug',
            'tag_id',
            'filename',
            'content_type',
            'content_length',
            'original_filename'
        ],
        permissions: false,
        async query(frame) {
            const filename = sanitizeFileName(getFrameValue(frame, 'filename'));
            const originalFilename = sanitizeFileName(getFrameValue(frame, 'original_filename') || filename);
            const contentType = String(getFrameValue(frame, 'content_type') || '').trim();
            const contentLengthRaw = getFrameValue(frame, 'content_length');
            const contentLength = contentLengthRaw == null ? null : Number(contentLengthRaw);

            if (!filename) {
                throw new errors.ValidationError({
                    message: tpl(messages.filenameRequired)
                });
            }
            if (!contentType) {
                throw new errors.ValidationError({
                    message: tpl(messages.contentTypeRequired)
                });
            }
            if (!originalFilename) {
                throw new errors.ValidationError({
                    message: tpl(messages.originalFilenameRequired)
                });
            }
            if (contentLengthRaw != null && (!Number.isFinite(contentLength) || contentLength <= 0)) {
                throw new errors.ValidationError({
                    message: tpl(messages.invalidContentLength)
                });
            }

            logging.info('[social-gallery] presign stage: before resolveUploadContext', {
                filename,
                originalFilename,
                contentType,
                contentLength: Number.isFinite(contentLength) ? contentLength : null,
                userId: frame.options?.context?.user || null,
                groupId: getFrameValue(frame, 'group_id') || null
            });
            const uploadContext = await resolveUploadContext(frame);
            const mediaStore = uploadContext.mediaStore;
            if (typeof mediaStore.getPresignedPutUrl !== 'function') {
                throw new errors.ValidationError({
                    message: tpl(messages.storageNoPresign)
                });
            }

            const uniqueKey = buildUniqueStorageKey(uploadContext.targetDir || '', filename);
            logging.info('[social-gallery] presign stage: unique key resolved', {
                filename,
                uniqueKey,
                targetDir: uploadContext.targetDir || null,
                ownerScope: uploadContext.groupId ? 'group' : 'user',
                userId: uploadContext.userId || null,
                groupId: uploadContext.groupId || null
            });
            let presigned;
            try {
                presigned = await mediaStore.getPresignedPutUrl({
                    key: uniqueKey,
                    contentType,
                    expiresInSeconds: 900
                });
            } catch (err) {
                wrapStorageError(messages.presignFailed, { filename }, err);
            }
            logging.info('[social-gallery] presign stage: presigned url created', {
                filename,
                storageKey: presigned?.key || null,
                storageUrl: presigned?.url || null
            });

            const assetType = resolveUploadedAssetType({ filename, contentType });
            let thumbnailPresigned = null;
            if (assetType === TYPE_VIDEO) {
                const thumbnailKey = buildThumbnailStorageKey(presigned?.key || uniqueKey);

                try {
                    thumbnailPresigned = await mediaStore.getPresignedPutUrl({
                        key: thumbnailKey,
                        contentType: 'image/png',
                        expiresInSeconds: 900
                    });
                } catch (err) {
                    logging.warn('[social-gallery] presign stage: failed to create thumbnail presign', {
                        filename,
                        thumbnailKey,
                        message: err?.message || null
                    });
                }

                if (thumbnailPresigned) {
                    logging.info('[social-gallery] presign stage: thumbnail presigned url created', {
                        filename,
                        thumbnailKey: thumbnailPresigned?.key || thumbnailKey,
                        thumbnailUrl: thumbnailPresigned?.url || null
                    });
                }
            }

            return {
                data: [{
                    upload_url: presigned.uploadUrl,
                    storage_url: presigned.url,
                    storage_key: presigned.key,
                    headers: presigned.headers || {},
                    original_filename: originalFilename,
                    asset_type: assetType,
                    owner_scope: uploadContext.groupId ? 'group' : 'user',
                    user_id: uploadContext.userId || null,
                    group_id: uploadContext.groupId || null,
                    job_id: String(getFrameValue(frame, 'job_id') || '').trim() || null,
                    category: uploadContext.tag?.name || null,
                    category_slug: uploadContext.tag?.slug || null,
                    content_type: contentType,
                    content_length: Number.isFinite(contentLength) ? contentLength : null,
                    thumbnail_upload_url: thumbnailPresigned?.uploadUrl || null,
                    thumbnail_storage_url: thumbnailPresigned?.url || null,
                    thumbnail_storage_key: thumbnailPresigned?.key || null,
                    thumbnail_headers: thumbnailPresigned?.headers || {},
                    thumbnail_content_type: thumbnailPresigned ? 'image/png' : null,
                    thumbnail_filename: thumbnailPresigned ? buildThumbnailFilename(originalFilename || filename) : null
                }]
            };
        }
    },

    finalize: {
        headers: {
            cacheInvalidate: false
        },
        options: [
            'group_id',
            'job_id',
            'tag',
            'tag_slug',
            'tag_id',
            'storage_key',
            'storage_url',
            'thumbnail_storage_key',
            'thumbnail_storage_url',
            'asset_type',
            'original_filename'
        ],
        permissions: false,
        async query(frame) {
            const storageKey = String(getFrameValue(frame, 'storage_key') || '').trim();
            const storageUrl = String(getFrameValue(frame, 'storage_url') || '').trim();
            const thumbnailStorageKey = String(getFrameValue(frame, 'thumbnail_storage_key') || '').trim();
            const thumbnailStorageUrl = String(getFrameValue(frame, 'thumbnail_storage_url') || '').trim();
            const requestedAssetType = String(getFrameValue(frame, 'asset_type') || '').trim().toLowerCase();
            const originalFilename = sanitizeFileName(getFrameValue(frame, 'original_filename'));
            const jobId = String(getFrameValue(frame, 'job_id') || '').trim() || null;

            if (!storageKey) {
                throw new errors.ValidationError({
                    message: tpl(messages.storageKeyRequired)
                });
            }
            if (!storageUrl) {
                throw new errors.ValidationError({
                    message: tpl(messages.storageUrlRequired)
                });
            }

            const uploadContext = await resolveUploadContext(frame);
            const assetType = [TYPE_IMAGE, TYPE_VIDEO, TYPE_AUDIO, TYPE_FILE].includes(requestedAssetType)
                ? requestedAssetType
                : inferAssetTypeByKey(storageKey);

            let assetId;
            try {
                assetId = await socialMediaAssets.upsertAsset({
                    knex: models.Base.knex,
                    store: uploadContext.mediaStore,
                    url: storageUrl,
                    thumbnailUrl: thumbnailStorageUrl || null,
                    thumbnailStorageKey: thumbnailStorageKey || null,
                    assetType,
                    originalFilename,
                    jobId,
                    userId: uploadContext.userId,
                    groupId: uploadContext.groupId,
                    tag: uploadContext.tag
                });
            } catch (err) {
                wrapStorageError(messages.finalizeFailed, { storageKey }, err);
            }

            return {
                data: [{
                    id: assetId,
                    storage_key: storageKey,
                    storage_url: storageUrl,
                    thumbnail_storage_key: thumbnailStorageKey || null,
                    thumbnail_storage_url: thumbnailStorageUrl || null,
                    thumbnail_url: thumbnailStorageUrl || null,
                    original_filename: originalFilename || null,
                    job_id: jobId,
                    asset_type: assetType,
                    owner_scope: uploadContext.groupId ? 'group' : 'user',
                    user_id: uploadContext.userId || null,
                    group_id: uploadContext.groupId || null,
                    category: uploadContext.tag?.name || null,
                    category_slug: uploadContext.tag?.slug || null
                }]
            };
        }
    },

    syncTags: {
        headers: {
            cacheInvalidate: false
        },
        options: [
            'post_id',
            'mode'
        ],
        permissions: false,
        async query(frame) {
            return syncAssetsFromPost(frame);
        }
    },

    updateTag: {
        headers: {
            cacheInvalidate: false
        },
        options: [
            'storage_key',
            'tag_id',
            'tag_slug',
            'tag'
        ],
        permissions: false,
        async query(frame) {
            const storageKey = String(frame.data?.storage_key || frame.options?.storage_key || '').trim();
            if (!storageKey) {
                throw new errors.ValidationError({
                    message: tpl(messages.storageKeyRequired)
                });
            }

            const knex = models.Base.knex;
            const existing = await socialMediaAssets.findAssetRowByStorageKey(knex, storageKey, ['id']);
            if (!existing) {
                throw new errors.NotFoundError({
                    message: tpl(messages.assetNotFound, {storageKey})
                });
            }

            const hasTagInput = Boolean(
                frame.data?.tag_id ||
                frame.data?.tag_slug ||
                frame.data?.tag ||
                frame.options?.tag_id ||
                frame.options?.tag_slug ||
                frame.options?.tag
            );
            const resolvedTag = await socialMediaAssets.resolveTag(knex, frame);
            if (hasTagInput && !resolvedTag) {
                throw new errors.NotFoundError({
                    message: tpl(messages.tagNotFound)
                });
            }

            const now = new Date();
            const patch = {
                tag_id: resolvedTag?.id || null,
                tag_slug: resolvedTag?.slug || null,
                updated_at: now
            };

            await knex('social_media_assets').where({id: existing.id}).update(patch);

            return {
                data: [{
                    id: existing.id,
                    storage_key: storageKey,
                    tag_id: patch.tag_id,
                    tag_slug: patch.tag_slug,
                    category: resolvedTag?.name || null,
                    category_slug: resolvedTag?.slug || null,
                    updated_at: now
                }]
            };
        }
    }
};

module.exports = controller;
