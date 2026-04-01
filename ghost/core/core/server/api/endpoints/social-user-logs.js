// @ts-ignore
const tpl = require('@tryghost/tpl');
const errors = require('@tryghost/errors');
const models = require('../../models');
// @ts-ignore
const logging = require('@tryghost/logging');

const ALLOWED_INCLUDES = [
    'user'
];

const messages = {
    notFound: 'social user logs not found.'
};

/** @type {import('@tryghost/api-framework').Controller} */
const controller = {
    docName: 'socialuserlogs',

    browse: {
        headers: {
            cacheInvalidate: false
        },
        options: [
            'include',
            'filter',
            'fields',
            'collection',
            'formats',
            'limit',
            'order',
            'page',
            'debug'
        ],
        validation: {
            options: {
                include: ALLOWED_INCLUDES
            }
        },
        permissions: true,
        async query(frame) {
            // @ts-ignore
            return await models.SocialUserLog.findPage({ ...frame.options, withRelated: ALLOWED_INCLUDES });
        }
    },

    read: {
        headers: { cacheInvalidate: false },
        options: [
            'filter',
            'include'
        ],
        data: ['id'],
        permissions: true,
        async query(frame) {
            // @ts-ignore
            const entry = await models.SocialUserLog.findOne(frame.data, { ...frame.options, withRelated: ALLOWED_INCLUDES });
            if (!entry) {
                return Promise.reject(new errors.NotFoundError({
                    message: tpl(messages.notFound)
                }));
            }
            return entry;
        }
    },

    add: {
        statusCode: 201,
        headers: { cacheInvalidate: false },
        options: [
            'include',
            'transacting'
        ],
        data: [
            'user_id',
            'function_used',
            'metadata'
        ],
        permissions: true,
        async query(frame) {
            try {
                // @ts-ignore
                return await models.SocialUserLog.add(frame.data.socialuserlogs[0], frame.options);
            } catch (err) {
                logging.error(err);
                throw err;
            }
        }
    },

    edit: {
        statusCode: 200,
        headers: { cacheInvalidate: false },
        options: [
            'filter',
            'include',
            'id',
            // NOTE: only for internal context
            'forUpdate',
            'transacting'
        ],
        data: [
            'user_id',
            'function_used',
            'metadata'
        ],
        permissions: true,
        async query(frame) {
            try {
                // @ts-ignore
                return await models.SocialUserLog.edit(frame.data.socialuserlogs[0], frame.options);
            } catch (err) {
                logging.error(err);
                throw err;
            }
        }
    },

    destroy: {
        statusCode: 204,
        headers: { cacheInvalidate: false },
        options: ['id'],
        permissions: true,
        query(frame) {
            // @ts-ignore
            return models.SocialUserLog.destroy({ ...frame.options, require: true });
        }
    }
};

module.exports = controller;

