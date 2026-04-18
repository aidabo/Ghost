const models = require('../../models');
const db = require('../../data/db');
const tpl = require('@tryghost/tpl');
const errors = require('@tryghost/errors');
const { mapQuery } = require('@tryghost/mongo-utils');
const postsPublicService = require('../../services/posts-public');
const getPostServiceInstance = require('../../services/posts/posts-service');
const postsService = getPostServiceInstance();

const allowedIncludes = [
    'tags',
    'authors',
    'tiers',
    'sentiment',
    'count.bookmarks',
    'count.favors',
    'count.forwards',
    'count.comments',
    'social_post_components',
];

const messages = {
    postNotFound: 'Post not found.',
    noPermission: 'You are not allowed to access posts in this group.'
};

function extractGroupIds(filter) {
    if (!filter || typeof filter !== 'string') {
        return [];
    }

    const ids = new Set();
    const listMatch = filter.match(/group_id:\[([^\]]+)\]/);
    if (listMatch && listMatch[1]) {
        listMatch[1]
            .split(',')
            .map(id => id.trim().replace(/^['"]|['"]$/g, ''))
            .filter(Boolean)
            .forEach(id => ids.add(id));
    }

    const singleMatches = filter.matchAll(/group_id:'?([a-f0-9]+)'?/g);
    for (const match of singleMatches) {
        if (match[1]) {
            ids.add(match[1]);
        }
    }

    return [...ids];
}

function appendGroupFilter(frame) {
    const groupId = frame.options?.group_id;
    if (!groupId) {
        return;
    }

    if (!/\bgroup_id:/.test(frame.options.filter || '')) {
        frame.options.filter = frame.options.filter ? `${frame.options.filter}+group_id:${groupId}` : `group_id:${groupId}`;
    }

    delete frame.options.group_id;
}

async function enforcePublicGroupAccess(frame, requestedGroupId = null) {
    const groupIds = new Set([
        ...extractGroupIds(frame.options?.filter),
        ...(requestedGroupId ? [requestedGroupId] : [])
    ]);

    if (!groupIds.size) {
        return;
    }

    for (const groupId of groupIds) {
        const group = await db.knex('social_groups')
            .select('id', db.knex.raw('type as groupType'))
            .where('id', groupId)
            .first();

        if (!group) {
            throw new errors.NotFoundError({
                message: `Group not found: ${groupId}.`
            });
        }

        if (group.groupType !== 'public') {
            throw new errors.NoPermissionError({
                message: tpl(messages.noPermission)
            });
        }
    }
}

const rejectPrivateFieldsTransformer = input => mapQuery(input, function (value, key) {
    const lowerCaseKey = key.toLowerCase();
    if (lowerCaseKey.startsWith('authors.password') || lowerCaseKey.startsWith('authors.email')) {
        return;
    }

    return {
        [key]: value
    };
});

/**
 *
 * @param {import('@tryghost/api-framework').Frame} frame
 * @param {object} options
 * @returns {object}
 */
function generateOptionsData(frame, options) {
    return options.reduce((memo, option) => {
        let value = frame.options?.[option];

        if (['include', 'fields', 'formats'].includes(option) && typeof value === 'string') {
            value = value.split(',').sort();
        }

        if (option === 'page') {
            value = value || 1;
        }

        return {
            ...memo,
            [option]: value
        };
    }, {});
}

function generateAuthData(frame) {
    if (frame.options?.context?.member) {
        return {
            free: frame.options?.context?.member.status === 'free',
            tiers: frame.options?.context?.member.products?.map((product) => {
                return product.slug;
            }).sort()
        };
    }
}

/** @type {import('@tryghost/api-framework').Controller} */
const controller = {
    docName: 'posts',

    browse: {
        headers: {
            cacheInvalidate: false
        },
        cache: postsPublicService.api?.cache,
        generateCacheKeyData(frame) {
            return {
                options: generateOptionsData(frame, [
                    'include',
                    'filter',
                    'group_id',
                    'fields',
                    'formats',
                    'limit',
                    'order',
                    'page',
                    'absolute_urls',
                    'collection'
                ]),
                auth: generateAuthData(frame),
                method: 'browse'
            };
        },
        options: [
            'include',
            'filter',
            'group_id',
            'fields',
            'formats',
            'limit',
            'order',
            'page',
            'debug',
            'absolute_urls',
            'collection'
        ],
        validation: {
            options: {
                include: {
                    values: allowedIncludes
                },
                formats: {
                    values: models.Post.allowedFormats
                }
            }
        },
        permissions: true,
        async query(frame) {
            const requestedGroupId = frame.options?.group_id || null;
            await enforcePublicGroupAccess(frame, requestedGroupId);
            appendGroupFilter(frame);

            const options = {
                ...frame.options,
                mongoTransformer: rejectPrivateFieldsTransformer
            };
            return postsService.browsePosts(options);
        }
    },

    read: {
        headers: {
            cacheInvalidate: false
        },
        cache: postsPublicService.api?.cache,
        generateCacheKeyData(frame) {
            return {
                options: generateOptionsData(frame, [
                    'filter',
                    'include',
                    'group_id',
                    'fields',
                    'formats',
                    'absolute_urls'
                ]),
                auth: generateAuthData(frame),
                method: 'read',
                identifier: {
                    id: frame.data.id,
                    slug: frame.data.slug,
                    uuid: frame.data.uuid
                }
            };
        },
        options: [
            'filter',
            'include',
            'group_id',
            'fields',
            'formats',
            'debug',
            'absolute_urls'
        ],
        data: [
            'id',
            'slug',
            'uuid'
        ],
        validation: {
            options: {
                include: {
                    values: allowedIncludes
                },
                formats: {
                    values: models.Post.allowedFormats
                }
            }
        },
        permissions: true,
        async query(frame) {
            const requestedGroupId = frame.options?.group_id || null;
            await enforcePublicGroupAccess(frame, requestedGroupId);
            appendGroupFilter(frame);

            const options = {
                ...frame.options,
                mongoTransformer: rejectPrivateFieldsTransformer
            };
            return models.Post.findOne(frame.data, options)
                .then((model) => {
                    if (!model) {
                        throw new errors.NotFoundError({
                            message: tpl(messages.postNotFound)
                        });
                    }

                    return model;
                });
        }
    }
};

module.exports = controller;
