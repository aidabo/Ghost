// @ts-ignore
const tpl = require('@tryghost/tpl');
const errors = require('@tryghost/errors');
const ObjectId = require('bson-objectid').default;
const models = require('../../models');

const ADMIN_ROLES = new Set(['Owner', 'Administrator', 'Admin']);

const messages = {
    userRequired: 'No login user authentication.',
    notFound: 'AI reminder not found.',
    noPermission: 'You are not allowed to access this AI reminder.',
    groupNotFound: 'Group not found.'
};

const getCurrentUserId = frame => frame.options?.context?.user || null;
const getCurrentIntegrationId = frame => frame.options?.context?.integration || null;
// @ts-ignore
const REMINDERS_TABLE = models.SocialAiReminder?.prototype?.tableName || 'social_ai_reminders';

const isAdminUser = async (userId) => {
    if (!userId) {
        return false;
    }
    // @ts-ignore
    const user = await models.User.findOne({id: userId}, {withRelated: ['roles']});
    if (!user) {
        return false;
    }
    const roles = user.related('roles')?.models || [];
    return roles.some(role => ADMIN_ROLES.has(role.get('name')));
};

const parseLimit = (value) => {
    const parsed = Number.parseInt(value, 10);
    if (Number.isNaN(parsed) || parsed <= 0) {
        return 100;
    }
    return Math.min(parsed, 500);
};

const resolveTargetUserId = async (frame) => {
    const currentUserId = getCurrentUserId(frame);
    const currentIntegrationId = getCurrentIntegrationId(frame);
    const requestedUserId = frame.options?.user_id || frame.data?.user_id || null;

    if (!currentUserId && !currentIntegrationId) {
        throw new errors.NoPermissionError({
            message: tpl(messages.userRequired)
        });
    }

    if (currentIntegrationId) {
        if (!requestedUserId) {
            throw new errors.ValidationError({message: '`user_id` is required.'});
        }
        return requestedUserId;
    }

    if (!requestedUserId || requestedUserId === currentUserId) {
        return currentUserId;
    }

    const isAdmin = await isAdminUser(currentUserId);
    if (isAdmin) {
        return requestedUserId;
    }

    throw new errors.NoPermissionError({
        message: tpl(messages.noPermission)
    });
};

const assertGroupAccess = async ({frame, groupId, targetUserId, permission}) => {
    if (!groupId) {
        return;
    }

    const currentUserId = getCurrentUserId(frame);
    const isAdmin = currentUserId ? await isAdminUser(currentUserId) : false;
    if (isAdmin) {
        return;
    }

    // @ts-ignore
    const group = await models.SocialGroup.findOne({id: groupId});
    if (!group) {
        throw new errors.NotFoundError({
            message: tpl(messages.groupNotFound)
        });
    }

    // @ts-ignore
    const allowed = await models.SocialGroup.canAccessGroup(group, targetUserId, permission);
    if (!allowed) {
        throw new errors.NoPermissionError({
            message: tpl(messages.noPermission)
        });
    }
};

const parseStatus = (value, fallback = 'active') => {
    const normalized = String(value || fallback).trim().toLowerCase();
    if (normalized === 'all') return 'all';
    if (normalized === 'cancelled') return 'cancelled';
    return 'active';
};

const normalizeSourceType = (value) => {
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized) {
        return null;
    }
    if (normalized === 'message' || normalized === 'post') {
        return normalized;
    }
    throw new errors.ValidationError({
        message: 'source_type must be message or post.'
    });
};

const formatReminder = (row) => ({
    id: row.id,
    user_id: row.user_id,
    group_id: row.group_id,
    reminder_message_id: row.reminder_message_id || null,
    reminder_batch_id: row.reminder_batch_id || null,
    source_type: row.source_type || null,
    source_id: row.source_id || null,
    source_message_id: row.source_message_id || null,
    created_by_user_message_id: row.created_by_user_message_id || null,
    title: row.title,
    note: row.note,
    remind_at: row.remind_at,
    timezone: row.timezone,
    status: row.status,
    recurrence_type: row.recurrence_type || 'none',
    recurrence_interval: Number(row.recurrence_interval || 1),
    cancelled_at: row.cancelled_at,
    created_at: row.created_at,
    updated_at: row.updated_at
});

const toSqlDateTime = (value) => {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) {
        throw new errors.ValidationError({
            message: 'Invalid remind_at. Use ISO datetime format.'
        });
    }
    return d.toISOString().slice(0, 19).replace('T', ' ');
};

/** @type {import('@tryghost/api-framework').Controller} */
const controller = {
    docName: 'socialaireminders',

    browse: {
        headers: {cacheInvalidate: false},
        options: ['group_id', 'user_id', 'status', 'limit'],
        permissions: false,
        async query(frame) {
            const knex = models.Base.knex;
            const targetUserId = await resolveTargetUserId(frame);
            const groupId = frame.options?.group_id || null;
            const status = parseStatus(frame.options?.status, 'active');
            const limit = parseLimit(frame.options?.limit);

            await assertGroupAccess({
                frame,
                groupId,
                targetUserId,
                permission: 'read'
            });

            const query = knex(REMINDERS_TABLE)
                .where({user_id: targetUserId});

            if (groupId) {
                query.andWhere('group_id', groupId);
            }
            if (status !== 'all') {
                query.andWhere('status', status);
            }

            const rows = await query
                .orderBy('remind_at', 'asc')
                .limit(limit);

            return {
                data: rows.map(formatReminder),
                meta: {
                    count: rows.length
                }
            };
        }
    },

    read: {
        headers: {cacheInvalidate: false},
        options: ['group_id', 'user_id'],
        data: ['id'],
        permissions: false,
        async query(frame) {
            const knex = models.Base.knex;
            const targetUserId = await resolveTargetUserId(frame);
            const reminderId = frame.data.id;
            const groupId = frame.options?.group_id || null;

            const reminder = await knex(REMINDERS_TABLE)
                .where({id: reminderId})
                .first();

            if (!reminder) {
                throw new errors.NotFoundError({message: tpl(messages.notFound)});
            }
            if (reminder.user_id !== targetUserId) {
                const currentUserId = getCurrentUserId(frame);
                const isAllowed = Boolean(getCurrentIntegrationId(frame)) || await isAdminUser(currentUserId);
                if (!isAllowed) {
                    throw new errors.NoPermissionError({message: tpl(messages.noPermission)});
                }
            }
            if (groupId && reminder.group_id !== groupId) {
                throw new errors.NotFoundError({message: tpl(messages.notFound)});
            }

            await assertGroupAccess({
                frame,
                groupId: reminder.group_id || groupId,
                targetUserId,
                permission: 'read'
            });

            return formatReminder(reminder);
        }
    },

    add: {
        statusCode: 201,
        headers: {cacheInvalidate: false},
        options: ['include', 'transacting'],
        data: [
            'user_id',
            'group_id',
            'reminder_message_id',
            'reminder_batch_id',
            'source_type',
            'source_id',
            'source_message_id',
            'created_by_user_message_id',
            'title',
            'note',
            'remind_at',
            'timezone',
            'status',
            'recurrence_type',
            'recurrence_interval'
        ],
        permissions: false,
        async query(frame) {
            const knex = models.Base.knex;
            const payload = frame.data.socialaireminders?.[0] || {};
            const targetUserId = await resolveTargetUserId({
                ...frame,
                data: {
                    ...frame.data,
                    user_id: payload.user_id
                }
            });
            const groupId = payload.group_id || null;

            await assertGroupAccess({
                frame,
                groupId,
                targetUserId,
                permission: 'write'
            });

            const title = String(payload.title || '').trim();
            if (!title) {
                throw new errors.ValidationError({message: 'title is required.'});
            }
            const remindAtSql = toSqlDateTime(payload.remind_at);
            const nowSql = new Date().toISOString().slice(0, 19).replace('T', ' ');
            const status = parseStatus(payload.status, 'active');
            const recurrenceType = String(payload.recurrence_type || 'none').trim().toLowerCase();
            const recurrenceInterval = Number(payload.recurrence_interval || 1);
            const reminderId = ObjectId().toHexString();
            const sourceType = normalizeSourceType(payload.source_type);
            const sourceId = String(payload.source_id || '').trim() || null;
            const sourceMessageId = String(payload.source_message_id || '').trim() || null;
            const resolvedSourceType = sourceType || (sourceMessageId ? 'message' : null);
            const resolvedSourceId = sourceId || sourceMessageId;
            if (resolvedSourceType && !resolvedSourceId && !sourceMessageId) {
                throw new errors.ValidationError({
                    message: 'source_id is required when source_type is provided.'
                });
            }

            await knex(REMINDERS_TABLE).insert({
                id: reminderId,
                user_id: targetUserId,
                group_id: groupId,
                reminder_message_id: payload.reminder_message_id || null,
                reminder_batch_id: payload.reminder_batch_id || null,
                source_type: resolvedSourceType,
                source_id: resolvedSourceId,
                source_message_id: resolvedSourceType === 'message'
                    ? (sourceMessageId || sourceId)
                    : null,
                created_by_user_message_id: payload.created_by_user_message_id || null,
                title,
                note: String(payload.note || '').trim() || null,
                remind_at: remindAtSql,
                timezone: String(payload.timezone || '').trim() || null,
                status: status === 'all' ? 'active' : status,
                recurrence_type: recurrenceType || 'none',
                recurrence_interval: Number.isFinite(recurrenceInterval) && recurrenceInterval > 0
                    ? Math.floor(recurrenceInterval)
                    : 1,
                cancelled_at: status === 'cancelled' ? nowSql : null,
                created_at: nowSql,
                updated_at: nowSql
            });

            const created = await knex(REMINDERS_TABLE).where({id: reminderId}).first();
            return formatReminder(created);
        }
    },

    edit: {
        headers: {cacheInvalidate: false},
        options: ['include', 'transacting'],
        data: [
            'id',
            'user_id',
            'group_id',
            'reminder_message_id',
            'reminder_batch_id',
            'source_type',
            'source_id',
            'source_message_id',
            'created_by_user_message_id',
            'title',
            'note',
            'remind_at',
            'timezone',
            'status',
            'recurrence_type',
            'recurrence_interval'
        ],
        permissions: false,
        async query(frame) {
            const knex = models.Base.knex;
            const payload = frame.data.socialaireminders?.[0] || {};
            const reminderId = String(payload.id || frame.data?.id || '').trim();
            if (!reminderId) {
                throw new errors.ValidationError({message: 'id is required.'});
            }

            const existing = await knex(REMINDERS_TABLE)
                .where({id: reminderId})
                .first();
            if (!existing) {
                throw new errors.NotFoundError({message: tpl(messages.notFound)});
            }

            const targetUserId = await resolveTargetUserId({
                ...frame,
                data: {
                    ...frame.data,
                    user_id: payload.user_id || existing.user_id
                }
            });
            if (existing.user_id !== targetUserId) {
                const currentUserId = getCurrentUserId(frame);
                const isAllowed = Boolean(getCurrentIntegrationId(frame)) || await isAdminUser(currentUserId);
                if (!isAllowed) {
                    throw new errors.NoPermissionError({message: tpl(messages.noPermission)});
                }
            }

            const nextGroupId = Object.prototype.hasOwnProperty.call(payload, 'group_id')
                ? (payload.group_id || null)
                : existing.group_id;

            await assertGroupAccess({
                frame,
                groupId: nextGroupId,
                targetUserId,
                permission: 'write'
            });

            const updates = {
                updated_at: new Date().toISOString().slice(0, 19).replace('T', ' ')
            };
            if (Object.prototype.hasOwnProperty.call(payload, 'title')) {
                const title = String(payload.title || '').trim();
                if (!title) {
                    throw new errors.ValidationError({message: 'title is required.'});
                }
                updates.title = title;
            }
            if (Object.prototype.hasOwnProperty.call(payload, 'note')) {
                updates.note = String(payload.note || '').trim() || null;
            }
            if (Object.prototype.hasOwnProperty.call(payload, 'remind_at')) {
                updates.remind_at = toSqlDateTime(payload.remind_at);
            }
            if (Object.prototype.hasOwnProperty.call(payload, 'timezone')) {
                updates.timezone = String(payload.timezone || '').trim() || null;
            }
            if (Object.prototype.hasOwnProperty.call(payload, 'group_id')) {
                updates.group_id = nextGroupId;
            }
            if (Object.prototype.hasOwnProperty.call(payload, 'reminder_message_id')) {
                updates.reminder_message_id = payload.reminder_message_id || null;
            }
            if (Object.prototype.hasOwnProperty.call(payload, 'reminder_batch_id')) {
                updates.reminder_batch_id = payload.reminder_batch_id || null;
            }
            if (Object.prototype.hasOwnProperty.call(payload, 'source_message_id')) {
                updates.source_message_id = payload.source_message_id || null;
            }
            if (Object.prototype.hasOwnProperty.call(payload, 'source_type')) {
                updates.source_type = normalizeSourceType(payload.source_type);
            }
            if (Object.prototype.hasOwnProperty.call(payload, 'source_id')) {
                updates.source_id = String(payload.source_id || '').trim() || null;
            }
            if (Object.prototype.hasOwnProperty.call(payload, 'source_type') ||
                Object.prototype.hasOwnProperty.call(payload, 'source_id') ||
                Object.prototype.hasOwnProperty.call(payload, 'source_message_id')) {
                const nextSourceType = Object.prototype.hasOwnProperty.call(payload, 'source_type')
                    ? updates.source_type
                    : existing.source_type || null;
                const nextSourceId = Object.prototype.hasOwnProperty.call(payload, 'source_id')
                    ? updates.source_id
                    : existing.source_id || null;
                if (nextSourceType === 'message') {
                    updates.source_type = nextSourceType;
                    updates.source_id = nextSourceId;
                    updates.source_message_id = Object.prototype.hasOwnProperty.call(payload, 'source_message_id')
                        ? updates.source_message_id
                        : (nextSourceId || null);
                } else if (nextSourceType === 'post') {
                    updates.source_type = nextSourceType;
                    updates.source_message_id = null;
                }
            }
            if (Object.prototype.hasOwnProperty.call(payload, 'created_by_user_message_id')) {
                updates.created_by_user_message_id = payload.created_by_user_message_id || null;
            }
            if (Object.prototype.hasOwnProperty.call(payload, 'status')) {
                const nextStatus = parseStatus(payload.status, existing.status);
                updates.status = nextStatus === 'all' ? existing.status : nextStatus;
                updates.cancelled_at = updates.status === 'cancelled'
                    ? updates.updated_at
                    : null;
            }
            if (Object.prototype.hasOwnProperty.call(payload, 'recurrence_type')) {
                updates.recurrence_type = String(payload.recurrence_type || 'none').trim().toLowerCase() || 'none';
            }
            if (Object.prototype.hasOwnProperty.call(payload, 'recurrence_interval')) {
                const raw = Number(payload.recurrence_interval || 1);
                updates.recurrence_interval = Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 1;
            }

            await knex(REMINDERS_TABLE)
                .where({id: reminderId})
                .update(updates);

            const updated = await knex(REMINDERS_TABLE).where({id: reminderId}).first();
            return formatReminder(updated);
        }
    }
};

module.exports = controller;
