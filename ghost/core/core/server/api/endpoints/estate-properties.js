const models = require('../../models');
const errors = require('@tryghost/errors');
const tpl = require('@tryghost/tpl');

const messages = {
    notFound: 'estate property not found.',
    noPermission: 'You are not allowed to access this estate property.'
};

const ALLOWED_INCLUDES = [
    'posts', 'propertyTags', 'staff', 'staffUsers', 'tags', 'media', 'socialMediaAssets', 'ghostPosts'
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
            'debug',

            'query',
            'q',
            'search',
            'query_any',
            'station_walk_minutes_max',
            'price_min',
            'price_max',
            'rent_min',
            'rent_max',
            'area_min',
            'area_max',
            'deposit_min',
            'deposit_max',
            'key_money_min',
            'key_money_max',
            'yield_min',
            'yield_max',
            'land_area_min',
            'land_area_max',
            'building_area_min',
            'building_area_max',
            'year_built_min',
            'year_built_max',
            'building_age_max',
            'nearest_station',
            'railway_line',
            'features',
            'tags',
            'source_type',
            'source',
            'location',
            'property_type',
            'status',
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
            return models.EstateProperty.hasAdvancedEstateSearchOptions(frame.options)
                ? await models.EstateProperty.findPageWithEstateSearch(frame.options)
                : await models.EstateProperty.findPage(frame.options);
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
