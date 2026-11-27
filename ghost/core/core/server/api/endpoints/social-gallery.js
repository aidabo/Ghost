const path = require('path');
const tpl = require('@tryghost/tpl');
const logging = require('@tryghost/logging');
const errors = require('@tryghost/errors');
const ObjectId = require('bson-objectid').default;
const storage = require('../../adapters/storage');
const models = require('../../models');
const socialMediaAssets = require('./utils/social-media-assets');
const staffScope = require('./utils/staff-scope');
const permissionsService = require('../../services/permissions');
const galleryKeyScope = require('./utils/gallery-key-scope');

const messages = {
    userRequired: 'No login user authentication, can not read gallery in this scope.',
    groupRequired: '`group_id` is required.',
    groupNotFound: 'Group not found: {groupId}.',
    propertyRequired: '`property_id` is required.',
    propertyNotFound: 'Estate property not found: {propertyId}.',
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
    tagNotFound: 'Tag not found for the supplied tag value.',
    deepzoomJobIdRequired: '`job_id` is required for deepzoom gallery uploads.',
    assetIdRequired: '`id` is required.',
    assetRowNotFound: 'Gallery asset not found: {id}.',
    noAssetPermission: 'You are not allowed to delete this gallery asset.',
    noRenamePermission: 'Only the person who added this file can change its name.',
    noTagPermission: 'You are not allowed to change the tag of this gallery file.',
    noSyncPostPermission: 'You are not allowed to edit this post.',
    displayNameTooLong: '`display_name` must be 200 characters or fewer.',
    displayNameRequired: '`display_name` is required (send "" or null to clear it).',
    selectedBroadcastAsset: 'This gallery asset is selected for a virtual broadcast. Clear the broadcast selection before deleting it.',
    projectRequired: '`project_id` is required.',
    projectNotFound: 'Project not found: {projectId}.',
    noProjectPermission: 'You are not allowed to access this project gallery.',
    jobIdRequired: '`job_id` is required.',
    jobNotFound: 'Chart job not found: {jobId}.',
    noJobPermission: 'You are not allowed to access this chart job gallery.',
    invalidPathId: '`{name}` may only contain letters, digits, "-" and "_".',
    storageNoScope: 'Configured storage adapter cannot place gallery uploads (no getTargetDir).',
    keyOutOfScope: '`{field}` must be a file under {prefixes} (the area presign hands out for these values).',
    keyBusy: 'Another upload is finishing with this storage key. Try again.',
    keyUrlMismatch: '`{keyField}` and `{urlField}` must point at the same file of the media store.',
    keyOwnedElsewhere: 'Another gallery asset already uses this storage key; it is not yours to overwrite.'
};

const TYPE_ALL = 'all';
const TYPE_IMAGE = 'image';
const TYPE_VIDEO = 'video';
const TYPE_AUDIO = 'audio';
const TYPE_FILE = 'file';

const getCurrentUserId = frame => frame.options?.context?.user || null;
const {getIntegrationId: getCurrentIntegrationId} = require('./utils/integration-context');

// System admin (Owner / Administrator / Admin). Super Editor is not: it only
// widens the gallery listings below (isNoGroupReader), writes as a normal user.
const isAdminUser = async userId => (await staffScope.getStaffScope(userId)).isSystemAdmin;

// A project / chart job the caller may add files to (copy-to-project / copy-to-job): the caller's own row
// (row.user_id), or a row of a group the caller may write (canAccessGroup 'write': an active member of an active
// group, or an admin of a group that is not archived). A member who may only read the group, a group the caller
// is not in, and a group that no longer exists are refused. Same rule as the content-bundle link-assets.
const canWriteOwnOrGroupRow = async (row, userId) => {
    if (String(row.user_id || '') === String(userId)) {
        return true;
    }
    if (!row.group_id) {
        return false;
    }
    // @ts-ignore
    const group = await models.SocialGroup.findOne({id: row.group_id});
    // @ts-ignore
    return Boolean(group && await models.SocialGroup.canAccessGroup(group, userId, 'write'));
};

const assertCanReadRow = async ({frame, row}) => {
    const currentUserId = getCurrentUserId(frame);
    if (getCurrentIntegrationId(frame) || await isAdminUser(currentUserId)) {
        return;
    }
    if (row.group_id) {
        // @ts-ignore
        const group = await models.SocialGroup.findOne({id: row.group_id});
        if (!group || !(await models.SocialGroup.canAccessGroup(group, currentUserId, 'read'))) {
            throw new errors.NoPermissionError({message: tpl(messages.noProjectPermission)});
        }
        return;
    }
    if (String(row.user_id || '') !== String(currentUserId || '')) {
        throw new errors.NoPermissionError({message: tpl(messages.noProjectPermission)});
    }
};

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
    if (errors.GhostError && err instanceof errors.GhostError) {
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

// Sanitize filename for safe S3 object key. Preserves CJK characters
// (hiragana/katakana U+3040-30FF, CJK unified U+3400-9FFF) and common
// safe punctuation so non-Latin filenames remain readable.
// NOTE: Keep in sync with content/adapters/storage/s3/src/index.js.
const sanitizeFileName = (value) => {
    const raw = String(value || '').trim();
    const base = path.basename(raw).normalize('NFC').replace(/[\\/\0]/g, '-').replace(/[^\p{L}\p{N}\p{M}._()+-]/gu, '-');
    return base || 'upload.bin';
};

const preserveOriginalFilename = (value) => {
    const raw = path.basename(String(value || '').trim()).normalize('NFC');
    return raw || 'upload.bin';
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

// A URL of the media store as its storage key, for comparing a URL of the body with one of the post:
// `&amp;` of the html and percent-encoding do not change the key. null when the URL is not on the store.
const toComparableKey = (store, url) => {
    if (typeof url !== 'string' || typeof store.urlToPath !== 'function') {
        return null;
    }
    const value = url.replace(/&amp;/gi, '&');
    if (!value.startsWith(store.host)) {
        return null;
    }
    const key = store.urlToPath(value);
    return key ? (decodeKey(key) || key) : null;
};

// The post's own URLs (feature_image, html, lexical). urls in the body only narrow them, matched by storage key:
// a URL that is not in the post is dropped (droppedUrlCount), so sync-tags never makes or retags a row for a file
// the post does not show.
const getSyncUrls = (frame, post, store) => {
    const urls = new Set();
    if (post.get('feature_image')) {
        urls.add(post.get('feature_image'));
    }

    extractUrlsFromHtml(post.get('html')).forEach(url => urls.add(url.replace(/&amp;/gi, '&')));
    extractUrlsFromLexical(post.get('lexical')).forEach(url => urls.add(url));

    const payloadUrls = getFrameValue(frame, 'urls');
    if (!Array.isArray(payloadUrls) || payloadUrls.length === 0) {
        return {urls: Array.from(urls), droppedUrlCount: 0};
    }
    const postUrlByKey = new Map();
    urls.forEach((url) => {
        const key = toComparableKey(store, url);
        if (key && !postUrlByKey.has(key)) {
            postUrlByKey.set(key, url);
        }
    });
    const kept = new Set();
    let droppedUrlCount = 0;
    payloadUrls.forEach((url) => {
        const key = toComparableKey(store, url);
        if (key && postUrlByKey.has(key)) {
            kept.add(postUrlByKey.get(key));
        } else {
            droppedUrlCount += 1;
        }
    });
    return {urls: Array.from(kept), droppedUrlCount};
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
        // outside a group: whoever Ghost lets edit the post (its author, editors, admins)
        try {
            await permissionsService.canThis(frame.options.context).edit.post(post.id);
        } catch (err) {
            throw new errors.NoPermissionError({
                message: tpl(messages.noSyncPostPermission)
            });
        }
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
        withRelated: ['tags', 'authors']
    });

    if (!post) {
        throw new errors.NotFoundError({
            message: tpl(messages.postNotFound, { postId })
        });
    }

    await assertCanSyncPost(frame, post);

    const selectedTag = mode === 'primary' ? getPrimaryTag(post) : null;
    const {urls, droppedUrlCount} = getSyncUrls(frame, post, mediaStore);
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
    let skipped = 0;
    const callerId = frame.options?.context?.user;
    // the post's authors: created_by and everyone in its authors
    const authorIds = new Set([post.get('created_by'), ...(post.related('authors')?.toJSON?.() || []).map(author => author?.id)]
        .filter(Boolean).map(String));
    for (const key of keys) {
        const existing = await socialMediaAssets.findAssetRowByStorageKey(knex, key, ['id', 'user_id', 'group_id', 'chart_job_id']);
        const patch = {
            tag_id: selectedTag?.id || null,
            tag_slug: selectedTag?.slug || null,
            updated_at: now
        };

        if (existing) {
            // only rows the caller may retag, or the post author's own: someone else's file shown in the post keeps its tag
            const writable = authorIds.has(String(existing.user_id || '')) ||
                await canRetagAsset(knex, existing, callerId);
            if (!writable) {
                skipped += 1;
                continue;
            }
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
            skipped_count: skipped,
            dropped_url_count: droppedUrlCount,
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

// Who may rename a gallery file: the uploader, or the owner of the chart job that produced the row
// (the same people destroyAsset lets delete). row carries user_id and the chart job's user_id.
const canRenameAsset = (row, userId) => {
    if (!userId) {
        return false;
    }
    return String(row.user_id || '') === String(userId) ||
        (Boolean(row.chart_job_user_id) && String(row.chart_job_user_id) === String(userId));
};

// Who may change a gallery row's tag (sync-tags, PUT /social/gallery/tag): who may rename it (the uploader, the owner
// of the chart job that made it), a member who may write the row's group, or a system admin.
const canRetagAsset = async (knex, row, userId) => {
    if (!userId) {
        return false;
    }
    let chartJobUserId = null;
    if (row.chart_job_id) {
        const job = await knex('social_ai_chart_jobs').where({id: row.chart_job_id}).first('user_id');
        chartJobUserId = job?.user_id || null;
    }
    if (canRenameAsset({...row, chart_job_user_id: chartJobUserId}, userId)) {
        return true;
    }
    if (row.group_id) {
        // @ts-ignore
        const group = await models.SocialGroup.findOne({id: row.group_id});
        // @ts-ignore
        if (group && await models.SocialGroup.canAccessGroup(group, userId, 'write')) {
            return true;
        }
    }
    return isAdminUser(userId);
};

// The name lists show: the display name (alias) first, then the uploaded file name, then the last part of the key.
const galleryItemName = row => String(row.display_name || '').trim() ||
    String(row.original_filename || '').trim() ||
    String(row.key || row.storage_key || '').split('/').filter(Boolean).pop() ||
    null;

// social_ai_video_job_media.role of each listed row that belongs to a video
// job (media_id -> role). Read for the rows already listed, so the visibility
// rules of the listing decide which rows get a role. 'output' wins when one
// file is linked more than once.
const loadVideoJobRoles = async (rows) => {
    const roles = new Map();
    const ids = rows.filter(row => row.video_job_id).map(row => String(row.id));
    if (!ids.length) {
        return roles;
    }
    const links = await models.Base.knex('social_ai_video_job_media as vjm')
        .join('social_media_assets as vsma', function () {
            this.on('vsma.id', 'vjm.media_id').andOn('vsma.video_job_id', 'vjm.video_job_id');
        })
        .whereIn('vjm.media_id', ids)
        .select('vjm.media_id as media_id', 'vjm.role as role');
    links.forEach((link) => {
        const id = String(link.media_id);
        if (!roles.has(id) || link.role === 'output') {
            roles.set(id, link.role || null);
        }
    });
    return roles;
};

// A video job's result stays after the job is deleted (H3 in
// social-ai-video-jobs destroy), but its junction row goes with the job. The
// project video area [<root>/]gallery/projects/<pid>/artifacts/video/ only ever
// holds results (roleForArea there: output only), so a row left there without
// a junction row is still the output.
const videoJobRole = (row, roles) => {
    const linked = roles.get(String(row.id));
    if (linked) {
        return linked;
    }
    const key = String(row.key || '');
    const area = row.project_id ? `gallery/projects/${row.project_id}/artifacts/video/` : null;
    return area && (key.startsWith(area) || key.includes(`/${area}`)) ? 'output' : null;
};

const listByAssetTable = async ({ scope, userId, groupId, jobId, chartJobId, newsJobId, projectId, limit, nextCursor, type, orderBy, newsroomScope = null }) => {
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
            'sma.display_name as display_name',
            'sma.user_id as user_id',
            'cj.user_id as chart_job_user_id',
            'sma.asset_type as asset_type',
            'sma.job_id as job_id',
            'sma.content_bundle_job_id as content_bundle_job_id',
            'sma.news_job_id as news_job_id',
            'sma.dzi_job_id as dzi_job_id',
            'sma.video_job_id as video_job_id',
            'sma.project_id as project_id',
            'njm.post_id as post_id',
            'np.title as post_title',
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

        const query = knex('social_media_assets as sma')
            .leftJoin('tags as t', 'sma.tag_id', 't.id')
            // who may rename: the uploader, or the owner of the chart job that produced the row (same as destroyAsset)
            .leftJoin('social_ai_chart_jobs as cj', 'cj.id', 'sma.chart_job_id')
            .leftJoin('social_ai_news_job_media as njm', function () {
                this.on('njm.media_id', 'sma.id').andOn('njm.role', '=', knex.raw('?', ['output']));
            })
            .leftJoin('posts as np', 'np.id', 'njm.post_id')
            .select(columns)
            .where(function () {
                this.where('sma.owner_scope', scope);
                if (scope === 'chart_jobs' || scope === 'user' || scope === 'group') {
                    this.orWhere('sma.owner_scope', 'content_bundles');
                    this.orWhere('sma.owner_scope', 'media_jobs');
                    this.orWhere('sma.owner_scope', 'deepzoom');
                    this.orWhere('sma.owner_scope', 'news_jobs');
                    // Video family (social-ai-video-jobs linkAssets): the rows carry
                    // the job's user_id / group_id / project_id, so the user, group
                    // and project filters below pick them up as they are (the
                    // project listing also shows every row of a video job of that
                    // project, see the chart_jobs scope below). There is
                    // no per-job listing (no 'video_jobs' target / 'videojobs'
                    // action) yet: the video screen (front PR 5) adds one if it
                    // needs it. A browser upload never writes these rows: an
                    // unknown target such as 'video_jobs' falls back to the user
                    // scope in resolveGalleryScope; only linkAssets writes them.
                    this.orWhere('sma.owner_scope', 'video_jobs');
                }
            })
            .limit(limit + 1)
            .orderBy(`sma.${sortField}`, sortDirection)
            .orderBy('sma.id', sortDirection);
        return query;
    };

    // The visibility and filter rules, applied to the normal query and to the
    // fallback query for a database without the thumbnail columns alike.
    const applyListFilters = (baseQuery) => {
        let query = baseQuery;

        if (scope === 'group') {
            query = query.andWhere('sma.group_id', groupId).whereNotExists(function () {
                this.select(1)
                    .from('estate_property_media as epm')
                    .whereRaw('epm.media_id = sma.id');
            });
        } else if (scope === 'chart_jobs') {
            // Chart-job artifacts are written by the worker (Admin JWT) with a null
            // user_id, so ownership is scoped through the OWNING chart job (user_id).
            // Also allow rows the caller uploaded directly. Without this, any signed-in
            // user could enumerate every user's chart-job artifacts (IDOR).
            query = query
                .where(function () {
                    this.where('sma.user_id', userId).orWhereExists(function () {
                        this.select(1)
                            .from('social_ai_chart_jobs as caj')
                            .whereRaw('caj.id = sma.chart_job_id')
                            .andWhere('caj.user_id', userId);
                    }).orWhereExists(function () {
                        this.select(1)
                            .from('social_ai_content_bundle_jobs as cbj')
                            .whereRaw('cbj.id = sma.content_bundle_job_id')
                            .andWhere('cbj.user_id', userId);
                    }).orWhereExists(function () {
                        this.select(1)
                            .from('social_ai_media_jobs as mj')
                            .whereRaw('mj.id = sma.job_id')
                            .andWhere('mj.user_id', userId);
                    }).orWhereExists(function () {
                        this.select(1)
                            .from('social_ai_dzi_jobs as dzj')
                            .whereRaw('dzj.id = sma.dzi_job_id')
                            .andWhere('dzj.user_id', userId);
                    }).orWhereExists(function () {
                        // News Agent family — same reasoning as chart: the worker
                        // writes artifacts with a null user_id, so ownership is
                        // resolved through the OWNING news job.
                        this.select(1)
                            .from('social_ai_news_jobs as nj')
                            .whereRaw('nj.id = sma.news_job_id')
                            .andWhere('nj.user_id', userId);
                    });
                    if (projectId) {
                        // Project listing only (the caller already passed the project
                        // read check): a job of THIS project shows its result rows to
                        // everyone who can read the project, e.g. the other members of
                        // a group project, not only to the job's creator.
                        // chart_job_id / news_job_id are checked on upload (finalize:
                        // an existing job of the row's project the caller can read)
                        // and video_job_id is written by video-jobs linkAssets only.
                        // job_id / content_bundle_job_id / dzi_job_id are not checked
                        // on upload, so for those the row must be written as the
                        // job's user (the job's own rows; null for both from an
                        // integration).
                        const sameUserAsJob = function (jobAlias) {
                            this.whereRaw(`sma.user_id = ${jobAlias}.user_id`).orWhere(function () {
                                this.whereNull('sma.user_id').whereNull(`${jobAlias}.user_id`);
                            });
                        };
                        [
                            ['social_ai_chart_jobs', 'chart_job_id', false],
                            ['social_ai_content_bundle_jobs', 'content_bundle_job_id', true],
                            ['social_ai_media_jobs', 'job_id', true],
                            ['social_ai_news_jobs', 'news_job_id', false],
                            ['social_ai_video_jobs', 'video_job_id', false]
                        ].forEach(([jobTable, assetColumn, checkUser]) => {
                            this.orWhereExists(function () {
                                this.select(1)
                                    .from(`${jobTable} as pj`)
                                    .whereRaw(`pj.id = sma.${assetColumn}`)
                                    .andWhere('pj.project_id', projectId);
                                if (checkUser) {
                                    this.andWhere(function () {
                                        sameUserAsJob.call(this, 'pj');
                                    });
                                }
                            });
                        });
                        // dzi jobs have no project_id column: they join projects
                        // through the social_ai_dzi_job_projects junction.
                        this.orWhereExists(function () {
                            this.select(1)
                                .from('social_ai_dzi_job_projects as pjp')
                                .join('social_ai_dzi_jobs as pdj', 'pdj.id', 'pjp.dzi_job_id')
                                .whereRaw('pjp.dzi_job_id = sma.dzi_job_id')
                                .andWhere('pjp.project_id', projectId)
                                .andWhere(function () {
                                    sameUserAsJob.call(this, 'pdj');
                                });
                        });
                        // H3: a chart / news / video job's results in a project stay
                        // after the job is deleted, with the old job id (linkAssets
                        // writes them as the job's user). Such a row is shown when it
                        // is tagged with this project and its job no longer exists.
                        // These three links cannot name a job that never existed or a
                        // job of another project (see above), so a row like this was
                        // the deleted job's.
                        this.orWhere(function () {
                            this.where('sma.project_id', projectId)
                                .where(function () {
                                    [
                                        ['social_ai_chart_jobs', 'chart_job_id'],
                                        ['social_ai_news_jobs', 'news_job_id'],
                                        ['social_ai_video_jobs', 'video_job_id']
                                    ].forEach(([jobTable, assetColumn]) => {
                                        this.orWhere(function () {
                                            this.whereNotNull(`sma.${assetColumn}`).whereNotExists(function () {
                                                this.select(1)
                                                    .from(`${jobTable} as gj`)
                                                    .whereRaw(`gj.id = sma.${assetColumn}`);
                                            });
                                        });
                                    });
                                });
                        });
                    }
                    if (newsroomScope) {
                        this.orWhere(function () {
                            staffScope.whereNewsroomAsset(this, newsroomScope);
                        });
                    }
                })
                .whereNotExists(function () {
                    this.select(1)
                        .from('estate_property_media as epm')
                        .whereRaw('epm.media_id = sma.id');
                });
        } else {
            query = query.andWhere(function () {
                this.where(function () {
                    this.where('sma.user_id', userId).whereNull('sma.group_id');
                });
                if (newsroomScope) {
                    this.orWhere(function () {
                        staffScope.whereNewsroomAsset(this, newsroomScope);
                    });
                }
            }).whereNotExists(function () {
                this.select(1)
                    .from('estate_property_media as epm')
                    .whereRaw('epm.media_id = sma.id');
            });
        }

        if (type !== TYPE_ALL) {
            query = query.andWhere('sma.asset_type', type);
        }

        if (jobId) {
            query = query.andWhere('sma.job_id', jobId);
        }

        if (chartJobId) {
            query = query.andWhere('sma.chart_job_id', chartJobId);
        }

        // News Agent family: one job = many articles, so the artifacts of a single
        // article are picked out of the junction by item_key (handled by the caller);
        // this filters to one job.
        if (newsJobId) {
            query = query.andWhere('sma.news_job_id', newsJobId);
        }

        if (projectId) {
            // Project artifacts = rows tagged directly (project_id, e.g. direct
            // uploads) OR produced by a job of this project (chart_job_id -> project).
            query = query.andWhere(function () {
                this.where('sma.project_id', projectId).orWhereExists(function () {
                    this.select(1)
                        .from('social_ai_chart_jobs as pcaj')
                        .whereRaw('pcaj.id = sma.chart_job_id')
                        .andWhere('pcaj.project_id', projectId);
                }).orWhereExists(function () {
                    this.select(1)
                        .from('social_ai_content_bundle_jobs as pcbj')
                        .whereRaw('pcbj.id = sma.content_bundle_job_id')
                        .andWhere('pcbj.project_id', projectId);
                }).orWhereExists(function () {
                    this.select(1)
                        .from('social_ai_media_jobs as pmj')
                        .whereRaw('pmj.id = sma.job_id')
                        .andWhere('pmj.project_id', projectId);
                }).orWhereExists(function () {
                    this.select(1)
                        .from('social_ai_dzi_job_projects as pdjp')
                        .whereRaw('pdjp.dzi_job_id = sma.dzi_job_id')
                        .andWhere('pdjp.project_id', projectId);
                }).orWhereExists(function () {
                    this.select(1)
                        .from('social_ai_news_jobs as pnj')
                        .whereRaw('pnj.id = sma.news_job_id')
                        .andWhere('pnj.project_id', projectId);
                });
            });
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
        return query;
    };

    let query = applyListFilters(buildAssetTableQuery(true));

    let rows;
    try {
        rows = await query;
    } catch (err) {
        if (!isMissingThumbnailColumnError(err)) {
            throw err;
        }

        query = applyListFilters(buildAssetTableQuery(false));

        rows = await query;
    }
    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const videoRoles = await loadVideoJobRoles(pageRows);

    const items = pageRows.map((row) => ({
        id: row.id,
        key: row.key,
        url: row.url,
        path: row.path,
        thumbnail_url: row.thumbnail_url || null,
        thumbnail_storage_key: row.thumbnail_storage_key || null,
        name: galleryItemName(row),
        display_name: String(row.display_name || '').trim() || null,
        original_filename: row.original_filename || null,
        can_rename: canRenameAsset(row, userId),
        type: resolveGalleryItemType({
            asset_type: row.asset_type
        }),
        asset_type: row.asset_type || null,
        job_id: row.job_id || null,
        dzi_job_id: row.dzi_job_id || null,
        // Video job mark: lets the project page tell a video job's result
        // (role 'output') from its parts without reading the job, which only
        // its creator and a site admin may read. Only the id and the role; the
        // job itself (payload, …) is never returned here.
        video_job_id: row.video_job_id || null,
        role: row.video_job_id ? videoJobRole(row, videoRoles) : null,
        project_id: row.project_id || null,
        post_id: row.post_id || null,
        post_title: row.post_title || null,
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

const resolvePropertyAndCheckExists = async (propertyId) => {
    if (!propertyId) {
        throw new errors.ValidationError({
            message: tpl(messages.propertyRequired)
        });
    }

    // @ts-ignore
    const property = await models.EstateProperty.findOne({ id: propertyId });
    if (!property) {
        throw new errors.NotFoundError({
            message: tpl(messages.propertyNotFound, { propertyId })
        });
    }

    return property;
};

/**
 * Centralized gallery scope resolution.
 * Precedence is explicit so browser state cannot accidentally override a more specific target.
 * Add new scopes here instead of spreading more conditionals across presign/finalize.
 */
const resolveGalleryScope = ({ target, groupId, propertyId, personId, chartId, projectId }) => {
    const normalizedTarget = String(target || '').toLowerCase().trim();
    const normalizedGroupId = String(groupId || '').trim();
    const normalizedPropertyId = String(propertyId || '').trim();
    const normalizedPersonId = String(personId || '').trim();
    const normalizedChartId = String(chartId || '').trim();
    const normalizedProjectId = String(projectId || '').trim();

    // Chart project target: gallery/chart_projects/{projectId}/. Uploaded directly
    // into a project (owner_scope 'chart_jobs' + project_id) so the project gallery
    // and "clear artifacts" pick it up. Used to bring in other agents' outputs.
    if (normalizedTarget === 'project' || normalizedTarget === 'chart_project') {
        return {
            scope: 'project',
            propertyId: null,
            groupId: null,
            personId: null,
            projectId: normalizedProjectId
        };
    }

    if (normalizedTarget === 'property' || normalizedPropertyId) {
        return {
            scope: 'property',
            propertyId: normalizedPropertyId,
            groupId: null,
            personId: null
        };
    }

    if (normalizedTarget === 'group' || normalizedGroupId) {
        return {
            scope: 'group',
            propertyId: null,
            groupId: normalizedGroupId,
            personId: null
        };
    }

    if (normalizedTarget === 'person' || normalizedPersonId) {
        return {
            scope: 'person',
            propertyId: null,
            groupId: null,
            personId: normalizedPersonId
        };
    }

    if (normalizedTarget === 'deepzoom') {
        return {
            scope: 'deepzoom',
            propertyId: null,
            groupId: null,
            personId: null
        };
    }

    // Chart-job artifacts (CSV・images・manifest) uploaded from the host UI.
    // Folder name is `chart_jobs` (user-specified), NOT the table name.
    if (normalizedTarget === 'chart_jobs' || normalizedTarget === 'chartjob') {
        return {
            scope: 'chart_jobs',
            propertyId: null,
            groupId: null,
            personId: null
        };
    }

    // News-job artifacts (voice / video / stills / paper pages). Its own scope
    // and its own folder — never chart's.
    if (normalizedTarget === 'news_jobs' || normalizedTarget === 'newsjob') {
        return {
            scope: 'news_jobs',
            propertyId: null,
            groupId: null,
            personId: null
        };
    }

    if (normalizedTarget === 'chart' || normalizedChartId) {
        return {
            scope: 'chart',
            propertyId: null,
            groupId: null,
            personId: null,
            chartId: normalizedChartId
        };
    }

    return {
        scope: 'user',
        propertyId: null,
        groupId: null,
        personId: null
    };
};

// The DZI job id of a deepzoom upload: presign takes it as job_id, finalize as
// dzi_job_id (finalize's job_id is the media-jobs FK) or, without dzi_job_id,
// as job_id. Shared by resolveUploadContext and finalize so both agree.
const getDeepzoomJobId = frame => String(getFrameValue(frame, 'dzi_job_id') || getFrameValue(frame, 'job_id') || '').trim() || null;

// Ids that become one folder name of the upload key (gallery/persons/{id}/,
// gallery/charts/{id}/). A '/' or '..' would move the key into another area.
const assertPathSafeId = (value, name) => {
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(String(value || ''))) {
        throw new errors.BadRequestError({message: tpl(messages.invalidPathId, {name})});
    }
};

// Target chart_jobs / news_jobs: job_id or chart_job_id / news_job_id names the
// job (docs: gallery-upload-paths 3.2). Both sent and different is refused.
const getTargetJobId = (frame, field) => {
    const viaJobId = String(getFrameValue(frame, 'job_id') || '').trim();
    const viaField = String(getFrameValue(frame, field) || '').trim();
    if (viaJobId && viaField && viaJobId !== viaField) {
        throw new errors.ValidationError({message: `job_id and ${field} name different jobs.`});
    }
    return viaJobId || viaField;
};

const resolveUploadContext = async (frame) => {
    const mediaStore = storage.getStorage('media');
    const userId = frame.options?.context?.user;
    const groupId = getFrameValue(frame, 'group_id');
    const target = getFrameValue(frame, 'target');
    const propertyId = getFrameValue(frame, 'property_id');
    const personId = getFrameValue(frame, 'person_id');
    const chartId = getFrameValue(frame, 'social_chart_id');
    const projectId = getFrameValue(frame, 'project_id');
    const tag = await socialMediaAssets.resolveTag(models.Base.knex, frame);
    const resolvedScope = resolveGalleryScope({target, groupId, propertyId, personId, chartId, projectId});

    logging.info('[social-gallery] resolveUploadContext: start', {
        userId: userId || null,
        groupId: groupId || null,
        target: target || null,
        scope: resolvedScope.scope,
        propertyId: resolvedScope.propertyId || null,
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

    // Property target: gallery/properties/{property-id}/
    if (resolvedScope.scope === 'property') {
        if (!userId) {
            throw new errors.NoPermissionError({
                message: tpl(messages.userRequired)
            });
        }

        await resolvePropertyAndCheckExists(resolvedScope.propertyId);
        const baseDir = path.posix.join(root, 'gallery', 'properties', resolvedScope.propertyId);
        return {
            mediaStore,
            targetDir: mediaStore.getTargetDir(baseDir),
            userId: userId || null,
            groupId: null,
            propertyId: resolvedScope.propertyId,
            ownerScope: 'property',
            areaPrefixes: [galleryKeyScope.buildAreaPrefix(baseDir)],
            tag
        };
    }

    // Person target: gallery/persons/{person-id}/
    if (resolvedScope.scope === 'person' && resolvedScope.personId) {
        assertPathSafeId(resolvedScope.personId, 'person_id');
        const baseDir = path.posix.join(root, 'gallery', 'persons', resolvedScope.personId);
        return {
            mediaStore,
            targetDir: mediaStore.getTargetDir(baseDir),
            userId: userId || null,
            groupId: null,
            personId: resolvedScope.personId,
            ownerScope: 'person',
            areaPrefixes: [galleryKeyScope.buildAreaPrefix(baseDir)],
            tag
        };
    }

    // Deep Zoom target: gallery/deepzoom/{24-char-hex-job-id}/
    if (resolvedScope.scope === 'deepzoom') {
        if (!userId) {
            throw new errors.NoPermissionError({
                message: tpl(messages.userRequired)
            });
        }

        // The folder is the DZI job's: dzi_job_id first (on finalize job_id is the
        // media-jobs FK, see getDeepzoomJobId), then job_id (presign), and a fresh
        // id only when neither is given.
        const jobId = String(getDeepzoomJobId(frame) || ObjectId().toHexString()).trim();
        assertPathSafeId(jobId, 'job_id');
        const baseDir = path.posix.join(root, 'gallery', 'deepzoom', jobId);
        return {
            mediaStore,
            targetDir: mediaStore.getTargetDir(baseDir),
            userId,
            groupId: null,
            jobId,
            ownerScope: 'deepzoom',
            areaPrefixes: [galleryKeyScope.buildAreaPrefix(baseDir)],
            tag
        };
    }

    // Chart project target: gallery/chart_projects/{projectId}/ (owner_scope
    // 'chart_jobs' + project_id). Direct uploads into a project from the UI.
    if (resolvedScope.scope === 'project') {
        if (!userId && !getCurrentIntegrationId(frame)) {
            throw new errors.NoPermissionError({
                message: tpl(messages.userRequired)
            });
        }
        const pid = String(resolvedScope.projectId || '').trim();
        if (!pid) {
            throw new errors.ValidationError({
                message: tpl(messages.projectRequired)
            });
        }
        const project = await models.Base.knex('social_ai_projects')
            .where({id: pid})
            .first('id', 'user_id', 'group_id');
        if (!project) {
            throw new errors.NotFoundError({
                message: tpl(messages.projectNotFound, {projectId: pid})
            });
        }
        await assertCanReadRow({frame, row: project});
        const contentBundleJobId = String(getFrameValue(frame, 'content_bundle_job_id') || '').trim() || null;
        let contentBundleJob = null;
        if (contentBundleJobId) {
            contentBundleJob = await models.Base.knex('social_ai_content_bundle_jobs')
                .where({id: contentBundleJobId})
                .first('id', 'project_id');
            if (!contentBundleJob || String(contentBundleJob.project_id || '') !== pid) {
                throw new errors.ValidationError({message: 'content_bundle_job_id does not belong to project_id.'});
            }
        }
        // News Agent family: same shape as the content-bundle branch above, but its
        // own table and its own owner_scope so the artifacts land under the news
        // family's scope rather than being misfiled as chart's.
        const newsJobId = String(getFrameValue(frame, 'news_job_id') || '').trim() || null;
        let newsJob = null;
        if (newsJobId) {
            newsJob = await models.Base.knex('social_ai_news_jobs')
                .where({id: newsJobId})
                .first('id', 'project_id');
            if (!newsJob || String(newsJob.project_id || '') !== pid) {
                throw new errors.ValidationError({message: 'news_job_id does not belong to project_id.'});
            }
        }
        // A project is a GENERIC task container (media/chart/deepzoom/posts), not
        // chart-specific. An optional typed subfolder routes the upload into the
        // general project tree gallery/projects/{pid}/{subfolder}/ (e.g. artifacts →
        // gallery/projects/{pid}/artifacts/). Legacy chart direct uploads (no
        // subfolder) stay at gallery/chart_projects/{pid}/ for back-compat.
        // Search is by social_media_assets.project_id, so the folder is purely
        // organizational — both trees list together under the project.
        const subRaw = String(getFrameValue(frame, 'subfolder') || '').trim().toLowerCase();
        const sub = /^[a-z0-9_-]{1,32}$/.test(subRaw) ? subRaw : '';
        const baseDir = sub
            ? path.posix.join(root, 'gallery', 'projects', pid, sub)
            : path.posix.join(root, 'gallery', 'chart_projects', pid);
        return {
            mediaStore,
            // NO date subfolder: project artifacts use a stable, flat layout
            // (gallery/projects/{pid}/{subfolder}/{name}) matching the chart
            // worker's artifacts layer — buildUniqueStorageKey already appends a
            // -{8hex} suffix so names never collide without a YYYY/MM split.
            targetDir: baseDir,
            userId,
            groupId: null,
            projectId: pid,
            ownerScope: newsJob ? 'news_jobs' : (contentBundleJob ? 'content_bundles' : 'chart_jobs'),
            contentBundleJobId: contentBundleJob?.id || null,
            newsJobId: newsJob?.id || null,
            // finalize has no subfolder: either project tree is this project's.
            areaPrefixes: [
                galleryKeyScope.buildAreaPrefix(root, 'gallery', 'projects', pid),
                galleryKeyScope.buildAreaPrefix(root, 'gallery', 'chart_projects', pid)
            ],
            tag
        };
    }

    // Chart-job target: gallery/chart_jobs/{24-char-hex-job-id}/  (owner_scope = 'chart_jobs')
    if (resolvedScope.scope === 'chart_jobs') {
        if (!userId) {
            throw new errors.NoPermissionError({
                message: tpl(messages.userRequired)
            });
        }

        // The chart job id is issued by the backend (job model); an upload must reference an
        // existing job. Do NOT invent a random id here — that orphans the artifacts.
        // job_id here names the chart job (chart_job_id), not a media job: finalize
        // writes it to the row's chart_job_id (job_id there is the media-jobs FK).
        const jobId = getTargetJobId(frame, 'chart_job_id');
        if (!/^[a-f0-9]{24}$/i.test(jobId)) {
            throw new errors.BadRequestError({
                message: 'job_id (24-char chart job id) is required for chart_jobs uploads.'
            });
        }
        const baseDir = path.posix.join(root, 'gallery', 'chart_jobs', jobId);
        return {
            mediaStore,
            targetDir: mediaStore.getTargetDir(baseDir),
            userId,
            groupId: null,
            jobId,
            jobIdIsTargetJob: true,
            chartJobId: jobId,
            ownerScope: 'chart_jobs',
            areaPrefixes: [galleryKeyScope.buildAreaPrefix(baseDir)],
            tag
        };
    }

    // News-job target: gallery/news_jobs/{24-char-hex-job-id}/  (owner_scope = 'news_jobs')
    if (resolvedScope.scope === 'news_jobs') {
        if (!userId) {
            throw new errors.NoPermissionError({
                message: tpl(messages.userRequired)
            });
        }

        // The job id is issued by the backend; an upload must reference an
        // existing news job. Inventing an id here would orphan the artifacts.
        // job_id here names the news job (news_job_id), not a media job: finalize
        // writes it to the row's news_job_id (job_id there is the media-jobs FK).
        const jobId = getTargetJobId(frame, 'news_job_id');
        if (!/^[a-f0-9]{24}$/i.test(jobId)) {
            throw new errors.BadRequestError({
                message: 'job_id (24-char news job id) is required for news_jobs uploads.'
            });
        }
        const baseDir = path.posix.join(root, 'gallery', 'news_jobs', jobId);
        return {
            mediaStore,
            targetDir: mediaStore.getTargetDir(baseDir),
            userId,
            groupId: null,
            jobId,
            jobIdIsTargetJob: true,
            newsJobId: jobId,
            ownerScope: 'news_jobs',
            areaPrefixes: [galleryKeyScope.buildAreaPrefix(baseDir)],
            tag
        };
    }

    // Chart target: gallery/charts/{social-chart-id}/  (owner_scope = 'chart')
    if (resolvedScope.scope === 'chart') {
        if (!userId) {
            throw new errors.NoPermissionError({
                message: tpl(messages.userRequired)
            });
        }

        const cid = String(resolvedScope.chartId || getFrameValue(frame, 'social_chart_id') || '').trim();
        if (cid) {
            assertPathSafeId(cid, 'social_chart_id');
        }
        const baseDir = path.posix.join(root, 'gallery', 'charts', cid || 'unknown');
        return {
            mediaStore,
            targetDir: mediaStore.getTargetDir(baseDir),
            userId,
            groupId: null,
            ownerScope: 'chart',
            areaPrefixes: [galleryKeyScope.buildAreaPrefix(baseDir)],
            tag
        };
    }

    if (resolvedScope.scope === 'group') {
        if (!userId) {
            throw new errors.NoPermissionError({
                message: tpl(messages.userRequired)
            });
        }

        // @ts-ignore
        const group = await models.SocialGroup.findOne({id: resolvedScope.groupId});
        if (!group) {
            throw new errors.NotFoundError({
                message: tpl(messages.groupNotFound, {groupId: resolvedScope.groupId})
            });
        }

        // @ts-ignore
        const allowed = await models.SocialGroup.canAccessGroup(group, userId, 'write');
        if (!allowed) {
            throw new errors.NoPermissionError({
                message: tpl(messages.noPermission, {groupId: resolvedScope.groupId, user: userId})
            });
        }

        const groupAlias = await models.SocialGroup.ensureMediaFolderAlias(resolvedScope.groupId);
        const baseDir = path.posix.join(root, 'gallery', 'groups', groupAlias);
        return {
            mediaStore,
            targetDir: mediaStore.getTargetDir(baseDir),
            userId,
            groupId: resolvedScope.groupId,
            ownerScope: 'group',
            areaPrefixes: [galleryKeyScope.buildAreaPrefix(baseDir)],
            tag
        };
    }

    if (!userId) {
        throw new errors.NoPermissionError({
            message: tpl(messages.userRequired)
        });
    }

    const userAlias = await models.User.ensureMediaFolderAlias(userId);
    const baseDir = path.posix.join(root, 'gallery', 'users', userAlias);
    return {
        mediaStore,
        targetDir: mediaStore.getTargetDir(baseDir),
        userId,
        groupId: null,
        ownerScope: 'user',
        areaPrefixes: [galleryKeyScope.buildAreaPrefix(baseDir)],
        tag
    };
};

const decodeKey = (value) => {
    try {
        return decodeURIComponent(value);
    } catch (err) {
        return null;
    }
};

/**
 * finalize: the key and/or URL the client sends back must name one file inside
 * the caller's upload area (uploadContext.areaPrefixes). When both are sent
 * they must agree (the URL may be percent-encoded). Returns the key the row is
 * stored under (the one upsertAsset takes from the URL).
 */
const assertFinalizeKey = ({store, prefixes, key, url, keyField, urlField}) => {
    if (!Array.isArray(prefixes) || prefixes.length === 0) {
        throw new errors.ValidationError({message: tpl(messages.storageNoScope)});
    }
    const outOfScope = field => new errors.ValidationError({
        message: tpl(messages.keyOutOfScope, {field, prefixes: prefixes.join(' or ')})
    });
    const cleanKey = galleryKeyScope.trimSlashes(key);
    if (key && !galleryKeyScope.isKeyInAreas(key, prefixes)) {
        throw outOfScope(keyField);
    }
    if (!url) {
        return cleanKey;
    }

    let urlKey;
    try {
        urlKey = String(socialMediaAssets.getStorageKeyFromUrl(store, url) || '');
    } catch (err) {
        // Local storage throws for a URL it does not serve.
        urlKey = '';
    }
    // A URL the store does not serve comes back unchanged (still with its host).
    if (!urlKey || /^[a-z][a-z0-9+.-]*:\/\//i.test(urlKey) || urlKey.includes('?') || urlKey.includes('#')) {
        throw outOfScope(urlField);
    }
    const decoded = decodeKey(urlKey);
    if (!decoded || !galleryKeyScope.isKeyInAreas(urlKey, prefixes) || !galleryKeyScope.isKeyInAreas(decoded, prefixes)) {
        throw outOfScope(urlField);
    }
    if (key && galleryKeyScope.trimSlashes(urlKey) !== cleanKey && galleryKeyScope.trimSlashes(decoded) !== cleanKey) {
        throw new errors.ValidationError({message: tpl(messages.keyUrlMismatch, {keyField, urlField})});
    }
    return galleryKeyScope.trimSlashes(urlKey);
};

const sameId = (a, b) => String(a || '') === String(b || '');

/**
 * finalize updates the row that already has this key (upsertAsset). That is a
 * retry of the caller's own upload only when the row has the same owner scope,
 * uploader and group and is not a member upload (the key's area already pins
 * the user / group / property / project / job folder); anything else is
 * someone else's file and is refused, never re-pointed.
 */
const assertCanReuseAssetRow = async ({knex, storageKey, uploadContext}) => {
    let existing;
    try {
        existing = await socialMediaAssets.findAssetRowByStorageKey(knex, storageKey, ['*'], {forUpdate: true});
    } catch (err) {
        // Before the table exists upsertAsset skips the row as well.
        if (err?.code === 'ER_NO_SUCH_TABLE' || /no such table/i.test(String(err?.message || ''))) {
            return;
        }
        throw err;
    }
    if (!existing) {
        return;
    }
    const ownerScope = uploadContext.ownerScope || (uploadContext.groupId ? 'group' : 'user');
    const same = sameId(existing.owner_scope, ownerScope)
        && sameId(existing.user_id, uploadContext.userId)
        && sameId(existing.group_id, uploadContext.groupId)
        && !existing.member_id;
    if (!same) {
        throw new errors.ConflictError({message: tpl(messages.keyOwnedElsewhere), context: storageKey});
    }
};

const resolveEstatePropertyMediaType = ({ assetType, storageKey, originalFilename }) => {
    const normalizedAssetType = String(assetType || '').toLowerCase().trim();
    const ext = getExtension({ name: originalFilename || storageKey });

    if (normalizedAssetType === TYPE_IMAGE) {
        return 'image';
    }
    if (normalizedAssetType === TYPE_VIDEO) {
        return 'video';
    }
    if (ext === 'pdf') {
        return 'pdf';
    }
    if (['doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'txt', 'rtf', 'csv', 'md'].includes(ext)) {
        return 'document';
    }

    return 'other';
};

const linkPropertyMediaAsset = async ({ propertyId, assetId, mediaType, sortOrder = 0 }) => {
    const knex = models.Base.knex;
    const existing = await models.EstatePropertyMedium.findOne({
        property_id: propertyId,
        media_id: assetId,
        media_type: mediaType
    }, {
        context: { internal: true }
    });

    if (existing) {
        return existing.id;
    }

    const id = ObjectId().toHexString();
    await knex('estate_property_media').insert({
        id,
        property_id: propertyId,
        media_id: assetId,
        media_type: mediaType,
        sort_order: sortOrder,
        is_primary: false,
        created_at: new Date()
    });

    return id;
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
            const scope = await staffScope.getStaffScope(userId);
            const listed = await listByAssetTable({
                scope: 'user',
                userId,
                groupId: null,
                jobId,
                limit,
                nextCursor,
                type,
                orderBy,
                newsroomScope: scope.isNoGroupReader ? scope : null
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

    // Chart-job artifacts: owner_scope='chart_jobs' rows registered by the
    // worker via link-assets (or uploaded by the host UI). Requires a browser
    // session; optional chart_job_id filter scopes to one job.
    chartjobs: {
        headers: {
            cacheInvalidate: false
        },
        options: [
            'limit',
            'next_cursor',
            'type',
            'chart_job_id',
            'include',
            'page',
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
            const chartJobId = String(frame.options?.chart_job_id || '').trim() || null;
            const orderBy = parseOrderBy(frame.options?.orderby || frame.options?.order);

            const scope = await staffScope.getStaffScope(userId);
            const listed = await listByAssetTable({
                scope: 'chart_jobs',
                userId,
                groupId: null,
                jobId: null,
                chartJobId,
                limit,
                nextCursor,
                type,
                orderBy,
                newsroomScope: scope.isNoGroupReader ? scope : null
            });
            listed.meta.scope = 'chart_jobs';
            listed.meta.chart_job_id = chartJobId;
            listed.meta.type = type;
            return listed;
        }
    },

    // News-job artifacts: owner_scope='news_jobs' rows registered by the news
    // worker via link-assets. A separate action from `chartjobs` because the
    // families never share a job id or an owner_scope. Requires a browser
    // session; optional news_job_id filter scopes to one job.
    newsjobs: {
        headers: {
            cacheInvalidate: false
        },
        options: [
            'limit',
            'next_cursor',
            'type',
            'news_job_id',
            'include',
            'page',
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
            const newsJobId = String(frame.options?.news_job_id || '').trim() || null;
            const orderBy = parseOrderBy(frame.options?.orderby || frame.options?.order);

            const scope = await staffScope.getStaffScope(userId);
            const listed = await listByAssetTable({
                scope: 'news_jobs',
                userId,
                groupId: null,
                jobId: null,
                chartJobId: null,
                newsJobId,
                limit,
                nextCursor,
                type,
                orderBy,
                newsroomScope: scope.isNoGroupReader ? scope : null
            });
            listed.meta.scope = 'news_jobs';
            listed.meta.news_job_id = newsJobId;
            listed.meta.type = type;
            return listed;
        }
    },

    // Distinct projects that a job's uploaded assets belong to. Job pages surface
    // "which project(s)" from here: an upload stamps social_media_assets.project_id
    // but leaves the job row itself project-less (asset-level association), and
    // those rows carry owner_scope='chart_jobs', so the plain user-scope gallery
    // list never returns them. Accepts MEDIA job ids (`job_id`/`job_ids`, matched
    // on sma.job_id) and/or CHART job ids (`chart_job_id`/`chart_job_ids`, matched
    // on sma.chart_job_id) — comma-separated sets let a LIST resolve many at once.
    jobProjects: {
        headers: {
            cacheInvalidate: false
        },
        options: ['job_id', 'job_ids', 'chart_job_id', 'chart_job_ids'],
        permissions: false,
        async query(frame) {
            const userId = frame.options?.context?.user;
            if (!userId) {
                throw new errors.NoPermissionError({
                    message: tpl(messages.userRequired)
                });
            }
            const parseIds = (...vals) => [...new Set(
                String(vals.find(v => v) || '').split(',').map(s => s.trim()).filter(Boolean)
            )];
            const jobIds = parseIds(getFrameValue(frame, 'job_ids'), getFrameValue(frame, 'job_id'));
            const chartJobIds = parseIds(getFrameValue(frame, 'chart_job_ids'), getFrameValue(frame, 'chart_job_id'));
            if (!jobIds.length && !chartJobIds.length) {
                return {data: [], meta: {}};
            }
            // Ownership: the uploader's own rows, OR rows of a media/chart job the
            // caller owns (mirror the chart_jobs IDOR guard) — never enumerate
            // another user's project associations. Super Editor also reads
            // newsroom (no-group / public-group) rows.
            const scope = await staffScope.getStaffScope(userId);
            const rows = await models.Base.knex('social_media_assets as sma')
                .join('social_ai_projects as p', 'p.id', 'sma.project_id')
                .whereNotNull('sma.project_id')
                .where(function () {
                    if (jobIds.length) {
                        this.orWhereIn('sma.job_id', jobIds);
                    }
                    if (chartJobIds.length) {
                        this.orWhereIn('sma.chart_job_id', chartJobIds);
                    }
                })
                .where(function () {
                    this.where('sma.user_id', userId)
                        .orWhereExists(function () {
                            this.select(1)
                                .from('social_ai_media_jobs as mj')
                                .whereRaw('mj.id = sma.job_id')
                                .andWhere('mj.user_id', userId);
                        })
                        .orWhereExists(function () {
                            this.select(1)
                                .from('social_ai_chart_jobs as caj')
                                .whereRaw('caj.id = sma.chart_job_id')
                                .andWhere('caj.user_id', userId);
                        });
                    if (scope.isNoGroupReader) {
                        this.orWhere(function () {
                            staffScope.whereNewsroomAsset(this, scope);
                        });
                    }
                })
                .distinct(
                    'sma.job_id as job_id',
                    'sma.chart_job_id as chart_job_id',
                    'sma.project_id as project_id',
                    'p.name as project_name'
                );
            return {
                data: rows.map(r => ({
                    job_id: r.job_id || null,
                    chart_job_id: r.chart_job_id || null,
                    project_id: r.project_id,
                    project_name: r.project_name
                })),
                meta: {}
            };
        }
    },

    // Project-scoped gallery: all media of a project (direct project_id rows +
    // rows produced by the project's jobs). Same card as chartjobs on the client.
    project: {
        headers: {
            cacheInvalidate: false
        },
        options: [
            'limit',
            'next_cursor',
            'type',
            'project_id',
            'include',
            'page',
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
            const userId = getCurrentUserId(frame);
            const integrationId = getCurrentIntegrationId(frame);
            if (!userId && !integrationId) {
                throw new errors.NoPermissionError({
                    message: tpl(messages.userRequired)
                });
            }
            const projectId = String(frame.options?.project_id || frame.data?.id || '').trim();
            if (!projectId) {
                throw new errors.ValidationError({
                    message: tpl(messages.projectRequired)
                });
            }

            const knex = models.Base.knex;
            const project = await knex('social_ai_projects')
                .where({id: projectId})
                .first('id', 'user_id', 'group_id', 'status');
            if (!project) {
                throw new errors.NotFoundError({
                    message: tpl(messages.projectNotFound, {projectId})
                });
            }
            // Use the same ownership, admin, integration, and group-membership
            // policy as the project read endpoint (Super Editor: newsroom
            // projects too). assertCanReadRow itself also gates project uploads,
            // so the Super Editor widening stays here, on the read.
            const scope = await staffScope.getStaffScope(userId);
            const newsroomReadScope = await staffScope.getNewsroomReadScope(userId);
            const sharedPublishedProject = staffScope.canReadPublishedProject(newsroomReadScope, project);
            if (!sharedPublishedProject && !staffScope.canReadRowAsNoGroupReader(scope, project)) {
                await assertCanReadRow({frame, row: project});
            }
            const scopedUserId = userId || null;

            const limit = parseLimit(frame.options?.limit);
            const nextCursor = frame.options?.next_cursor || null;
            const type = parseType(frame.options?.type);
            const orderBy = parseOrderBy(frame.options?.orderby || frame.options?.order);

            const listed = await listByAssetTable({
                scope: 'chart_jobs',
                userId: scopedUserId,
                groupId: null,
                jobId: null,
                chartJobId: null,
                projectId,
                limit,
                nextCursor,
                type,
                orderBy,
                newsroomScope: sharedPublishedProject ? newsroomReadScope : (scope.isNoGroupReader ? scope : null)
            });
            listed.meta.scope = 'project';
            listed.meta.project_id = projectId;
            listed.meta.type = type;
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
                // not used to narrow the group list; only for can_rename (whether the viewer may rename each file)
                userId: frame.options?.context?.user || null,
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

    property: {
        headers: {
            cacheInvalidate: false
        },
        options: [
            'limit',
            'next_cursor',
            'type',
            'property_id',
            'include',
            'page',
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
            const propertyId = String(frame.data?.id || frame.options?.property_id || '').trim();
            if (!propertyId) {
                throw new errors.ValidationError({
                    message: tpl(messages.propertyRequired)
                });
            }

            await resolvePropertyAndCheckExists(propertyId);

            const mediaStore = storage.getStorage('media');
            assertListSupported(mediaStore);
            const root = mediaStore.pathPrefix || mediaStore.storagePath || '';
            const baseDir = path.posix.join(root, 'gallery', 'properties', propertyId);
            const targetDir = typeof mediaStore.getTargetDir === 'function'
                ? mediaStore.getTargetDir(baseDir)
                : baseDir;

            const limit = parseLimit(frame.options?.limit);
            const nextCursor = frame.options?.next_cursor || null;
            const type = parseType(frame.options?.type);
            const orderBy = parseOrderBy(frame.options?.orderby || frame.options?.order);
            const listed = await listByPrefix(mediaStore, targetDir, limit, nextCursor, type);

            listed.meta.scope = 'property';
            listed.meta.property_id = propertyId;
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
            'content_bundle_job_id',
            'news_job_id',
            'social_chart_id',
            'tag',
            'tag_slug',
            'tag_id',
            'filename',
            'content_type',
            'content_length',
            'original_filename',
            'target',
            'property_id',
            'person_id',
            'project_id',
            'subfolder'
        ],
        permissions: false,
        async query(frame) {
            const filename = sanitizeFileName(getFrameValue(frame, 'filename'));
            const originalFilename = preserveOriginalFilename(getFrameValue(frame, 'original_filename') || filename);
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
                ownerScope: uploadContext.ownerScope || (uploadContext.groupId ? 'group' : 'user'),
                userId: uploadContext.userId || null,
                groupId: uploadContext.groupId || null,
                propertyId: uploadContext.propertyId || null
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
                    owner_scope: uploadContext.ownerScope || (uploadContext.groupId ? 'group' : 'user'),
                    property_id: uploadContext.propertyId || null,
                    user_id: uploadContext.userId || null,
                    group_id: uploadContext.groupId || null,
                    job_id: String(uploadContext.jobId || getFrameValue(frame, 'job_id') || '').trim() || null,
                    social_chart_id: String(getFrameValue(frame, 'social_chart_id') || '').trim() || null,
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
            'property_id',
            'job_id',
            'dzi_job_id',
            'chart_job_id',
            'content_bundle_job_id',
            'news_job_id',
            'project_id',
            'target',
            'social_chart_id',
            'tag',
            'tag_slug',
            'tag_id',
            'person_id',
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
            const originalFilename = preserveOriginalFilename(getFrameValue(frame, 'original_filename'));
            const target = String(getFrameValue(frame, 'target') || '').trim().toLowerCase();
            const requestedJobId = String(getFrameValue(frame, 'job_id') || '').trim() || null;
            const dziJobId = target === 'deepzoom'
                ? getDeepzoomJobId(frame)
                : String(getFrameValue(frame, 'dzi_job_id') || '').trim() || null;
            const contentBundleJobId = String(getFrameValue(frame, 'content_bundle_job_id') || '').trim() || null;
            const socialChartId = String(getFrameValue(frame, 'social_chart_id') || '').trim() || null;

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
            // job_id is the media-jobs FK, except for deepzoom (the DZI job) and
            // target chart_jobs / news_jobs (the chart / news job, see getTargetJobId).
            const jobId = target === 'deepzoom' || uploadContext.jobIdIsTargetJob ? null : requestedJobId;
            const chartJobId = uploadContext.chartJobId || String(getFrameValue(frame, 'chart_job_id') || '').trim() || null;
            // The row's key is the one taken from storage_url (upsertAsset), so both
            // the key and the URL must name the same file inside the area presign
            // hands out for these scope values; the thumbnail too (destroyAsset
            // deletes it). Finalize is not tied to a presign call, so this is what
            // keeps a caller from recording — and later deleting — other files.
            const storedKey = assertFinalizeKey({
                store: uploadContext.mediaStore,
                prefixes: uploadContext.areaPrefixes,
                key: storageKey,
                url: storageUrl,
                keyField: 'storage_key',
                urlField: 'storage_url'
            });
            if (thumbnailStorageKey || thumbnailStorageUrl) {
                assertFinalizeKey({
                    store: uploadContext.mediaStore,
                    prefixes: uploadContext.areaPrefixes,
                    key: thumbnailStorageKey,
                    url: thumbnailStorageUrl,
                    keyField: 'thumbnail_storage_key',
                    urlField: 'thumbnail_storage_url'
                });
            }
            // The resolver returns newsJobId only when the job belongs to the
            // project (target project) or is the target news job, so its answer
            // wins over the raw frame value; the job checks below still run.
            const newsJobId = uploadContext.newsJobId || String(getFrameValue(frame, 'news_job_id') || '').trim() || null;
            let rowProjectId = uploadContext.projectId || String(getFrameValue(frame, 'project_id') || '').trim() || null;
            // The project gallery shows a chart / news job's results to everyone
            // who can read its project, also after the job is deleted (H3: the
            // row keeps the old job id). So a browser upload may only link an
            // existing job of the row's own project, and the caller must be able
            // to read that project (no project: own the job). A row without a
            // project_id (target chart_jobs / news_jobs) takes the job's project;
            // the key stays where presign put it. The worker (integration) links
            // its own results.
            if (!getCurrentIntegrationId(frame)) {
                // A project_id sent in the request (not the project target's own,
                // which resolveUploadContext already checked) puts the row in that
                // project's gallery (and the public one of a published project):
                // the project must exist and the caller must be able to read it.
                if (rowProjectId && !uploadContext.projectId) {
                    const sentProject = await models.Base.knex('social_ai_projects')
                        .where({id: rowProjectId})
                        .first('id', 'user_id', 'group_id');
                    if (!sentProject) {
                        throw new errors.ValidationError({message: tpl(messages.projectNotFound, {projectId: rowProjectId})});
                    }
                    await assertCanReadRow({frame, row: sentProject});
                }
                for (const [table, field, linkedJobId] of [
                    ['social_ai_chart_jobs', 'chart_job_id', chartJobId],
                    ['social_ai_news_jobs', 'news_job_id', newsJobId]
                ]) {
                    if (!linkedJobId) {
                        continue;
                    }
                    const linkedJob = await models.Base.knex(table)
                        .where({id: linkedJobId})
                        .first('id', 'user_id', 'project_id');
                    if (linkedJob && !rowProjectId) {
                        rowProjectId = linkedJob.project_id || null;
                    }
                    if (!linkedJob || String(linkedJob.project_id || '') !== String(rowProjectId || '')) {
                        throw new errors.ValidationError({message: `${field} does not belong to project_id.`});
                    }
                    if (linkedJob.project_id) {
                        const linkedProject = await models.Base.knex('social_ai_projects')
                            .where({id: linkedJob.project_id})
                            .first('id', 'user_id', 'group_id');
                        if (!linkedProject) {
                            throw new errors.ValidationError({message: `${field} does not belong to project_id.`});
                        }
                        await assertCanReadRow({frame, row: linkedProject});
                    } else if (String(linkedJob.user_id || '') !== String(uploadContext.userId || '') && !(await isAdminUser(uploadContext.userId))) {
                        throw new errors.NoPermissionError({message: tpl(messages.noJobPermission)});
                    }
                }
            }
            const assetType = [TYPE_IMAGE, TYPE_VIDEO, TYPE_AUDIO, TYPE_FILE].includes(requestedAssetType)
                ? requestedAssetType
                : inferAssetTypeByKey(storageKey);
            const propertyId = String(getFrameValue(frame, 'property_id') || '').trim() || null;

            let assetId;
            try {
                // The owner check and the write are one transaction, and the check
                // locks the row (FOR UPDATE; on MySQL a key with no row yet takes a
                // gap lock, so a second finalize of the same key waits or fails with
                // a deadlock instead of slipping in between). A separate check
                // followed by upsertAsset let two finalizes both see "no row" and
                // the later one overwrite the earlier one's owner.
                assetId = await models.Base.knex.transaction(async (trx) => {
                    await assertCanReuseAssetRow({knex: trx, storageKey: storedKey, uploadContext});
                    return socialMediaAssets.upsertAsset({
                        knex: trx,
                        store: uploadContext.mediaStore,
                        url: storageUrl,
                        thumbnailUrl: thumbnailStorageUrl || null,
                        thumbnailStorageKey: thumbnailStorageKey || null,
                        assetType,
                        originalFilename,
                        jobId,
                        dziJobId,
                        chartJobId,
                        contentBundleJobId,
                        newsJobId,
                        projectId: rowProjectId,
                        socialChartId,
                        userId: uploadContext.userId,
                        groupId: uploadContext.groupId,
                        propertyId: uploadContext.propertyId || propertyId,
                        ownerScope: uploadContext.ownerScope,
                        tag: uploadContext.tag
                    });
                });
            } catch (err) {
                // The owner check's 409 (thrown inside the transaction) goes out as
                // is; wrapStorageError would turn it into a 500.
                if (err instanceof errors.ConflictError) {
                    throw err;
                }
                // Lost the race for a key with no row yet (MySQL deadlock / lock
                // wait): the other finalize owns it now; a retry sees its row.
                if (err?.code === 'ER_LOCK_DEADLOCK' || err?.code === 'ER_LOCK_WAIT_TIMEOUT' || err?.code === 'SQLITE_BUSY') {
                    throw new errors.ConflictError({message: tpl(messages.keyBusy), context: storageKey});
                }
                wrapStorageError(messages.finalizeFailed, { storageKey }, err);
            }

            const finalPropertyId = uploadContext.propertyId || propertyId;
            let propertyMediaId = null;
            if (finalPropertyId && uploadContext.ownerScope === 'property') {
                const mediaType = resolveEstatePropertyMediaType({
                    assetType,
                    storageKey,
                    originalFilename
                });
                propertyMediaId = await linkPropertyMediaAsset({
                    propertyId: finalPropertyId,
                    assetId,
                    mediaType
                });
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
                    dzi_job_id: dziJobId,
                    news_job_id: newsJobId,
                    social_chart_id: socialChartId,
                    asset_type: assetType,
                    owner_scope: uploadContext.ownerScope || (uploadContext.groupId ? 'group' : 'user'),
                    property_id: finalPropertyId,
                    user_id: uploadContext.userId || null,
                    group_id: uploadContext.groupId || null,
                    category: uploadContext.tag?.name || null,
                    category_slug: uploadContext.tag?.slug || null,
                    property_media_id: propertyMediaId || null
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

            const userId = getCurrentUserId(frame);
            if (!userId) {
                throw new errors.NoPermissionError({
                    message: tpl(messages.userRequired)
                });
            }

            const knex = models.Base.knex;
            const existing = await socialMediaAssets.findAssetRowByStorageKey(knex, storageKey, ['id', 'user_id', 'group_id', 'chart_job_id']);
            if (!existing) {
                throw new errors.NotFoundError({
                    message: tpl(messages.assetNotFound, {storageKey})
                });
            }
            if (!(await canRetagAsset(knex, existing, userId))) {
                throw new errors.NoPermissionError({
                    message: tpl(messages.noTagPermission)
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
    },

    // Give ONE gallery asset a display name (alias). Only the name shown in lists changes:
    // the S3 object, storage_key and original_filename stay as they are. An empty name clears it
    // (lists fall back to original_filename). Who may rename = who may delete (destroyAsset):
    // the uploader, or the owner of the chart job that produced the row.
    renameAsset: {
        headers: {
            cacheInvalidate: false
        },
        options: [
            'id'
        ],
        permissions: false,
        async query(frame) {
            const userId = frame.options?.context?.user;
            if (!userId) {
                throw new errors.NoPermissionError({
                    message: tpl(messages.userRequired)
                });
            }
            const id = String(frame.options?.id || '').trim();
            if (!id) {
                throw new errors.ValidationError({
                    message: tpl(messages.assetIdRequired)
                });
            }
            // The key must be there: a body without it (or with a misspelt key) must not silently clear the name.
            // "" or null clears it on purpose.
            if (!frame.data || !Object.prototype.hasOwnProperty.call(frame.data, 'display_name')) {
                throw new errors.ValidationError({
                    message: tpl(messages.displayNameRequired)
                });
            }
            // control characters out, spaces folded; empty = clear
            const displayName = String(frame.data.display_name ?? '')
                .replace(/[\u0000-\u001f\u007f]/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();
            if (displayName.length > 200) {
                throw new errors.ValidationError({
                    message: tpl(messages.displayNameTooLong)
                });
            }

            const knex = models.Base.knex;
            const row = await knex('social_media_assets')
                .where({id})
                .first('id', 'user_id', 'chart_job_id', 'storage_key', 'original_filename');
            if (!row) {
                throw new errors.NotFoundError({
                    message: tpl(messages.assetRowNotFound, {id})
                });
            }
            let chartJobUserId = null;
            if (row.chart_job_id) {
                const job = await knex('social_ai_chart_jobs')
                    .where({id: row.chart_job_id})
                    .first('user_id');
                chartJobUserId = job?.user_id || null;
            }
            if (!canRenameAsset({...row, chart_job_user_id: chartJobUserId}, userId)) {
                throw new errors.NoPermissionError({
                    message: tpl(messages.noRenamePermission)
                });
            }

            await knex('social_media_assets')
                .where({id})
                .update({display_name: displayName || null, updated_at: new Date()});

            // {data: [...]} like destroyAsset / updateTag: the default serializer turns it into {socialgallery: [...]}
            return {
                data: [{
                    id,
                    display_name: displayName || null,
                    original_filename: row.original_filename || null,
                    name: galleryItemName({...row, display_name: displayName})
                }]
            };
        }
    },

    // Delete ONE gallery asset (social_media_assets row) by id — used by the
    // chart-job gallery "delete" icon to drop a wrong/unwanted image. Mirrors
    // the per-asset cleanup of the chart-job destroy: best-effort S3 object
    // removal, then the DB row (junction social_ai_chart_job_media cascades via
    // the chart_job_id FK). Ownership is scoped through the OWNING chart job so
    // worker-written rows (null user_id) cannot be enumerated/deleted by others.
    destroyAsset: {
        headers: {
            cacheInvalidate: false
        },
        options: [
            'id'
        ],
        data: [
            'id'
        ],
        permissions: false,
        async query(frame) {
            const userId = frame.options?.context?.user;
            if (!userId) {
                throw new errors.NoPermissionError({
                    message: tpl(messages.userRequired)
                });
            }
            const id = String(frame.data?.id || frame.options?.id || '').trim();
            if (!id) {
                throw new errors.ValidationError({
                    message: tpl(messages.assetIdRequired)
                });
            }

            const knex = models.Base.knex;
            const row = await knex('social_media_assets')
                .where({id})
                .first('id', 'user_id', 'chart_job_id', 'storage_key', 'thumbnail_storage_key', 'original_filename');
            if (!row) {
                throw new errors.NotFoundError({
                    message: tpl(messages.assetRowNotFound, {id})
                });
            }

            // IDOR guard: caller must own the row directly, or own the chart job
            // that produced it (worker rows carry a null user_id + chart_job_id).
            let owned = String(row.user_id || '') === String(userId);
            if (!owned && row.chart_job_id) {
                const job = await knex('social_ai_chart_jobs')
                    .where({id: row.chart_job_id})
                    .first('user_id');
                owned = Boolean(job && String(job.user_id || '') === String(userId));
            }
            if (!owned) {
                throw new errors.NoPermissionError({
                    message: tpl(messages.noAssetPermission)
                });
            }

            const selectedBroadcast = await socialMediaAssets.findBroadcastSelectionForMedia(knex, id);
            if (selectedBroadcast) {
                throw new errors.ValidationError({
                    message: tpl(messages.selectedBroadcastAsset)
                });
            }

            // Best-effort S3 cleanup — must not block the DB delete.
            try {
                const mediaStore = storage.getStorage('media');
                if (mediaStore && typeof mediaStore.delete === 'function') {
                    const deleteKey = async (key) => {
                        const clean = String(key || '').replace(/^\/+/, '').trim();
                        if (!clean) {
                            return;
                        }
                        const parts = clean.split('/');
                        const name = parts.pop();
                        const dir = parts.join('/');
                        await mediaStore.delete(name, dir);
                    };
                    await deleteKey(row.storage_key);
                    if (row.thumbnail_storage_key) {
                        await deleteKey(row.thumbnail_storage_key);
                    }
                }
            } catch (err) {
                logging.warn(`[social-gallery] asset S3 cleanup failed for ${id}: ${err?.message || err}`);
            }

            // Delete the row; junction social_ai_chart_job_media cascades on FK.
            await knex('social_media_assets').where({id}).del();

            // Return the deleted row's storage keys so the HOST route can remove
            // the actual S3 objects: Ghost's media store is local-only and can
            // never reach the think-ai-jobs bucket chart artifacts.
            return {
                data: [{
                    id,
                    deleted: true,
                    storage_key: row.storage_key || null,
                    thumbnail_storage_key: row.thumbnail_storage_key || null,
                    original_filename: row.original_filename || null
                }]
            };
        }
    },

    // Copy one of the caller's gallery assets INTO a project (server-side S3 copy
    // → gallery/chart_projects/{projectId}/, new row with project_id). Lets users
    // bring another agent's output (image/csv/json/…) into a chart project.
    copyToProject: {
        headers: {
            cacheInvalidate: false
        },
        options: [
            'id',
            'project_id'
        ],
        data: [
            'id'
        ],
        permissions: false,
        async query(frame) {
            const userId = frame.options?.context?.user;
            if (!userId) {
                throw new errors.NoPermissionError({
                    message: tpl(messages.userRequired)
                });
            }
            const assetId = String(frame.data?.id || frame.options?.id || '').trim();
            // Body fields land in frame.data (see @tryghost/api-framework Frame.js);
            // options only ever carries query/url params. Read body first.
            const projectId = String(frame.data?.project_id || frame.options?.project_id || '').trim();
            if (!assetId) {
                throw new errors.ValidationError({
                    message: tpl(messages.assetIdRequired)
                });
            }
            if (!projectId) {
                throw new errors.ValidationError({
                    message: tpl(messages.projectRequired)
                });
            }

            const knex = models.Base.knex;
            // Source: must be the caller's own asset.
            const source = await knex('social_media_assets')
                .where({id: assetId})
                .first('id', 'user_id', 'job_id', 'storage_key', 'storage_url', 'asset_type', 'original_filename');
            if (!source) {
                throw new errors.NotFoundError({
                    message: tpl(messages.assetRowNotFound, {id: assetId})
                });
            }
            if (String(source.user_id || '') !== String(userId)) {
                throw new errors.NoPermissionError({
                    message: tpl(messages.noAssetPermission)
                });
            }
            // Destination project ownership (mirror the projects rule).
            const project = await knex('social_ai_projects')
                .where({id: projectId})
                .first('id', 'user_id', 'group_id');
            if (!project) {
                throw new errors.NotFoundError({
                    message: tpl(messages.projectNotFound, {projectId})
                });
            }
            if (!(await canWriteOwnOrGroupRow(project, userId))) {
                throw new errors.NoPermissionError({
                    message: tpl(messages.noProjectPermission)
                });
            }

            const mediaStore = storage.getStorage('media');
            if (typeof mediaStore.copy !== 'function') {
                throw new errors.BadRequestError({
                    message: 'Configured storage adapter does not support server-side copy.'
                });
            }
            const root = mediaStore.pathPrefix || mediaStore.storagePath || '';
            const baseDir = path.posix.join(root, 'gallery', 'chart_projects', projectId);
            const targetDir = typeof mediaStore.getTargetDir === 'function'
                ? mediaStore.getTargetDir(baseDir)
                : baseDir;
            const name = String(source.original_filename || source.storage_key || 'file').split('/').pop();
            const destKey = buildUniqueStorageKey(targetDir, name);

            let destUrl;
            try {
                destUrl = await mediaStore.copy(source.storage_key, destKey);
            } catch (err) {
                wrapStorageError(messages.finalizeFailed, {storageKey: destKey}, err);
            }

            const newId = await socialMediaAssets.upsertAsset({
                knex,
                store: mediaStore,
                url: destUrl,
                assetType: source.asset_type,
                originalFilename: source.original_filename,
                jobId: source.job_id || null,
                projectId,
                ownerScope: 'chart_jobs',
                userId
            });

            return {
                data: [{
                    id: newId,
                    storage_key: destKey,
                    storage_url: destUrl,
                    project_id: projectId,
                    asset_type: source.asset_type,
                    original_filename: source.original_filename || null
                }]
            };
        }
    },

    copyToJob: {
        headers: {
            cacheInvalidate: false
        },
        options: [
            'id',
            'job_id'
        ],
        data: [
            'id'
        ],
        permissions: false,
        async query(frame) {
            const userId = frame.options?.context?.user;
            if (!userId) {
                throw new errors.NoPermissionError({
                    message: tpl(messages.userRequired)
                });
            }
            const assetId = String(frame.data?.id || frame.options?.id || '').trim();
            // Body fields land in frame.data (see @tryghost/api-framework Frame.js);
            // options only ever carries query/url params. Read body first.
            const jobId = String(frame.data?.job_id || frame.options?.job_id || '').trim();
            if (!assetId) {
                throw new errors.ValidationError({
                    message: tpl(messages.assetIdRequired)
                });
            }
            if (!jobId) {
                throw new errors.ValidationError({
                    message: tpl(messages.jobIdRequired)
                });
            }

            const knex = models.Base.knex;
            // Source: must be the caller's own asset.
            const source = await knex('social_media_assets')
                .where({id: assetId})
                .first('id', 'user_id', 'storage_key', 'storage_url', 'asset_type', 'original_filename');
            if (!source) {
                throw new errors.NotFoundError({
                    message: tpl(messages.assetRowNotFound, {id: assetId})
                });
            }
            if (String(source.user_id || '') !== String(userId)) {
                throw new errors.NoPermissionError({
                    message: tpl(messages.noAssetPermission)
                });
            }
            // Destination job: caller must own the job (or may write its group).
            // project_id comes from the JOB row, never from the payload (mirror link-assets).
            const job = await knex('social_ai_chart_jobs')
                .where({id: jobId})
                .first('id', 'user_id', 'project_id', 'group_id');
            if (!job) {
                throw new errors.NotFoundError({
                    message: tpl(messages.jobNotFound, {jobId})
                });
            }
            if (!(await canWriteOwnOrGroupRow(job, userId))) {
                throw new errors.NoPermissionError({
                    message: tpl(messages.noJobPermission)
                });
            }
            const projectId = job.project_id ? String(job.project_id).trim() : null;
            if (projectId) {
                const project = await knex('social_ai_projects')
                    .where({id: projectId})
                    .first('id', 'user_id', 'group_id');
                if (!project) {
                    throw new errors.NotFoundError({
                        message: tpl(messages.projectNotFound, {projectId})
                    });
                }
                if (!(await canWriteOwnOrGroupRow(project, userId))) {
                    throw new errors.NoPermissionError({
                        message: tpl(messages.noProjectPermission)
                    });
                }
            }

            const mediaStore = storage.getStorage('media');
            if (typeof mediaStore.copy !== 'function') {
                throw new errors.BadRequestError({
                    message: 'Configured storage adapter does not support server-side copy.'
                });
            }
            const root = mediaStore.pathPrefix || mediaStore.storagePath || '';
            const baseDir = path.posix.join(root, 'gallery', 'chart_projects', projectId || 'job', jobId);
            const targetDir = typeof mediaStore.getTargetDir === 'function'
                ? mediaStore.getTargetDir(baseDir)
                : baseDir;
            const name = String(source.original_filename || source.storage_key || 'file').split('/').pop();
            const destKey = buildUniqueStorageKey(targetDir, name);

            let destUrl;
            try {
                destUrl = await mediaStore.copy(source.storage_key, destKey);
            } catch (err) {
                wrapStorageError(messages.finalizeFailed, {storageKey: destKey}, err);
            }

            const newId = await socialMediaAssets.upsertAsset({
                knex,
                store: mediaStore,
                url: destUrl,
                assetType: source.asset_type,
                originalFilename: source.original_filename,
                chartJobId: jobId,
                projectId,
                ownerScope: 'chart_jobs',
                userId
            });

            return {
                data: [{
                    id: newId,
                    storage_key: destKey,
                    storage_url: destUrl,
                    chart_job_id: jobId,
                    project_id: projectId,
                    asset_type: source.asset_type,
                    original_filename: source.original_filename || null
                }]
            };
        }
    }
};

module.exports = controller;
