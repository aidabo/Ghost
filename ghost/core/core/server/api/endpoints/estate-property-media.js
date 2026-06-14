const models = require('../../models');
const errors = require('@tryghost/errors');
const tpl = require('@tryghost/tpl');

const messages = {
    notFound: 'estate property media link not found.'
};

const controller = {
    docName: 'estatepropertymediums',

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
            object: 'estatepropertymedium',
            action: 'browse'
        },
        async query(frame) {
            const options = {...frame.options};

            if (frame.options.property_id) {
                options.filter = options.filter
                    ? `property_id:'${frame.options.property_id}'+(${options.filter})`
                    : `property_id:'${frame.options.property_id}'`;
            }

            return await models.EstatePropertyMedium.findPage(options);
        }
    },

    add: {
        statusCode: 201,
        headers: {
            cacheInvalidate: true
        },
        permissions: {
            object: 'estatepropertymedium',
            action: 'add'
        },
        async query(frame) {
            const data = frame.data.estatepropertymediums[0];
            // Inject property_id from URL route param
            if (frame.options.property_id && !data.property_id) {
                data.property_id = frame.options.property_id;
            }
            const result = await models.EstatePropertyMedium.add(data, frame.options);
            await models.EstateProperty.reindexSearch(data.property_id, frame.options).catch(() => false);
            return result;
        }
    },

    edit: {
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
            object: 'estatepropertymedium',
            action: 'edit'
        },
        async query(frame) {
            const entry = await models.EstatePropertyMedium.findOne({id: frame.options.id}, frame.options);

            if (!entry) {
                throw new errors.NotFoundError({
                    message: tpl(messages.notFound)
                });
            }

            const result = await models.EstatePropertyMedium.edit(frame.data.estatepropertymediums[0], frame.options);
            await models.EstateProperty.reindexSearch(entry.get('property_id'), frame.options).catch(() => false);
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
            object: 'estatepropertymedium',
            action: 'destroy'
        },
        async query(frame) {
            const entry = await models.EstatePropertyMedium.findOne({id: frame.options.id}, frame.options);

            if (!entry) {
                throw new errors.NotFoundError({
                    message: tpl(messages.notFound)
                });
            }

            const propertyId = entry.get('property_id');
            const result = await models.EstatePropertyMedium.destroy({...frame.options, require: true});
            await models.EstateProperty.reindexSearch(propertyId, frame.options).catch(() => false);
            return result;
        }
    }
};

module.exports = controller;
