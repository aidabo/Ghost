// @ts-ignore
const tpl = require('@tryghost/tpl');
const errors = require('@tryghost/errors');
const models = require('../../models');
// @ts-ignore
const logging = require('@tryghost/logging');

const ALLOWED_INCLUDES = [
    'user',
    'tag'
];

const messages = {
    notFound: 'social component not found.',
    noPermission: 'You are not allowed to access this social component.',
    userRequired: 'No login user authentication.'
};

const TAG_ID_REGEX = /^[a-f0-9]{24}$/;
const ADMIN_ROLES = new Set(['Owner', 'Administrator', 'Admin']);

const getCurrentUserId = (frame) => frame.options?.context?.user || null;

const isAdminUser = async (userId) => {
    if (!userId) {
        return false;
    }

    // @ts-ignore
    const user = await models.User.findOne({ id: userId }, { withRelated: ['roles'] });
    if (!user) {
        return false;
    }

    const roles = user.related('roles')?.models || [];
    return roles.some(role => ADMIN_ROLES.has(role.get('name')));
};

const resolveTagId = async (tagValue) => {
    if (typeof tagValue !== 'string') {
        return null;
    }

    const normalizedTag = tagValue.trim();
    if (!normalizedTag) {
        return null;
    }

    if (TAG_ID_REGEX.test(normalizedTag)) {
        return normalizedTag;
    }

    // @ts-ignore
    const bySlug = await models.Tag.findOne({ slug: normalizedTag }, { columns: ['id'] });
    if (bySlug) {
        return bySlug.get('id');
    }

    // @ts-ignore
    const byName = await models.Tag.findOne({ name: normalizedTag }, { columns: ['id'] });
    if (byName) {
        return byName.get('id');
    }

    return null;
};

const appendTagFilter = async (frame) => {
    const tag = frame.options?.tag;
    if (!tag) {
        return;
    }

    const tagId = await resolveTagId(tag);
    const filterTag = tagId || tag;

    if (!/\btag:/.test(frame.options.filter || '')) {
        frame.options.filter = frame.options.filter ? `${frame.options.filter}+tag:${filterTag}` : `tag:${filterTag}`;
    }

    // If searching by tag and caller didn't provide status, default to published.
    if (!/\bstatus:/.test(frame.options.filter || '')) {
        frame.options.filter = `${frame.options.filter}+status:published`;
    }

    delete frame.options.tag;
};

const appendGroupFilter = (frame) => {
    const groupId = frame.options?.group_id;
    if (!groupId) {
        return;
    }

    if (!/\bgroup_id:/.test(frame.options.filter || '')) {
        frame.options.filter = frame.options.filter ? `${frame.options.filter}+group_id:${groupId}` : `group_id:${groupId}`;
    }

    delete frame.options.group_id;
};

const appendCreatedByFilter = (frame, userId) => {
    if (!userId) {
        return;
    }

    if (!/\bcreated_by:/.test(frame.options.filter || '')) {
        frame.options.filter = frame.options.filter ? `${frame.options.filter}+created_by:${userId}` : `created_by:${userId}`;
    }
};

const canReadGroup = async (groupId, userId) => {
    if (!groupId || !userId) {
        return false;
    }

    // @ts-ignore
    const group = await models.SocialGroup.findOne({ id: groupId });
    if (!group) {
        return false;
    }

    // @ts-ignore
    return await models.SocialGroup.canAccessGroup(group, userId, 'read');
};

const enforceReadAccessForEntry = async (entry, userId, isAdmin) => {
    if (isAdmin) {
        return;
    }

    if (!userId) {
        throw new errors.NoPermissionError({
            message: tpl(messages.userRequired)
        });
    }

    if (entry.get('created_by') === userId) {
        return;
    }

    const groupId = entry.get('group_id');
    if (groupId) {
        const groupAllowed = await canReadGroup(groupId, userId);
        if (groupAllowed) {
            return;
        }
    }

    throw new errors.NoPermissionError({
        message: tpl(messages.noPermission)
    });
};

const enforceWriteAccessForEntry = (entry, userId, isAdmin) => {
    if (isAdmin) {
        return;
    }

    if (!userId || entry.get('created_by') !== userId) {
        throw new errors.NoPermissionError({
            message: tpl(messages.noPermission)
        });
    }
};

/** @type {import('@tryghost/api-framework').Controller} */
const controller = {
    docName: 'socialcomponents',

    browse: {
        headers: {
            cacheInvalidate: false
        },
        options: [
            'include',
            'filter',
            'tag',
            'group_id',
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
            console.log('socialcomponents options before processing', frame.options);
            const userId = getCurrentUserId(frame);
            const isAdmin = await isAdminUser(userId);
            const requestedGroupId = frame.options?.group_id || null;

            await appendTagFilter(frame);
            appendGroupFilter(frame);

            if (!isAdmin) {
                if (requestedGroupId) {
                    const groupReadable = await canReadGroup(requestedGroupId, userId);
                    if (!groupReadable) {
                        appendCreatedByFilter(frame, userId);
                    }
                } else {
                    appendCreatedByFilter(frame, userId);
                }
            }

            // @ts-ignore
            return await models.SocialComponent.findPage({ ...frame.options, withRelated: ALLOWED_INCLUDES });
        }
    },

    read: {
        headers: { cacheInvalidate: false },
        options: [
            'filter',
            'include',
            'group_id'
        ],
        data: ['id'],
        permissions: true,
        async query(frame) {
            const userId = getCurrentUserId(frame);
            const isAdmin = await isAdminUser(userId);

            appendGroupFilter(frame);
            // @ts-ignore
            const entry = await models.SocialComponent.findOne(frame.data, { ...frame.options, withRelated: ALLOWED_INCLUDES });
            if (!entry) {
                return Promise.reject(new errors.NotFoundError({
                    message: tpl(messages.notFound)
                }));
            }

            await enforceReadAccessForEntry(entry, userId, isAdmin);
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
            'type',
            'title',
            'tag',
            'group_id',
            'status'
        ],
        permissions: true,
        async query(frame) {
            try {
                // @ts-ignore
                return await models.SocialComponent.add(frame.data.socialcomponents[0], frame.options);
            } catch (err) {
                logging.error(err);
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
            'type',
            'title',
            'tag',
            'group_id',
            'status'
        ],
        permissions: true,
        async query(frame) {
            try {
                const userId = getCurrentUserId(frame);
                const isAdmin = await isAdminUser(userId);

                // @ts-ignore
                const existing = await models.SocialComponent.findOne({ id: frame.options.id }, frame.options);
                if (!existing) {
                    throw new errors.NotFoundError({
                        message: tpl(messages.notFound)
                    });
                }

                enforceWriteAccessForEntry(existing, userId, isAdmin);
                // @ts-ignore
                return await models.SocialComponent.edit(frame.data.socialcomponents[0], frame.options);
            } catch (err) {
                logging.error(err);
                throw err;
            }
        }
    },

    destroy: {
        statusCode: 204,
        headers: { cacheInvalidate: false },
        options: ['id'],
        permissions: true,
        async query(frame) {
            const userId = getCurrentUserId(frame);
            const isAdmin = await isAdminUser(userId);

            // @ts-ignore
            const existing = await models.SocialComponent.findOne({ id: frame.options.id }, frame.options);
            if (!existing) {
                throw new errors.NotFoundError({
                    message: tpl(messages.notFound)
                });
            }

            enforceWriteAccessForEntry(existing, userId, isAdmin);

            // @ts-ignore
            return models.SocialComponent.destroy({ ...frame.options, require: true });
        }
    }
};

module.exports = controller;
