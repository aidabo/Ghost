const models = require('../../models');
const errors = require('@tryghost/errors');
const tpl = require('@tryghost/tpl');

const messages = {
    notFound: 'estate setting not found.'
};

const controller = {
    docName: 'estatesettings',

    browse: {
        headers: {
            cacheInvalidate: false
        },
        options: [
            'limit'
        ],
        permissions: {
            object: 'estatesetting',
            action: 'browse'
        },
        async query(frame) {
            return await models.EstateSetting.findAll(frame.options);
        }
    },

    read: {
        headers: {
            cacheInvalidate: false
        },
        data: ['key'],
        permissions: {
            object: 'estatesetting',
            action: 'read'
        },
        async query(frame) {
            const entry = await models.EstateSetting.findOne(frame.data, frame.options);

            if (!entry) {
                throw new errors.NotFoundError({
                    message: tpl(messages.notFound)
                });
            }

            return entry;
        }
    },

    edit: {
        headers: {
            cacheInvalidate: true
        },
        options: ['key'],
        permissions: {
            object: 'estatesetting',
            action: 'edit'
        },
        async query(frame) {
            const existing = await models.EstateSetting.findOne({key: frame.options.key}, frame.options);

            if (existing) {
                return await models.EstateSetting.edit(frame.data.estatesettings[0], {
                    ...frame.options,
                    id: existing.id
                });
            }

            // Create if not exists (upsert behavior)
            return await models.EstateSetting.add(frame.data.estatesettings[0], frame.options);
        }
    }
};

module.exports = controller;
