const models = require('../../models');
const errors = require('@tryghost/errors');
const tpl = require('@tryghost/tpl');

const messages = {
    notFound: 'estate property tag link not found.'
};

const controller = {
    docName: 'estatepropertytags',

    browse: {
        headers: {
            cacheInvalidate: false
        },
        options: [
            'include',
            'filter',
            'limit',
            'page',
            'property_id'
        ],
        permissions: {
            object: 'estatepropertytag',
            action: 'browse'
        },
        async query(frame) {
            const options = {...frame.options};

            if (frame.options.property_id) {
                options.filter = options.filter
                    ? `property_id:'${frame.options.property_id}'+(${options.filter})`
                    : `property_id:'${frame.options.property_id}'`;
            }

            return await models.EstatePropertyTag.findPage(options);
        }
    },

    add: {
        statusCode: 201,
        headers: {
            cacheInvalidate: true
        },
        permissions: {
            object: 'estatepropertytag',
            action: 'add'
        },
        async query(frame) {
            const data = frame.data.estatepropertytags[0];
            if (frame.options.property_id && !data.property_id) {
                data.property_id = frame.options.property_id;
            }
            const result = await models.EstatePropertyTag.add(data, frame.options);
            await models.EstateProperty.reindexSearch(data.property_id, frame.options).catch(() => false);
            return result;
        }
    },

    destroy: {
        statusCode: 204,
        headers: {
            cacheInvalidate: true
        },
        options: ['id'],
        validation: {
            options: {
                id: {required: true}
            }
        },
        permissions: {
            object: 'estatepropertytag',
            action: 'destroy'
        },
        async query(frame) {
            const entry = await models.EstatePropertyTag.findOne({id: frame.options.id}, frame.options);

            if (!entry) {
                throw new errors.NotFoundError({
                    message: tpl(messages.notFound)
                });
            }

            const propertyId = entry.get('property_id');
            const result = await models.EstatePropertyTag.destroy({...frame.options, require: true});
            await models.EstateProperty.reindexSearch(propertyId, frame.options).catch(() => false);
            return result;
        }
    }
};

module.exports = controller;
