// @ts-ignore
const tpl = require('@tryghost/tpl');
const errors = require('@tryghost/errors');
const models = require('../../models');

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
    }
};

module.exports = controller;

