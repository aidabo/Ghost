const path = require('path');
const tpl = require('@tryghost/tpl');
const errors = require('@tryghost/errors');
const ObjectId = require('bson-objectid').default;
const storage = require('../../adapters/storage');
const models = require('../../models');

const messages = {
    userRequired: 'No login user authentication, can not read gallery in this scope.',
    groupRequired: '`group_id` is required.',
    groupNotFound: 'Group not found: {groupId}.',
    noPermission: 'You are not allowed to read gallery in this group: {groupId}, user: {user}.',
    storageNoList: 'Configured storage adapter does not support gallery listing.',
    postIdRequired: '`post_id` is required.',
    postNotFound: 'Post not found: {postId}.',
    invalidMode: 'Invalid mode value. Allowed: primary.'
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

const getExtension = (item) => {
    const name = String(item?.name || '').toLowerCase();
    const idx = name.lastIndexOf('.');
    if (idx < 0 || idx === name.length - 1) {
        return '';
    }
    return name.substring(idx + 1);
};

const matchType = (item, type) => {
    if (type === TYPE_ALL) {
        return true;
    }

    const ext = getExtension(item);
    const image = typeExtensions[TYPE_IMAGE].has(ext);
    const video = typeExtensions[TYPE_VIDEO].has(ext);
    const audio = typeExtensions[TYPE_AUDIO].has(ext);

    if (type === TYPE_IMAGE) {
        return image;
    }

    if (type === TYPE_VIDEO) {
        return video;
    }

    if (type === TYPE_AUDIO) {
        return audio;
    }

    // TYPE_FILE: anything not image/video/audio
    return !(image || video || audio);
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
        const existing = await knex('social_media_assets').where({ storage_key: key }).first('id');
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

        await knex('social_media_assets').insert({
            id: ObjectId().toHexString(),
            storage_key: key,
            storage_url: keyToUrl.get(key),
            asset_type: inferAssetTypeByKey(key),
            owner_scope: post.get('group_id') ? 'group' : 'user',
            user_id: post.get('created_by') || frame.options?.context?.user || null,
            group_id: post.get('group_id') || null,
            tag_id: selectedTag?.id || null,
            tag_slug: selectedTag?.slug || null,
            created_at: now,
            updated_at: now
        });
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
        rows = keys.length > 0
            ? await knex('social_media_assets as sma')
                .leftJoin('tags as t', 'sma.tag_id', 't.id')
                .whereIn('sma.storage_key', keys)
                .select('sma.storage_key as storage_key', 'sma.tag_slug as asset_tag_slug', 't.name as tag_name', 't.slug as tag_slug')
            : [];
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
    const result = await store.list({
        prefix,
        limit,
        next_cursor: nextCursor
    });

    const typedItems = (result.items || []).filter(item => matchType(item, type));
    const items = await attachCategoryInfo(typedItems);

    return {
        data: items,
        meta: {
            prefix: result.prefix || prefix,
            count: items.length,
            listed_count: result.count || 0,
            next_cursor: result.nextCursor || null
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
            'type'
        ],
        permissions: false,
        async query(frame) {
            const userId = frame.options?.context?.user;
            if (!userId) {
                throw new errors.NoPermissionError({
                    message: tpl(messages.userRequired)
                });
            }

            const mediaStore = storage.getStorage('media');
            assertListSupported(mediaStore);

            const root = mediaStore.pathPrefix || mediaStore.storagePath || '';
            const limit = parseLimit(frame.options?.limit);
            const nextCursor = frame.options?.next_cursor || null;
            const type = parseType(frame.options?.type);

            const userAlias = await models.User.ensureMediaFolderAlias(userId);
            const prefix = path.posix.join(root, 'gallery', 'users', userAlias);

            const listed = await listByPrefix(mediaStore, prefix, limit, nextCursor, type);
            listed.meta.scope = 'user';
            listed.meta.alias = userAlias;
            listed.meta.user_id = userId;
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
            'group_id'
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
            const mediaStore = storage.getStorage('media');
            assertListSupported(mediaStore);

            const root = mediaStore.pathPrefix || mediaStore.storagePath || '';
            const limit = parseLimit(frame.options?.limit);
            const nextCursor = frame.options?.next_cursor || null;
            const type = parseType(frame.options?.type);

            // @ts-ignore
            const groupAlias = await models.SocialGroup.ensureMediaFolderAlias(groupId);
            const prefix = path.posix.join(root, 'gallery', 'groups', groupAlias);
            const listed = await listByPrefix(mediaStore, prefix, limit, nextCursor, type);

            listed.meta.scope = 'group';
            listed.meta.alias = groupAlias;
            listed.meta.group_id = groupId;
            listed.meta.group_type = group.get('type');
            listed.meta.type = type;

            return listed;
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
    }
};

module.exports = controller;
