const tpl = require('@tryghost/tpl');
const {randomUUID} = require('crypto');
const errors = require('@tryghost/errors');
const logging = require('@tryghost/logging');
const models = require('../../models');
const ObjectId = require('bson-objectid').default;
const storage = require('../../adapters/storage');
const socialMediaAssets = require('./utils/social-media-assets');
const staffScope = require('./utils/staff-scope');
const {validateVideoJobPayload, estimate} = require('./utils/video-job-payload');
const {assertAssetsUsable} = require('./utils/video-asset-access');
const {isIntegrationRequest} = require('./utils/integration-context');

// Video family — job endpoint (front repo docs/planning/video-job-runner-plan.md).
//
// Copied from social-ai-news-jobs.js and cut down: same table shape, same atomic
// claim with a generation-fenced lease (claim_protocol 2), same worker-only
// progress / complete / fail / link-assets. What is NOT copied: the newsroom
// read rules and the virtual-broadcast guards — those are news-only. A video job
// is readable / writable by its creator and by a system admin (and by the worker
// integration).
//
// A SEPARATE FAMILY: one table, one asset link column (video_job_id), one
// junction, one owner_scope ('video_jobs'), one S3 prefix. The news and media
// workers never see these jobs (their claim endpoints read other tables).
const messages = {
    userRequired: 'A user is required.',
    workerRequired: 'Worker integration is required.',
    activeJob: 'A queued or running video job cannot be deleted.',
    // Same spelling as chart/news: workers match this string to treat a canceled
    // job's late ticks as a quiet skip.
    invalidTransition: 'The requested job transition is not allowed.',
    notLeaseHolder: 'This worker does not hold the job lease.'
};

const TABLE = 'social_ai_video_jobs';
const JUNCTION = 'social_ai_video_job_media';
const CONSENTS = 'social_ai_avatar_consents';
const OWNER_SCOPE = 'video_jobs';
const LEASE_LOST = 'VIDEO_JOB_LEASE_LOST';

const DEFAULT_JOB_TYPE = 'video-render';
const JOB_TYPES = new Set([DEFAULT_JOB_TYPE]);

const TERMINAL_ITEM_STATUSES = new Set(['completed', 'failed', 'skipped']);
const VALID_ROLES = ['input', 'source', 'material', 'intermediate', 'preview', 'output'];
const VALID_SOURCE_KINDS = ['real', 'ai'];

const now = () => new Date().toISOString().slice(0, 19).replace('T', ' ');
const leaseExpiry = () => new Date(Date.now() + 300000).toISOString().slice(0, 19).replace('T', ' ');

// @ts-ignore
const getPayload = frame => frame.data?.socialaivideojobs?.[0] || {};
// Worker endpoints post a bare body; the admin API may wrap it in the docName key.
const getActionPayload = (frame) => {
    const payload = getPayload(frame);
    return Object.keys(payload).length > 0 ? payload : (frame.data || {});
};
// @ts-ignore
const currentUser = frame => frame.options?.context?.user || null;
// @ts-ignore
const jobId = frame => frame.options?.id || frame.data?.id || null;

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

const validateType = (value) => {
    const type = value === undefined ? DEFAULT_JOB_TYPE : value;
    if (typeof type !== 'string' || !JOB_TYPES.has(type.trim())) {
        throw new errors.ValidationError({message: 'Unsupported video job type.'});
    }
    return type.trim();
};

const acceptedTypes = (payloadInput) => {
    const types = payloadInput.accepted_types === undefined ? [DEFAULT_JOB_TYPE] : payloadInput.accepted_types;
    if (!Array.isArray(types) || !types.length
        || types.some(type => typeof type !== 'string' || !JOB_TYPES.has(type))) {
        throw new errors.ValidationError({message: 'accepted_types must be a nonempty array of supported video job types.'});
    }
    return [...new Set(types)];
};

// One pipeline step whose `type` is the job type (the worker's registry resolves
// steps by type, as in chart/news).
const buildSteps = (type, payload) => [{
    id: 'step-1',
    type,
    status: 'pending',
    payload,
    result: null,
    artifacts: [],
    error: null,
    history: []
}];

// Work list: one entry per line. The worker reports each line's voice / face
// state here. A failed line does NOT fail the job (plan §7.6: a line whose face
// failed is drawn with a still face) — the job settles from its steps.
const normalizeItems = (value) => {
    if (!Array.isArray(value)) {
        return null;
    }
    return value.slice(0, 200).map((item, index) => {
        const source = item && typeof item === 'object' ? item : {};
        const progress = Number(source.progress);
        return {
            key: String(source.key ?? index),
            status: source.status || 'pending',
            progress: Number.isFinite(progress) ? Math.max(0, Math.min(100, progress)) : 0,
            message: source.message ?? null,
            error: source.error ?? null,
            result: source.result ?? null,
            completed_at: source.completed_at ?? null
        };
    });
};

const itemsFromLines = payload => (Array.isArray(payload.lines) ? payload.lines : [])
    .map(line => ({key: line.key, status: 'pending', progress: 0, message: null, error: null, result: null, completed_at: null}));

const deriveProgressFromItems = (items) => {
    if (!items.length) {
        return null;
    }
    const done = items.filter(item => TERMINAL_ITEM_STATUSES.has(item.status)).length;
    return Math.round((done / items.length) * 100);
};

const summarizeItems = (items) => {
    if (!items.length) {
        return null;
    }
    const completed = items.filter(item => item.status === 'completed').length;
    const failed = items.filter(item => item.status === 'failed').length;
    const base = `${completed}/${items.length} lines`;
    return failed ? `${base}, ${failed} failed` : base;
};

const deriveStatus = (steps, previousStatus) => {
    if (steps.length && steps.every(step => step.status === 'completed')) {
        return 'completed';
    }
    if (steps.some(step => step.status === 'failed')) {
        return 'failed';
    }
    // A claimed job never falls back to `queued` (that is what claim picks up).
    return previousStatus && previousStatus !== 'queued' ? 'running' : 'queued';
};

const serialize = (row) => {
    const payload = parseJson(row.payload, {});
    return {
        id: row.id,
        job_id: row.id,
        type: row.type,
        status: row.status,
        progress: row.progress,
        current_step_id: row.current_step_id || null,
        status_message: row.status_message || null,
        steps: parseJson(row.steps, []),
        items: parseJson(row.items, []),
        payload,
        result: parseJson(row.result, {}),
        artifacts: parseJson(row.artifacts, []),
        estimate: estimate(payload),
        error_code: row.error_code || null,
        error_message: row.error_message || null,
        project_id: row.project_id || null,
        base_job_id: row.base_job_id || null,
        avatar_consent_id: row.avatar_consent_id || null,
        user_id: row.user_id || null,
        group_id: row.group_id || null,
        scope_type: row.scope_type || 'user',
        claim_generation: Number(row.claim_generation || 0),
        claim_worker_id: row.claim_worker_id || null,
        claim_expires_at: row.claim_expires_at || null,
        created_at: row.created_at,
        updated_at: row.updated_at,
        started_at: row.started_at || null,
        completed_at: row.completed_at || null
    };
};

const isSystemAdmin = async actor => Boolean(actor) && (await staffScope.getStaffScope(actor)).isSystemAdmin;

// Creator or system admin (or the worker integration). Writing a group job also
// needs write access to the group, as in news.
const assertAccess = async (frame, row, write = false) => {
    const actor = currentUser(frame);
    if (isIntegrationRequest(frame) || await isSystemAdmin(actor)) {
        return;
    }
    if (!actor || row.user_id !== actor) {
        throw new errors.NoPermissionError({message: 'You are not allowed to access this video job.'});
    }
    if (write && row.group_id) {
        // @ts-ignore
        const group = await models.SocialGroup.findOne({id: row.group_id});
        // @ts-ignore
        if (!group || !(await models.SocialGroup.canAccessGroup(group, actor, 'write'))) {
            throw new errors.NoPermissionError({message: 'You are not allowed to write this video job.'});
        }
    }
};

const loadRow = async (id) => {
    if (!id) {
        throw new errors.ValidationError({message: '`id` is required.'});
    }
    const row = await models.Base.knex(TABLE).where({id}).first();
    if (!row) {
        throw new errors.NotFoundError({message: 'Video job not found.'});
    }
    return row;
};

const assertOpen = (row) => {
    if (row.status === 'canceled' || row.status === 'completed' || row.status === 'failed') {
        throw new errors.ValidationError({message: tpl(messages.invalidTransition)});
    }
};

// Only the worker holding the current lease may move a running job forward. The
// video family starts on claim protocol 2, so every claimed row has a generation.
// A finished or canceled job answers with the transition refusal first (cancel
// clears the lease), so the worker treats its late ticks as a quiet skip.
const assertWorker = (frame, row) => {
    if (!isIntegrationRequest(frame)) {
        throw new errors.NoPermissionError({message: tpl(messages.workerRequired)});
    }
    assertOpen(row);
    const payload = getActionPayload(frame);
    const caller = String(payload.claim_worker_id || '').trim();
    const expires = row.claim_expires_at instanceof Date
        ? row.claim_expires_at.getTime() <= Date.now()
        : !row.claim_expires_at || row.claim_expires_at <= now();
    if (Number(row.claim_generation || 0) < 1 || !caller || caller !== row.claim_worker_id
        || typeof payload.claim_token !== 'string' || payload.claim_token !== row.claim_token
        || !Number.isSafeInteger(payload.claim_generation) || payload.claim_generation !== Number(row.claim_generation)
        || row.status !== 'running' || expires) {
        throw new errors.ValidationError({message: tpl(messages.notLeaseHolder), code: LEASE_LOST});
    }
};

// The lease credentials come from the request and are rechecked in SQL, so a
// reclaim between the read and the write fences the stale worker out.
const updateJob = async (frame, row, patch, knex = models.Base.knex) => {
    const payload = getActionPayload(frame);
    const query = knex(TABLE).where({
        id: row.id,
        status: 'running',
        claim_worker_id: payload.claim_worker_id,
        claim_token: payload.claim_token,
        claim_generation: payload.claim_generation
    }).where('claim_expires_at', '>', now());
    if (['completed', 'failed', 'canceled'].includes(patch.status)) {
        patch = {...patch, claim_token: null, claim_worker_id: null, claim_expires_at: null};
    }
    if (!(await query.update(patch))) {
        throw new errors.ValidationError({message: tpl(messages.notLeaseHolder), code: LEASE_LOST});
    }
};

// A talking face needs an active consent of the creator for this very photo, and
// the consent must allow lip-sync (sending the photo to the external AI).
const assertConsent = async (actor, validated) => {
    if (!validated.consentId) {
        return;
    }
    const consent = await models.Base.knex(CONSENTS).where({id: validated.consentId}).first();
    if (!consent || consent.revoked_at) {
        throw new errors.ValidationError({message: 'The avatar consent does not exist or was revoked.', code: 'VIDEO_JOB_CONSENT_REQUIRED'});
    }
    if (consent.user_id !== actor && !(await isSystemAdmin(actor))) {
        throw new errors.NoPermissionError({message: 'The avatar consent belongs to another user.'});
    }
    if (consent.photo_asset_id !== validated.photoAssetId) {
        throw new errors.ValidationError({message: 'The avatar consent is for a different photo.', code: 'VIDEO_JOB_CONSENT_REQUIRED'});
    }
    const uses = parseJson(consent.uses, []);
    if (validated.lipsync && !uses.includes('lipsync')) {
        throw new errors.ValidationError({message: 'The avatar consent does not allow lip-sync.', code: 'VIDEO_JOB_CONSENT_REQUIRED'});
    }
};

const canWriteGroup = async (actor, groupId) => {
    // @ts-ignore
    const group = await models.SocialGroup.findOne({id: groupId});
    // @ts-ignore
    return Boolean(group) && Boolean(await models.SocialGroup.canAccessGroup(group, actor, 'write'));
};

// Where the job lives: project, group and scope_type are decided here, never
// copied from the request as-is. The group comes from the (checked) project when
// there is one; a request group must match it. The creator needs write access to
// the group (or to be a system admin), and scope_type must match the group.
const resolveOwnership = async (actor, input) => {
    const admin = await isSystemAdmin(actor);
    let groupId = input.group_id ? String(input.group_id).trim() : null;
    const projectId = input.project_id ? String(input.project_id).trim() : null;
    if (projectId) {
        // @ts-ignore
        const project = await models.SocialAiProject.findOne({id: projectId});
        if (!project) {
            throw new errors.NotFoundError({message: 'Project not found.'});
        }
        const projectGroupId = project.get('group_id') || null;
        if (groupId && groupId !== projectGroupId) {
            throw new errors.ValidationError({message: 'group_id does not match the project.'});
        }
        groupId = projectGroupId;
        if (!admin && project.get('user_id') !== actor && !(projectGroupId && await canWriteGroup(actor, projectGroupId))) {
            throw new errors.NoPermissionError({message: 'You are not allowed to add jobs to this project.'});
        }
    }
    if (groupId && !admin && !(await canWriteGroup(actor, groupId))) {
        throw new errors.NoPermissionError({message: 'You are not allowed to add jobs to this group.'});
    }
    const scopeType = groupId ? 'group' : 'user';
    if (input.scope_type !== undefined && input.scope_type !== null && input.scope_type !== scopeType) {
        throw new errors.ValidationError({message: `scope_type must be '${scopeType}' for this job.`});
    }
    return {projectId, groupId, scopeType};
};

const controller = {
    docName: 'socialaivideojobs',

    browse: {
        options: ['limit', 'type', 'status', 'project_id', 'page', 'order', 'debug'],
        permissions: false,
        async query(frame) {
            const actor = currentUser(frame);
            const options = frame.options || {};
            const limit = Math.min(200, Math.max(1, Number(options.limit || 50) || 50));
            const query = models.Base.knex(TABLE).select('*').orderBy('updated_at', 'desc');
            if (!isIntegrationRequest(frame) && !(await isSystemAdmin(actor))) {
                if (!actor) {
                    throw new errors.NoPermissionError({message: tpl(messages.userRequired)});
                }
                query.where('user_id', actor);
            }
            if (options.project_id) {
                query.where('project_id', options.project_id);
            }
            if (options.status) {
                query.where('status', options.status);
            }
            if (options.type) {
                query.where('type', options.type);
            }
            const rows = await query.limit(limit);
            return {
                data: rows.map(serialize),
                meta: {pagination: {page: 1, limit, pages: 1, total: rows.length, next: null, prev: null}}
            };
        }
    },

    read: {
        options: ['id'],
        permissions: false,
        async query(frame) {
            const row = await loadRow(jobId(frame));
            await assertAccess(frame, row);
            return serialize(row);
        }
    },

    add: {
        statusCode: 201,
        headers: {cacheInvalidate: false},
        options: ['include', 'transacting'],
        permissions: false,
        async query(frame) {
            const payloadInput = getPayload(frame);
            // A job always belongs to a user (created_by is NOT NULL with a users FK).
            // An integration must name one explicitly.
            const actor = currentUser(frame)
                || (isIntegrationRequest(frame) ? String(payloadInput.user_id || '').trim() : '')
                || null;
            if (!actor) {
                throw new errors.NoPermissionError({message: tpl(messages.userRequired)});
            }
            const type = validateType(payloadInput.type);
            const validated = validateVideoJobPayload(payloadInput.payload);
            const owner = await models.Base.knex('users').where({id: actor}).first('id');
            if (!owner) {
                throw new errors.ValidationError({message: 'user_id does not exist.'});
            }
            const ownership = await resolveOwnership(actor, payloadInput);
            await assertAssetsUsable({
                knex: models.Base.knex,
                // @ts-ignore
                SocialGroup: models.SocialGroup,
                isSystemAdmin
            }, actor, validated.assetIds);
            await assertConsent(actor, validated);
            if (validated.baseJobId) {
                await assertAccess(frame, await loadRow(validated.baseJobId));
            }

            const id = ObjectId().toHexString();
            const timestamp = now();
            const steps = buildSteps(type, validated.payload);
            const items = itemsFromLines(validated.payload);

            await models.Base.knex(TABLE).insert({
                id,
                type,
                status: 'queued',
                progress: 0,
                current_step_id: steps[0].id,
                status_message: 'Queued',
                steps: JSON.stringify(steps),
                items: JSON.stringify(items),
                payload: JSON.stringify(validated.payload),
                result: null,
                artifacts: null,
                project_id: ownership.projectId,
                base_job_id: validated.baseJobId,
                avatar_consent_id: validated.consentId,
                user_id: actor,
                group_id: ownership.groupId,
                scope_type: ownership.scopeType,
                claim_generation: 0,
                created_at: timestamp,
                created_by: actor,
                updated_at: timestamp,
                updated_by: actor
            });
            return serialize(await loadRow(id));
        }
    },

    claim: {
        permissions: false,
        async query(frame) {
            const payloadInput = getActionPayload(frame);
            if (!isIntegrationRequest(frame)) {
                throw new errors.NoPermissionError({message: tpl(messages.workerRequired)});
            }
            const types = acceptedTypes(payloadInput);
            const workerId = String(payloadInput.worker_id || 'video-runner').trim();
            if (!workerId) {
                throw new errors.ValidationError({message: 'worker_id is required.'});
            }
            const timestamp = now();
            const claimable = function () {
                this.where('status', 'queued').orWhere(function () {
                    this.where('status', 'running').andWhere('claim_expires_at', '<', timestamp);
                });
            };
            const row = await models.Base.knex(TABLE).whereIn('type', types).where(claimable)
                .orderBy('updated_at', 'asc').first();
            if (!row) {
                // Empty queue: an empty list, so the worker sleeps instead of spinning.
                return [];
            }
            const generation = Number(row.claim_generation || 0);
            const claim = {
                status: 'running',
                claim_generation: generation + 1,
                claim_token: randomUUID(),
                claim_worker_id: workerId,
                claim_expires_at: leaseExpiry(),
                started_at: row.started_at || timestamp,
                updated_at: timestamp,
                updated_by: row.updated_by || row.user_id
            };
            const affected = await models.Base.knex(TABLE)
                .where({id: row.id, claim_generation: generation})
                .whereIn('type', types)
                .where(claimable)
                .update(claim);
            if (!affected) {
                return [];
            }
            return {...serialize({...row, ...claim}), claim_token: claim.claim_token};
        }
    },

    progress: {
        options: ['id'],
        permissions: false,
        async query(frame) {
            const payloadInput = getActionPayload(frame);
            const row = await loadRow(jobId(frame));
            assertWorker(frame, row);
            if (payloadInput.status && payloadInput.status !== 'running') {
                throw new errors.ValidationError({message: tpl(messages.invalidTransition)});
            }

            const steps = parseJson(row.steps, []);
            const step = steps.find(item => item.id === payloadInput.step_id)
                || steps.find(item => item.status === 'running')
                || steps.find(item => item.status === 'pending');
            if (step) {
                step.status = 'running';
                step.progress = Number(payloadInput.step_progress ?? payloadInput.progress ?? step.progress ?? 0);
                if (payloadInput.checkpoint) {
                    step.checkpoint = payloadInput.checkpoint;
                }
            }

            let items = parseJson(row.items, []);
            if (Array.isArray(payloadInput.items)) {
                items = normalizeItems(payloadInput.items) || [];
            } else if (payloadInput.item_key) {
                const item = items.find(entry => entry.key === String(payloadInput.item_key));
                if (item) {
                    item.status = payloadInput.item_status || 'running';
                    const itemProgress = Number(payloadInput.item_progress);
                    if (Number.isFinite(itemProgress)) {
                        item.progress = Math.max(0, Math.min(100, itemProgress));
                    }
                    if (payloadInput.item_error) {
                        item.error = String(payloadInput.item_error).slice(0, 500);
                    }
                    if (TERMINAL_ITEM_STATUSES.has(item.status)) {
                        item.completed_at = now();
                    }
                }
            }

            const derived = deriveProgressFromItems(items);
            const progress = Number.isFinite(Number(payloadInput.progress))
                ? Math.min(100, Math.max(0, Number(payloadInput.progress)))
                : (derived === null ? row.progress : derived);

            await updateJob(frame, row, {
                progress,
                current_step_id: payloadInput.step_id || row.current_step_id,
                status_message: String(payloadInput.status_message || summarizeItems(items) || row.status_message || '').slice(0, 500) || null,
                steps: JSON.stringify(steps),
                items: JSON.stringify(items),
                claim_expires_at: leaseExpiry(),
                updated_at: now(),
                updated_by: row.updated_by || row.user_id
            });
            return serialize(await loadRow(row.id));
        }
    },

    complete: {
        options: ['id'],
        permissions: false,
        async query(frame) {
            const payloadInput = getActionPayload(frame);
            const row = await loadRow(jobId(frame));
            assertWorker(frame, row);
            const timestamp = now();

            const steps = parseJson(row.steps, []);
            const stepId = String(payloadInput.step_id || '').trim();
            const step = stepId
                ? steps.find(item => item.id === stepId)
                : steps.find(item => item.status === 'running' || item.status === 'pending');
            if (step) {
                step.status = 'completed';
                step.progress = 100;
                step.result = payloadInput.result || null;
                step.artifacts = payloadInput.artifacts || [];
                step.completed_at = timestamp;
            }
            const items = Array.isArray(payloadInput.items)
                ? (normalizeItems(payloadInput.items) || [])
                : parseJson(row.items, []);
            const status = deriveStatus(steps, row.status);
            const finished = status === 'completed' || status === 'failed';

            await updateJob(frame, row, {
                status,
                progress: finished ? 100 : row.progress,
                status_message: String(payloadInput.status_message || summarizeItems(items) || row.status_message || '').slice(0, 500) || null,
                steps: JSON.stringify(steps),
                items: JSON.stringify(items),
                result: payloadInput.result ? JSON.stringify(payloadInput.result) : row.result,
                artifacts: payloadInput.artifacts ? JSON.stringify(payloadInput.artifacts) : row.artifacts,
                completed_at: finished ? timestamp : null,
                updated_at: timestamp,
                updated_by: row.updated_by || row.user_id
            });
            return serialize(await loadRow(row.id));
        }
    },

    fail: {
        options: ['id'],
        permissions: false,
        async query(frame) {
            const payloadInput = getActionPayload(frame);
            const row = await loadRow(jobId(frame));
            assertWorker(frame, row);
            const timestamp = now();
            const errorText = payloadInput.error || payloadInput.error_message || null;
            const steps = parseJson(row.steps, []);
            const stepId = payloadInput.step_id || (steps[0] && steps[0].id);
            const step = steps.find(item => item.id === stepId);
            if (step) {
                step.status = 'failed';
                step.error = errorText || step.error;
            }
            await updateJob(frame, row, {
                status: 'failed',
                error_code: String(payloadInput.error_code || 'step_failed').slice(0, 100),
                error_message: errorText ? String(errorText) : 'Video job step failed',
                result: payloadInput.result ? JSON.stringify(payloadInput.result) : row.result,
                steps: JSON.stringify(steps),
                completed_at: timestamp,
                updated_at: timestamp,
                updated_by: row.updated_by || row.user_id
            });
            return serialize(await loadRow(row.id));
        }
    },

    linkAssets: {
        options: ['id'],
        permissions: false,
        async query(frame) {
            const row = await loadRow(jobId(frame));
            assertWorker(frame, row);
            const payloadInput = getActionPayload(frame);
            const assets = Array.isArray(payloadInput.assets) ? payloadInput.assets : [];
            const removedKeys = Array.isArray(payloadInput.removed_keys)
                ? payloadInput.removed_keys.map(String).map(key => key.trim()).filter(Boolean)
                : [];

            const link = async (knex) => {
                const mediaIds = [];
                // Idempotency key is storage_key_hash (same rule as chart/news): a
                // re-run reuses the existing row and re-points video_job_id.
                for (const asset of assets) {
                    const storageKey = String(asset?.storage_key || '').trim();
                    const storageUrl = String(asset?.storage_url || '').trim();
                    if (!storageKey || !storageUrl) {
                        continue;
                    }
                    const storageKeyHash = socialMediaAssets.buildStorageKeyHash(storageKey);
                    const assetType = String(asset.asset_type || 'file').trim().toLowerCase();
                    const role = VALID_ROLES.includes(asset.role) ? asset.role : 'output';
                    const sourceKind = VALID_SOURCE_KINDS.includes(asset.source_kind) ? asset.source_kind : null;
                    const sortOrder = Number.isFinite(Number(asset.sort_order)) ? Math.max(0, Number(asset.sort_order)) : 0;
                    const timestamp = now();

                    let mediaId;
                    const existing = await knex('social_media_assets').where({storage_key_hash: storageKeyHash}).first();
                    if (existing) {
                        await knex('social_media_assets').where({id: existing.id}).update({
                            storage_key: storageKey,
                            storage_url: storageUrl,
                            thumbnail_url: asset.thumbnail_url || existing.thumbnail_url || null,
                            original_filename: asset.original_filename || existing.original_filename || null,
                            asset_type: assetType,
                            video_job_id: row.id,
                            project_id: row.project_id || existing.project_id || null,
                            user_id: existing.user_id || row.user_id || null,
                            group_id: existing.group_id || row.group_id || null,
                            updated_at: timestamp
                        });
                        mediaId = existing.id;
                    } else {
                        mediaId = ObjectId().toHexString();
                        // project_id / user_id / group_id come from the JOB, never
                        // from the worker's payload.
                        await knex('social_media_assets').insert({
                            id: mediaId,
                            storage_key: storageKey,
                            storage_key_hash: storageKeyHash,
                            storage_url: storageUrl,
                            thumbnail_url: asset.thumbnail_url || null,
                            original_filename: asset.original_filename || null,
                            asset_type: assetType,
                            owner_scope: OWNER_SCOPE,
                            project_id: row.project_id || null,
                            user_id: row.user_id || null,
                            group_id: row.group_id || null,
                            video_job_id: row.id,
                            created_at: timestamp,
                            updated_at: timestamp
                        });
                    }

                    const itemKey = String(asset.item_key || '').trim() || null;
                    const existingJunction = await knex(JUNCTION).where({video_job_id: row.id, media_id: mediaId}).first();
                    if (existingJunction) {
                        await knex(JUNCTION).where({id: existingJunction.id}).update({
                            role,
                            source_kind: sourceKind || existingJunction.source_kind,
                            step_id: asset.step_id || existingJunction.step_id || null,
                            item_key: itemKey || existingJunction.item_key || null,
                            sort_order: sortOrder,
                            caption: asset.caption || existingJunction.caption || null
                        });
                    } else {
                        await knex(JUNCTION).insert({
                            id: ObjectId().toHexString(),
                            video_job_id: row.id,
                            media_id: mediaId,
                            role,
                            source_kind: sourceKind,
                            step_id: asset.step_id || null,
                            item_key: itemKey,
                            sort_order: sortOrder,
                            caption: asset.caption || null,
                            created_at: timestamp
                        });
                    }
                    mediaIds.push(mediaId);
                }

                // A key the worker deleted from S3 must not keep its gallery row.
                // Scoped to this job and this family; junction rows cascade via FK.
                for (const key of new Set(removedKeys)) {
                    if (assets.some(asset => String(asset?.storage_key || '').trim() === key)) {
                        continue;
                    }
                    await knex('social_media_assets')
                        .where({storage_key: key, owner_scope: OWNER_SCOPE, video_job_id: row.id})
                        .del();
                }

                await updateJob(frame, row, {
                    artifacts: JSON.stringify([...parseJson(row.artifacts, []), ...assets]),
                    claim_expires_at: leaseExpiry(),
                    updated_at: now(),
                    updated_by: row.updated_by || row.user_id
                }, knex);

                return {media_ids: [...new Set(mediaIds)], count: mediaIds.length, removed_count: removedKeys.length};
            };
            return models.Base.knex.transaction(trx => link(trx));
        }
    },

    cancel: {
        options: ['id'],
        permissions: false,
        async query(frame) {
            const row = await loadRow(jobId(frame));
            await assertAccess(frame, row, true);
            const timestamp = now();
            const affected = await models.Base.knex(TABLE).where({id: row.id}).whereIn('status', ['queued', 'running']).update({
                status: 'canceled',
                claim_token: null,
                claim_worker_id: null,
                claim_expires_at: null,
                completed_at: timestamp,
                updated_at: timestamp,
                updated_by: currentUser(frame) || row.updated_by || row.user_id
            });
            if (!affected) {
                throw new errors.ValidationError({message: tpl(messages.invalidTransition)});
            }
            return serialize(await loadRow(row.id));
        }
    },

    destroy: {
        options: ['id'],
        permissions: false,
        async query(frame) {
            const knex = models.Base.knex;
            const row = await loadRow(jobId(frame));
            await assertAccess(frame, row, true);
            if (['queued', 'running'].includes(row.status)) {
                throw new errors.ValidationError({message: tpl(messages.activeJob)});
            }

            // Best-effort S3 cleanup of this job's gallery area
            // (gallery/video_jobs/{jobId}/). Never blocks the DB delete. The
            // worker's own work area (jobs bucket video-jobs/{jobId}/) is cleaned
            // by the host (front repo), as for the other families.
            try {
                const mediaStore = storage.getStorage('media');
                if (mediaStore && typeof mediaStore.delete === 'function' && typeof mediaStore.list === 'function') {
                    const root = mediaStore.pathPrefix || mediaStore.storagePath || '';
                    const prefix = [root, 'gallery', OWNER_SCOPE, row.id].filter(Boolean).join('/').replace(/\/+/g, '/');
                    let cursor = null;
                    do {
                        const listed = await mediaStore.list({prefix, limit: 1000, continuationToken: cursor});
                        for (const item of (Array.isArray(listed?.items) ? listed.items : [])) {
                            const clean = String(item.key || item.path || '').replace(/^\/+/, '').trim();
                            if (clean) {
                                const parts = clean.split('/');
                                const name = parts.pop();
                                await mediaStore.delete(name, parts.join('/'));
                            }
                        }
                        cursor = listed?.nextCursor || null;
                    } while (cursor);
                }
            } catch (err) {
                logging.warn(`[social-ai-video-jobs] gallery S3 cleanup failed for job ${row.id}: ${err?.message || err}`);
            }

            // video_job_id is a plain link (no FK), so delete rows explicitly. As
            // for news: a project-scoped job removes only its working area
            // (…/jobs/{jobId}/…); a job without a project owns every row it made.
            await knex('social_media_assets')
                .where(function () {
                    if (row.project_id) {
                        this.whereRaw('storage_key LIKE ?', [`%/jobs/${row.id}/%`]);
                    } else {
                        this.where('video_job_id', row.id);
                    }
                })
                .orWhereRaw('storage_key LIKE ?', [`%gallery/${OWNER_SCOPE}/${row.id}/%`])
                .del();

            // Junction rows cascade via the video_job_id FK.
            await knex(JUNCTION).where({video_job_id: row.id}).del();
            await knex(TABLE).where({id: row.id}).del();
            return serialize({...row, status: 'deleted'});
        }
    }
};

module.exports = controller;
