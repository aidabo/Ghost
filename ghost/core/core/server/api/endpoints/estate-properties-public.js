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
            'floor_plan',
            'property_type',
            'featured',
            'status',
        ],
        validation: {
            options: {
                include: ALLOWED_INCLUDES
            }
        },
        permissions: true,
        async query(frame) {
            const clauses = ['status:published'];
            if (frame.options.filter) {
                clauses.push(`(${frame.options.filter})`);
            }
            // Fold structured equality filters into NQL so they apply on the plain
            // findPage path (full estate_properties table) as well as the index path.
            if (frame.options.property_type) {
                const types = String(frame.options.property_type)
                    .split(',')
                    .map(value => value.trim())
                    .filter(Boolean);
                if (types.length === 1) {
                    clauses.push(`property_type:${types[0]}`);
                } else if (types.length > 1) {
                    clauses.push(`property_type:[${types.join(',')}]`);
                }
            }
            const filter = clauses.join('+');

            const options = {
                ...frame.options,
                filter
            };

            const result = await (models.EstateProperty.hasAdvancedEstateSearchOptions(options)
                ? models.EstateProperty.findPageWithEstateSearch(options)
                : models.EstateProperty.findPage(options));
            await models.EstateProperty.attachMediaImages(result);
            return result;
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
            'floor_plan',
            'property_type',
            'featured',
            'status',
        ],
        validation: {
            options: {
                include: ALLOWED_INCLUDES
            }
        },
        permissions: true,
        async query(frame) {
            const clauses = ['status:published'];
            if (frame.options.filter) {
                clauses.push(`(${frame.options.filter})`);
            }
            // Fold structured equality filters into NQL so they apply on the plain
            // findPage path (full estate_properties table) as well as the index path.
            if (frame.options.property_type) {
                const types = String(frame.options.property_type)
                    .split(',')
                    .map(value => value.trim())
                    .filter(Boolean);
                if (types.length === 1) {
                    clauses.push(`property_type:${types[0]}`);
                } else if (types.length > 1) {
                    clauses.push(`property_type:[${types.join(',')}]`);
                }
            }
            const filter = clauses.join('+');

            const options = {
                ...frame.options,
                filter
            };

            const result = await (models.EstateProperty.hasAdvancedEstateSearchOptions(options)
                ? models.EstateProperty.findPageWithEstateSearch(options)
                : models.EstateProperty.findPage(options));
            await models.EstateProperty.attachMediaImages(result);
            return result;
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

            await models.EstateProperty.attachMediaImages(entry);
            return entry;
        }
    }
};

module.exports = controller;
