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
            'page',

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
        permissions: true,
        async query(frame) {
            const filter = frame.options.filter
                ? `status:published+(${frame.options.filter})`
                : 'status:published';

            const options = {
                ...frame.options,
                filter
            };

            return models.EstateProperty.hasAdvancedEstateSearchOptions(options)
                ? await models.EstateProperty.findPageWithEstateSearch(options)
                : await models.EstateProperty.findPage(options);
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
            'page',

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
        permissions: true,
        async query(frame) {
            const filter = frame.options.filter
                ? `status:published+(${frame.options.filter})`
                : 'status:published';

            const options = {
                ...frame.options,
                filter
            };

            return models.EstateProperty.hasAdvancedEstateSearchOptions(options)
                ? await models.EstateProperty.findPageWithEstateSearch(options)
                : await models.EstateProperty.findPage(options);
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
