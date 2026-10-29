const models = require('../../models');
const errors = require('@tryghost/errors');
const tpl = require('@tryghost/tpl');

const messages = {notFound: 'estate property translation not found.'};

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
            if (!entry) throw new errors.NotFoundError({message: tpl(messages.notFound)});
            return entry;
        }
    },

    add: {
        statusCode: 201,
        headers: {cacheInvalidate: true},
        permissions: {object: 'estatepropertytranslation', action: 'add'},
        async query(frame) {
            return await models.EstatePropertyTranslation.add(frame.data.estatepropertytranslations[0], frame.options);
        }
    },

    edit: {
        headers: {cacheInvalidate: true},
        options: ['id'],
        permissions: {object: 'estatepropertytranslation', action: 'edit'},
        async query(frame) {
            const existing = await models.EstatePropertyTranslation.findOne({id: frame.options.id}, frame.options);
            if (!existing) throw new errors.NotFoundError({message: tpl(messages.notFound)});
            return await models.EstatePropertyTranslation.edit(frame.data.estatepropertytranslations[0], {...frame.options, id: existing.id});
        }
    },

    destroy: {
        statusCode: 204,
        headers: {cacheInvalidate: true},
        options: ['id'],
        permissions: {object: 'estatepropertytranslation', action: 'destroy'},
        async query(frame) {
            const existing = await models.EstatePropertyTranslation.findOne({id: frame.options.id}, frame.options);
            if (!existing) throw new errors.NotFoundError({message: tpl(messages.notFound)});
            return await models.EstatePropertyTranslation.destroy({...frame.options, require: true});
        }
    }
};

module.exports = controller;
