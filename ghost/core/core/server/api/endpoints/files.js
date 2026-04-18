const storage = require('../../adapters/storage');
const path = require('path');
const errors = require('@tryghost/errors');
const models = require('../../models');
const socialMediaAssets = require('./utils/social-media-assets');

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
                message: `No login user authentication, can not upload files to group: ${groupId}.`
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
                message: `You are not allowed to upload files to this group: ${groupId}, user: ${userId}.`
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
    docName: 'files',
    upload: {
        statusCode: 201,
        headers: {
            cacheInvalidate: false
        },
        options: [
            'group_id',
            'job_id',
            'tag',
            'tag_slug',
            'tag_id'
        ],
        permissions: false,
        async query(frame) {
            const fileStore = storage.getStorage('files');
            const uploadContext = await resolveUploadTargetDir(fileStore, frame);
            const targetDir = uploadContext.targetDir;

            const filePath = await fileStore.save({
                name: frame.file.originalname,
                path: frame.file.path
            }, targetDir || undefined);

            await socialMediaAssets.upsertAsset({
                knex: models.Base.knex,
                store: fileStore,
                url: filePath,
                assetType: 'file',
                originalFilename: frame.file?.originalname || frame.file?.name || null,
                jobId: frame.data?.job_id || frame.options?.job_id || null,
                userId: uploadContext.userId,
                groupId: uploadContext.groupId,
                tag: uploadContext.tag
            });

            return {
                filePath
            };
        }
    }
};

module.exports = controller;
