// @ts-ignore
const tpl = require('@tryghost/tpl');
const errors = require('@tryghost/errors');
const models = require('../../models');

const ADMIN_ROLES = new Set(['Owner', 'Administrator', 'Admin']);
const ALLOWED_INCLUDES = ['user', 'group'];

const messages = {
    userRequired: 'No login user authentication.',
    notFound: 'DZI job not found.',
    noPermission: 'You are not allowed to access this DZI job.',
    groupNotFound: 'Group not found.',
    invalidJobId: '`id` is required.',
    invalidTransition: 'The requested job transition is not allowed.'
};

// @ts-ignore
const getPayload = (frame) => frame.data?.socialaidzijobs?.[0] || {};
// @ts-ignore
const getActionPayload = (frame) => {
    const payload = getPayload(frame);
    return Object.keys(payload).length > 0 ? payload : (frame.data || {});
};

// @ts-ignore
const getCurrentUserId = frame => frame.options?.context?.user || null;
// @ts-ignore
const getCurrentIntegrationId = frame => frame.options?.context?.integration || null;
// @ts-ignore
const getRequestedUserId = (frame) => {
    const payload = getPayload(frame);
    return frame.options?.user_id || payload.user_id || frame.data?.user_id || null;
};
// @ts-ignore
const SocialAiDziJobModel = models.SocialAiDziJob;
// @ts-ignore
const TABLE = SocialAiDziJobModel?.prototype?.tableName || 'social_ai_dzi_jobs';

const nowMySql = () => new Date().toISOString().slice(0, 19).replace('T', ' ');

// @ts-ignore
const getJobId = (frame) => frame.options?.id || frame.data?.id || null;

// @ts-ignore
const serializeRow = (row) => ({
    id: row.id,
    job_id: row.id,
    user_id: row.user_id,
    group_id: row.group_id,
    status: row.status,
    progress: row.progress,
    source_path: row.source_path,
    source_name: row.source_name,
    publication_name: row.publication_name,
    edition: row.edition,
    pages: row.pages ? JSON.parse(row.pages) : [],
    error: row.error || null,
    claim_worker_id: row.claim_worker_id || null,
    claim_expires_at: row.claim_expires_at || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    started_at: row.started_at || null,
    completed_at: row.completed_at || null
});

// @ts-ignore
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
    // @ts-ignore
    return roles.some(role => ADMIN_ROLES.has(role.get('name')));
};

// @ts-ignore
const resolveTargetUserId = async (frame) => {
    const currentUserId = getCurrentUserId(frame);
    const currentIntegrationId = getCurrentIntegrationId(frame);
    const requestedUserId = getRequestedUserId(frame);

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

// @ts-ignore
const assertGroupAccess = async ({ frame, groupId, targetUserId, permission }) => {
    if (!groupId) {
        return;
    }

    const currentUserId = getCurrentUserId(frame);
    const isAdmin = currentUserId ? await isAdminUser(currentUserId) : false;
    if (isAdmin) {
        return;
    }

    // @ts-ignore
    const group = await models.SocialGroup.findOne({ id: groupId });
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

// @ts-ignore
const assertCanReadRow = async ({ frame, row }) => {
    const currentUserId = getCurrentUserId(frame);
    const integrationId = getCurrentIntegrationId(frame);
    const isAdmin = currentUserId ? await isAdminUser(currentUserId) : false;

    if (integrationId || isAdmin) {
        return;
    }

    const targetUserId = await resolveTargetUserId(frame);
    await assertGroupAccess({
        frame,
        groupId: row.group_id,
        targetUserId: targetUserId || currentUserId,
        permission: 'read'
    });

    if (row.user_id !== targetUserId && row.group_id === null) {
        throw new errors.NoPermissionError({
            message: tpl(messages.noPermission)
        });
    }
};

// @ts-ignore
const loadModelOrThrow = async (id) => {
    if (!id) {
        throw new errors.ValidationError({
            message: tpl(messages.invalidJobId)
        });
    }

    // @ts-ignore
    const model = await SocialAiDziJobModel.findOne({ id });
    if (!model) {
        throw new errors.NotFoundError({
            message: tpl(messages.notFound)
        });
    }

    return model;
};

// @ts-ignore
const loadRowOrThrow = async (knex, id) => {
    if (!id) {
        throw new errors.ValidationError({
            message: tpl(messages.invalidJobId)
        });
    }

    const row = await knex(TABLE).where({ id }).first();
    if (!row) {
        throw new errors.NotFoundError({
            message: tpl(messages.notFound)
        });
    }

    return row;
};

/** @type {import('@tryghost/api-framework').Controller} */
const controller = {
    docName: 'socialaidzijobs',

    browse: {
        headers: {
            cacheInvalidate: false
        },
        options: [
            'group_id',
            'user_id',
            'status',
            'include',
            'filter',
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
            const targetUserId = await resolveTargetUserId(frame);
            // @ts-ignore
            const groupId = frame.options?.group_id || null;
            await assertGroupAccess({
                frame,
                groupId,
                targetUserId,
                permission: 'read'
            });
            // @ts-ignore
            return await models.SocialAiDziJob.findPage({ ...frame.options, withRelated: ALLOWED_INCLUDES });
        }
    },

    read: {
        headers: {
            cacheInvalidate: false
        },
        options: ['id'],
        validation: {
            options: {
                include: ALLOWED_INCLUDES
            }
        },
        permissions: true,
        async query(frame) {
            const targetUserId = await resolveTargetUserId(frame);
            // @ts-ignore
            const groupId = frame.options?.group_id || null;
            await assertGroupAccess({
                frame,
                groupId,
                targetUserId,
                permission: 'read'
            });
            // @ts-ignore
            return await loadModelOrThrow(frame.options.id);
        }
    },

    // @ts-ignore
    add: {
        statusCode: 201,
        headers: { cacheInvalidate: false },
        options: ['include', 'transacting'],
        data: [
            'id',
            'user_id',
            'group_id',
            'source_path',
            'source_name',
            'publication_name',
            'edition'
        ],
        permissions: true,
        async query(frame) {
            const payloadInput = getPayload(frame);
            const currentUserId = getCurrentUserId(frame);
            const integrationId = getCurrentIntegrationId(frame);
            const targetUserId = await resolveTargetUserId(frame);
            const groupId = String(frame.options?.group_id || payloadInput.group_id || '').trim() || null;

            if (groupId) {
                await assertGroupAccess({
                    frame,
                    groupId,
                    targetUserId: targetUserId || currentUserId,
                    permission: 'write'
                });
            }

            if (!currentUserId && !integrationId) {
                throw new errors.NoPermissionError({
                    message: tpl(messages.userRequired)
                });
            }

            // @ts-ignore
            return await models.SocialAiDziJob.add({
                ...payloadInput,
                user_id: targetUserId || currentUserId,
                group_id: groupId
            }, frame.options);
        }
    },

    // @ts-ignore
    cancel: {
        options: ['id'],
        permissions: true,
        async query(frame) {
            const knex = models.Base.knex;
            const currentUserId = getCurrentUserId(frame);
            // @ts-ignore
            const row = (await loadModelOrThrow(getJobId(frame))).toJSON();
            await assertCanReadRow({ frame, row });

            if (!['queued', 'running'].includes(row.status)) {
                throw new errors.ValidationError({
                    message: tpl(messages.invalidTransition)
                });
            }

            const now = nowMySql();
            await knex(TABLE)
                .where({ id: row.id })
                .update({
                    status: 'canceled',
                    updated_at: now,
                    updated_by: currentUserId || row.user_id
                });

            return {
                ...serializeRow({
                    ...row,
                    status: 'canceled'
                })
            };
        }
    },

    // @ts-ignore
    claim: {
        permissions: true,
        async query(frame) {
            const knex = models.Base.knex;
            const payloadInput = getActionPayload(frame);
            // @ts-ignore
            const workerId = payloadInput.worker_id || frame.options?.worker_id || 'runner';
            const claimTtlSeconds = Number(payloadInput.claim_ttl_seconds || 300);
            const nowDate = new Date();
            const expiresAt = new Date(nowDate.getTime() + claimTtlSeconds * 1000);
            const now = nowMySql();
            const claimExpiresAt = expiresAt.toISOString().slice(0, 19).replace('T', ' ');

            const row = await knex(TABLE)
                .where(function () {
                    this.where('status', 'queued').orWhere(function () {
                        this.where('status', 'running').andWhere('claim_expires_at', '<', now);
                    });
                })
                .andWhere(function () {
                    this.whereNull('claim_expires_at').orWhere('claim_expires_at', '<', now);
                })
                .orderBy('updated_at', 'asc')
                .first();

            if (!row) {
                return [];
            }

            await knex(TABLE)
                .where({ id: row.id })
                .update({
                    status: 'running',
                    claim_worker_id: workerId,
                    claim_expires_at: claimExpiresAt,
                    started_at: row.started_at || now,
                    updated_at: now,
                    updated_by: row.updated_by || row.user_id
                });

            const claimed = await loadRowOrThrow(knex, row.id);
            return serializeRow(claimed);
        }
    },

    // @ts-ignore
    progress: {
        options: ['id'],
        permissions: true,
        async query(frame) {
            const knex = models.Base.knex;
            const payloadInput = getActionPayload(frame);
            // @ts-ignore
            const row = await loadRowOrThrow(knex, getJobId(frame));
            const now = nowMySql();
            await knex(TABLE)
                .where({ id: row.id })
                .update({
                    progress: Number(payloadInput.progress ?? row.progress),
                    status: payloadInput.status || row.status,
                    error: payloadInput.error ?? row.error,
                    claim_worker_id: payloadInput.claim_worker_id ?? row.claim_worker_id,
                    claim_expires_at: payloadInput.claim_expires_at ?? row.claim_expires_at,
                    updated_at: now,
                    updated_by: row.updated_by || row.user_id
                });

            const next = await loadRowOrThrow(knex, row.id);
            return serializeRow(next);
        }
    },

    // @ts-ignore
    complete: {
        options: ['id'],
        permissions: true,
        async query(frame) {
            const knex = models.Base.knex;
            const payloadInput = getActionPayload(frame);
            // @ts-ignore
            const row = await loadRowOrThrow(knex, getJobId(frame));
            const now = nowMySql();
            await knex(TABLE)
                .where({ id: row.id })
                .update({
                    status: 'completed',
                    progress: 100,
                    pages: payloadInput.pages
                        ? JSON.stringify(payloadInput.pages)
                        : row.pages,
                    completed_at: now,
                    claim_worker_id: null,
                    claim_expires_at: null,
                    updated_at: now,
                    updated_by: row.updated_by || row.user_id
                });

            const next = await loadRowOrThrow(knex, row.id);
            return serializeRow(next);
        }
    },

    // @ts-ignore
    fail: {
        options: ['id'],
        permissions: true,
        async query(frame) {
            const knex = models.Base.knex;
            const payloadInput = getActionPayload(frame);
            // @ts-ignore
            const row = await loadRowOrThrow(knex, getJobId(frame));
            const now = nowMySql();
            await knex(TABLE)
                .where({ id: row.id })
                .update({
                    status: 'failed',
                    progress: Number(payloadInput.progress ?? row.progress),
                    error: payloadInput.error || row.error,
                    claim_worker_id: null,
                    claim_expires_at: null,
                    updated_at: now,
                    updated_by: row.updated_by || row.user_id
                });

            const next = await loadRowOrThrow(knex, row.id);
            return serializeRow(next);
        }
    }
};

module.exports = controller;
