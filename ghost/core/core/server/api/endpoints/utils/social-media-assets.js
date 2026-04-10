const {slugify} = require('@tryghost/string');
const ObjectId = require('bson-objectid').default;

const normalizeId = (value) => {
    const v = String(value || '').trim();
    return /^[a-f0-9]{24}$/i.test(v) ? v : null;
};

const normalizeSlug = (value) => {
    const raw = String(value || '').trim().toLowerCase();
    if (!raw) {
        return null;
    }
    return slugify(raw);
};

const getTagInputs = (frame) => {
    const data = frame.data || {};
    const options = frame.options || {};

    return {
        tag_id: data.tag_id || options.tag_id || null,
        tag_slug: data.tag_slug || options.tag_slug || null,
        tag: data.tag || options.tag || null
    };
};

const resolveTag = async (knex, frame) => {
    const {tag_id, tag_slug, tag} = getTagInputs(frame);

    const resolvedId = normalizeId(tag_id) || normalizeId(tag);
    if (resolvedId) {
        const byId = await knex('tags').where({id: resolvedId}).first('id', 'name', 'slug');
        if (byId) {
            return byId;
        }
    }

    const resolvedSlug = normalizeSlug(tag_slug) || normalizeSlug(tag);
    if (resolvedSlug) {
        const bySlug = await knex('tags').where({slug: resolvedSlug}).first('id', 'name', 'slug');
        if (bySlug) {
            return bySlug;
        }
    }

    return null;
};

const getStorageKeyFromUrl = (store, url) => {
    if (!url) {
        return null;
    }

    if (typeof store?.urlToPath === 'function') {
        return store.urlToPath(url);
    }

    try {
        const parsed = new URL(url);
        return parsed.pathname.replace(/^\/+/, '');
    } catch (err) {
        return String(url).replace(/^\/+/, '');
    }
};

const normalizeOptionalUrl = (value) => {
    const normalized = String(value || '').trim();
    return normalized || null;
};

const resolveStorageKey = (store, keyOrUrl) => {
    const normalized = String(keyOrUrl || '').trim();
    if (!normalized) {
        return null;
    }

    if (/^https?:\/\//i.test(normalized)) {
        return getStorageKeyFromUrl(store, normalized);
    }

    return normalized.replace(/^\/+/, '');
};

const upsertAsset = async ({
    knex,
    store,
    url,
    thumbnailUrl,
    thumbnailStorageKey,
    assetType,
    originalFilename,
    userId,
    groupId,
    tag
}) => {
    if (!knex || !url) {
        return null;
    }

    const storageKey = getStorageKeyFromUrl(store, url);
    if (!storageKey) {
        return null;
    }

    try {
        const now = new Date();
        const ownerScope = groupId ? 'group' : 'user';

        const payload = {
            storage_key: storageKey,
            storage_url: url,
            thumbnail_url: normalizeOptionalUrl(thumbnailUrl),
            thumbnail_storage_key: resolveStorageKey(store, thumbnailStorageKey || thumbnailUrl),
            original_filename: String(originalFilename || '').trim() || null,
            asset_type: assetType,
            owner_scope: ownerScope,
            user_id: userId || null,
            group_id: groupId || null,
            tag_id: tag?.id || null,
            tag_slug: tag?.slug || null,
            updated_at: now
        };
        const legacyPayload = {
            storage_key: payload.storage_key,
            storage_url: payload.storage_url,
            original_filename: payload.original_filename,
            asset_type: payload.asset_type,
            owner_scope: payload.owner_scope,
            user_id: payload.user_id,
            group_id: payload.group_id,
            tag_id: payload.tag_id,
            tag_slug: payload.tag_slug,
            updated_at: payload.updated_at
        };

        const persistAsset = async (persistPayload) => {
            const existing = await knex('social_media_assets').where({storage_key: storageKey}).first('id');
            if (existing) {
                await knex('social_media_assets').where({id: existing.id}).update(persistPayload);
                return existing.id;
            }

            const id = ObjectId().toHexString();
            await knex('social_media_assets').insert({
                id,
                ...persistPayload,
                created_at: now
            });

            return id;
        };

        try {
            return await persistAsset(payload);
        } catch (err) {
            const message = String(err?.message || '').toLowerCase();
            const isMissingThumbnailColumn =
                err?.code === 'ER_BAD_FIELD_ERROR' ||
                (err?.code === 'SQLITE_ERROR' && message.includes('thumbnail_')) ||
                message.includes('unknown column') ||
                message.includes('has no column named thumbnail_');

            if (!isMissingThumbnailColumn) {
                throw err;
            }

            return await persistAsset(legacyPayload);
        }
    } catch (err) {
        // Backward compatibility: allow uploads before migration is applied.
        if (err?.code === 'ER_NO_SUCH_TABLE' || err?.code === 'SQLITE_ERROR') {
            return null;
        }
        throw err;
    }
};

module.exports = {
    resolveTag,
    upsertAsset
};
