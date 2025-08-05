const models = require('../../models');
const commentsService = require('../../services/social-comments');
function handleCacheHeaders(model, frame) {
    if (model) {
        const postId = model.get('post_id');
        const parentId = model.get('parent_id');
        const pathsToInvalidate = [
            postId ? `/api/admin/social/comments/post/${postId}/` : null,
            parentId ? `/api/admin/social/comments/replies/${parentId}/` : null
        ].filter(path => path !== null);
        frame.setHeader('X-Cache-Invalidate', pathsToInvalidate.join(', '));
    }
}

/** @type {import('@tryghost/api-framework').Controller} */
const controller = {
    docName: 'socialpostcomments',

    edit: {
        headers: {
            cacheInvalidate: false
        },
        options: [
            'id'
        ],
        validation: {
            options: {
                id: {
                    required: true
                }
            }
        },
        permissions: true,
        async query(frame) {
            // @ts-ignore
            const result = await models.SocialPostComment.edit({
                id: frame.data.socialpostcomments[0].id || frame.options.id,
                status: frame.data.socialpostcomments[0].status
            }, frame.options);

            handleCacheHeaders(result, frame);

            return result;
        }
    },
    browse: {
        headers: {
            cacheInvalidate: false
        },
        options: [
            'post_id',
            'include',
            'page',
            'limit',
            'fields',
            'filter',
            'order',
            'debug'//,
        ],
        validation: {
            options: {
                post_id: {
                    required: true
                }
            }
        },
        permissions: true,
        async query(frame) {
            return await commentsService.controller.adminBrowse(frame);
        }
    }
};

module.exports = controller;
