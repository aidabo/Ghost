// @ts-ignore
const tpl = require('@tryghost/tpl');
const errors = require('@tryghost/errors');
const models = require('../../models');
// @ts-ignore
const logging = require('@tryghost/logging');

const ALLOWED_INCLUDES = [
    'posts'
];

const messages = {
    notFound: 'post component not found.'
};

/** @type {import('@tryghost/api-framework').Controller} */
const controller = {
    docName: 'postcomponents',

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
            return await models.PostComponent.findPage({...frame.options, withRelated: ALLOWED_INCLUDES});
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
            const entry = await models.PostComponent.findOne(frame.data, {...frame.options, withRelated: ALLOWED_INCLUDES});
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
            'name', 
            'title' 
        ],
        permissions: true,
        async query(frame) {
            try {
                // @ts-ignore
                return await models.PostComponent.add(frame.data.postcomponents[0], frame.options);
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
            'name', 
            'title' 
        ],
        permissions: true,
        async query(frame) {
            try {
                // @ts-ignore
                return await models.PostComponent.edit(frame.data.postcomponents[0], frame.options);
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
            return models.PostComponent.destroy({...frame.options, require: true});
        }
    }
};

module.exports = controller;

