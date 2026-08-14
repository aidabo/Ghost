// @ts-ignore
const tpl = require('@tryghost/tpl');
const errors = require('@tryghost/errors');
const logging = require('@tryghost/logging');
const models = require('../../models');
const storage = require('../../adapters/storage');
const ObjectId = require('bson-objectid').default;
const socialMediaAssets = require('./utils/social-media-assets');
const {recalcProjectStatus} = require('./utils/social-ai-projects');

const ADMIN_ROLES = new Set(['Owner', 'Administrator', 'Admin']);
const ALLOWED_INCLUDES = ['user', 'group'];

const messages = {
    userRequired: 'No login user authentication.',
    notFound: 'Chart job not found.',
    noPermission: 'You are not allowed to access this chart job.',
    groupNotFound: 'Group not found.',
    projectNotFound: 'Project not found.',
    invalidJobId: '`id` is required.',
    invalidTransition: 'The requested job transition is not allowed.',
    activeJobs: 'Queued or running jobs cannot be deleted.'
};

// @ts-ignore
const getPayload = (frame) => frame.data?.socialaichartjobs?.[0] || {};
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
const SocialAiChartJobModel = models.SocialAiChartJob;
// @ts-ignore
const TABLE = SocialAiChartJobModel?.prototype?.tableName || 'social_ai_chart_jobs';

const nowMySql = () => new Date().toISOString().slice(0, 19).replace('T', ' ');

// @ts-ignore
const getJobId = (frame) => frame.options?.id || frame.data?.id || null;

const parseJson = (value, fallback) => {
    if (value === null || value === undefined || value === '') {
        return fallback;
    }
    try {
        return JSON.parse(value);
    } catch (err) {
        return fallback;
    }
};

// @ts-ignore
const serializeRow = (row) => ({
    id: row.id,
    job_id: row.id,
    type: row.type,
    user_id: row.user_id,
    group_id: row.group_id,
    project_id: row.project_id || null,
    status: row.status,
    // steps / payload / result are stored as JSON strings — parse for the client.
    steps: parseJson(row.steps, []),
    payload: parseJson(row.payload, {}),
    result: parseJson(row.result, {}),
    progress: row.progress,
    source_path: row.source_path || null,
    preview_url: row.preview_url || null,
    error: row.error || null,
    claim_worker_id: row.claim_worker_id || null,
    claim_expires_at: row.claim_expires_at || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    started_at: row.started_at || null,
    completed_at: row.completed_at || null
});

// Job-level status derived from the step array (docs/chart-job-agent-plan.md §2-2).
//   all completed → completed
//   any failed    → failed
//   any running   → running (includes waiting-for-review gates)
//   else          → queued ("continuation remains")
// @ts-ignore
const deriveJobStatus = (steps) => {
    const list = Array.isArray(steps) ? steps : [];
    if (list.length === 0) {
        return 'queued';
    }
    if (list.every(s => s.status === 'completed')) {
        return 'completed';
    }
    if (list.some(s => s.status === 'failed')) {
        return 'failed';
    }
    if (list.some(s => s.status === 'running')) {
        return 'running';
    }
    return 'queued';
};

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
const assertRowAccess = async ({ frame, row, permission = 'read' }) => {
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
        permission
    });

    if (row.user_id !== targetUserId && row.group_id === null) {
        throw new errors.NoPermissionError({
            message: tpl(messages.noPermission)
        });
    }
};

// @ts-ignore
const assertCanReadRow = (args) => assertRowAccess({ ...args, permission: 'read' });

// Review 2026-08-07 #1: destructive/state-changing actions (cancel/rerun/
// destroy) require write permission — `read` is granted to any valid group
// member, so a read-only member could otherwise cancel, rerun, or delete jobs.
// @ts-ignore
const assertCanWriteRow = (args) => assertRowAccess({ ...args, permission: 'write' });

// M8 (review 2026-08-07): the PROJECT owns its jobs' visibility. A browser
// user may only read/write jobs of projects they own or share via group.
// @ts-ignore
const assertProjectAccess = async ({ frame, project, targetUserId, permission }) => {
    const currentUserId = getCurrentUserId(frame);
    const integrationId = getCurrentIntegrationId(frame);
    const isAdmin = currentUserId ? await isAdminUser(currentUserId) : false;
    if (integrationId || isAdmin) {
        return;
    }

    const projectOwnerId = project.get('user_id') || null;
    const projectGroupId = project.get('group_id') || null;

    if (projectGroupId) {
        await assertGroupAccess({
            frame,
            groupId: projectGroupId,
            targetUserId: targetUserId || currentUserId,
            permission
        });
        return;
    }

    if (projectOwnerId && projectOwnerId !== (targetUserId || currentUserId)) {
        throw new errors.NoPermissionError({
            message: tpl(messages.noPermission)
        });
    }
};

// @ts-ignore
const loadProjectOrThrow = async (id) => {
    if (!id) {
        return null;
    }
    // @ts-ignore
    const project = await models.SocialAiProject.findOne({ id });
    if (!project) {
        throw new errors.NotFoundError({
            message: tpl(messages.projectNotFound)
        });
    }
    return project;
};

// @ts-ignore
const loadModelOrThrow = async (id) => {
    if (!id) {
        throw new errors.ValidationError({
            message: tpl(messages.invalidJobId)
        });
    }

    // @ts-ignore
    const model = await SocialAiChartJobModel.findOne({ id });
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

/**
 * Worker-endpoint guard (H2/M3/H4, review 2026-08-07):
 * - integration context only (browser sessions must not touch queue state)
 * - a canceled job must not be resurrected by progress/complete/fail
 * - while running, the caller must be the CURRENT lease holder
 * @returns {string} the caller's worker id ('' when not running / not checked)
 */
const assertWorkerContext = async (frame, row) => {
    if (!getCurrentIntegrationId(frame)) {
        throw new errors.NoPermissionError({
            message: tpl(messages.userRequired)
        });
    }

    if (row.status === 'canceled') {
        throw new errors.ValidationError({
            message: tpl(messages.invalidTransition)
        });
    }

    const payloadInput = getActionPayload(frame);
    const caller = String(payloadInput.claim_worker_id || '').trim();
    if (row.status === 'running' && row.claim_worker_id && caller && caller !== row.claim_worker_id) {
        throw new errors.ValidationError({
            message: tpl(messages.invalidTransition)
        });
    }
    return caller;
};

/** Server-computed lease extension (client may not extend its own lease). */
const extendLeaseAt = () => {
    const d = new Date(Date.now() + 300 * 1000);
    return d.toISOString().slice(0, 19).replace('T', ' ');
};

/** @type {import('@tryghost/api-framework').Controller} */
const controller = {
    docName: 'socialaichartjobs',

    browse: {
        headers: {
            cacheInvalidate: false
        },
        options: [
            'group_id',
            'user_id',
            'status',
            'type',
            'project_id',
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
        permissions: false,
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

            // H3: a non-admin browser user only sees their own jobs (the payload
            // contains the family names being researched). Integration context
            // (host UI / workers) and admins keep the full listing.
            const integrationId = getCurrentIntegrationId(frame);
            const isAdmin = targetUserId ? await isAdminUser(targetUserId) : false;
            let options = { ...frame.options, withRelated: ALLOWED_INCLUDES };

            // M8: filtering by project requires access to THAT project — the
            // project's ownership governs its jobs' visibility.
            // @ts-ignore
            const projectId = String(frame.options?.project_id || '').trim() || null;
            if (projectId) {
                const project = await loadProjectOrThrow(projectId);
                if (!integrationId && !isAdmin) {
                    await assertProjectAccess({
                        frame,
                        project,
                        targetUserId: targetUserId || getCurrentUserId(frame),
                        permission: 'read'
                    });
                }
                const baseFilter = String(frame.options?.filter || '').trim();
                options = {
                    ...options,
                    filter: baseFilter ? `${baseFilter}+project_id:${projectId}` : `project_id:${projectId}`
                };
            } else if (!integrationId && !isAdmin && !groupId && targetUserId) {
                const baseFilter = String(frame.options?.filter || '').trim();
                options = {
                    ...options,
                    filter: baseFilter ? `${baseFilter}+user_id:${targetUserId}` : `user_id:${targetUserId}`
                };
            }

            // Type filter (review 2026-08-08): the `type` option was declared
            // and sent by the host but never composed into the NQL filter —
            // dead contract end-to-end. Compose it after the project/user scope
            // so the two combine (`project_id:xxx+type:csv-create`).
            const jobType = String(frame.options?.type || '').trim();
            if (jobType) {
                const baseFilter = String(options.filter || '').trim();
                options = {
                    ...options,
                    filter: baseFilter ? `${baseFilter}+type:${jobType}` : `type:${jobType}`
                };
            }

            // @ts-ignore
            return await models.SocialAiChartJob.findPage(options);
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
        permissions: false,
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
            'project_id',
            'type',
            'steps',
            'payload',
            'result',
            'source_path',
            'preview_url'
        ],
        permissions: false,
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

            // M8: a job may only be created inside a project the caller owns
            // (or shares via group). Integration context (host) is trusted.
            const projectId = String(payloadInput.project_id || '').trim() || null;
            if (projectId) {
                const project = await loadProjectOrThrow(projectId);
                await assertProjectAccess({
                    frame,
                    project,
                    targetUserId: targetUserId || currentUserId,
                    permission: 'write'
                });
            }

            const type = String(payloadInput.type || 'image-fetch').trim();
            // Accept steps as array (preferred) or build a single-step job from
            // the legacy fields (type + payload) so plain callers stay simple.
            const steps = Array.isArray(payloadInput.steps) && payloadInput.steps.length > 0
                ? payloadInput.steps
                : [{
                    id: 'step-1',
                    type,
                    status: 'pending',
                    payload: payloadInput.payload || {},
                    result: null,
                    artifacts: [],
                    error: null,
                    history: []
                }];

            // @ts-ignore
            const added = await models.SocialAiChartJob.add({
                type,
                steps: JSON.stringify(steps),
                payload: typeof payloadInput.payload === 'string'
                    ? payloadInput.payload
                    : JSON.stringify(payloadInput.payload || {}),
                result: payloadInput.result
                    ? (typeof payloadInput.result === 'string' ? payloadInput.result : JSON.stringify(payloadInput.result))
                    : null,
                source_path: payloadInput.source_path || null,
                preview_url: payloadInput.preview_url || null,
                project_id: projectId,
                user_id: targetUserId || currentUserId,
                group_id: groupId
            }, frame.options);

            // M2: a new job may flip the project status (draft → active).
            if (projectId) {
                await recalcProjectStatus(models.Base.knex, projectId);
            }

            // Link source/preview assets by stamping chart_job_id on them
            // (plain link, NOT a FK — artifacts are finalized before the job row
            // exists, and worker-written assets are linked post-completion).
            // Best-effort: a link failure must never fail job creation.
            try {
                const jobId = added?.id || payloadInput.id;
                const assetUrls = [payloadInput.source_path, payloadInput.preview_url]
                    .map(u => String(u || '').trim())
                    .filter(u => /^https?:\/\//i.test(u));
                if (jobId && assetUrls.length) {
                    await models.Base.knex('social_media_assets')
                        .whereIn('storage_url', assetUrls)
                        .update({chart_job_id: jobId});
                }
            } catch (err) {
                logging.warn(`[social-ai-chart-jobs] asset link failed for job ${added?.id}: ${err?.message || err}`);
            }

            return added;
        }
    },

    // @ts-ignore
    cancel: {
        options: ['id'],
        permissions: false,
        async query(frame) {
            const knex = models.Base.knex;
            const currentUserId = getCurrentUserId(frame);
            // Load the RAW row — the model's toJSON strips `updated_by`, and the
            // column is NOT NULL, so the fallback below would collapse to null.
            const row = await loadRowOrThrow(knex, getJobId(frame));
            await assertCanWriteRow({ frame, row });

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
                    updated_by: currentUserId || row.updated_by || row.user_id
                });

            // M2: project status may flip active → completed.
            await recalcProjectStatus(knex, row.project_id);

            return {
                ...serializeRow({
                    ...row,
                    status: 'canceled'
                })
            };
        }
    },

    // @ts-ignore
    rerun: {
        options: ['id'],
        permissions: false,
        async query(frame) {
            const knex = models.Base.knex;
            const payloadInput = getActionPayload(frame);
            const row = await loadRowOrThrow(knex, getJobId(frame));
            await assertCanWriteRow({ frame, row });

            // A claimed (running) job must not be rerun under an active worker —
            // cancel first (or wait for the lease to expire).
            if (row.status === 'running') {
                throw new errors.ValidationError({
                    message: tpl(messages.invalidTransition)
                });
            }

            const now = nowMySql();
            const steps = parseJson(row.steps, []);
            const partial = payloadInput.partial_payload
                && typeof payloadInput.partial_payload === 'object'
                ? payloadInput.partial_payload
                : null;

            for (const step of steps) {
                if (step.status === 'failed' || step.status === 'completed' || step.status === 'canceled') {
                    step.status = 'pending';
                    step.result = null;
                    step.error = null;
                    step.history = Array.isArray(step.history)
                        ? [...step.history, {action: 'rerun', at: now}]
                        : [{action: 'rerun', at: now}];
                }
                if (partial) {
                    step.payload = {...(step.payload || {}), ...partial};
                }
            }

            await knex(TABLE)
                .where({ id: row.id })
                .update({
                    status: 'queued',
                    steps: JSON.stringify(steps),
                    error: null,
                    progress: 0,
                    claim_worker_id: null,
                    claim_expires_at: null,
                    completed_at: null,
                    updated_at: now,
                    updated_by: row.updated_by || row.user_id
                });

            // M2: rerun may flip the project status (completed → active).
            await recalcProjectStatus(knex, row.project_id);

            const next = await loadRowOrThrow(knex, row.id);
            return serializeRow(next);
        }
    },

    // @ts-ignore
    destroy: {
        options: ['id'],
        permissions: false,
        async query(frame) {
            const knex = models.Base.knex;
            const row = await loadRowOrThrow(knex, getJobId(frame));
            await assertCanWriteRow({ frame, row });

            // Review MAJOR 4 (2026-08-08): reject deleting a queued/running
            // job — it would strand the worker mid-run and race its lease
            // updates (mirrors the project destroy M7 guard). The host maps
            // this to 409.
            if (['queued', 'running'].includes(row.status)) {
                throw new errors.ValidationError({
                    message: tpl(messages.activeJobs)
                });
            }

            // Best-effort cleanup of gallery-bucket objects for this job
            // (gallery/chart_jobs/{jobId}/). S3 cleanup must not block the DB
            // delete, so it is wrapped and only logged on failure.
            try {
                const mediaStore = storage.getStorage('media');
                const deleteKey = async (key) => {
                    const clean = String(key || '').replace(/^\/+/, '').trim();
                    if (!clean) {
                        return;
                    }
                    const parts = clean.split('/');
                    const name = parts.pop();
                    const dir = parts.join('/');
                    await mediaStore.delete(name, dir);
                };
                if (mediaStore && typeof mediaStore.delete === 'function') {
                    if (typeof mediaStore.list === 'function') {
                        const root = mediaStore.pathPrefix || mediaStore.storagePath || '';
                        const prefix = [root, 'gallery', 'chart_jobs', row.id]
                            .filter(Boolean)
                            .join('/')
                            .replace(/\/+/g, '/');
                        let cursor = null;
                        do {
                            const listed = await mediaStore.list({prefix, limit: 1000, continuationToken: cursor});
                            const items = Array.isArray(listed?.items) ? listed.items : [];
                            for (const item of items) {
                                await deleteKey(item.key || item.path);
                            }
                            cursor = listed?.nextCursor || null;
                        } while (cursor);
                    }
                    if (row.preview_url && typeof mediaStore.urlToPath === 'function') {
                        await deleteKey(mediaStore.urlToPath(row.preview_url));
                    }
                }
            } catch (err) {
                logging.warn(`[social-ai-chart-jobs] gallery S3 cleanup failed for job ${row.id}: ${err?.message || err}`);
            }

            // Remove this job's asset row(s). chart_job_id is a plain link (no
            // ON DELETE CASCADE), so delete explicitly.
            // H3 (review 2026-08-07): for project-scoped jobs ONLY the
            // working-area rows (storage_key …/jobs/{jobId}/…) are removed —
            // artifacts rows use stable paths that other jobs may reference and
            // must survive until project deletion. Legacy (project_id null) jobs
            // own every row they created, so all of them are removed.
            try {
                await knex('social_media_assets')
                    .where(function () {
                        if (row.project_id) {
                            this.whereRaw('storage_key LIKE ?', [`%/jobs/${row.id}/%`]);
                        } else {
                            this.where('chart_job_id', row.id);
                        }
                    })
                    .orWhereRaw('storage_key LIKE ?', [`%gallery/chart_jobs/${row.id}/%`])
                    .del();
            } catch (err) {
                logging.warn(`[social-ai-chart-jobs] asset row cleanup failed for job ${row.id}: ${err?.message || err}`);
            }

            // Junction rows (social_ai_chart_job_media) cascade via the
            // chart_job_id FK.
            await knex(TABLE).where({id: row.id}).del();

            // M2: a project with no remaining jobs flips back to draft.
            await recalcProjectStatus(knex, row.project_id);

            return {
                ...serializeRow({
                    ...row,
                    status: 'deleted'
                })
            };
        }
    },

    // @ts-ignore
    claim: {
        permissions: false,
        async query(frame) {
            const knex = models.Base.knex;
            // Worker endpoints (claim/progress/complete/fail/linkAssets) are
            // integration-context only — a browser session user must not be able
            // to manipulate queue state (H2, review 2026-08-07).
            if (!getCurrentIntegrationId(frame)) {
                throw new errors.NoPermissionError({
                    message: tpl(messages.userRequired)
                });
            }

            const payloadInput = getActionPayload(frame);
            // @ts-ignore
            const workerId = payloadInput.worker_id || frame.options?.worker_id || 'runner';
            // Clamp the lease TTL — a caller must not lock the whole queue for a day.
            const claimTtlSeconds = Math.min(600, Math.max(60, Number(payloadInput.claim_ttl_seconds || 300)));
            const nowDate = new Date();
            const expiresAt = new Date(nowDate.getTime() + claimTtlSeconds * 1000);
            const now = nowMySql();
            const claimExpiresAt = expiresAt.toISOString().slice(0, 19).replace('T', ' ');

            // Candidate selection (non-locking — the transition below is atomic).
            const candidate = await knex(TABLE)
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

            if (!candidate) {
                return [];
            }

            // Atomic conditional claim (H1, TOCTOU fix): only one worker wins the
            // queued→running transition per candidate; the loser gets 0 affected
            // rows and must not proceed. MySQL UPDATE ... ORDER BY ... LIMIT 1.
            const affected = await knex(TABLE)
                .where({ id: candidate.id })
                .where(function () {
                    this.where('status', 'queued').orWhere(function () {
                        this.where('status', 'running').andWhere('claim_expires_at', '<', now);
                    });
                })
                .andWhere(function () {
                    this.whereNull('claim_expires_at').orWhere('claim_expires_at', '<', now);
                })
                .update({
                    status: 'running',
                    claim_worker_id: workerId,
                    claim_expires_at: claimExpiresAt,
                    started_at: knex.raw('COALESCE(started_at, ?)', [now]),
                    updated_at: now,
                    updated_by: knex.raw('COALESCE(updated_by, user_id)')
                });

            if (!affected) {
                // Another worker claimed this job between SELECT and UPDATE.
                return [];
            }

            // A step left `running` by a dead worker (lease expired) returns to
            // `pending` so the resumed run continues from N+1 — never re-runs all.
            const row = await loadRowOrThrow(knex, candidate.id);
            const steps = parseJson(row.steps, []);
            let stepsChanged = false;
            for (const step of steps) {
                // `row` was reloaded AFTER the claim UPDATE, so its claim_expires_at is the
                // NEW future lease. Test the PRE-UPDATE snapshot (candidate) — the job we just
                // took over had an expired/absent lease, so any still-`running` step is stale.
                if (step.status === 'running' && (candidate.claim_expires_at < now || !candidate.claim_expires_at)) {
                    step.status = 'pending';
                    stepsChanged = true;
                }
            }
            if (stepsChanged) {
                await knex(TABLE)
                    .where({ id: row.id })
                    .update({steps: JSON.stringify(steps), updated_at: now});
            }

            const claimed = await loadRowOrThrow(knex, row.id);
            return serializeRow(claimed);
        }
    },

    // @ts-ignore
    progress: {
        options: ['id'],
        permissions: false,
        async query(frame) {
            const knex = models.Base.knex;
            const payloadInput = getActionPayload(frame);
            // @ts-ignore
            const row = await loadRowOrThrow(knex, getJobId(frame));
            const caller = await assertWorkerContext(frame, row);
            const now = nowMySql();

            // Worker checkpoint: {processed_count, last_name, cursor, …} merged
            // into the RUNNING step's progress object so an interrupted long job
            // resumes at N+1 (manifest re-read + continue), never from scratch.
            const steps = parseJson(row.steps, []);
            const checkpoint = payloadInput.checkpoint && typeof payloadInput.checkpoint === 'object'
                ? payloadInput.checkpoint
                : null;
            if (checkpoint) {
                for (const step of steps) {
                    if (step.status === 'running') {
                        step.progress = {...(step.progress || {}), ...checkpoint};
                    }
                }
            }

            // Lease renewal is server-computed — the client may NOT extend its
            // own lease or hijack another worker's (M3).
            const isHolder = row.status === 'running' && row.claim_worker_id && caller === row.claim_worker_id;

            await knex(TABLE)
                .where({ id: row.id })
                .update({
                    progress: Number(payloadInput.progress ?? row.progress),
                    status: payloadInput.status || row.status,
                    error: payloadInput.error ?? row.error,
                    steps: JSON.stringify(steps),
                    claim_expires_at: isHolder ? extendLeaseAt() : row.claim_expires_at,
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
        permissions: false,
        async query(frame) {
            const knex = models.Base.knex;
            const payloadInput = getActionPayload(frame);
            // @ts-ignore
            const row = await loadRowOrThrow(knex, getJobId(frame));
            await assertWorkerContext(frame, row);
            const now = nowMySql();

            const steps = parseJson(row.steps, []);
            const stepId = payloadInput.step_id || (steps[0] && steps[0].id);
            const step = steps.find(s => s.id === stepId);
            if (step) {
                step.status = 'completed';
                step.completed_at = now;
                if (payloadInput.result) {
                    step.result = typeof payloadInput.result === 'string'
                        ? parseJson(payloadInput.result, payloadInput.result)
                        : payloadInput.result;
                }
                if (Array.isArray(payloadInput.artifacts)) {
                    step.artifacts = payloadInput.artifacts;
                }
                step.history = Array.isArray(step.history)
                    ? [...step.history, {action: 'completed', at: now}]
                    : [{action: 'completed', at: now}];
            }

            const jobStatus = deriveJobStatus(steps);

            await knex(TABLE)
                .where({ id: row.id })
                .update({
                    status: jobStatus,
                    steps: JSON.stringify(steps),
                    result: payloadInput.result
                        ? (typeof payloadInput.result === 'string' ? payloadInput.result : JSON.stringify(payloadInput.result))
                        : row.result,
                    progress: jobStatus === 'completed' ? 100 : row.progress,
                    completed_at: jobStatus === 'completed' ? now : null,
                    claim_worker_id: null,
                    claim_expires_at: null,
                    updated_at: now,
                    updated_by: row.updated_by || row.user_id
                });

            // M2: job completion may flip the project status (active → completed).
            await recalcProjectStatus(knex, row.project_id);

            const next = await loadRowOrThrow(knex, row.id);
            return serializeRow(next);
        }
    },

    // @ts-ignore
    linkAssets: {
        options: ['id'],
        permissions: false,
        async query(frame) {
            const knex = models.Base.knex;
            if (!getCurrentIntegrationId(frame)) {
                throw new errors.NoPermissionError({
                    message: tpl(messages.userRequired)
                });
            }
            const row = await loadRowOrThrow(knex, getJobId(frame));
            const payloadInput = getActionPayload(frame);
            const assets = Array.isArray(payloadInput.assets) ? payloadInput.assets : [];
            const removedKeys = Array.isArray(payloadInput.removed_keys)
                ? payloadInput.removed_keys.map(String).map((s) => String(s).trim()).filter(Boolean)
                : [];
            const mediaIds = [];

            // Register worker-written S3 artifacts in social_media_assets +
            // social_ai_chart_job_media so the gallery can show them
            // (docs/chart-job-agent-design-addendum.md §3).
            // H1 (review 2026-08-07): the idempotency key is storage_key_hash
            // ALONE. A DIFFERENT job re-publishing the same artifacts path
            // (e.g. J2 image-fetch → J6 image-generate overwrite) must reuse
            // the existing row and re-point chart_job_id at the latest
            // publisher — never create a duplicate (rerun/overwrite never dupes).
            for (const asset of assets) {
                const storageKey = String(asset.storage_key || '').trim();
                const storageUrl = String(asset.storage_url || '').trim();
                if (!storageKey || !storageUrl) {
                    continue;
                }
                const storageKeyHash = socialMediaAssets.buildStorageKeyHash(storageKey);
                const assetType = String(asset.asset_type || 'image').trim().toLowerCase();
                // L2/L3: whitelist role/source_kind, guard sort_order against NaN.
                const VALID_ROLES = ['input', 'source', 'material', 'intermediate', 'preview', 'output'];
                const VALID_SOURCE_KINDS = ['real', 'ai', 'interview'];
                const role = VALID_ROLES.includes(asset.role) ? asset.role : 'output';
                const sourceKind = VALID_SOURCE_KINDS.includes(asset.source_kind) ? asset.source_kind : null;
                const sortOrder = Number.isFinite(Number(asset.sort_order)) ? Math.max(0, Number(asset.sort_order)) : 0;
                const now = nowMySql();

                // upsert social_media_assets (lookup by storage_key_hash alone)
                let mediaId;
                const existing = await knex('social_media_assets')
                    .where({storage_key_hash: storageKeyHash})
                    .first();
                // project_id is written from the JOB (row.project_id), NOT from
                // the asset payload (worker has no auth context and cannot be
                // trusted with arbitrary project ids). A legacy job without a
                // project_id keeps the row's existing value (null for new rows).
                const jobProjectId = row.project_id || null;

                if (existing) {
                    // Same S3 key: latest publisher wins. chart_job_id is
                    // re-pointed; user/group fall back to existing values.
                    await knex('social_media_assets')
                        .where({id: existing.id})
                        .update({
                            storage_key: storageKey,
                            storage_url: storageUrl,
                            thumbnail_url: asset.thumbnail_url || existing.thumbnail_url || null,
                            original_filename: asset.original_filename || existing.original_filename || null,
                            asset_type: assetType,
                            chart_job_id: row.id,
                            // Backfill: older rows (pre project_id) get the
                            // project resolved from the publishing job.
                            project_id: jobProjectId || existing.project_id || null,
                            user_id: existing.user_id || row.user_id || null,
                            group_id: existing.group_id || row.group_id || null,
                            updated_at: now
                        });
                    mediaId = existing.id;
                } else {
                    mediaId = ObjectId().toHexString();
                    try {
                        await knex('social_media_assets')
                            .insert({
                                id: mediaId,
                                storage_key: storageKey,
                                storage_key_hash: storageKeyHash,
                                storage_url: storageUrl,
                                thumbnail_url: asset.thumbnail_url || null,
                                original_filename: asset.original_filename || null,
                                asset_type: assetType,
                                owner_scope: 'chart_jobs',
                                project_id: jobProjectId,
                                user_id: row.user_id || null,
                                group_id: row.group_id || null,
                                chart_job_id: row.id,
                                created_at: now,
                                updated_at: now
                            });
                    } catch (err) {
                        // M6: unique (chart_job_id, storage_key_hash) — a racing
                        // insert loses; fall back to updating the winner's row.
                        if (String(err?.code || '').toUpperCase() === 'ER_DUP_ENTRY') {
                            const dup = await knex('social_media_assets')
                                .where({storage_key_hash: storageKeyHash})
                                .first();
                            if (!dup) {
                                throw err;
                            }
                            await knex('social_media_assets')
                                .where({id: dup.id})
                                .update({
                                    storage_url: storageUrl,
                                    thumbnail_url: asset.thumbnail_url || dup.thumbnail_url || null,
                                    original_filename: asset.original_filename || dup.original_filename || null,
                                    asset_type: assetType,
                                    chart_job_id: row.id,
                                    updated_at: now
                                });
                            mediaId = dup.id;
                        } else {
                            throw err;
                        }
                    }
                }

                // upsert junction (role / source_kind / person / step)
                const existingJunction = await knex('social_ai_chart_job_media')
                    .where({chart_job_id: row.id, media_id: mediaId})
                    .first();
                if (existingJunction) {
                    await knex('social_ai_chart_job_media')
                        .where({id: existingJunction.id})
                        .update({
                            role: role || existingJunction.role,
                            source_kind: sourceKind || existingJunction.source_kind,
                            step_id: asset.step_id || existingJunction.step_id || null,
                            person_name: asset.person_name || existingJunction.person_name || null,
                            sort_order: Number.isFinite(Number(asset.sort_order))
                                ? Math.max(0, Number(asset.sort_order))
                                : existingJunction.sort_order,
                            caption: asset.caption || existingJunction.caption || null
                            // NB: social_ai_chart_job_media has no `updated_at` column — do not write it.
                        });
                } else {
                    await knex('social_ai_chart_job_media')
                        .insert({
                            id: ObjectId().toHexString(),
                            chart_job_id: row.id,
                            media_id: mediaId,
                            role,
                            source_kind: sourceKind,
                            step_id: asset.step_id || null,
                            person_name: asset.person_name || null,
                            sort_order: sortOrder,
                            caption: asset.caption || null,
                            created_at: now
                        });
                }

                mediaIds.push(mediaId);
            }

            // Removed keys (S3 objects deleted by publishJob's stale per-person
            // cleanup) must also drop their social_media_assets rows — a deleted
            // object keeps no gallery row (S3↔DB consistency, 2026-08-14).
            // Scope: chart_jobs owner rows only; the junction
            // social_ai_chart_job_media rows cascade via the media_id FK.
            // Deleting only rows whose storage_key is NOT re-registered in this
            // payload (a key can be both in assets[] and removed_keys[] when a
            // later entry re-publishes the same path — the asset wins).
            const removedSet = new Set(removedKeys);
            for (const key of removedSet) {
                const stillRegistered = assets.some((a) =>
                    String(a.storage_key || '').trim() === key);
                if (stillRegistered) {
                    continue;
                }
                await knex('social_media_assets')
                    .where({storage_key: key, owner_scope: 'chart_jobs'})
                    .del();
            }

            return {
                media_ids: mediaIds,
                count: mediaIds.length,
                removed_count: removedKeys.length
            };
        }
    },

    // @ts-ignore
    fail: {
        options: ['id'],
        permissions: false,
        async query(frame) {
            const knex = models.Base.knex;
            const payloadInput = getActionPayload(frame);
            // @ts-ignore
            const row = await loadRowOrThrow(knex, getJobId(frame));
            await assertWorkerContext(frame, row);
            const now = nowMySql();

            const steps = parseJson(row.steps, []);
            const stepId = payloadInput.step_id || (steps[0] && steps[0].id);
            const step = steps.find(s => s.id === stepId);
            if (step) {
                step.status = 'failed';
                step.error = payloadInput.error || step.error;
                step.history = Array.isArray(step.history)
                    ? [...step.history, {action: 'failed', at: now, error: payloadInput.error || null}]
                    : [{action: 'failed', at: now, error: payloadInput.error || null}];
            }

            await knex(TABLE)
                .where({ id: row.id })
                .update({
                    status: 'failed',
                    steps: JSON.stringify(steps),
                    error: payloadInput.error || row.error,
                    claim_worker_id: null,
                    claim_expires_at: null,
                    updated_at: now,
                    updated_by: row.updated_by || row.user_id
                });

            // M2: a failed job is terminal at the project level.
            await recalcProjectStatus(knex, row.project_id);

            const next = await loadRowOrThrow(knex, row.id);
            return serializeRow(next);
        }
    }
};

module.exports = controller;
