// @ts-ignore
const tpl = require('@tryghost/tpl');
const errors = require('@tryghost/errors');
const models = require('../../models');

const ADMIN_ROLES = new Set(['Owner', 'Administrator', 'Admin']);

const messages = {
    userRequired: 'No login user authentication.',
    notFound: 'AI usage not found.',
    noPermission: 'You are not allowed to access this AI usage.',
    groupNotFound: 'Group not found.'
};

const getCurrentUserId = frame => frame.options?.context?.user || null;
const getCurrentIntegrationId = frame => frame.options?.context?.integration || null;
const getRequestedUserId = frame => frame.options?.user_id || frame.data?.user_id || null;
// @ts-ignore
const USAGES_TABLE = models.SocialAiUsage?.prototype?.tableName || 'social_ai_usages';

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

const parsePage = (value) => {
    const parsed = Number.parseInt(value, 10);
    if (Number.isNaN(parsed) || parsed <= 0) {
        return 1;
    }
    return parsed;
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
        return requestedUserId || null;
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

const applyUsageFilters = (query, options = {}) => {
    const {
        targetUserId,
        groupId,
        provider,
        periodStart,
        periodEnd
    } = options;

    if (targetUserId) {
        query.andWhere('user_id', targetUserId);
    }

    if (groupId) {
        query.andWhere('group_id', groupId);
    }

    if (provider) {
        query.andWhere('provider', provider);
    }

    if (periodStart) {
        query.andWhere('created_at', '>=', `${periodStart} 00:00:00`);
    }
    if (periodEnd) {
        query.andWhere('created_at', '<=', `${periodEnd} 23:59:59`);
    }
};

/** @type {import('@tryghost/api-framework').Controller} */
const controller = {
    docName: 'socialaiusages',

    browse: {
        headers: {
            cacheInvalidate: false
        },
        options: [
            'group_id',
            'user_id',
            'provider',
            'period_start',
            'period_end',
            'limit',
            'page'
        ],
        permissions: false,
        async query(frame) {
            const knex = models.Base.knex;
            const currentUserId = getCurrentUserId(frame);
            const currentIntegrationId = getCurrentIntegrationId(frame);
            const requestedUserId = getRequestedUserId(frame);
            const groupId = frame.options?.group_id || null;
            const provider = frame.options?.provider || null;
            const periodStart = frame.options?.period_start || null;
            const periodEnd = frame.options?.period_end || null;
            const limit = parseLimit(frame.options?.limit);
            const page = parsePage(frame.options?.page);
            const offset = (page - 1) * limit;
            let targetUserId = null;

            if (groupId) {
                if (requestedUserId) {
                    if (!currentIntegrationId) {
                        if (!currentUserId) {
                            throw new errors.NoPermissionError({
                                message: tpl(messages.userRequired)
                            });
                        }

                        if (requestedUserId !== currentUserId) {
                            const isAdmin = await isAdminUser(currentUserId);
                            if (!isAdmin) {
                                throw new errors.NoPermissionError({
                                    message: tpl(messages.noPermission)
                                });
                            }
                        }
                    }
                    targetUserId = requestedUserId;
                }
            } else {
                targetUserId = await resolveTargetUserId(frame);
            }

            if (!groupId && !targetUserId) {
                throw new errors.ValidationError({
                    message: '`user_id` is required when `context.user` is unavailable and `group_id` is not provided.'
                });
            }

            const accessUserId = currentUserId || targetUserId || getRequestedUserId(frame);
            if (groupId && !accessUserId && !currentIntegrationId) {
                throw new errors.NoPermissionError({
                    message: tpl(messages.userRequired)
                });
            }

            await assertGroupAccess({
                frame,
                groupId,
                targetUserId: accessUserId,
                permission: 'read'
            });

            const baseQuery = knex(USAGES_TABLE);
            applyUsageFilters(baseQuery, {
                targetUserId,
                groupId,
                provider,
                periodStart,
                periodEnd
            });

            const totalCountRow = await baseQuery.clone()
                .clearSelect()
                .count({total_count: '*'})
                .first();

            const totals = await baseQuery.clone()
                .clearSelect()
                .sum({
                    prompt_tokens: 'prompt_tokens',
                    completion_tokens: 'completion_tokens',
                    total_tokens: 'total_tokens',
                    cost_usd_micros: 'cost_usd_micros'
                })
                .first();

            const rows = await baseQuery.clone()
                .orderBy('created_at', 'desc')
                .offset(offset)
                .limit(limit);

            const totalCount = Number(totalCountRow?.total_count || 0);
            const costMicros = Number(totals?.cost_usd_micros || 0);
            const pages = limit > 0 ? Math.max(1, Math.ceil(totalCount / limit)) : 1;

            const mappedRows = rows.map((row) => ({
                id: row.id,
                conversation_id: row.conversation_id,
                user_id: row.user_id,
                group_id: row.group_id,
                provider: row.provider,
                model: row.model,
                prompt_tokens: Number(row.prompt_tokens || 0),
                completion_tokens: Number(row.completion_tokens || 0),
                total_tokens: Number(row.total_tokens || 0),
                cost_usd_micros: Number(row.cost_usd_micros || 0),
                amount_usd: Number(row.cost_usd_micros || 0) / 1000000,
                currency: row.currency || 'USD',
                usage_source: row.usage_source || null,
                created_at: row.created_at
            }));

            return {
                data: mappedRows,
                group_totals: {
                    prompt_tokens: Number(totals?.prompt_tokens || 0),
                    completion_tokens: Number(totals?.completion_tokens || 0),
                    total_tokens: Number(totals?.total_tokens || 0),
                    amount_usd: costMicros / 1000000
                },
                meta: {
                    pagination: {
                        page,
                        limit,
                        pages,
                        total: totalCount,
                        next: page < pages ? page + 1 : null,
                        prev: page > 1 ? page - 1 : null
                    }
                }
            };
        }
    },

    read: {
        headers: {cacheInvalidate: false},
        options: [
            'group_id',
            'user_id'
        ],
        data: ['id'],
        permissions: false,
        async query(frame) {
            const knex = models.Base.knex;
            const targetUserId = await resolveTargetUserId(frame);
            const usageId = frame.data.id;

            const usage = await knex(USAGES_TABLE)
                .where({id: usageId})
                .first();

            if (!usage) {
                throw new errors.NotFoundError({
                    message: tpl(messages.notFound)
                });
            }

            if (targetUserId && usage.user_id !== targetUserId) {
                const currentUserId = getCurrentUserId(frame);
                const currentIntegrationId = getCurrentIntegrationId(frame);
                const isAllowed = Boolean(currentIntegrationId) || await isAdminUser(currentUserId);
                if (!isAllowed) {
                    throw new errors.NoPermissionError({
                        message: tpl(messages.noPermission)
                    });
                }
            }

            await assertGroupAccess({
                frame,
                groupId: usage.group_id || frame.options?.group_id || null,
                targetUserId: usage.user_id,
                permission: 'read'
            });

            return {
                id: usage.id,
                conversation_id: usage.conversation_id,
                user_id: usage.user_id,
                group_id: usage.group_id,
                provider: usage.provider,
                model: usage.model,
                prompt_tokens: Number(usage.prompt_tokens || 0),
                completion_tokens: Number(usage.completion_tokens || 0),
                total_tokens: Number(usage.total_tokens || 0),
                cost_usd_micros: Number(usage.cost_usd_micros || 0),
                amount_usd: Number(usage.cost_usd_micros || 0) / 1000000,
                currency: usage.currency || 'USD',
                usage_source: usage.usage_source || null,
                created_at: usage.created_at
            };
        }
    }
};

module.exports = controller;
