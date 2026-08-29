// @ts-ignore
const tpl = require('@tryghost/tpl');
const errors = require('@tryghost/errors');
const ObjectId = require('bson-objectid').default;
const models = require('../../models');
const crypto = require('crypto');

const ADMIN_ROLES = new Set(['Owner', 'Administrator', 'Admin']);

const messages = {
    userRequired: 'No login user authentication.',
    notFound: 'AI device not found.',
    noPermission: 'You are not allowed to access this AI device.',
    groupNotFound: 'Group not found.'
};

const getCurrentUserId = frame => frame.options?.context?.user || null;
const getCurrentIntegrationId = frame => frame.options?.context?.integration || null;
// @ts-ignore
const DEVICES_TABLE = models.SocialAiDevice?.prototype?.tableName || 'social_ai_devices';

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

const formatDevice = (row) => ({
    id: row.id,
    user_id: row.user_id,
    group_id: row.group_id,
    device_type: row.device_type,
    device_key: row.device_key,
    push_subscription: row.push_subscription,
    locale: row.locale,
    timezone: row.timezone,
    enabled: Boolean(row.enabled),
    created_at: row.created_at,
    updated_at: row.updated_at
});

/** @type {import('@tryghost/api-framework').Controller} */
const controller = {
    docName: 'socialaidevices',

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

            const query = knex(DEVICES_TABLE).where({user_id: targetUserId});
            if (groupId) {
                query.andWhere('group_id', groupId);
            }

            const rows = await query.orderBy('updated_at', 'desc').limit(limit);
            return {
                data: rows.map(formatDevice),
                meta: {count: rows.length}
            };
        }
    },

    add: {
        statusCode: 201,
        headers: {cacheInvalidate: false},
        options: ['group_id', 'user_id'],
        data: ['user_id', 'group_id', 'device_type', 'device_key', 'push_subscription', 'locale', 'timezone', 'enabled'],
        permissions: false,
        async query(frame) {
            const knex = models.Base.knex;
            const targetUserId = await resolveTargetUserId(frame);
            const payload = frame.data.socialaidevices?.[0] || {};
            const groupId = payload.group_id || frame.options?.group_id || null;
            const deviceType = String(payload.device_type || '').trim().toLowerCase();
            const deviceKey = String(payload.device_key || '').trim();
            const deviceKeyHash = crypto.createHash('sha256').update(deviceKey).digest('hex');
            const locale = payload.locale || null;
            const timezone = payload.timezone || null;
            const pushSubscription = payload.push_subscription || null;
            const enabled = payload.enabled == null ? true : Boolean(payload.enabled);

            await assertGroupAccess({
                frame,
                groupId,
                targetUserId,
                permission: 'write'
            });

            if (!deviceType || !deviceKey) {
                throw new errors.ValidationError({message: 'device_type and device_key are required.'});
            }

            const existing = await knex(DEVICES_TABLE)
                .where({user_id: targetUserId, device_key_hash: deviceKeyHash})
                .first();

            const nowSql = new Date().toISOString().slice(0, 19).replace('T', ' ');
            if (existing) {
                await knex(DEVICES_TABLE)
                    .where({id: existing.id})
                    .update({
                        group_id: groupId,
                        device_type: deviceType,
                        locale,
                        timezone,
                        push_subscription: pushSubscription,
                        enabled,
                        updated_at: nowSql
                    });
                const updated = await knex(DEVICES_TABLE).where({id: existing.id}).first();
                return formatDevice(updated);
            }

            const id = ObjectId().toHexString();
            await knex(DEVICES_TABLE).insert({
                id,
                user_id: targetUserId,
                group_id: groupId,
                device_type: deviceType,
                device_key: deviceKey,
                device_key_hash: deviceKeyHash,
                locale,
                timezone,
                push_subscription: pushSubscription,
                enabled,
                created_at: nowSql,
                updated_at: nowSql
            });
            const created = await knex(DEVICES_TABLE).where({id}).first();
            return formatDevice(created);
        }
    },

    edit: {
        headers: {cacheInvalidate: false},
        options: ['group_id', 'user_id'],
        data: ['id', 'user_id', 'group_id', 'enabled', 'locale', 'timezone', 'push_subscription'],
        permissions: false,
        async query(frame) {
            const knex = models.Base.knex;
            const targetUserId = await resolveTargetUserId(frame);
            const payload = frame.data.socialaidevices?.[0] || {};
            const deviceId = String(payload.id || '').trim();
            const groupId = payload.group_id || frame.options?.group_id || null;

            if (!deviceId) {
                throw new errors.ValidationError({message: 'id is required.'});
            }

            await assertGroupAccess({
                frame,
                groupId,
                targetUserId,
                permission: 'write'
            });

            const existing = await knex(DEVICES_TABLE)
                .where({id: deviceId})
                .first();
            if (!existing) {
                throw new errors.NotFoundError({message: tpl(messages.notFound)});
            }

            if (existing.user_id !== targetUserId) {
                const currentUserId = getCurrentUserId(frame);
                const currentIntegrationId = getCurrentIntegrationId(frame);
                const isAllowed = Boolean(currentIntegrationId) || await isAdminUser(currentUserId);
                if (!isAllowed) {
                    throw new errors.NoPermissionError({message: tpl(messages.noPermission)});
                }
            }

            const nowSql = new Date().toISOString().slice(0, 19).replace('T', ' ');
            await knex(DEVICES_TABLE)
                .where({id: deviceId})
                .update({
                    locale: payload.locale || existing.locale,
                    timezone: payload.timezone || existing.timezone,
                    push_subscription: payload.push_subscription || existing.push_subscription,
                    enabled: payload.enabled == null ? existing.enabled : Boolean(payload.enabled),
                    updated_at: nowSql
                });
            const updated = await knex(DEVICES_TABLE).where({id: deviceId}).first();
            return formatDevice(updated);
        }
    },

    destroy: {
        statusCode: 204,
        headers: {cacheInvalidate: false},
        options: ['group_id', 'user_id'],
        data: ['id'],
        permissions: false,
        async query(frame) {
            const knex = models.Base.knex;
            const targetUserId = await resolveTargetUserId(frame);
            const deviceId = String(frame.data?.id || '').trim();
            const groupId = frame.options?.group_id || null;

            if (!deviceId) {
                throw new errors.ValidationError({message: 'id is required.'});
            }

            await assertGroupAccess({
                frame,
                groupId,
                targetUserId,
                permission: 'write'
            });

            const existing = await knex(DEVICES_TABLE)
                .where({id: deviceId})
                .first();
            if (!existing) {
                throw new errors.NotFoundError({message: tpl(messages.notFound)});
            }

            if (existing.user_id !== targetUserId) {
                const currentUserId = getCurrentUserId(frame);
                const currentIntegrationId = getCurrentIntegrationId(frame);
                const isAllowed = Boolean(currentIntegrationId) || await isAdminUser(currentUserId);
                if (!isAllowed) {
                    throw new errors.NoPermissionError({message: tpl(messages.noPermission)});
                }
            }

            await knex(DEVICES_TABLE).where({id: deviceId}).del();
            return null;
        }
    }
};

module.exports = controller;
