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
            'page'
        ],
        permissions: true,
        async query(frame) {
            const filter = frame.options.filter
                ? `status:published+(${frame.options.filter})`
                : 'status:published';

            const collection = await models.PersonStory.findPage({
                ...frame.options,
                filter
            });

            return await hydratePersonStoryCollection(collection);
        }
    },

    search: {
        headers: {
            cacheInvalidate: false
        },
        options: [
            'filter',
            'limit',
            'order',
            'page'
        ],
        permissions: true,
        async query(frame) {
            const filter = frame.options.filter
                ? `status:published+(${frame.options.filter})`
                : 'status:published';

            const collection = await models.PersonStory.findPage({
                ...frame.options,
                filter
            });

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
        permissions: true,
        async query(frame) {
            const entry = await models.PersonStory.findOne({
                id: frame.data.id,
                status: 'published'
            }, frame.options);

            if (!entry) {
                throw new errors.NotFoundError({
                    message: tpl(messages.notFound)
                });
            }

            return await hydratePersonStoryModel(entry);
        }
    }
};

module.exports = controller;
