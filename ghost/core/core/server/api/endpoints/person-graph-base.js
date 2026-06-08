const models = require('../../models');
const errors = require('@tryghost/errors');
const tpl = require('@tryghost/tpl');

const DEFAULT_BROWSE_OPTIONS = ['filter', 'limit', 'order', 'page', 'debug'];

const buildFilter = (filter, publishedOnly) => {
    if (!publishedOnly) {
        return filter;
    }

    if (filter) {
        return `status:published+(${filter})`;
    }

    return 'status:published';
};

const buildCrudController = ({
    docName,
    modelName,
    permissionObject,
    notFoundMessage,
    publishedOnly = false
}) => {
    const model = models[modelName];

    const permissions = publishedOnly ? true : {
        object: permissionObject,
        action: 'browse'
    };

    const readPermissions = publishedOnly ? true : {
        object: permissionObject,
        action: 'read'
    };

    const writePermissions = publishedOnly ? true : {
        object: permissionObject,
        action: 'add'
    };

    const controller = {
        docName,
        permissionObject,
        browse: {
            headers: {
                cacheInvalidate: false
            },
            options: DEFAULT_BROWSE_OPTIONS,
            permissions,
            async query(frame) {
                const collection = await model.findPage({
                    ...frame.options,
                    filter: buildFilter(frame.options.filter, publishedOnly)
                });

                return collection;
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
            permissions: readPermissions,
            async query(frame) {
                const entry = await model.findOne({
                    id: frame.data.id,
                    ...(publishedOnly ? {status: 'published'} : {})
                }, frame.options);

                if (!entry) {
                    throw new errors.NotFoundError({
                        message: tpl(notFoundMessage)
                    });
                }

                return entry;
            }
        }
    };

    if (!publishedOnly) {
        controller.add = {
            statusCode: 201,
            headers: {
                cacheInvalidate: true
            },
            permissions: writePermissions,
            async query(frame) {
                return model.add(frame.data[docName][0], frame.options);
            }
        };

        controller.edit = {
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
                object: permissionObject,
                action: 'edit'
            },
            async query(frame) {
                const entry = await model.findOne({id: frame.options.id}, frame.options);

                if (!entry) {
                    throw new errors.NotFoundError({
                        message: tpl(notFoundMessage)
                    });
                }

                return model.edit(frame.data[docName][0], frame.options);
            }
        };

        controller.destroy = {
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
                object: permissionObject,
                action: 'destroy'
            },
            async query(frame) {
                const entry = await model.findOne({id: frame.options.id}, frame.options);

                if (!entry) {
                    throw new errors.NotFoundError({
                        message: tpl(notFoundMessage)
                    });
                }

                return model.destroy({...frame.options, require: true});
            }
        };
    }

    return controller;
};

module.exports = {
    buildCrudController
};
