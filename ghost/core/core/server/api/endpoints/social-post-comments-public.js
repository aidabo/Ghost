const commentsService = require('../../services/social-comments');

const ALLOWED_INCLUDES = [
    'user', 
    'replies', 
    'replies.user', 
    'replies.count.likes', 
    'replies.liked', 
    'count.replies', 
    'count.likes', 
    'liked', 
    'post', 
    'parent'
];

/** @type {import('@tryghost/api-framework').Controller} */
const controller = {
    docName: 'socialpostcomments',

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
            'debug'
        ],
        validation: {
            options: {
                include: ALLOWED_INCLUDES
            }
        },
        permissions: true,
        async query(frame) {
            return await commentsService.controller.browse(frame);
        }
    },

    replies: {
        headers: {
            cacheInvalidate: false
        },
        options: [
            'include',
            'page',
            'limit',
            'fields',
            'filter',
            'order',
            'debug',
            'id'
        ],
        validation: {
            options: {
                include: ALLOWED_INCLUDES
            }
        },
        permissions: 'browse',
        async query(frame) {
            return await commentsService.controller.replies(frame);
        }
    },

    read: {
        headers: {
            cacheInvalidate: false
        },
        options: [
            'include'
        ],
        data: [
            'id',
            'email'
        ],
        validation: {
            options: {
                include: ALLOWED_INCLUDES
            }
        },
        permissions: true,
        async query(frame) {
            return await commentsService.controller.read_public(frame);
        }
    },

    counts: {
        headers: {
            cacheInvalidate: false
        },
        permissions: false,
        options: [
            'ids'
        ],
        async query(frame) {
            return await commentsService.controller.count(frame);
        }
    }
};

module.exports = controller;

