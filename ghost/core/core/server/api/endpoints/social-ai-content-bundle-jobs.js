const errors = require('@tryghost/errors');
const models = require('../../models');
const ObjectId = require('bson-objectid').default;

const TABLE = 'social_ai_content_bundle_jobs';
const DOC_NAME = 'socialaicontentbundlejobs';
const ADMIN_ROLES = new Set(['Owner', 'Administrator', 'Admin']);
const now = () => new Date().toISOString().slice(0, 19).replace('T', ' ');
const parseJson = (value, fallback) => {
    if (value === null || value === undefined || value === '') return fallback;
    try { return JSON.parse(value); } catch (e) { return fallback; }
};
const getPayload = frame => frame.data?.socialaicontentbundlejobs?.[0] || frame.data || {};
const currentUser = frame => frame.options?.context?.user || null;
const integration = frame => frame.options?.context?.integration || null;
const jobId = frame => frame.options?.id || frame.data?.id || null;

const defaultSteps = () => [
    ['reference-ingest', 'Read reference input'],
    ['manifest-validate', 'Validate ContentBundle manifest'],
    ['asset-stage', 'Stage media assets'],
    ['asset-process', 'Process media artifacts'],
    ['manifest-finalize', 'Finalize artifact manifest']
].map(([id, label]) => ({id, type: id, label, status: 'pending', progress: 0, checkpoint: null, result: null, error: null}));

const deriveStatus = steps => {
    if (!steps.length) return 'queued';
    if (steps.every(step => step.status === 'completed')) return 'completed';
    if (steps.some(step => step.status === 'failed')) return 'failed';
    if (steps.some(step => step.status === 'running')) return 'running';
    return 'queued';
};

const serialize = row => ({
    id: row.id,
    job_id: row.id,
    type: row.type,
    status: row.status,
    progress: row.progress,
    current_step_id: row.current_step_id || null,
    status_message: row.status_message || null,
    steps: parseJson(row.steps, []),
    manifest: parseJson(row.manifest, {}),
    result: parseJson(row.result, {}),
    artifacts: parseJson(row.artifacts, []),
    error_code: row.error_code || null,
    error_message: row.error_message || null,
    project_id: row.project_id || null,
    user_id: row.user_id || null,
    group_id: row.group_id || null,
    scope_type: row.scope_type || 'user',
    claim_worker_id: row.claim_worker_id || null,
    claim_expires_at: row.claim_expires_at || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    started_at: row.started_at || null,
    completed_at: row.completed_at || null
});

const isAdmin = async userId => {
    if (!userId) return false;
    const user = await models.User.findOne({id: userId}, {withRelated: ['roles']});
    return Boolean(user?.related('roles')?.models?.some(role => ADMIN_ROLES.has(role.get('name'))));
};

const assertAccess = async (frame, row, write = false) => {
    const actor = currentUser(frame);
    if (integration(frame) || await isAdmin(actor)) return;
    if (!actor || row.user_id !== actor) throw new errors.NoPermissionError({message: 'You are not allowed to access this content bundle job.'});
    if (write && row.group_id) {
        const group = await models.SocialGroup.findOne({id: row.group_id});
        if (!group || !(await models.SocialGroup.canAccessGroup(group, actor, 'write'))) {
            throw new errors.NoPermissionError({message: 'You are not allowed to write this content bundle job.'});
        }
    }
};

const loadRow = async id => {
    if (!id) throw new errors.ValidationError({message: '`id` is required.'});
    const row = await models.Base.knex(TABLE).where({id}).first();
    if (!row) throw new errors.NotFoundError({message: 'Content bundle job not found.'});
    return row;
};

const controller = {
    docName: 'socialaicontentbundlejobs',
    browse: {
        permissions: false,
        async query(frame) {
            const actor = currentUser(frame);
            const options = frame.options || {};
            const query = models.Base.knex(TABLE).select('*').orderBy('updated_at', 'desc');
            if (!integration(frame) && !(await isAdmin(actor))) query.where('user_id', actor);
            if (options.project_id) query.where('project_id', options.project_id);
            if (options.status) query.where('status', options.status);
            const rows = await query.limit(Math.min(200, Number(options.limit || 50)));
            return rows.map(serialize);
        }
    },
    read: {
        permissions: false,
        async query(frame) {
            const row = await loadRow(jobId(frame));
            await assertAccess(frame, row);
            return await models.SocialAiContentBundleJob.findOne({id: row.id});
        }
    },
    add: {
        statusCode: 201,
        permissions: false,
        async query(frame) {
            const payload = getPayload(frame);
            const actor = currentUser(frame) || payload.user_id;
            if (!actor && !integration(frame)) throw new errors.NoPermissionError({message: 'A user is required.'});
            if (payload.project_id) {
                const project = await models.SocialAiProject.findOne({id: payload.project_id});
                if (!project) throw new errors.NotFoundError({message: 'Project not found.'});
            }
            const manifest = typeof payload.manifest === 'string' ? parseJson(payload.manifest, null) : payload.manifest;
            if (!manifest || manifest.schemaVersion !== 'content-bundle/v1') {
                throw new errors.ValidationError({message: 'A content-bundle/v1 manifest is required.'});
            }
            const id = payload.id || ObjectId().toHexString();
            const timestamp = now();
            const steps = Array.isArray(payload.steps) && payload.steps.length ? payload.steps : defaultSteps();
            await models.Base.knex(TABLE).insert({
                id,
                type: payload.type || 'content-bundle',
                status: 'queued',
                progress: 0,
                current_step_id: steps[0]?.id || null,
                status_message: 'Queued',
                steps: JSON.stringify(steps),
                manifest: JSON.stringify(manifest),
                result: null,
                artifacts: null,
                project_id: payload.project_id || null,
                user_id: actor || null,
                group_id: payload.group_id || null,
                scope_type: payload.scope_type || manifest.targetScope || 'user',
                created_at: timestamp,
                created_by: actor,
                updated_at: timestamp,
                updated_by: actor
            });
            return await models.SocialAiContentBundleJob.findOne({id});
        }
    },
    claim: {
        permissions: false,
        async query(frame) {
            if (!integration(frame)) throw new errors.NoPermissionError({message: 'Worker integration is required.'});
            const workerId = String(getPayload(frame).worker_id || 'content-bundle-runner');
            const timestamp = now();
            const lease = new Date(Date.now() + 300000).toISOString().slice(0, 19).replace('T', ' ');
            const row = await models.Base.knex(TABLE).where(function () {
                this.where('status', 'queued').orWhere(function () { this.where('status', 'running').andWhere('claim_expires_at', '<', timestamp); });
            }).orderBy('updated_at', 'asc').first();
            if (!row) return [];
            const affected = await models.Base.knex(TABLE).where({id: row.id}).where(function () {
                this.where('status', 'queued').orWhere(function () { this.where('status', 'running').andWhere('claim_expires_at', '<', timestamp); });
            }).update({status: 'running', claim_worker_id: workerId, claim_expires_at: lease, started_at: row.started_at || timestamp, updated_at: timestamp, updated_by: row.updated_by || row.user_id});
            if (!affected) return [];
            return serialize(await loadRow(row.id));
        }
    },
    progress: {
        permissions: false,
        async query(frame) {
            if (!integration(frame)) throw new errors.NoPermissionError({message: 'Worker integration is required.'});
            const row = await loadRow(jobId(frame));
            const payload = getPayload(frame);
            if (row.status === 'canceled' || (row.claim_worker_id && payload.claim_worker_id !== row.claim_worker_id)) throw new errors.ValidationError({message: 'Invalid job transition.'});
            const steps = parseJson(row.steps, []);
            const step = steps.find(item => item.id === payload.step_id) || steps.find(item => item.status === 'running');
            if (step) {
                step.status = 'running';
                step.progress = Number(payload.step_progress ?? step.progress ?? 0);
                if (payload.checkpoint) step.checkpoint = payload.checkpoint;
            }
            const timestamp = now();
            await models.Base.knex(TABLE).where({id: row.id}).update({
                status: 'running', progress: Math.min(100, Math.max(0, Number(payload.progress ?? row.progress))),
                current_step_id: payload.step_id || row.current_step_id, status_message: payload.status_message || row.status_message,
                steps: JSON.stringify(steps), claim_expires_at: new Date(Date.now() + 300000).toISOString().slice(0, 19).replace('T', ' '),
                updated_at: timestamp, updated_by: row.updated_by || row.user_id
            });
            return serialize(await loadRow(row.id));
        }
    },
    complete: {
        permissions: false,
        async query(frame) {
            if (!integration(frame)) throw new errors.NoPermissionError({message: 'Worker integration is required.'});
            const row = await loadRow(jobId(frame));
            const payload = getPayload(frame);
            const steps = parseJson(row.steps, []);
            const step = steps.find(item => item.id === payload.step_id) || steps.find(item => item.status === 'running');
            if (step) { step.status = 'completed'; step.progress = 100; step.result = payload.result || null; step.artifacts = payload.artifacts || []; step.completed_at = now(); }
            const status = deriveStatus(steps);
            await models.Base.knex(TABLE).where({id: row.id}).update({status, progress: status === 'completed' ? 100 : row.progress, steps: JSON.stringify(steps), result: payload.result ? JSON.stringify(payload.result) : row.result, artifacts: payload.artifacts ? JSON.stringify(payload.artifacts) : row.artifacts, completed_at: status === 'completed' ? now() : null, claim_worker_id: null, claim_expires_at: null, updated_at: now(), updated_by: row.updated_by || row.user_id});
            return serialize(await loadRow(row.id));
        }
    },
    fail: {
        permissions: false,
        async query(frame) {
            if (!integration(frame)) throw new errors.NoPermissionError({message: 'Worker integration is required.'});
            const row = await loadRow(jobId(frame));
            const payload = getPayload(frame);
            const steps = parseJson(row.steps, []);
            const step = steps.find(item => item.id === payload.step_id) || steps.find(item => item.status === 'running');
            if (step) { step.status = 'failed'; step.error = payload.error_message || payload.error_code || 'step failed'; }
            await models.Base.knex(TABLE).where({id: row.id}).update({status: 'failed', error_code: payload.error_code || 'step_failed', error_message: payload.error_message || 'Content bundle step failed', steps: JSON.stringify(steps), claim_worker_id: null, claim_expires_at: null, updated_at: now(), updated_by: row.updated_by || row.user_id});
            return serialize(await loadRow(row.id));
        }
    },
    cancel: {
        permissions: false,
        async query(frame) {
            const row = await loadRow(jobId(frame));
            await assertAccess(frame, row, true);
            if (!['queued', 'running'].includes(row.status)) throw new errors.ValidationError({message: 'Invalid job transition.'});
            await models.Base.knex(TABLE).where({id: row.id}).update({status: 'canceled', completed_at: now(), updated_at: now(), updated_by: currentUser(frame) || row.updated_by || row.user_id});
            return serialize(await loadRow(row.id));
        }
    }
};

module.exports = controller;
