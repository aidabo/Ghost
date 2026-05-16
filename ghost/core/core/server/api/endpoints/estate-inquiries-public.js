const models = require('../../models');
const errors = require('@tryghost/errors');
const tpl = require('@tryghost/tpl');

const messages = {
    propertyNotFound: 'published estate property not found.'
};

const controller = {
    docName: 'estateinquiries',

    add: {
        statusCode: 201,
        headers: {
            cacheInvalidate: false
        },
        permissions: true,
        async query(frame) {
            const data = frame.data.estateinquiries[0];

            if (data.property_id) {
                const property = await models.EstateProperty.findOne({
                    id: data.property_id,
                    status: 'published'
                });

                if (!property) {
                    throw new errors.NotFoundError({
                        message: tpl(messages.propertyNotFound)
                    });
                }
            }

            return await models.EstateInquiry.add(data, frame.options);
        }
    }
};

module.exports = controller;
