// @ts-ignore
const tpl = require('@tryghost/tpl');
const errors = require('@tryghost/errors');
const ObjectId = require('bson-objectid').default;
const models = require('../../models');

const ADMIN_ROLES = new Set(['Owner', 'Administrator', 'Admin']);

const messages = {
    userRequired: 'No login user authentication.',
    notFound: 'AI reminder event not found.',
    noPermission: 'You are not allowed to access this AI reminder event.',
    groupNotFound: 'Group not found.'
};

const getCurrentUserId = frame => frame.options?.context?.user || null;
const getCurrentIntegrationId = frame => frame.options?.context?.integration || null;
// @ts-ignore
const EVENTS_TABLE = models.SocialAiReminderEvent?.prototype?.tableName || 'social_ai_reminder_events';
// @ts-ignore
const REMINDERS_TABLE = models.SocialAiReminder?.prototype?.tableName || 'social_ai_reminders';

const isAdminUser = async (userId) => {
    if (!userId) return false;
    // @ts-ignore
    const user = await models.User.findOne({id: userId}, {withRelated: ['roles']});
    if (!user) return false;
    const roles = user.related('roles')?.models || [];
    return roles.some(role => ADMIN_ROLES.has(role.get('name')));
};

const resolveTargetUserId = async (frame) => {
    const currentUserId = getCurrentUserId(frame);
    const currentIntegrationId = getCurrentIntegrationId(frame);
    const requestedUserId = frame.options?.user_id || frame.data?.user_id || null;

    if (!currentUserId && !currentIntegrationId) {
        throw new errors.NoPermissionError({message: tpl(messages.userRequired)});
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
    if (isAdmin) return requestedUserId;
    throw new errors.NoPermissionError({message: tpl(messages.noPermission)});
};

const assertGroupAccess = async ({frame, groupId, targetUserId, permission}) => {
    if (!groupId) return;
    const currentUserId = getCurrentUserId(frame);
    const isAdmin = currentUserId ? await isAdminUser(currentUserId) : false;
    if (isAdmin) return;
    // @ts-ignore
    const group = await models.SocialGroup.findOne({id: groupId});
    if (!group) {
        throw new errors.NotFoundError({message: tpl(messages.groupNotFound)});
    }
    // @ts-ignore
    const allowed = await models.SocialGroup.canAccessGroup(group, targetUserId, permission);
    if (!allowed) {
        throw new errors.NoPermissionError({message: tpl(messages.noPermission)});
    }
};

const formatEvent = (row) => ({
    id: row.id,
    reminder_id: row.reminder_id,
    user_id: row.user_id,
    group_id: row.group_id,
    scheduled_at: row.scheduled_at,
    prompted_at: row.prompted_at,
    answered_at: row.answered_at,
    answer_type: row.answer_type,
    answer_text: row.answer_text,
    channel: row.channel,
    created_at: row.created_at,
    updated_at: row.updated_at
});

/** @type {import('@tryghost/api-framework').Controller} */
const controller = {
    docName: 'socialaireminderevents',

    browse: {
        headers: {cacheInvalidate: false},
        options: ['group_id', 'user_id', 'reminder_id', 'limit'],
        permissions: false,
        async query(frame) {
            const knex = models.Base.knex;
            const targetUserId = await resolveTargetUserId(frame);
            const groupId = frame.options?.group_id || null;
            const reminderId = frame.options?.reminder_id || null;
            const limit = Math.min(Math.max(Number(frame.options?.limit || 100), 1), 500);

            await assertGroupAccess({
                frame,
                groupId,
                targetUserId,
                permission: 'read'
            });

            const query = knex(EVENTS_TABLE).where({user_id: targetUserId});
            if (groupId) query.andWhere('group_id', groupId);
            if (reminderId) query.andWhere('reminder_id', reminderId);

            const rows = await query.orderBy('created_at', 'desc').limit(limit);
            return {data: rows.map(formatEvent), meta: {count: rows.length}};
        }
    },

    add: {
        statusCode: 201,
        headers: {cacheInvalidate: false},
        options: ['include', 'transacting'],
        data: [
            'reminder_id',
            'user_id',
            'group_id',
            'scheduled_at',
            'prompted_at',
            'answered_at',
            'answer_type',
            'answer_text',
            'channel'
        ],
        permissions: false,
        async query(frame) {
            const knex = models.Base.knex;
            const payload = frame.data.socialaireminderevents?.[0] || {};
            const reminderId = String(payload.reminder_id || '').trim();
            if (!reminderId) {
                throw new errors.ValidationError({message: 'reminder_id is required.'});
            }

            const reminder = await knex(REMINDERS_TABLE).where({id: reminderId}).first();
            if (!reminder) {
                throw new errors.NotFoundError({message: tpl(messages.notFound)});
            }

            const targetUserId = await resolveTargetUserId({
                ...frame,
                data: {
                    ...frame.data,
                    user_id: payload.user_id || reminder.user_id
                }
            });
            if (reminder.user_id !== targetUserId) {
                const currentUserId = getCurrentUserId(frame);
                const isAllowed = Boolean(getCurrentIntegrationId(frame)) || await isAdminUser(currentUserId);
                if (!isAllowed) {
                    throw new errors.NoPermissionError({message: tpl(messages.noPermission)});
                }
            }

            const groupId = Object.prototype.hasOwnProperty.call(payload, 'group_id')
                ? (payload.group_id || null)
                : reminder.group_id;

            await assertGroupAccess({
                frame,
                groupId,
                targetUserId,
                permission: 'write'
            });

            const nowSql = new Date().toISOString().slice(0, 19).replace('T', ' ');
            const eventId = ObjectId().toHexString();
            await knex(EVENTS_TABLE).insert({
                id: eventId,
                reminder_id: reminderId,
                user_id: targetUserId,
                group_id: groupId,
                scheduled_at: payload.scheduled_at || null,
                prompted_at: payload.prompted_at || null,
                answered_at: payload.answered_at || nowSql,
                answer_type: String(payload.answer_type || 'acknowledged').trim() || 'acknowledged',
                answer_text: String(payload.answer_text || '').trim() || null,
                channel: String(payload.channel || '').trim() || null,
                created_at: nowSql,
                updated_at: nowSql
            });

            const created = await knex(EVENTS_TABLE).where({id: eventId}).first();
            return formatEvent(created);
        }
    }
};

module.exports = controller;

