// @ts-ignore
const tpl = require('@tryghost/tpl');
const errors = require('@tryghost/errors');
const models = require('../../models');
// @ts-ignore
const logging = require('@tryghost/logging');

const ALLOWED_INCLUDES = [
    'posts',
    'components'
];

const messages = {
    notFound: 'social post component not found.'
};

/** @type {import('@tryghost/api-framework').Controller} */
const controller = {
    docName: 'socialpostcomponents',

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
            return await models.SocialPostComponent.findPage({...frame.options, withRelated: ALLOWED_INCLUDES});
        }
    },
    
    read: {
        headers: {cacheInvalidate: false},
        options: [
            'filter',
            'include'
        ],
        data: ['id'],
        permissions: true,
        async query(frame) {
            // @ts-ignore
            const entry = await models.SocialPostComponent.findOne(frame.data, {...frame.options, withRelated: ALLOWED_INCLUDES});
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
        headers: {cacheInvalidate: false},
        options: [
            'include',
            'transacting'
        ],
        data: [
            'post_id', 
            'component_id'
        ],
        permissions: true,
        async query(frame) {
            try {
                // @ts-ignore
                return await models.SocialPostComponent.add(frame.data.socialpostcomponents[0], frame.options);
            } catch (err) {
                logging.error(err);
                throw err;
            }
        }
    }, 

    edit: {
        statusCode: 200,
        headers: {cacheInvalidate: false},
        options: [
            'filter',
            'include',
            'id',
            // NOTE: only for internal context
            'forUpdate',
            'transacting'
        ],
        data: [
            'post_id', 
            'component_id'
        ],
        permissions: true,
        async query(frame) {
            try {
                // @ts-ignore
                return await models.SocialPostComponent.edit(frame.data.socialpostcomponents[0], frame.options);
            } catch (err) {
                logging.error(err);
                throw err;
            }
        }
    },

    destroy: {
        statusCode: 204,
        headers: {cacheInvalidate: false},
        options: ['id'],
        permissions: true,
        query(frame) {
            // @ts-ignore
            return models.SocialPostComponent.destroy({...frame.options, require: true});
        }
    }
};

module.exports = controller;

