// @ts-ignore
const tpl = require('@tryghost/tpl');
const errors = require('@tryghost/errors');
const models = require('../../models');
const staffScope = require('./utils/staff-scope');
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

const getCurrentUserId = (frame) => frame.options?.context?.user || null;

// The requested group is always AND-ed onto the query: readability is decided
// from this group, so a caller filter naming another group must not replace it.
const appendGroupFilter = (frame) => {
    const groupId = frame.options?.group_id;
    if (!groupId) {
        return;
    }

    frame.options.filter = staffScope.andFilter(frame.options.filter, `group_id:${staffScope.nqlId(groupId, 'group_id')}`);
    delete frame.options.group_id;
};

// Always AND-ed (a caller filter naming created_by must not replace it).
const appendCreatedByFilter = (frame, userId) => {
    if (!userId) {
        return;
    }

    frame.options.filter = staffScope.andFilter(frame.options.filter, `created_by:${userId}`);
};

// Creating in, or moving a row into, a group requires write access to that
// group: system admin, Super Editor for a newsroom (public) group, else an
// active membership (SocialGroup.canAccessGroup 'write').
const assertCanWriteIntoGroup = async (groupId, userId, scope) => {
    if (!groupId || scope.isSystemAdmin || staffScope.isNewsroomGroup(scope, groupId)) {
        return;
    }
    // @ts-ignore
    const group = await models.SocialGroup.findOne({ id: groupId });
    if (!group) {
        throw new errors.NotFoundError({ message: tpl(messages.notFound) });
    }
    // @ts-ignore
    const allowed = await models.SocialGroup.canAccessGroup(group, userId, 'write');
    if (!allowed) {
        throw new errors.NoPermissionError({ message: tpl(messages.noPermission) });
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

const enforceReadAccessForEntry = async (entry, userId, scope) => {
    if (staffScope.bypassesRowCheck(scope, entry)) {
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

const enforceWriteAccessForEntry = async (entry, userId, scope) => {
    // System admin writes anything; Super Editor only newsroom rows (no group
    // or a public group). Other group rows go through the normal path below.
    if (staffScope.bypassesRowCheck(scope, entry)) {
        return;
    }

    // Author, group owner/admin, or system admin may write. A regular group
    // member (who can view group content) cannot edit content they did not
    // author. Single source of truth: SocialGroupMember.canEditGroupContent.
    // @ts-ignore
    const allowed = await models.SocialGroupMember.canEditGroupContent({
        groupId: entry.get('group_id'),
        authorId: entry.get('created_by'),
        userId
    });
    if (!allowed) {
        throw new errors.NoPermissionError({
            message: tpl(messages.noPermission)
        });
    }
};

// Stamp a computed `can_edit` on each returned model so the frontend shows/hides
// edit controls without re-implementing the rule (backend is the single source
// of truth). Mirrors the write gate: system admin / Super Editor-on-newsroom
// bypass, else the shared canEditGroupContent predicate (author / group owner-admin).
const attachCanEdit = async (entryOrCollection, userId, scope) => {
    let list = [];
    const src = (entryOrCollection && entryOrCollection.data !== undefined) ? entryOrCollection.data : entryOrCollection;
    if (Array.isArray(src)) {
        list = src;
    } else if (src && Array.isArray(src.models)) {
        list = src.models;
    } else if (src && typeof src.get === 'function') {
        list = [src];
    }
    for (const m of list) {
        if (!m || typeof m.get !== 'function') {
            continue;
        }
        const canEdit = staffScope.bypassesRowCheck(scope, m) || await models.SocialGroupMember.canEditGroupContent({
            groupId: m.get('group_id'),
            authorId: m.get('created_by'),
            userId
        });
        m.set('can_edit', canEdit);
    }
    return entryOrCollection;
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
            const scope = await staffScope.getStaffScope(userId);
            const requestedGroupId = frame.options?.group_id || null;

            appendGroupFilter(frame);

            if (!scope.isSystemAdmin) {
                if (requestedGroupId) {
                    // Super Editor reads a public group without membership.
                    const groupReadable = staffScope.isNewsroomGroup(scope, requestedGroupId) || await canReadGroup(requestedGroupId, userId);
                    if (!groupReadable) {
                        appendCreatedByFilter(frame, userId);
                    }
                } else if (scope.isNoGroupReader) {
                    // Super Editor: every newsroom (no-group / public-group)
                    // row + its own rows. Always AND-ed, so a caller filter
                    // cannot widen it.
                    const clause = staffScope.newsroomOrOwnFilter(scope, userId);
                    frame.options.filter = staffScope.andFilter(frame.options.filter, clause);
                } else {
                    appendCreatedByFilter(frame, userId);
                }
            }

            // @ts-ignore
            const result = await models.SocialChart.findPage({ ...frame.options, withRelated: ALLOWED_INCLUDES });
            await attachCanEdit(result, userId, scope);
            return result;
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
            const scope = await staffScope.getStaffScope(userId);

            appendGroupFilter(frame);
            // @ts-ignore
            const entry = await models.SocialChart.findOne(frame.data, { ...frame.options, withRelated: ALLOWED_INCLUDES });
            if (!entry) {
                return Promise.reject(new errors.NotFoundError({
                    message: tpl(messages.notFound)
                }));
            }

            await enforceReadAccessForEntry(entry, userId, scope);
            await attachCanEdit(entry, userId, scope);
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
                const userId = getCurrentUserId(frame);
                const groupId = frame.data.socialcharts[0]?.group_id || null;
                // Creating inside a group requires being a member of that group
                // (group access). System admins bypass; Super Editor only for a
                // public group. Personal (no-group) creation is gated only by
                // the staff role permission above.
                if (groupId && userId) {
                    await assertCanWriteIntoGroup(groupId, userId, await staffScope.getStaffScope(userId));
                }
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
                const scope = await staffScope.getStaffScope(userId);

                // @ts-ignore
                const existing = await models.SocialChart.findOne({ id: frame.options.id }, frame.options);
                if (!existing) {
                    throw new errors.NotFoundError({
                        message: tpl(messages.notFound)
                    });
                }

                await enforceWriteAccessForEntry(existing, userId, scope);

                const payload = frame.data.socialcharts[0] || {};

                // Moving the row into another group is gated like creating in it.
                if (
                    payload.group_id !== undefined &&
                    String(payload.group_id || '') !== String(existing.get('group_id') || '')
                ) {
                    await assertCanWriteIntoGroup(payload.group_id || null, userId, scope);
                }

                // Reassigning the chart owner (created_by) is owner/admin only
                // (Super Editor: newsroom rows only, same as its write bypass).
                // Strip from the main payload so non-admins cannot set it; apply
                // separately via internal context to bypass the x_by guard.
                let reassignTo = null;
                if (
                    staffScope.bypassesRowCheck(scope, existing) &&
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
            const scope = await staffScope.getStaffScope(userId);

            // @ts-ignore
            const existing = await models.SocialChart.findOne({ id: frame.options.id }, frame.options);
            if (!existing) {
                throw new errors.NotFoundError({
                    message: tpl(messages.notFound)
                });
            }

            await enforceWriteAccessForEntry(existing, userId, scope);

            // @ts-ignore
            return models.SocialChart.destroy({ ...frame.options, require: true });
        }
    }
};

module.exports = controller;
