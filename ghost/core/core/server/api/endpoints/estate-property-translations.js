const models = require('../../models');
const errors = require('@tryghost/errors');
const tpl = require('@tryghost/tpl');
const logging = require('@tryghost/logging');

const messages = {notFound: 'estate property translation not found.'};

async function reindexProperty(propertyId) {
    try {
        await models.EstateProperty.reindexSearch(propertyId);
    } catch (err) {
        logging.error(`Failed to refresh estate search index for property ${propertyId}: ${err.message}`);
    }
}

const controller = {
    docName: 'estatepropertytranslations',

    browse: {
        headers: {cacheInvalidate: false},
        options: ['limit', 'page', 'filter', 'order'],
        permissions: {object: 'estatepropertytranslation', action: 'browse'},
        async query(frame) {
            return await models.EstatePropertyTranslation.findPage(frame.options);
        }
    },

    read: {
        headers: {cacheInvalidate: false},
        options: ['id'],
        data: ['id'],
        permissions: {object: 'estatepropertytranslation', action: 'read'},
        async query(frame) {
            const entry = await models.EstatePropertyTranslation.findOne({id: frame.data.id}, frame.options);
            if (!entry) {
                throw new errors.NotFoundError({message: tpl(messages.notFound)});
            }
            return entry;
        }
    },

    add: {
        statusCode: 201,
        headers: {cacheInvalidate: true},
        permissions: {object: 'estatepropertytranslation', action: 'add'},
        async query(frame) {
            const entry = await models.EstatePropertyTranslation.add(frame.data.estatepropertytranslations[0], frame.options);
            await reindexProperty(entry.get('property_id'));
            return entry;
        }
    },

    edit: {
        headers: {cacheInvalidate: true},
        options: ['id'],
        permissions: {object: 'estatepropertytranslation', action: 'edit'},
        async query(frame) {
            const existing = await models.EstatePropertyTranslation.findOne({id: frame.options.id}, frame.options);
            if (!existing) {
                throw new errors.NotFoundError({message: tpl(messages.notFound)});
            }
            const entry = await models.EstatePropertyTranslation.edit(frame.data.estatepropertytranslations[0], {...frame.options, id: existing.id});
            await reindexProperty(entry.get('property_id'));
            return entry;
        }
    },

    destroy: {
        statusCode: 204,
        headers: {cacheInvalidate: true},
        options: ['id'],
        permissions: {object: 'estatepropertytranslation', action: 'destroy'},
        async query(frame) {
            const existing = await models.EstatePropertyTranslation.findOne({id: frame.options.id}, frame.options);
            if (!existing) {
                throw new errors.NotFoundError({message: tpl(messages.notFound)});
            }
            const propertyId = existing.get('property_id');
            const result = await models.EstatePropertyTranslation.destroy({...frame.options, require: true});
            await reindexProperty(propertyId);
            return result;
        }
    }
};

module.exports = controller;
