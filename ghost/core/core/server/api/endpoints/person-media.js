const models = require('../../models');
const errors = require('@tryghost/errors');
const tpl = require('@tryghost/tpl');

const messages = {
    notFound: 'person media link not found.'
};

const controller = {
    docName: 'personmedia',

    browse: {
        headers: {
            cacheInvalidate: false
        },
        options: [
            'include',
            'filter',
            'limit',
            'page',
            'person_id'
        ],
        permissions: false,
        async query(frame) {
            const options = {...frame.options};

            if (frame.options.person_id) {
                options.filter = options.filter
                    ? `person_id:'${frame.options.person_id}'+(${options.filter})`
                    : `person_id:'${frame.options.person_id}'`;
            }

            return await models.PersonMedia.findPage(options);
        }
    },

    read: {
        headers: {
            cacheInvalidate: false
        },
        options: [
            'include'
        ],
        data: ['id'],
        permissions: false,
        async query(frame) {
            const entry = await models.PersonMedia.findOne({id: frame.data.id}, frame.options);

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
        permissions: false,
        async query(frame) {
            return await models.PersonMedia.add(frame.data.personmedia[0], frame.options);
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
        permissions: false,
        async query(frame) {
            const entry = await models.PersonMedia.findOne({id: frame.options.id}, frame.options);

            if (!entry) {
                throw new errors.NotFoundError({
                    message: tpl(messages.notFound)
                });
            }

            await models.PersonMedia.edit(frame.data.personmedia[0], {id: frame.options.id, ...frame.options});
            return models.PersonMedia.findOne({id: frame.options.id}, frame.options);
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
        permissions: false,
        async query(frame) {
            const entry = await models.PersonMedia.findOne({id: frame.options.id}, frame.options);

            if (!entry) {
                throw new errors.NotFoundError({
                    message: tpl(messages.notFound)
                });
            }

            await models.PersonMedia.destroy({id: frame.options.id});
        }
    }
};

module.exports = controller;
