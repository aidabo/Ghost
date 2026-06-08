const models = require('../../models');
const errors = require('@tryghost/errors');
const tpl = require('@tryghost/tpl');
const {
    hydratePersonStoryCollection,
    hydratePersonStoryModel
} = require('../../lib/person-story');

const messages = {
    notFound: 'person story not found.'
};

const controller = {
    docName: 'personstories',

    browse: {
        headers: {
            cacheInvalidate: false
        },
        options: [
            'filter',
            'limit',
            'order',
            'page',
            'debug'
        ],
        permissions: {
            object: 'personstory',
            action: 'browse'
        },
        async query(frame) {
            const collection = await models.PersonStory.findPage(frame.options);
            return await hydratePersonStoryCollection(collection);
        }
    },

    read: {
        headers: {
            cacheInvalidate: false
        },
        options: [
            'filter'
        ],
        data: ['id'],
        permissions: {
            object: 'personstory',
            action: 'read'
        },
        async query(frame) {
            const entry = await models.PersonStory.findOne(frame.data, frame.options);

            if (!entry) {
                throw new errors.NotFoundError({
                    message: tpl(messages.notFound)
                });
            }

            return await hydratePersonStoryModel(entry);
        }
    },

    add: {
        statusCode: 201,
        headers: {
            cacheInvalidate: true
        },
        permissions: {
            object: 'personstory',
            action: 'add'
        },
        async query(frame) {
            const entry = await models.PersonStory.add(frame.data.personstories[0], frame.options);
            return await hydratePersonStoryModel(entry);
        }
    },

    edit: {
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
            object: 'personstory',
            action: 'edit'
        },
        async query(frame) {
            const entry = await models.PersonStory.findOne({id: frame.options.id}, frame.options);

            if (!entry) {
                throw new errors.NotFoundError({
                    message: tpl(messages.notFound)
                });
            }

            const updated = await models.PersonStory.edit(frame.data.personstories[0], frame.options);
            return await hydratePersonStoryModel(updated);
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
            object: 'personstory',
            action: 'destroy'
        },
        async query(frame) {
            const entry = await models.PersonStory.findOne({id: frame.options.id}, frame.options);

            if (!entry) {
                throw new errors.NotFoundError({
                    message: tpl(messages.notFound)
                });
            }

            return models.PersonStory.destroy({...frame.options, require: true});
        }
    }
};

module.exports = controller;
