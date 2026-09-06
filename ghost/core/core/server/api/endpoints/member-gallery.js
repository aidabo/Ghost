const path = require('path');
const ObjectId = require('bson-objectid').default;
const errors = require('@tryghost/errors');
const storage = require('../../adapters/storage');
const models = require('../../models');
const socialMediaAssets = require('./utils/social-media-assets');
const membersService = require('../../services/members');

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
const MAX_FILE_SIZE = 10 * 1024 * 1024;

function safeName(value) {
    const name = String(value || 'avatar').trim().replace(/[\\/\0]/g, '_').replace(/[^\w.\-ぁ-んァ-ン一-龯 ]/g, '_');
    return name.slice(0, 180) || 'avatar';
}

async function getMember(req, res) {
    const member = await membersService.ssr.getMemberDataFromSession(req, res);
    if (!member?.id || !/^[a-f0-9]{24}$/i.test(String(member.id))) {
        throw new errors.NoPermissionError({message: 'Member session is required.'});
    }
    return member;
}

function memberPrefix(store, memberUuid) {
    const root = store.pathPrefix || store.storagePath || '';
    return path.posix.join(root, 'gallery', 'member', String(memberUuid));
}

function publicRow(row) {
    return {
        id: row.id,
        url: row.storage_url,
        storage_url: row.storage_url,
        storage_key: row.storage_key,
        original_filename: row.original_filename,
        asset_type: row.asset_type,
        owner_scope: row.owner_scope,
        created_at: row.created_at,
        updated_at: row.updated_at
    };
}

function handleError(res, error) {
    const status = error?.statusCode || 500;
    res.status(status).json({errors: [{message: error?.message || 'Member gallery request failed.'}]});
}

async function presign(req, res) {
    try {
        const member = await getMember(req, res);
        const filename = safeName(req.body?.filename);
        const contentType = String(req.body?.content_type || '').toLowerCase().split(';')[0].trim();
        const contentLength = Number(req.body?.content_length || 0);
        if (!IMAGE_TYPES.has(contentType)) {
            throw new errors.ValidationError({message: 'Only image uploads are allowed.'});
        }
        if (!Number.isFinite(contentLength) || contentLength <= 0 || contentLength > MAX_FILE_SIZE) {
            throw new errors.ValidationError({message: 'Image size must be between 1 byte and 10 MB.'});
        }
        const store = storage.getStorage('media');
        if (typeof store?.getPresignedPutUrl !== 'function') {
            throw new errors.ValidationError({message: 'Configured storage adapter does not support presigned uploads.'});
        }
        const prefix = memberPrefix(store, member.id);
        const key = path.posix.join(prefix, `${ObjectId().toHexString()}-${filename}`);
        const signed = await store.getPresignedPutUrl({key, contentType, expiresInSeconds: 900});
        res.status(200).json({membergallery: [{upload_url: signed.uploadUrl, storage_url: signed.url, storage_key: signed.key, headers: signed.headers || {}, original_filename: filename, asset_type: 'image'}]});
    } catch (error) {
        handleError(res, error);
    }
}

async function finalize(req, res) {
    try {
        const member = await getMember(req, res);
        const store = storage.getStorage('media');
        const storageKey = String(req.body?.storage_key || '').replace(/^\/+/, '');
        const expectedPrefix = `${memberPrefix(store, member.id).replace(/^\/+/, '')}/`;
        if (!storageKey.startsWith(expectedPrefix)) {
            throw new errors.NoPermissionError({message: 'This asset does not belong to the current Member.'});
        }
        const storageUrl = String(req.body?.storage_url || '').trim();
        if (!storageUrl) {
            throw new errors.ValidationError({message: 'storage_url is required.'});
        }
        const assetId = await socialMediaAssets.upsertAsset({
            knex: models.Base.knex,
            store,
            url: storageUrl,
            assetType: 'image',
            originalFilename: safeName(req.body?.original_filename),
            ownerScope: 'member',
            memberId: member.id
        });
        const row = await models.Base.knex('social_media_assets').where({id: assetId, member_id: member.id}).first();
        res.status(200).json({membergallery: [publicRow(row)]});
    } catch (error) {
        handleError(res, error);
    }
}

async function list(req, res) {
    try {
        const member = await getMember(req, res);
        const rows = await models.Base.knex('social_media_assets').where({owner_scope: 'member', member_id: member.id}).orderBy('created_at', 'desc').limit(100);
        res.json({membergallery: rows.map(publicRow)});
    } catch (error) {
        handleError(res, error);
    }
}

async function destroy(req, res) {
    try {
        const member = await getMember(req, res);
        const row = await models.Base.knex('social_media_assets').where({id: req.params.id, owner_scope: 'member', member_id: member.id}).first();
        if (!row) {
            throw new errors.NotFoundError({message: 'Member gallery asset not found.'});
        }
        const store = storage.getStorage('media');
        if (typeof store?.delete === 'function') {
            await store.delete(row.storage_key, store.getTargetDir ? store.getTargetDir(path.posix.dirname(row.storage_key)) : undefined);
        }
        await models.Base.knex('social_media_assets').where({id: row.id}).del();
        res.status(204).end();
    } catch (error) {
        handleError(res, error);
    }
}

module.exports = {presign, finalize, list, destroy};
