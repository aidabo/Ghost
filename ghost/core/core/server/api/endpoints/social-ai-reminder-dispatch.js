// @ts-ignore
const tpl = require('@tryghost/tpl');
const errors = require('@tryghost/errors');
const models = require('../../models');

const ADMIN_ROLES = new Set(['Owner', 'Administrator', 'Admin']);

const messages = {
    userRequired: 'No login user authentication.'
};

const getCurrentUserId = frame => frame.options?.context?.user || null;
const getCurrentIntegrationId = frame => frame.options?.context?.integration || null;
// @ts-ignore
const REMINDERS_TABLE = models.SocialAiReminder?.prototype?.tableName || 'social_ai_reminders';
// @ts-ignore
const EVENTS_TABLE = models.SocialAiReminderEvent?.prototype?.tableName || 'social_ai_reminder_events';

const isAdminUser = async (userId) => {
    if (!userId) return false;
    // @ts-ignore
    const user = await models.User.findOne({id: userId}, {withRelated: ['roles']});
    if (!user) return false;
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

const formatReminder = (row) => ({
    id: row.id,
    user_id: row.user_id,
    group_id: row.group_id,
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

/** @type {import('@tryghost/api-framework').Controller} */
const controller = {
    docName: 'socialaireminderdispatch',

    browse: {
        headers: {cacheInvalidate: false},
        options: ['limit', 'now'],
        permissions: false,
        async query(frame) {
            const currentUserId = getCurrentUserId(frame);
            const currentIntegrationId = getCurrentIntegrationId(frame);
            if (!currentIntegrationId) {
                const isAdmin = await isAdminUser(currentUserId);
                if (!isAdmin) {
                    throw new errors.NoPermissionError({message: tpl(messages.userRequired)});
                }
            }

            const knex = models.Base.knex;
            const limit = parseLimit(frame.options?.limit);
            const nowRaw = frame.options?.now || null;
            const now = nowRaw ? new Date(nowRaw) : new Date();
            const nowSql = now.toISOString().slice(0, 19).replace('T', ' ');

            const rows = await knex({r: REMINDERS_TABLE})
                .leftJoin({e: EVENTS_TABLE}, function () {
                    this.on('e.reminder_id', '=', 'r.id')
                        .andOn('e.channel', '=', knex.raw('?', ['push']))
                        .andOn('e.prompted_at', '>=', knex.ref('r.remind_at'));
                })
                .where('r.status', 'active')
                .andWhere('r.remind_at', '<=', nowSql)
                .andWhereNull('r.cancelled_at')
                .andWhereNull('e.id')
                .orderBy('r.remind_at', 'asc')
                .limit(limit);

            return {
                data: rows.map(formatReminder),
                meta: {count: rows.length}
            };
        }
    }
};

module.exports = controller;
