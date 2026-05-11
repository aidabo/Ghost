/* eslint-disable ghost/ghost-custom/max-api-complexity */
const path = require('path');
const errors = require('@tryghost/errors');
const imageTransform = require('@tryghost/image-transform');

const storage = require('../../adapters/storage');
const models = require('../../models');
const config = require('../../../shared/config');
const socialMediaAssets = require('./utils/social-media-assets');

const normalizeUploadFilename = (value) => {
    const raw = path.basename(String(value || '').trim() || 'upload.bin');
    const withoutOriginalSuffix = raw.replace(/_o(\.\w+?)$/, '$1');
    const deduped = withoutOriginalSuffix.match(/^(.*\.[a-z0-9]+)-[a-z0-9_-]+$/i);
    return deduped ? deduped[1] : withoutOriginalSuffix;
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
                message: `No login user authentication, can not upload images to group: ${groupId}.`
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
                message: `You are not allowed to upload images to this group: ${groupId}, user: ${userId}.`
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
    docName: 'images',
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
            const store = storage.getStorage('images');
            const uploadContext = await resolveUploadTargetDir(store, frame);
            const userTargetDir = uploadContext.targetDir;
            const normalizedName = normalizeUploadFilename(frame.file.originalname || frame.file.name || '');
            frame.file.name = normalizedName;
            frame.file.originalname = normalizedName;
            frame.file.ext = path.extname(normalizedName);

            // Normalize
            const imageOptimizationOptions = config.get('imageOptimization');

            // CASE: image transform is not capable of transforming file (e.g. .gif)
            if (imageTransform.shouldResizeFileExtension(frame.file.ext) && imageOptimizationOptions.resize) {
                const out = `${frame.file.path}_processed`;
                const originalPath = frame.file.path;

                const options = Object.assign({
                    in: originalPath,
                    out,
                    ext: frame.file.ext,
                    width: config.get('imageOptimization:defaultMaxWidth')
                }, imageOptimizationOptions);

                try {
                    await imageTransform.resizeFromPath(options);
                } catch (err) {
                    // If the image processing fails, we don't want to store the image because it's corrupted/invalid
                    throw new errors.BadRequestError({
                        message: 'Image processing failed',
                        context: err.message,
                        help: 'Please verify that the image is valid'
                    });
                }

                // Store the processed/optimized image
                const processedImageUrl = await store.save({
                    ...frame.file,
                    path: out
                }, userTargetDir || undefined);

                await socialMediaAssets.upsertAsset({
                    knex: models.Base.knex,
                    store,
                    url: processedImageUrl,
                    assetType: 'image',
                    userId: uploadContext.userId,
                    groupId: uploadContext.groupId,
                    tag: uploadContext.tag
                });

                let processedImageName = path.basename(processedImageUrl);
                let processedImageDir = undefined;

                if (store.urlToPath) {
                    // Currently urlToPath is not part of StorageBase, so not all storage provider have implemented it
                    const processedImagePath = store.urlToPath(processedImageUrl);

                    // Get the path and name of the processed image
                    // We want to store the original image on the same name + _o
                    // So we need to wait for the first store to finish before generating the name of the original image
                    processedImageName = path.basename(processedImagePath);
                    processedImageDir = path.dirname(processedImagePath);
                }

                // Store the original image
                await store.save({
                    ...frame.file,
                    path: originalPath,
                    name: imageTransform.generateOriginalImageName(processedImageName)
                }, processedImageDir || userTargetDir || undefined);

                return processedImageUrl;
            }

            const imageUrl = await store.save(frame.file, userTargetDir || undefined);

            await socialMediaAssets.upsertAsset({
                knex: models.Base.knex,
                store,
                url: imageUrl,
                assetType: 'image',
                userId: uploadContext.userId,
                groupId: uploadContext.groupId,
                tag: uploadContext.tag
            });

            return imageUrl;
        }
    }
};

module.exports = controller;
