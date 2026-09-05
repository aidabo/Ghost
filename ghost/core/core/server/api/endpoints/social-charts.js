// @ts-ignore
const tpl = require('@tryghost/tpl');
const errors = require('@tryghost/errors');
const models = require('../../models');
// @ts-ignore
const logging = require('@tryghost/logging');

const ALLOWED_INCLUDES = [
    'user'
];

const messages = {
    notFound: 'social chart not found.',
    noPermission: 'You are not allowed to access this social chart.',
    userRequired: 'No login user authentication.'
};

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
    docName: 'socialcharts',

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
            'debug'
        ],
        validation: {
            options: {
                include: ALLOWED_INCLUDES
            }
        },
        permissions: true,
        async query(frame) {
            const userId = getCurrentUserId(frame);
            const isAdmin = await isAdminUser(userId);
            const requestedGroupId = frame.options?.group_id || null;

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
            return await models.SocialChart.findPage({ ...frame.options, withRelated: ALLOWED_INCLUDES });
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
            const entry = await models.SocialChart.findOne(frame.data, { ...frame.options, withRelated: ALLOWED_INCLUDES });
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
            'title',
            'group_id',
            'status'
        ],
        permissions: true,
        async query(frame) {
            try {
                // @ts-ignore
                return await models.SocialChart.add(frame.data.socialcharts[0], frame.options);
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
            'title',
            'group_id',
            'status',
            'created_by'
        ],
        permissions: true,
        async query(frame) {
            try {
                const userId = getCurrentUserId(frame);
                const isAdmin = await isAdminUser(userId);

                // @ts-ignore
                const existing = await models.SocialChart.findOne({ id: frame.options.id }, frame.options);
                if (!existing) {
                    throw new errors.NotFoundError({
                        message: tpl(messages.notFound)
                    });
                }

                enforceWriteAccessForEntry(existing, userId, isAdmin);

                const payload = frame.data.socialcharts[0] || {};

                // Reassigning the chart owner (created_by) is owner/admin only.
                // Strip from the main payload so non-admins cannot set it; apply
                // separately via internal context to bypass the x_by guard.
                let reassignTo = null;
                if (
                    isAdmin &&
                    payload.created_by &&
                    String(payload.created_by) !== String(existing.get('created_by'))
                ) {
                    reassignTo = String(payload.created_by);
                }
                delete payload.created_by;

                // @ts-ignore
                const result = await models.SocialChart.edit(payload, frame.options);

                if (reassignTo) {
                    // @ts-ignore
                    await models.SocialChart.edit(
                        {created_by: reassignTo},
                        {id: frame.options.id, context: {internal: true}}
                    );
                    result.set('created_by', reassignTo);
                }

                return result;
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
            const existing = await models.SocialChart.findOne({ id: frame.options.id }, frame.options);
            if (!existing) {
                throw new errors.NotFoundError({
                    message: tpl(messages.notFound)
                });
            }

            enforceWriteAccessForEntry(existing, userId, isAdmin);

            // @ts-ignore
            return models.SocialChart.destroy({ ...frame.options, require: true });
        }
    }
};

module.exports = controller;
