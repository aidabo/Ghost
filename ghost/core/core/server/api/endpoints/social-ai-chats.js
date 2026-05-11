// @ts-ignore
const tpl = require('@tryghost/tpl');
const errors = require('@tryghost/errors');
const ObjectId = require('bson-objectid').default;
const models = require('../../models');

const ADMIN_ROLES = new Set(['Owner', 'Administrator', 'Admin']);

const messages = {
    userRequired: 'No login user authentication.',
    notFound: 'AI conversation not found.',
    noPermission: 'You are not allowed to access this AI conversation.',
    conversationIdRequired: '`conversation_id` is required.',
    groupNotFound: 'Group not found or You are not allowed to access this group.'
};

const getCurrentUserId = frame => frame.options?.context?.user || null;
const getCurrentIntegrationId = frame => frame.options?.context?.integration || null;
// @ts-ignore
const CONVERSATIONS_TABLE = models.SocialAiConversation?.prototype?.tableName || 'social_ai_conversations';
// @ts-ignore
const MESSAGES_TABLE = models.SocialAiMessage?.prototype?.tableName || 'social_ai_messages';
// @ts-ignore
const USAGES_TABLE = models.SocialAiUsage?.prototype?.tableName || 'social_ai_usages';

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

const parseLimit = (value) => {
    const parsed = Number.parseInt(value, 10);
    if (Number.isNaN(parsed) || parsed <= 0) {
        return 30;
    }
    return Math.min(parsed, 100);
};

const parsePage = (value) => {
    const parsed = Number.parseInt(value, 10);
    if (Number.isNaN(parsed) || parsed <= 0) {
        return 1;
    }
    return parsed;
};

const normalizeGroupId = (value) => {
    const groupId = String(value || '').trim();
    if (!groupId) {
        return null;
    }

    // Host-side private/site chat scopes use synthetic ids like `u:<userId>`
    // or the sentinel `site`. These are not real Ghost groups and must not
    // be validated as such.
    if (groupId.startsWith('u:') || groupId === 'site') {
        return null;
    }

    return groupId;
};

const resolveTargetUserId = async (frame) => {
    const currentUserId = getCurrentUserId(frame);
    const currentIntegrationId = getCurrentIntegrationId(frame);

    if (!currentUserId && !currentIntegrationId) {
        throw new errors.NoPermissionError({
            message: tpl(messages.userRequired)
        });
    }

    const requestedUserId = frame.options?.user_id || frame.data?.user_id || null;

    if (currentIntegrationId) {
        if (!requestedUserId) {
            throw new errors.ValidationError({
                message: '`user_id` is required.'
            });
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

const formatMessageRows = (rows) => {
    const formatted = [];

    rows.forEach((row) => {
        if (row.role !== 'turn') {
            return;
        }

        let parsed = null;
        try {
            parsed = JSON.parse(row.content || '{}');
        } catch (err) {
            return;
        }

        if (typeof parsed.user === 'string' && parsed.user.trim()) {
            formatted.push({
                id: `${row.id}:user`,
                role: 'user',
                content: parsed.user,
                created_at: row.created_at
            });
        }

        if (typeof parsed.assistant === 'string' && parsed.assistant.trim()) {
            formatted.push({
                id: `${row.id}:assistant`,
                role: 'assistant',
                content: parsed.assistant,
                created_at: row.created_at
            });
        }
    });

    return formatted;
};

const formatMySqlDateTime = (date) => {
    // MySQL DATETIME expects "YYYY-MM-DD HH:mm:ss" (no timezone suffix).
    return date.toISOString().slice(0, 19).replace('T', ' ');
};

const buildConversationTitle = ({ provider, title, userMessage }) => {
    const incomingTitle = String(title || '').trim();
    if (incomingTitle) {
        return incomingTitle;
    }

    const text = String(userMessage || '').trim();
    if (!text) {
        return 'New chat';
    }

    const maxLength = 60;
    let clipped = text;
    if (text.length > maxLength) {
        const within = text.slice(0, maxLength + 1);
        const lastSpace = within.lastIndexOf(' ');
        clipped = lastSpace > Math.floor(maxLength * 0.6)
            ? within.slice(0, lastSpace)
            : text.slice(0, maxLength);
    }

    return clipped;
};

const assertGroupAccess = async ({ frame, groupId, targetUserId, permission }) => {
    const normalizedGroupId = normalizeGroupId(groupId);
    if (!normalizedGroupId) {
        return;
    }

    const currentUserId = getCurrentUserId(frame);
    const isAdmin = currentUserId ? await isAdminUser(currentUserId) : false;
    if (isAdmin) {
        return;
    }

    // @ts-ignore
    const group = await models.SocialGroup.findOne({ id: normalizedGroupId });
    if (!group) {
        throw new errors.NoPermissionError({
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

/** @type {import('@tryghost/api-framework').Controller} */
const controller = {
    docName: 'socialaichats',

    browse: {
        headers: {
            cacheInvalidate: false
        },
        options: [
            'group_id',
            'user_id',
            'provider',
            'visibility',
            'limit',
            'page'
        ],
        permissions: false,
        async query(frame) {
            const knex = models.Base.knex;
            const targetUserId = await resolveTargetUserId(frame);
            const groupId = normalizeGroupId(frame.options?.group_id || null);
            const provider = frame.options?.provider || null;
            const visibility = frame.options?.visibility || null;
            const limit = parseLimit(frame.options?.limit);
            const page = parsePage(frame.options?.page);
            const offset = (page - 1) * limit;

            await assertGroupAccess({
                frame,
                groupId,
                targetUserId,
                permission: 'read'
            });

            const baseFilter = knex(CONVERSATIONS_TABLE)
                .where({ user_id: targetUserId });

            if (groupId) {
                baseFilter.andWhere('group_id', groupId);
            }

            if (provider) {
                baseFilter.andWhere('provider', provider);
            }

            if (visibility) {
                baseFilter.andWhere('visibility', visibility);
            }

            const totalCountRow = await baseFilter.clone()
                .clearSelect()
                .count({ total_count: '*' })
                .first();

            const query = baseFilter.clone()
                .orderBy('updated_at', 'desc')
                .offset(offset)
                .limit(limit);

            const rows = await query;
            const totalCount = Number(totalCountRow?.total_count || 0);

            const mappedRows = rows.map((row) => ({
                id: row.id,
                user_id: row.user_id,
                group_id: row.group_id,
                title: row.title,
                provider: row.provider,
                model: row.model,
                response_mode: row.response_mode,
                visibility: row.visibility,
                created_at: row.created_at,
                updated_at: row.updated_at
            }));
            const pages = limit > 0 ? Math.max(1, Math.ceil(totalCount / limit)) : 1;

            return {
                data: mappedRows,
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
        headers: { cacheInvalidate: false },
        options: [
            'group_id',
            'user_id'
        ],
        data: ['id'],
        permissions: false,
        async query(frame) {
            const knex = models.Base.knex;
            const targetUserId = await resolveTargetUserId(frame);
            const conversationId = frame.data.id;

            const conversation = await knex(CONVERSATIONS_TABLE)
                .where({ id: conversationId })
                .first();

            if (!conversation) {
                throw new errors.NotFoundError({
                    message: tpl(messages.notFound)
                });
            }

            if (conversation.user_id !== targetUserId) {
                const currentUserId = getCurrentUserId(frame);
                const currentIntegrationId = getCurrentIntegrationId(frame);
                const isAllowed = Boolean(currentIntegrationId) || await isAdminUser(currentUserId);
                if (!isAllowed) {
                    throw new errors.NoPermissionError({
                        message: tpl(messages.noPermission)
                    });
                }
            }

            const groupId = normalizeGroupId(frame.options?.group_id || null);
            if (groupId && conversation.group_id !== groupId) {
                throw new errors.NotFoundError({
                    message: tpl(messages.notFound)
                });
            }

            await assertGroupAccess({
                frame,
                groupId: conversation.group_id || groupId,
                targetUserId,
                permission: 'read'
            });

            const messageRows = await knex(MESSAGES_TABLE)
                .where({ conversation_id: conversationId })
                .orderBy('created_at', 'asc');

            const usageTotals = await knex(USAGES_TABLE)
                .where({ conversation_id: conversationId })
                .sum({
                    prompt_tokens: 'prompt_tokens',
                    completion_tokens: 'completion_tokens',
                    total_tokens: 'total_tokens',
                    cost_usd_micros: 'cost_usd_micros'
                })
                .first();

            return {
                id: conversation.id,
                user_id: conversation.user_id,
                group_id: conversation.group_id,
                title: conversation.title,
                provider: conversation.provider,
                model: conversation.model,
                response_mode: conversation.response_mode,
                visibility: conversation.visibility,
                created_at: conversation.created_at,
                updated_at: conversation.updated_at,
                messages: formatMessageRows(messageRows),
                usage_totals: {
                    prompt_tokens: Number(usageTotals?.prompt_tokens || 0),
                    completion_tokens: Number(usageTotals?.completion_tokens || 0),
                    total_tokens: Number(usageTotals?.total_tokens || 0),
                    cost_usd_micros: Number(usageTotals?.cost_usd_micros || 0)
                }
            };
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
            'conversation_id',
            'user_id',
            'group_id',
            'visibility',
            'provider',
            'model',
            'response_mode',
            'title',
            'user_message',
            'assistant_message',
            'prompt_tokens',
            'completion_tokens',
            'total_tokens',
            'cost_usd_micros',
            'currency',
            'usage_source',
            'manual_title'
        ],
        permissions: false,
        async query(frame) {
            const knex = models.Base.knex;
            const currentUserId = getCurrentUserId(frame);
            const currentIntegrationId = getCurrentIntegrationId(frame);
            if (!currentUserId && !currentIntegrationId) {
                throw new errors.NoPermissionError({
                    message: tpl(messages.userRequired)
                });
            }

            const payload = frame.data.socialaichats?.[0] || {};
            const conversationId = String(payload.conversation_id || '').trim();
            if (!conversationId) {
                throw new errors.ValidationError({
                    message: tpl(messages.conversationIdRequired)
                });
            }

            const targetUserId = await resolveTargetUserId({
                ...frame,
                data: {
                    ...frame.data,
                    user_id: payload.user_id || currentUserId
                }
            });

            const hasGroupId = Object.prototype.hasOwnProperty.call(payload, 'group_id');
            const groupId = hasGroupId ? normalizeGroupId(payload.group_id || null) : undefined;
            const visibility = payload.visibility || 'private';
            const provider = payload.provider || null;
            const model = payload.model || null;
            const responseMode = payload.response_mode || null;
            const title = payload.title || null;
            const manualTitle = Boolean(payload.manual_title);
            const userMessage = typeof payload.user_message === 'string' ? payload.user_message : '';
            const assistantMessage = typeof payload.assistant_message === 'string' ? payload.assistant_message : '';

            const promptTokens = Number(payload.prompt_tokens || 0);
            const completionTokens = Number(payload.completion_tokens || 0);
            const totalTokens = Number(payload.total_tokens || (promptTokens + completionTokens));
            const costUsdMicros = Number(payload.cost_usd_micros || 0);
            const currency = String(payload.currency || 'USD').toUpperCase();
            const usageSource = String(payload.usage_source || 'finish').trim().toLowerCase();

            const now = new Date();
            const nowSql = formatMySqlDateTime(now);
            const messageIds = [];

            await assertGroupAccess({
                frame,
                groupId,
                targetUserId,
                permission: 'write'
            });

            const normalizedTitle = buildConversationTitle({
                provider,
                title,
                userMessage
            });

            await knex.transaction(async (trx) => {
                const existingConversation = await trx(CONVERSATIONS_TABLE)
                    .where({ id: conversationId })
                    .first();

                if (!existingConversation) {
                    await trx(CONVERSATIONS_TABLE).insert({
                        id: conversationId,
                        user_id: targetUserId,
                        group_id: groupId,
                        title: normalizedTitle,
                        provider,
                        model,
                        response_mode: responseMode,
                        visibility,
                        created_at: nowSql,
                        updated_at: nowSql
                    });
                } else {
                    if (existingConversation.user_id !== targetUserId) {
                        const adminAllowed = Boolean(currentIntegrationId) || await isAdminUser(currentUserId);
                        if (!adminAllowed) {
                            throw new errors.NoPermissionError({
                                message: tpl(messages.noPermission)
                            });
                        }
                    }

                    const existingTitle = String(existingConversation.title || '').trim();
                    const existingProvider = String(existingConversation.provider || provider || '').trim();
                    const shouldUpgradeTitle = !existingTitle || existingTitle === existingProvider;
                    const hasIncomingTitle = String(title || '').trim().length > 0;
                    const nextTitle = (manualTitle && hasIncomingTitle)
                        ? String(title).trim()
                        : (shouldUpgradeTitle ? normalizedTitle : existingTitle);

                    await trx(CONVERSATIONS_TABLE)
                        .where({ id: conversationId })
                        .update({
                            group_id: hasGroupId ? groupId : existingConversation.group_id,
                            title: nextTitle,
                            provider: provider || existingConversation.provider,
                            model: model || existingConversation.model,
                            response_mode: responseMode || existingConversation.response_mode,
                            visibility: visibility || existingConversation.visibility,
                            updated_at: nowSql
                        });
                }

                if (userMessage.trim() || assistantMessage.trim()) {
                    const turnId = ObjectId().toHexString();
                    messageIds.push(turnId);
                    await trx(MESSAGES_TABLE).insert({
                        id: turnId,
                        conversation_id: conversationId,
                        user_id: targetUserId,
                        role: 'turn',
                        content: JSON.stringify({
                            user: userMessage,
                            assistant: assistantMessage
                        }),
                        created_at: nowSql
                    });
                }

                if (promptTokens || completionTokens || totalTokens || costUsdMicros) {
                    await trx(USAGES_TABLE).insert({
                        id: ObjectId().toHexString(),
                        conversation_id: conversationId,
                        user_id: targetUserId,
                        group_id: groupId,
                        provider,
                        model,
                        prompt_tokens: promptTokens,
                        completion_tokens: completionTokens,
                        total_tokens: totalTokens,
                        cost_usd_micros: costUsdMicros,
                        currency,
                        usage_source: usageSource,
                        created_at: nowSql
                    });
                }
            });

            const conversation = await knex(CONVERSATIONS_TABLE)
                .where({ id: conversationId })
                .first();

            return {
                id: conversation.id,
                user_id: conversation.user_id,
                group_id: conversation.group_id,
                title: conversation.title,
                provider: conversation.provider,
                model: conversation.model,
                response_mode: conversation.response_mode,
                visibility: conversation.visibility,
                created_at: conversation.created_at,
                updated_at: conversation.updated_at,
                saved_message_ids: messageIds
            };
        }
    },

    destroy: {
        statusCode: 204,
        headers: { cacheInvalidate: false },
        options: [
            'group_id',
            'user_id'
        ],
        data: ['id'],
        permissions: false,
        async query(frame) {
            const knex = models.Base.knex;
            const currentUserId = getCurrentUserId(frame);
            const currentIntegrationId = getCurrentIntegrationId(frame);
            if (!currentUserId && !currentIntegrationId) {
                throw new errors.NoPermissionError({
                    message: tpl(messages.userRequired)
                });
            }

            const conversationId = String(frame.data?.id || '').trim();
            if (!conversationId) {
                throw new errors.ValidationError({
                    message: tpl(messages.conversationIdRequired)
                });
            }

            const targetUserId = await resolveTargetUserId({
                ...frame,
                data: {
                    ...frame.data,
                    user_id: frame.options?.user_id || frame.data?.user_id || currentUserId
                }
            });

            const conversation = await knex(CONVERSATIONS_TABLE)
                .where({ id: conversationId })
                .first();

            if (!conversation) {
                throw new errors.NotFoundError({
                    message: tpl(messages.notFound)
                });
            }

            if (targetUserId && conversation.user_id !== targetUserId) {
                const isAllowed = Boolean(currentIntegrationId) || await isAdminUser(currentUserId);
                if (!isAllowed) {
                    throw new errors.NoPermissionError({
                        message: tpl(messages.noPermission)
                    });
                }
            }

            await assertGroupAccess({
                frame,
                groupId: conversation.group_id || frame.options?.group_id || null,
                targetUserId: conversation.user_id,
                permission: 'write'
            });

            await knex(CONVERSATIONS_TABLE)
                .where({ id: conversationId })
                .del();

            return null;
        }
    }
};

module.exports = controller;
