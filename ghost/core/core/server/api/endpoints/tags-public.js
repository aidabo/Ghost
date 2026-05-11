const tpl = require('@tryghost/tpl');
const errors = require('@tryghost/errors');
const models = require('../../models');
const db = require('../../data/db');
const tagsPublicService = require('../../services/tags-public');

const ALLOWED_INCLUDES = ['count.posts'];

const messages = {
    tagNotFound: 'Tag not found.',
    noPermission: 'You are not allowed to access tags in this group.'
};

const enforcePublicGroupAccess = async (frame) => {
    const groupId = frame.options?.group_id || null;
    if (!groupId) {
        return;
    }

    const group = await db.knex('social_groups')
        .select('id', 'status', db.knex.raw('type as groupType'))
        .where('id', groupId)
        .first();

    if (!group) {
        throw new errors.NotFoundError({
            message: `Group not found: ${groupId}.`
        });
    }

    if (group.groupType !== 'public' || group.status !== 'active') {
        throw new errors.NoPermissionError({
            message: tpl(messages.noPermission)
        });
    }
};

/** @type {import('@tryghost/api-framework').Controller} */
const controller = {
    docName: 'tags',

    browse: {
        headers: {
            cacheInvalidate: false
        },
        cache: tagsPublicService.api?.cache,
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
            await enforcePublicGroupAccess(frame);

            // @ts-ignore            
            return models.TagPublic.findPage(frame.options);
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
            await enforcePublicGroupAccess(frame);

            return models.TagPublic.findOne(frame.data, frame.options)
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

    count: {
        headers: {
            cacheInvalidate: false
        },
        options: ['filter', 'group_id'],
        permissions: true, // or define a custom permissions handler
        async query(frame) {
            await enforcePublicGroupAccess(frame);

            // @ts-ignore
            return await models.TagPublic.getCount(frame.options.filter);
        }
    }
    
};

module.exports = controller;
