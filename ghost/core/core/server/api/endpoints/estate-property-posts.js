const models = require('../../models');
const errors = require('@tryghost/errors');
const tpl = require('@tryghost/tpl');

const messages = {
    notFound: 'estate property post link not found.'
};

const controller = {
    docName: 'estatepropertyposts',

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
            object: 'estatepropertypost',
            action: 'browse'
        },
        async query(frame) {
            const options = {...frame.options};

            if (frame.options.property_id) {
                options.filter = options.filter
                    ? `property_id:'${frame.options.property_id}'+(${options.filter})`
                    : `property_id:'${frame.options.property_id}'`;
            }

            return await models.EstatePropertyPost.findPage(options);
        }
    },

    add: {
        statusCode: 201,
        headers: {
            cacheInvalidate: true
        },
        permissions: {
            object: 'estatepropertypost',
            action: 'add'
        },
        async query(frame) {
            const data = frame.data.estatepropertyposts[0];
            const link = await models.EstatePropertyPost.add(data, frame.options);
            const post = await models.Post.findOne({
                id: data.post_id,
                status: 'published'
            });

            if (post && data.property_id) {
                await models.EstateProperty.edit({status: 'published'}, {
                    ...frame.options,
                    id: data.property_id
                });
            }

            return link;
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
            object: 'estatepropertypost',
            action: 'destroy'
        },
        async query(frame) {
            const entry = await models.EstatePropertyPost.findOne({id: frame.options.id}, frame.options);

            if (!entry) {
                throw new errors.NotFoundError({
                    message: tpl(messages.notFound)
                });
            }

            return models.EstatePropertyPost.destroy({...frame.options, require: true});
        }
    }
};

module.exports = controller;
