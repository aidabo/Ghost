const urlUtils = require('../../../shared/url-utils');
const models = require('../../models');
const errors = require('@tryghost/errors');
const getPostServiceInstance = require('../../services/posts/posts-service');
const allowedIncludes = [
    'tags',
    'authors',
    'authors.roles',
    'email',
    'tiers',
    'newsletter',
    'count.conversions',
    'count.signups',
    'count.paid_conversions',
    'count.clicks',
    'sentiment',
    'count.positive_feedback',
    'count.negative_feedback',
    'post_revisions',
    'post_revisions.author',
    'count.bookmarks',
    'count.favors',
    'count.forwards',
    'count.comments',
    'social_post_components'
];
const unsafeAttrs = ['status', 'authors', 'visibility'];

const postsService = getPostServiceInstance();

/**
 * @param {string} event
 */
function getCacheHeaderFromEventString(event, dto) {
    if (event === 'published_updated' || event === 'unpublished') {
        return true;
    }
    if (event === 'scheduled_updated' || event === 'draft_updated') {
        const baseUrl = urlUtils.urlFor({
            relativeUrl: urlUtils.urlJoin('/p', dto.uuid, '/')
        });
        return {
            value: [
                baseUrl,
                `${baseUrl}?member_status=anonymous`,
                `${baseUrl}?member_status=free`,
                `${baseUrl}?member_status=paid`
            ].join(', ')
        };
    }
}

function setDefaultPostApproved(frame) {
    if (frame?.data?.posts && Array.isArray(frame.data.posts) && frame.data.posts.length > 0) {
        if (typeof frame.data.posts[0].post_approved === 'undefined') {
            frame.data.posts[0].post_approved = true;
        }
    }
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

async function enforceGroupAccess(frame) {
    const groupIds = extractGroupIds(frame.options?.filter);
    if (!groupIds.length) {
        return;
    }

    const userId = frame.options?.context?.user;

    for (const groupId of groupIds) {
        // @ts-ignore
        const group = await models.SocialGroup.findOne({id: groupId});
        if (!group) {
            throw new errors.NotFoundError({
                message: `Group not found: ${groupId}.`
            });
        }

        // public groups are readable without user auth
        if (group.get('type') === 'public') {
            continue;
        }

        if (!userId) {
            throw new errors.NoPermissionError({
                message: `No login user authentication, can not read posts in this group: ${groupId}.`
            });
        }

        // @ts-ignore
        const allowed = await models.SocialGroup.canAccessGroup(group, userId, 'read');
        if (!allowed) {
            throw new errors.NoPermissionError({
                message: `You are not allowed to read posts in this group: ${groupId}, user: ${userId}.`
            });
        }
    }
}

/** @type {import('@tryghost/api-framework').Controller} */
const controller = {
    docName: 'posts',
    browse: {
        headers: {
            cacheInvalidate: false
        },
        options: [
            'include',
            'filter',
            'group_id',
            'fields',
            'collection',
            'formats',
            'limit',
            'order',
            'page',
            'debug',
            'absolute_urls'
        ],
        validation: {
            options: {
                include: {
                    values: allowedIncludes
                },
                formats: {
                    // @ts-ignore
                    values: models.Post.allowedFormats
                }
            }
        },
        permissions: {
            unsafeAttrs: unsafeAttrs
        },
        async query(frame) {
            appendGroupFilter(frame);
            await enforceGroupAccess(frame);
            return postsService.browsePosts(frame.options);
        }
    },

    exportCSV: {
        options: [
            'limit',
            'filter',
            'order'
        ],
        headers: {
            disposition: {
                type: 'csv',
                value() {
                    const datetime = (new Date()).toJSON().substring(0, 10);
                    return `post-analytics.${datetime}.csv`;
                }
            },
            cacheInvalidate: false
        },
        response: {
            format: 'plain'
        },
        permissions: {
            method: 'browse'
        },
        validation: {},
        async query(frame) {
            return {
                data: await postsService.export(frame)
            };
        }
    },

    read: {
        headers: {
            cacheInvalidate: false
        },
        options: [
            'filter',
            'include',
            'fields',
            'formats',
            'debug',
            'absolute_urls',
            // NOTE: only for internal context
            'forUpdate',
            'transacting'
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
        permissions: {
            unsafeAttrs: unsafeAttrs
        },
        query(frame) {
            return postsService.readPost(frame);
        }
    },

    add: {
        statusCode: 201,
        headers: {
            cacheInvalidate: false
        },
        options: [
            'include',
            'formats',
            'source'
        ],
        validation: {
            options: {
                include: {
                    values: allowedIncludes
                },
                source: {
                    values: ['html']
                }
            }
        },
        permissions: {
            unsafeAttrs: unsafeAttrs
        },
        query(frame) {
            setDefaultPostApproved(frame);
            // @ts-ignore
            return models.Post.add(frame.data.posts[0], frame.options)
                .then((model) => {
                    if (model.get('status') === 'published') {
                        frame.setHeader('X-Cache-Invalidate', '/*');
                    }

                    return model;
                });
        }
    },

    edit: {
        headers: {
            /** @type {boolean | {value: string}} */
            cacheInvalidate: false
        },
        options: [
            'include',
            'id',
            'formats',
            'source',
            'email_segment',
            'newsletter',
            'force_rerender',
            'save_revision',
            'convert_to_lexical',
            // NOTE: only for internal context
            'forUpdate',
            'transacting',
            // for Update to hidden status and group_id
            // hidden is not default search option, so must specify filter on update. 
            // posts/:id/?filter=status:[oldstatus, 'hidden']+group_id:'my group id' or 
            // posts/:id/?filter=status:['hidden', newstatus]+group_id:'my group id' 
            'filter'
        ],
        validation: {
            options: {
                include: {
                    values: allowedIncludes
                },
                id: {
                    required: true
                },
                source: {
                    values: ['html']
                }
            }
        },
        permissions: {
            unsafeAttrs: unsafeAttrs
        },
        async query(frame) {
            await enforceGroupAccess(frame);
            setDefaultPostApproved(frame);
            // @ts-ignore
            let model = await postsService.editPost(frame, {
                eventHandler: (event, dto) => {
                    const cacheInvalidate = getCacheHeaderFromEventString(event, dto);
                    if (cacheInvalidate === true) {
                        frame.setHeader('X-Cache-Invalidate', '/*');
                    } else if (cacheInvalidate?.value) {
                        frame.setHeader('X-Cache-Invalidate', cacheInvalidate.value);
                    }
                }
            });

            return model;
        }
    },

    bulkEdit: {
        statusCode: 200,
        headers: {
            cacheInvalidate: true
        },
        options: [
            'filter'
        ],
        data: [
            'action',
            'meta'
        ],
        validation: {
            data: {
                action: {
                    required: true
                }
            },
            options: {
                filter: {
                    required: true
                }
            }
        },
        permissions: {
            method: 'edit'
        },
        async query(frame) {
            return await postsService.bulkEdit(frame.data.bulk, frame.options);
        }
    },

    bulkDestroy: {
        statusCode: 200,
        headers: {
            cacheInvalidate: true
        },
        options: [
            'filter'
        ],
        permissions: {
            method: 'destroy'
        },
        async query(frame) {
            return await postsService.bulkDestroy(frame.options);
        }
    },

    destroy: {
        statusCode: 204,
        headers: {
            cacheInvalidate: true
        },
        options: [
            'include',
            'id'
        ],
        validation: {
            options: {
                include: {
                    values: allowedIncludes
                },
                id: {
                    required: true
                }
            }
        },
        permissions: {
            unsafeAttrs: unsafeAttrs
        },
        query(frame) {
            return models.Post.destroy({...frame.options, require: true});
        }
    },

    copy: {
        statusCode: 201,
        headers: {
            location: {
                resolve: postsService.generateCopiedPostLocationFromUrl
            },
            cacheInvalidate: false
        },
        options: [
            'id',
            'formats'
        ],
        validation: {
            id: {
                required: true
            }
        },
        permissions: {
            method: 'add'
        },
        async query(frame) {
            return postsService.copyPost(frame);
        }
    }
};

module.exports = controller;
