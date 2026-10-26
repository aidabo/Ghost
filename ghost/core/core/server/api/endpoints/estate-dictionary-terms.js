const models = require('../../models');
const errors = require('@tryghost/errors');
const tpl = require('@tryghost/tpl');

const messages = {
    notFound: 'estate dictionary term not found.'
};

const controller = {
    docName: 'estatedictionaryterms',

    browse: {
        headers: {cacheInvalidate: false},
        options: ['limit', 'page', 'filter', 'order'],
        permissions: {object: 'estatedictionaryterm', action: 'browse'},
        async query(frame) {
            return await models.EstateDictionaryTerm.findPage(frame.options);
        }
    },

    read: {
        headers: {cacheInvalidate: false},
        options: ['id'],
        data: ['id'],
        permissions: {object: 'estatedictionaryterm', action: 'read'},
        async query(frame) {
            const entry = await models.EstateDictionaryTerm.findOne({id: frame.data.id}, frame.options);
            if (!entry) {
                throw new errors.NotFoundError({message: tpl(messages.notFound)});
            }
            return entry;
        }
    },

    add: {
        statusCode: 201,
        headers: {cacheInvalidate: true},
        permissions: {object: 'estatedictionaryterm', action: 'add'},
        async query(frame) {
            return await models.EstateDictionaryTerm.add(frame.data.estatedictionaryterms[0], frame.options);
        }
    },

    edit: {
        headers: {cacheInvalidate: true},
        options: ['id'],
        permissions: {object: 'estatedictionaryterm', action: 'edit'},
        async query(frame) {
            const existing = await models.EstateDictionaryTerm.findOne({id: frame.options.id}, frame.options);
            if (!existing) {
                throw new errors.NotFoundError({message: tpl(messages.notFound)});
            }
            return await models.EstateDictionaryTerm.edit(frame.data.estatedictionaryterms[0], {
                ...frame.options,
                id: existing.id
            });
        }
    },

    destroy: {
        statusCode: 204,
        headers: {cacheInvalidate: true},
        options: ['id'],
        permissions: {object: 'estatedictionaryterm', action: 'destroy'},
        async query(frame) {
            const existing = await models.EstateDictionaryTerm.findOne({id: frame.options.id}, frame.options);
            if (!existing) {
                throw new errors.NotFoundError({message: tpl(messages.notFound)});
            }
            return await models.EstateDictionaryTerm.destroy({...frame.options, require: true});
        }
    }
};

module.exports = controller;
