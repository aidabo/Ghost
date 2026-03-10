// @ts-ignore
const tpl = require('@tryghost/tpl');
const errors = require('@tryghost/errors');
const ObjectId = require('bson-objectid').default;
const models = require('../../models');

const ADMIN_ROLES = new Set(['Owner', 'Administrator', 'Admin']);

const messages = {
    userRequired: 'No login user authentication.',
    noPermission: 'You are not allowed to access this SMS log.',
    groupNotFound: 'Group not found.'
};

const getCurrentUserId = frame => frame.options?.context?.user || null;
const getCurrentIntegrationId = frame => frame.options?.context?.integration || null;
// @ts-ignore
const LOGS_TABLE = models.SocialAiSmsLog?.prototype?.tableName || 'social_ai_sms_logs';

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

const formatLog = (row) => ({
    id: row.id,
    user_id: row.user_id,
    group_id: row.group_id,
    phone_hash: row.phone_hash,
    phone_last4: row.phone_last4,
    message: row.message,
    message_category: row.message_category,
    provider: row.provider,
    message_id: row.message_id,
    status: row.status,
    error: row.error,
    region: row.region,
    sender_id: row.sender_id,
    sms_type: row.sms_type,
    created_at: row.created_at,
    updated_at: row.updated_at
});

/** @type {import('@tryghost/api-framework').Controller} */
const controller = {
    docName: 'socialaismslogs',

    browse: {
        headers: {cacheInvalidate: false},
        options: ['group_id', 'user_id', 'limit'],
        permissions: false,
        async query(frame) {
            const knex = models.Base.knex;
            const targetUserId = await resolveTargetUserId(frame);
            const groupId = frame.options?.group_id || null;
            const limit = Math.min(Number.parseInt(frame.options?.limit, 10) || 100, 500);

            await assertGroupAccess({
                frame,
                groupId,
                targetUserId,
                permission: 'read'
            });

            const query = knex(LOGS_TABLE).where({user_id: targetUserId});
            if (groupId) {
                query.andWhere('group_id', groupId);
            }

            const rows = await query.orderBy('created_at', 'desc').limit(limit);
            return {
                data: rows.map(formatLog),
                meta: {count: rows.length}
            };
        }
    },

    add: {
        statusCode: 201,
        headers: {cacheInvalidate: false},
        options: ['group_id', 'user_id'],
        data: [
            'user_id',
            'group_id',
            'phone_hash',
            'phone_last4',
            'message',
            'message_category',
            'provider',
            'message_id',
            'status',
            'error',
            'region',
            'sender_id',
            'sms_type'
        ],
        permissions: false,
        async query(frame) {
            const knex = models.Base.knex;
            const targetUserId = await resolveTargetUserId(frame);
            const payload = frame.data.socialaismslogs?.[0] || {};
            const groupId = payload.group_id || frame.options?.group_id || null;

            await assertGroupAccess({
                frame,
                groupId,
                targetUserId,
                permission: 'write'
            });

            const id = ObjectId().toHexString();
            const nowSql = new Date().toISOString().slice(0, 19).replace('T', ' ');

            await knex(LOGS_TABLE).insert({
                id,
                user_id: targetUserId,
                group_id: groupId,
                phone_hash: payload.phone_hash,
                phone_last4: payload.phone_last4 || null,
                message: payload.message || null,
                message_category: payload.message_category || null,
                provider: payload.provider,
                message_id: payload.message_id || null,
                status: payload.status,
                error: payload.error || null,
                region: payload.region || null,
                sender_id: payload.sender_id || null,
                sms_type: payload.sms_type || null,
                created_at: nowSql,
                updated_at: nowSql
            });

            const created = await knex(LOGS_TABLE).where({id}).first();
            return formatLog(created);
        }
    }
};

module.exports = controller;
