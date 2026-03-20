const path = require('path');
const errors = require('@tryghost/errors');
const storage = require('../../adapters/storage');
const models = require('../../models');
const socialMediaAssets = require('./utils/social-media-assets');

const resolveUploadedMediaAssetType = (file) => {
    const mime = String(file?.mimetype || file?.type || '').toLowerCase().split(';')[0].trim();
    if (mime.startsWith('audio/')) {
        return 'audio';
    }
    if (mime.startsWith('video/')) {
        return 'video';
    }

    const name = String(file?.originalname || file?.name || '').toLowerCase();
    const ext = path.extname(name).replace('.', '');
    if (['mp3', 'wav', 'ogg', 'm4a', 'weba'].includes(ext)) {
        return 'audio';
    }
    return 'video';
};

const resolveUploadTargetDir = async (store, frame) => {
    if (typeof store.getTargetDir !== 'function') {
        return {targetDir: null, userId: null, groupId: null, tag: null};
    }

    const knex = models.Base.knex;
    const userId = frame.options?.context?.user;
    const groupId = frame.data?.group_id || frame.options?.group_id;
    const tag = await socialMediaAssets.resolveTag(knex, frame);
    const root = store.pathPrefix || store.storagePath || '';

    if (groupId) {
        if (!userId) {
            throw new errors.NoPermissionError({
                message: `No login user authentication, can not upload media to group: ${groupId}.`
            });
        }

        // @ts-ignore
        const group = await models.SocialGroup.findOne({id: groupId});
        if (!group) {
            throw new errors.NotFoundError({
                message: `Group not found: ${groupId}.`
            });
        }

        // @ts-ignore
        const allowed = await models.SocialGroup.canAccessGroup(group, userId, 'write');
        if (!allowed) {
            throw new errors.NoPermissionError({
                message: `You are not allowed to upload media to this group: ${groupId}, user: ${userId}.`
            });
        }

        // @ts-ignore
        const groupAlias = await models.SocialGroup.ensureMediaFolderAlias(groupId);
        if (!groupAlias) {
            return {targetDir: null, userId, groupId, tag};
        }

        const baseDir = path.join(root, 'gallery', 'groups', groupAlias);
        const targetDir = store.getTargetDir(baseDir);
        return {targetDir, userId, groupId, tag};
    }

    if (!userId) {
        return {targetDir: null, userId: null, groupId: null, tag};
    }

    const userAlias = await models.User.ensureMediaFolderAlias(userId);
    if (!userAlias) {
        return {targetDir: null, userId, groupId: null, tag};
    }

    const baseDir = path.join(root, 'gallery', 'users', userAlias);
    const targetDir = store.getTargetDir(baseDir);
    return {targetDir, userId, groupId: null, tag};
};

/** @type {import('@tryghost/api-framework').Controller} */
const controller = {
    docName: 'media',
    upload: {
        statusCode: 201,
        headers: {
            cacheInvalidate: false
        },
        options: [
            'group_id',
            'tag',
            'tag_slug',
            'tag_id'
        ],
        permissions: false,
        async query(frame) {
            const mediaStore = storage.getStorage('media');
            const uploadContext = await resolveUploadTargetDir(mediaStore, frame);
            const targetDir = uploadContext.targetDir;

            let thumbnailPath = null;
            if (frame.files.thumbnail && frame.files.thumbnail[0]) {
                thumbnailPath = await mediaStore.save(frame.files.thumbnail[0], targetDir || undefined);
            }

            const filePath = await mediaStore.save(frame.files.file[0], targetDir || undefined);

            const mediaType = resolveUploadedMediaAssetType(frame.files.file[0]);
            await socialMediaAssets.upsertAsset({
                knex: models.Base.knex,
                store: mediaStore,
                url: filePath,
                assetType: mediaType,
                userId: uploadContext.userId,
                groupId: uploadContext.groupId,
                tag: uploadContext.tag
            });

            return {
                filePath,
                thumbnailPath
            };
        }
    },

    uploadThumbnail: {
        headers: {
            cacheInvalidate: false
        },
        permissions: false,
        data: [
            'url',
            'ref'
        ],
        async query(frame) {
            const mediaStorage = storage.getStorage('media');
            const targetDir = path.dirname(mediaStorage.urlToPath(frame.data.url));

            // NOTE: need to cleanup otherwise the parent media name won't match thumb name
            //       due to "unique name" generation during save
            if (mediaStorage.exists(frame.file.name, targetDir)) {
                await mediaStorage.delete(frame.file.name, targetDir);
            }

            return await mediaStorage.save(frame.file, targetDir);
        }
    }
};

module.exports = controller;
