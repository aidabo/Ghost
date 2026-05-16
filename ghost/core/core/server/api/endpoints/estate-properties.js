const models = require('../../models');
const errors = require('@tryghost/errors');
const tpl = require('@tryghost/tpl');

const messages = {
    notFound: 'estate property not found.',
    noPermission: 'You are not allowed to access this estate property.'
};

const ALLOWED_INCLUDES = [
    'posts', 'propertyTags', 'tags', 'media', 'socialMediaAssets', 'ghostPosts'
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
            'page',
            'debug'
        ],
        validation: {
            options: {
                include: ALLOWED_INCLUDES
            }
        },
        permissions: {
            object: 'estateproperty',
            action: 'browse'
        },
        async query(frame) {
            return await models.EstateProperty.findPage(frame.options);
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
        permissions: {
            object: 'estateproperty',
            action: 'read'
        },
        async query(frame) {
            const entry = await models.EstateProperty.findOne(frame.data, {
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
    },

    add: {
        statusCode: 201,
        headers: {
            cacheInvalidate: true
        },
        options: [
            'include'
        ],
        validation: {
            options: {
                include: ALLOWED_INCLUDES
            }
        },
        permissions: {
            object: 'estateproperty',
            action: 'add'
        },
        async query(frame) {
            return await models.EstateProperty.add(frame.data.estateproperties[0], frame.options);
        }
    },

    edit: {
        headers: {
            cacheInvalidate: true
        },
        options: [
            'include',
            'id'
        ],
        validation: {
            options: {
                include: ALLOWED_INCLUDES,
                id: {required: true}
            }
        },
        permissions: {
            object: 'estateproperty',
            action: 'edit'
        },
        async query(frame) {
            const entry = await models.EstateProperty.findOne({id: frame.options.id}, frame.options);

            if (!entry) {
                throw new errors.NotFoundError({
                    message: tpl(messages.notFound)
                });
            }

            return await models.EstateProperty.edit(frame.data.estateproperties[0], frame.options);
        }
    },

    destroy: {
        statusCode: 204,
        headers: {
            cacheInvalidate: true
        },
        options: [
            'id'
        ],
        validation: {
            options: {
                id: {required: true}
            }
        },
        permissions: {
            object: 'estateproperty',
            action: 'destroy'
        },
        async query(frame) {
            const entry = await models.EstateProperty.findOne({id: frame.options.id}, frame.options);

            if (!entry) {
                throw new errors.NotFoundError({
                    message: tpl(messages.notFound)
                });
            }

            return models.EstateProperty.destroy({...frame.options, require: true});
        }
    }
};

module.exports = controller;
