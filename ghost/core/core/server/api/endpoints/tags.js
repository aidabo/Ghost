const tpl = require('@tryghost/tpl');
const errors = require('@tryghost/errors');
const models = require('../../models');

const ALLOWED_INCLUDES = ['count.posts'];

const messages = {
    tagNotFound: 'Tag not found.'
};

const appendGroupFilter = async (frame) => {
    const groupId = frame.options?.group_id;
    if (!groupId) {
        return;
    }

    const userId = frame.options?.context?.user;
    // @ts-ignore
    const group = await models.SocialGroup.findOne({id: groupId});
    if (!group) {
        throw new errors.NotFoundError({
            message: `Group not found: ${groupId}.`
        });
    }

    // public groups are readable without user auth
    if (group.get('type') !== 'public') {
        if (!userId) {
            throw new errors.NoPermissionError({
                message: `No login user authentication, can not read tags in this group: ${groupId}.`
            });
        }

        // @ts-ignore
        const allowed = await models.SocialGroup.canAccessGroup(group, userId, 'read');
        if (!allowed) {
            throw new errors.NoPermissionError({
                message: `You are not allowed to read tags in this group: ${groupId}, user: ${userId}.`
            });
        }
    }
};

/** @type {import('@tryghost/api-framework').Controller} */
const controller = {
    docName: 'tags',

    browse: {
        headers: {
            cacheInvalidate: false
        },
        options: [
            'include',
            'filter',
            'group_id',
            'fields',
            'limit',
            'order',
            'page',
            'debug'
        ],
        validation: {
            options: {
                include: {
                    values: ALLOWED_INCLUDES
                }
            }
        },
        permissions: true,
        async query(frame) {
            await appendGroupFilter(frame);
            return models.Tag.findPage(frame.options);
        }
    },

    read: {
        headers: {
            cacheInvalidate: false
        },
        options: [
            'include',
            'filter',
            'group_id',
            'fields',
            'debug'
        ],
        data: [
            'id',
            'slug',
            'visibility'
        ],
        validation: {
            options: {
                include: {
                    values: ALLOWED_INCLUDES
                }
            }
        },
        permissions: true,
        async query(frame) {
            await appendGroupFilter(frame);
            return models.Tag.findOne(frame.data, frame.options)
                .then((model) => {
                    if (!model) {
                        return Promise.reject(new errors.NotFoundError({
                            message: tpl(messages.tagNotFound)
                        }));
                    }

                    return model;
                });
        }
    },

    add: {
        statusCode: 201,
        headers: {
            cacheInvalidate: true
        },
        options: [
            'include'
        ],
        validation: {
            options: {
                include: {
                    values: ALLOWED_INCLUDES
                }
            }
        },
        permissions: true,
        query(frame) {
            return models.Tag.add(frame.data.tags[0], frame.options);
        }
    },

    edit: {
        headers: {
            cacheInvalidate: false
        },
        options: [
            'id',
            'include'
        ],
        validation: {
            options: {
                include: {
                    values: ALLOWED_INCLUDES
                },
                id: {
                    required: true
                }
            }
        },
        permissions: true,
        query(frame) {
            return models.Tag.edit(frame.data.tags[0], frame.options)
                .then((model) => {
                    if (!model) {
                        return Promise.reject(new errors.NotFoundError({
                            message: tpl(messages.tagNotFound)
                        }));
                    }

                    if (model.wasChanged()) {
                        frame.setHeader('X-Cache-Invalidate', '/*');
                    }

                    return model;
                });
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
                include: {
                    values: ALLOWED_INCLUDES
                },
                id: {
                    required: true
                }
            }
        },
        permissions: true,
        query(frame) {
            return models.Tag.destroy({...frame.options, require: true});
        }
    },

    count: {
        headers: {
            cacheInvalidate: false
        },
        options: ['filter'],
        permissions: true, // or define a custom permissions handler
        async query(frame) {
            // @ts-ignore
            return await models.Tag.getCount(frame.options.filter);
        }
    }
};

module.exports = controller;
