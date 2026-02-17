// @ts-ignore
// @ts-ignore
// @ts-ignore
const tpl = require('@tryghost/tpl');
const errors = require('@tryghost/errors');
const models = require('../../models');
// @ts-ignore
// @ts-ignore
const logging = require('@tryghost/logging');

const ALLOWED_INCLUDES = [
    'posts',
    'posts.authors',
    'posts.tags',
    'owner',
    'members',
    'members.user',
    'members.role',
    'count.members',
    'count.posts',
    'count.inactive_members',
    'count.pages'
];

const messages = {
    notFound: 'group not found.',
    duplicateEntry: 'group already exists.',
    notPermissionToReadGroup: 'You do not have permission to perform this action: { group }, { user }.'
};

/** @type {import('@tryghost/api-framework').Controller} */
const controller = {
    docName: 'socialgroups',

    browse: {
        headers: {
            cacheInvalidate: false
        },
        options: [
            'include',
            'filter',
            'fields',
            'collection',
            'formats',
            'limit',
            'order',
            'page',
            'debug'
        ],
        validation: {
            options: {
                include: ALLOWED_INCLUDES
            }
        },
        permissions: true,
        async query(frame) {
            // @ts-ignore
            const allGroups = await models.SocialGroup.findPage({ ...frame.options, withRelated: ALLOWED_INCLUDES });
            //logging.info('allGroups', JSON.stringify(allGroups));
            const userId = frame.options.context?.user;
            const allowedGroups = [];
            for (const group of allGroups.data) {
                // @ts-ignore
                const canRead = await models.SocialGroup.canAccessGroup(group, userId, 'read');
                if (canRead) {
                    allowedGroups.push(group);
                }
            }
            allGroups.data = allowedGroups;
            return allGroups;
        }
    },

    read: {
        headers: { cacheInvalidate: false },
        options: [
            'filter',
            'include'
        ],
        data: ['id'],
        permissions: true,
        async query(frame) {
            // @ts-ignore
            const entry = await models.SocialGroup.findOne(frame.data, { ...frame.options, withRelated: ALLOWED_INCLUDES });
            if (!entry) {
                return Promise.reject(new errors.NotFoundError({
                    message: tpl(messages.notFound)
                }));
            }
            const userId = frame.options.context?.user;
            // @ts-ignore
            const canRead = await models.SocialGroup.canAccessGroup(entry, userId, 'read');
            if (!canRead) {
                return Promise.reject(new errors.NoPermissionError({
                    message: tpl(messages.notPermissionToReadGroup, { group: entry.id, user: userId })
                }));
            }
            return entry;
        }
    },

    add: {
        statusCode: 201,
        headers: { cacheInvalidate: false },
        options: [
            'include',
            'transacting'
        ],
        data: [
            'creator_id',
            'group_name',
            'type',
            'status',
            'optional_settings'
        ],
        permissions: true,
        async query(frame) {
            try {
                // @ts-ignore
                return await models.SocialGroup.add(frame.data.socialgroups[0], frame.options);
            } catch (err) {
                logging.error(err);
                if (err.code === 'ER_DUP_ENTRY') {
                    throw new errors.InternalServerError({
                        message: tpl(messages.duplicateEntry, frame.data.socialgroups)
                    });
                }
                throw err;
            }
        }
    },

    edit: {
        statusCode: 200,
        headers: { cacheInvalidate: false },
        options: [
            'filter',
            'include',
            'id',
            // NOTE: only for internal context
            'forUpdate',
            'transacting'
        ],
        data: [
            'creator_id',
            'group_name',
            'type',
            'status',
            'optional_settings'
        ],
        permissions: true,
        async query(frame) {
            try {
                // @ts-ignore
                return await models.SocialGroup.edit(frame.data.socialgroups[0], frame.options);
            } catch (err) {
                logging.error(err);
                if (err.code === 'ER_DUP_ENTRY') {
                    throw new errors.InternalServerError({
                        message: tpl(messages.duplicateEntry, frame.data.socialgroups)
                    });
                }
                throw err;
            }
        }
    },

    destroy: {
        statusCode: 204,
        headers: { cacheInvalidate: false },
        options: ['id'],
        permissions: true,
        query(frame) {
            // @ts-ignore
            return models.SocialGroup.destroy({ ...frame.options, require: true });
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
            return await models.SocialGroup.getGroupsCount(frame.options);
        }
    }
};

module.exports = controller;
