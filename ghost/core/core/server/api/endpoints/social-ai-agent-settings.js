// @ts-ignore
const tpl = require('@tryghost/tpl');
const errors = require('@tryghost/errors');
const models = require('../../models');

const ADMIN_ROLES = new Set(['Owner', 'Administrator', 'Admin']);

const messages = {
    userRequired: 'No login user authentication.',
    notFound: 'Agent setting not found.',
    noPermission: 'You are not allowed to access this agent setting.'
};

const getCurrentUserId = frame => frame.options?.context?.user || null;
const getCurrentIntegrationId = frame => frame.options?.context?.integration || null;

const isAdminUser = async (userId) => {
    if (!userId) return false;
    // @ts-ignore
    const user = await models.User.findOne({ id: userId }, { withRelated: ['roles'] });
    if (!user) return false;
    const roles = user.related('roles')?.models || [];
    return roles.some(role => ADMIN_ROLES.has(role.get('name')));
};

const resolveTargetUserId = async (frame, fallbackUserId = null) => {
    const currentUserId = getCurrentUserId(frame);
    const currentIntegrationId = getCurrentIntegrationId(frame);
    const requestedUserId = frame.options?.user_id || frame.data?.user_id || fallbackUserId || null;

    if (!currentUserId && !currentIntegrationId) {
        throw new errors.NoPermissionError({ message: tpl(messages.userRequired) });
    }
    if (currentIntegrationId) {
        if (!requestedUserId) {
            throw new errors.ValidationError({ message: '`user_id` is required.' });
        }
        return requestedUserId;
    }
    if (!requestedUserId || requestedUserId === currentUserId) {
        return currentUserId;
    }
    const isAdmin = await isAdminUser(currentUserId);
    if (isAdmin) return requestedUserId;
    throw new errors.NoPermissionError({ message: tpl(messages.noPermission) });
};

const normalizePayload = (payload) => {
    const source = payload || {};
    const next = {...source};
    if (next.settings && typeof next.settings === 'object' && !next.settings_json) {
        next.settings_json = JSON.stringify(next.settings);
    }
    delete next.settings;
    return next;
};

const canAccessRecord = async (frame, ownerUserId) => {
    const currentIntegrationId = getCurrentIntegrationId(frame);
    if (currentIntegrationId) {
        return true;
    }
    const currentUserId = getCurrentUserId(frame);
    if (!currentUserId) {
        return false;
    }
    if (String(ownerUserId || '') === String(currentUserId || '')) {
        return true;
    }
    return await isAdminUser(currentUserId);
};

const extractUserIdFromFilter = (filterValue) => {
    const filter = String(filterValue || '').trim();
    if (!filter) {
        return null;
    }
    const matched = filter.match(/(?:^|\+)user_id:([^+]+)/);
    return matched?.[1] ? String(matched[1]).trim() : null;
};

/** @type {import('@tryghost/api-framework').Controller} */
const controller = {
    docName: 'socialaiagentsettings',

    browse: {
        headers: { cacheInvalidate: false },
        options: [
            'user_id',
            'include',
            'filter',
            'fields',
            'collection',
            'limit',
            'order',
            'page',
            'debug'
        ],
        permissions: false,
        async query(frame) {
            const requestedUserId =
                frame.options?.user_id ||
                extractUserIdFromFilter(frame.options?.filter) ||
                null;
            if (requestedUserId) {
                const targetUserId = await resolveTargetUserId(frame, requestedUserId);
                frame.options.filter = frame.options.filter
                    ? `${frame.options.filter}+user_id:${targetUserId}`
                    : `user_id:${targetUserId}`;
            } else {
                const currentIntegrationId = getCurrentIntegrationId(frame);
                const currentUserId = getCurrentUserId(frame);
                const isAdmin = await isAdminUser(currentUserId);
                if (!currentIntegrationId && !isAdmin) {
                    throw new errors.NoPermissionError({ message: tpl(messages.noPermission) });
                }
            }
            // @ts-ignore
            return models.SocialAiAgentSetting.findPage(frame.options);
        }
    },

    read: {
        headers: { cacheInvalidate: false },
        options: ['include', 'fields'],
        data: ['id'],
        permissions: false,
        async query(frame) {
            // @ts-ignore
            const entry = await models.SocialAiAgentSetting.findOne(frame.data, { ...frame.options, require: false });
            if (!entry) {
                throw new errors.NotFoundError({ message: tpl(messages.notFound) });
            }
            const allowed = await canAccessRecord(frame, entry.get('user_id'));
            if (!allowed) {
                throw new errors.NoPermissionError({ message: tpl(messages.noPermission) });
            }
            return entry;
        }
    },

    add: {
        statusCode: 201,
        headers: { cacheInvalidate: false },
        options: ['include'],
        data: ['user_id', 'settings_json', 'settings'],
        permissions: false,
        async query(frame) {
            const payload = normalizePayload(frame.data.socialaiagentsettings?.[0] || {});
            const targetUserId = await resolveTargetUserId(frame, payload.user_id);
            const nowSql = new Date().toISOString().slice(0, 19).replace('T', ' ');
            // @ts-ignore
            const created = await models.SocialAiAgentSetting.add({
                ...payload,
                user_id: targetUserId,
                created_at: nowSql,
                updated_at: nowSql
            }, {
                context: frame.options?.context
            });
            return {
                data: [created.toJSON()]
            };
        }
    },

    edit: {
        headers: { cacheInvalidate: false },
        options: ['id', 'include'],
        data: ['settings_json', 'settings'],
        permissions: false,
        async query(frame) {
            // @ts-ignore
            const existing = await models.SocialAiAgentSetting.findOne({ id: frame.options.id }, { require: false });
            if (!existing) {
                throw new errors.NotFoundError({ message: tpl(messages.notFound) });
            }
            const allowed = await canAccessRecord(frame, existing.get('user_id'));
            if (!allowed) {
                throw new errors.NoPermissionError({ message: tpl(messages.noPermission) });
            }

            const payload = normalizePayload(frame.data.socialaiagentsettings?.[0] || {});
            const nowSql = new Date().toISOString().slice(0, 19).replace('T', ' ');
            await existing.save({
                ...payload,
                updated_at: nowSql
            }, {
                patch: true,
                method: 'update'
            });
            return existing;
        }
    }
};

module.exports = controller;
