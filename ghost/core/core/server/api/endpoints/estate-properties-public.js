const models = require('../../models');
const errors = require('@tryghost/errors');
const tpl = require('@tryghost/tpl');

const messages = {
    notFound: 'estate property not found.'
};

const ALLOWED_INCLUDES = [
    'posts', 'tags', 'media'
];

const controller = {
    docName: 'estateproperties',

    browse: {
        headers: {
            cacheInvalidate: false
        },
        options: [
            'include',
            'filter',
            'fields',
            'limit',
            'order',
            'page'
        ],
        validation: {
            options: {
                include: ALLOWED_INCLUDES
            }
        },
        permissions: true,
        async query(frame) {
            const filter = frame.options.filter
                ? `status:published+(${frame.options.filter})`
                : 'status:published';

            return await models.EstateProperty.findPage({
                ...frame.options,
                filter
            });
        }
    },

    search: {
        headers: {
            cacheInvalidate: false
        },
        options: [
            'include',
            'filter',
            'fields',
            'limit',
            'order',
            'page'
        ],
        validation: {
            options: {
                include: ALLOWED_INCLUDES
            }
        },
        permissions: true,
        async query(frame) {
            const filter = frame.options.filter
                ? `status:published+(${frame.options.filter})`
                : 'status:published';

            return await models.EstateProperty.findPage({
                ...frame.options,
                filter
            });
        }
    },

    read: {
        headers: {
            cacheInvalidate: false
        },
        options: [
            'include',
            'filter'
        ],
        data: ['id'],
        validation: {
            options: {
                include: ALLOWED_INCLUDES
            }
        },
        permissions: true,
        async query(frame) {
            const entry = await models.EstateProperty.findOne({
                id: frame.data.id,
                status: 'published'
            }, {
                ...frame.options,
                withRelated: frame.options.withRelated || []
            });

            if (!entry) {
                throw new errors.NotFoundError({
                    message: tpl(messages.notFound)
                });
            }

            return entry;
        }
    }
};

module.exports = controller;
