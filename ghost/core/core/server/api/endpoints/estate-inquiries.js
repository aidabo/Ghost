const models = require('../../models');
const errors = require('@tryghost/errors');
const tpl = require('@tryghost/tpl');

const messages = {
    notFound: 'estate inquiry not found.'
};

const controller = {
    docName: 'estateinquiries',

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
        permissions: {
            object: 'estateinquiry',
            action: 'browse'
        },
        async query(frame) {
            return await models.EstateInquiry.findPage(frame.options);
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
        permissions: {
            object: 'estateinquiry',
            action: 'read'
        },
        async query(frame) {
            const entry = await models.EstateInquiry.findOne(frame.data, frame.options);

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
            cacheInvalidate: false
        },
        permissions: {
            object: 'estateinquiry',
            action: 'add'
        },
        async query(frame) {
            return await models.EstateInquiry.add(frame.data.estateinquiries[0], frame.options);
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
            object: 'estateinquiry',
            action: 'edit'
        },
        async query(frame) {
            const entry = await models.EstateInquiry.findOne({id: frame.options.id}, frame.options);

            if (!entry) {
                throw new errors.NotFoundError({
                    message: tpl(messages.notFound)
                });
            }

            return await models.EstateInquiry.edit(frame.data.estateinquiries[0], frame.options);
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
            object: 'estateinquiry',
            action: 'destroy'
        },
        async query(frame) {
            const entry = await models.EstateInquiry.findOne({id: frame.options.id}, frame.options);

            if (!entry) {
                throw new errors.NotFoundError({
                    message: tpl(messages.notFound)
                });
            }

            return models.EstateInquiry.destroy({...frame.options, require: true});
        }
    }
};

module.exports = controller;
