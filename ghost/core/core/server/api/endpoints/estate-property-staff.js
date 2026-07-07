const models = require('../../models');
const ghostBookshelf = require('../../models/base');
const errors = require('@tryghost/errors');
const tpl = require('@tryghost/tpl');

const messages = {
    notFound: 'estate property staff link not found.',
    maxStaff: 'A property can have up to 3 staff members.'
};

const controller = {
    docName: 'estatepropertystaff',

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
            object: 'estateproperty',
            action: 'read'
        },
        async query(frame) {
            const options = {...frame.options};

            if (frame.options.property_id) {
                options.filter = options.filter
                    ? `property_id:'${frame.options.property_id}'+(${options.filter})`
                    : `property_id:'${frame.options.property_id}'`;
            }

            return await models.EstatePropertyStaff.findPage(options);
        }
    },

    add: {
        statusCode: 201,
        headers: {
            cacheInvalidate: true
        },
        permissions: {
            object: 'estateproperty',
            action: 'edit'
        },
        async query(frame) {
            const data = frame.data.estatepropertystaff[0];
            if (frame.options.property_id && !data.property_id) {
                data.property_id = frame.options.property_id;
            }

            const propertyId = String(data.property_id || '').trim();
            const userId = String(data.user_id || '').trim();
            if (!propertyId || !userId) {
                throw new errors.ValidationError({message: 'property_id and user_id are required.'});
            }

            const existing = await models.EstatePropertyStaff.findOne({property_id: propertyId, user_id: userId}, frame.options);
            if (existing) {
                return existing;
            }

            const countResult = await ghostBookshelf.knex('estate_property_staff')
                .where({property_id: propertyId})
                .count({total: 'id'})
                .first();
            if (Number(countResult && countResult.total || 0) >= 3) {
                throw new errors.ValidationError({
                    message: tpl(messages.maxStaff)
                });
            }

            return await models.EstatePropertyStaff.add(data, frame.options);
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
            object: 'estateproperty',
            action: 'edit'
        },
        async query(frame) {
            const entry = await models.EstatePropertyStaff.findOne({id: frame.options.id}, frame.options);

            if (!entry) {
                throw new errors.NotFoundError({
                    message: tpl(messages.notFound)
                });
            }

            return models.EstatePropertyStaff.destroy({...frame.options, require: true});
        }
    }
};

module.exports = controller;
