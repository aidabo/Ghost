// @ts-ignore
const tpl = require('@tryghost/tpl');
const errors = require('@tryghost/errors');
const models = require('../../models');
const logging = require('@tryghost/logging');

const ALLOWED_INCLUDES = [
    //'posts'
];

const messages = {
    notFound: 'social component not found.'
};

const addPublishedStatusFilter = (frame) => {
    let filter = frame.options.filter;

    if (filter && typeof filter === 'string') {
        // Simple check for existing status filter
        if (!filter.includes('status:')) {
            filter = filter + '+status:published';
        }
    } else {
        filter = 'status:published';
    }
        
    frame.options.filter = filter;
};

/** @type {import('@tryghost/api-framework').Controller} */
const controller = {
    docName: 'socialcomponents',

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
            addPublishedStatusFilter(frame);
            logging.info('Fetching social components with published status filter:', JSON.stringify(frame.options));
            // @ts-ignore
            return await models.SocialComponent.findPage({...frame.options, withRelated: ALLOWED_INCLUDES});
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
            const entry = await models.SocialComponent.findOne(frame.data, {...frame.options, withRelated: ALLOWED_INCLUDES});
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

