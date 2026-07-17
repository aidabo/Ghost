const crypto = require('crypto');
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

const normalizeJobId = (value) => {
    const raw = String(value || '').trim();
    return /^[a-f0-9]{24}$/i.test(raw) ? raw : null;
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

const buildStorageKeyHash = (value) => {
    const normalized = String(value || '').trim();
    if (!normalized) {
        return null;
    }
    return crypto.createHash('sha256').update(normalized).digest('hex');
};

const isMissingStorageKeyHashColumnError = (err) => {
    const message = String(err?.message || '').toLowerCase();
    return (
        err?.code === 'ER_BAD_FIELD_ERROR' ||
        (err?.code === 'SQLITE_ERROR' && message.includes('storage_key_hash')) ||
        message.includes('unknown column') ||
        message.includes('has no column named storage_key_hash')
    );
};

const findAssetRowByStorageKey = async (knex, storageKey, columns = ['id']) => {
    const normalizedKey = String(storageKey || '').trim();
    if (!normalizedKey) {
        return null;
    }

    const storageKeyHash = buildStorageKeyHash(normalizedKey);
    if (storageKeyHash) {
        try {
            const row = await knex('social_media_assets')
                .where({storage_key_hash: storageKeyHash, storage_key: normalizedKey})
                .first(...columns);
            if (row) {
                return row;
            }
        } catch (err) {
            if (!isMissingStorageKeyHashColumnError(err)) {
                throw err;
            }
        }
    }

    return knex('social_media_assets').where({storage_key: normalizedKey}).first(...columns);
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
    jobId,
    dziJobId,
    userId,
    groupId,
    propertyId,
    ownerScope,
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
        const resolvedOwnerScope = ownerScope || (propertyId ? 'property' : (groupId ? 'group' : 'user'));

        const payload = {
            storage_key: storageKey,
            storage_key_hash: buildStorageKeyHash(storageKey),
            storage_url: url,
            thumbnail_url: normalizeOptionalUrl(thumbnailUrl),
            thumbnail_storage_key: resolveStorageKey(store, thumbnailStorageKey || thumbnailUrl),
            original_filename: String(originalFilename || '').trim() || null,
            asset_type: assetType,
            owner_scope: resolvedOwnerScope,
            user_id: userId || null,
            group_id: groupId || null,
            job_id: normalizeJobId(jobId),
            dzi_job_id: normalizeJobId(dziJobId),
            tag_id: tag?.id || null,
            tag_slug: tag?.slug || null,
            updated_at: now
        };
        const legacyPayload = {
            storage_key: payload.storage_key,
            storage_key_hash: payload.storage_key_hash,
            storage_url: payload.storage_url,
            original_filename: payload.original_filename,
            asset_type: payload.asset_type,
            owner_scope: payload.owner_scope,
            user_id: payload.user_id,
            group_id: payload.group_id,
            job_id: payload.job_id,
            dzi_job_id: payload.dzi_job_id,
            tag_id: payload.tag_id,
            tag_slug: payload.tag_slug,
            updated_at: payload.updated_at
        };

        const persistAsset = async (persistPayload) => {
            const existing = await findAssetRowByStorageKey(knex, storageKey, ['id']);
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
            const isMissingJobIdColumn =
                err?.code === 'ER_BAD_FIELD_ERROR' ||
                (err?.code === 'SQLITE_ERROR' && message.includes('job_id')) ||
                message.includes('unknown column') ||
                message.includes('has no column named job_id');
            // dzi_job_id is a newer column; before its migration runs, an insert
            // including it fails with unknown/no-such-column. Detect ONLY that
            // (both the missing-column signal AND the column name) so we drop it
            // from the retry payload — a broader match would silently strip a
            // valid dzi_job_id whenever any unrelated column error occurred.
            const isMissingDziJobIdColumn =
                (message.includes('unknown column') || message.includes('has no column named')) &&
                message.includes('dzi_job_id');
            const isMissingStorageKeyHashColumn = isMissingStorageKeyHashColumnError(err);

            if (!isMissingThumbnailColumn && !isMissingJobIdColumn && !isMissingDziJobIdColumn && !isMissingStorageKeyHashColumn) {
                throw err;
            }

            const fallbackPayload = {
                ...(isMissingThumbnailColumn || isMissingJobIdColumn ? legacyPayload : payload)
            };
            if (isMissingDziJobIdColumn) {
                delete fallbackPayload.dzi_job_id;
            }
            if (isMissingStorageKeyHashColumn) {
                delete fallbackPayload.storage_key_hash;
            }

            return await persistAsset(fallbackPayload);
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
    buildStorageKeyHash,
    findAssetRowByStorageKey,
    isMissingStorageKeyHashColumnError,
    resolveTag,
    upsertAsset
};
