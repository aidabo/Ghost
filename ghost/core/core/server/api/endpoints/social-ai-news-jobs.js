const tpl = require('@tryghost/tpl');
const errors = require('@tryghost/errors');
const logging = require('@tryghost/logging');
const models = require('../../models');
const ObjectId = require('bson-objectid').default;
const storage = require('../../adapters/storage');
const socialMediaAssets = require('./utils/social-media-assets');

// News Agent — job endpoint.
//
// A SEPARATE FAMILY from chart (docs/architecture/job-runner-feature-playbook.md
// §1; user decision 2026-09-29): chart draws relationship diagrams, news makes
// news jobs. One family = one table = one `<name>_job_id` column = one
// owner_scope = one S3 work prefix. A news job id can never be written into
// chart_job_id, and this endpoint never touches chart's columns or junction.
//
// Two progress shapes coexist on purpose:
//   - `steps` is the PIPELINE. Its `type` is resolved by the worker's type
//     registry, so a step must be built from the job's `type` (chart's shape) —
//     NOT from invented stage names, or the worker dies with
//     「未知のステップ種別」.
//   - `items` is the WORK LIST: one entry per selected article. One job carries
//     many articles, so a single percentage cannot say "article 3 of 8 just
//     finished". The desk UI polls `items` for that, and the integer `progress`
//     is DERIVED from it whenever items are present, so the bar and the list can
//     never disagree.
const messages = {
    userRequired: 'A user is required.',
    workerRequired: 'Worker integration is required.',
    activeJob: 'A queued or running news job cannot be deleted.',
    // Same refusal, same spelling as chart (messages.invalidTransition). This is
    // NOT cosmetic: the worker's cancel guard matches the string VERBATIM —
    // tools/chart-worker/src/runner.js: `message.includes('job transition is not
    // allowed')` — and one worker now serves both families. A second spelling
    // here would turn the remaining ticks of a canceled job into step failures
    // (complete → 422 → failStep → 422) instead of the quiet skip.
    invalidTransition: 'The requested job transition is not allowed.',
    // A different refusal: the caller is not the worker holding the lease. It
    // used to reuse the transition string, which made two causes unreadable.
    notLeaseHolder: 'This worker does not hold the job lease.'
};

// @ts-ignore
const NewsJobModel = models.SocialAiNewsJob;
// @ts-ignore
const TABLE = NewsJobModel?.prototype?.tableName || 'social_ai_news_jobs';
const JUNCTION = 'social_ai_news_job_media';
const OWNER_SCOPE = 'news_jobs';

const ADMIN_ROLES = new Set(['Owner', 'Administrator', 'Admin']);

const DEFAULT_JOB_TYPE = 'news-read';
// Lip-sync is reserved for explicit future workers; creating it stays disabled.
const CLAIMABLE_JOB_TYPES = new Set([DEFAULT_JOB_TYPE, 'news-avatar-lipsync']);

const validateCreateType = payloadInput => {
    const type = payloadInput.type === undefined ? DEFAULT_JOB_TYPE : payloadInput.type;
    if (typeof type !== 'string' || type.trim() !== DEFAULT_JOB_TYPE) {
        throw new errors.ValidationError({message: 'Unsupported news job type.'});
    }
    if (payloadInput.steps !== undefined && (!Array.isArray(payloadInput.steps)
        || [...payloadInput.steps].some(step => !step || Array.isArray(step) || step.type !== type.trim()))) {
        throw new errors.ValidationError({message: 'News job steps must match the job type.'});
    }
    return type.trim();
};

const acceptedTypes = payloadInput => {
    const types = payloadInput.accepted_types === undefined ? [DEFAULT_JOB_TYPE] : payloadInput.accepted_types;
    if (!Array.isArray(types) || !types.length
        || [...types].some(type => typeof type !== 'string' || !CLAIMABLE_JOB_TYPES.has(type))) {
        throw new errors.ValidationError({message: 'accepted_types must be a nonempty array of supported news job types.'});
    }
    return [...new Set(types)];
};

// An item in these states is "done" for progress purposes. A failed item still
// counts as done: the bar measures how far the run got, not how well it went.
const TERMINAL_ITEM_STATUSES = new Set(['completed', 'failed', 'skipped']);

const now = () => new Date().toISOString().slice(0, 19).replace('T', ' ');
const leaseExpiry = () => new Date(Date.now() + 300000).toISOString().slice(0, 19).replace('T', ' ');

// @ts-ignore
const getPayload = frame => frame.data?.socialainewsjobs?.[0] || {};
// Worker endpoints post a bare body; the admin API may wrap it in the docName key.
// @ts-ignore
const getActionPayload = frame => {
    const payload = getPayload(frame);
    return Object.keys(payload).length > 0 ? payload : (frame.data || {});
};
// @ts-ignore
const currentUser = frame => frame.options?.context?.user || null;
// @ts-ignore
const integration = frame => frame.options?.context?.integration || null;
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

// Steps mirror chart's add: the job `type` IS the step `type` so the worker's
// tryType registry can resolve it.
const buildSteps = payloadInput => {
    if (Array.isArray(payloadInput.steps) && payloadInput.steps.length > 0) {
        return payloadInput.steps;
    }
    return [{
        id: 'step-1',
        type: payloadInput.type,
        status: 'pending',
        payload: payloadInput.payload || {},
        result: null,
        artifacts: [],
        error: null,
        history: []
    }];
};

// Work list normalization. `key` is the article identity (slug) and is the only
// required field; `post_id` rides along so the reader face can hang the
// 「アナウンサーが読む」 affordance off a Ghost post.
const normalizeItems = value => {
    if (!Array.isArray(value)) {
        return null;
    }
    return value.map((item, index) => {
        const source = item && typeof item === 'object' ? item : {};
        const progress = Number(source.progress);
        return {
            key: String(source.key ?? source.item_key ?? source.slug ?? index),
            title: source.title ?? null,
            post_id: source.post_id ?? null,
            status: source.status || 'pending',
            progress: Number.isFinite(progress) ? Math.max(0, Math.min(100, progress)) : 0,
            message: source.message ?? null,
            error: source.error ?? null,
            result: source.result ?? null,
            completed_at: source.completed_at ?? null
        };
    });
};

const countTerminal = items => items.filter(item => TERMINAL_ITEM_STATUSES.has(item.status)).length;
const countCompleted = items => items.filter(item => item.status === 'completed').length;
const countFailed = items => items.filter(item => item.status === 'failed').length;
const hasFailedItems = items => items.some(item => item.status === 'failed');

// The single source of truth for the percentage whenever a work list exists.
const deriveProgressFromItems = items => {
    if (!items.length) {
        return null;
    }
    return Math.round((countTerminal(items) / items.length) * 100);
};

// The desk reads this string, so a failure must be visible in it: "2/3 completed"
// alone would report a clean run when one article had died.
const summarizeItems = items => {
    if (!items.length) {
        return null;
    }
    const base = `${countCompleted(items)}/${items.length} completed`;
    const failed = countFailed(items);
    return failed ? `${base}, ${failed} failed` : base;
};

// Job-level status derived from the step array (same rule as chart/content-bundle).
const deriveStatus = steps => {
    if (!steps.length) {
        return 'queued';
    }
    if (steps.every(step => step.status === 'completed')) {
        return 'completed';
    }
    if (steps.some(step => step.status === 'failed')) {
        return 'failed';
    }
    if (steps.some(step => step.status === 'running')) {
        return 'running';
    }
    return 'queued';
};

// The job's real state: the steps say how far the pipeline got, the work list says
// whether the run was clean. Two rules the step array alone cannot express:
//   - a finished pipeline with a dead article is NOT `completed` — the desk must
//     see `failed`, with items[] naming which article;
//   - a claimed job never falls back to `queued`, because `queued` is what `claim`
//     picks up: the regression would hand a job in flight to a second worker.
const resolveJobStatus = (steps, items, previousStatus) => {
    const stepStatus = deriveStatus(steps);
    if (stepStatus === 'completed') {
        const allItemsTerminal = items.length === 0 || items.every(item => TERMINAL_ITEM_STATUSES.has(item.status));
        if (!allItemsTerminal) {
            return 'running';
        }
        return hasFailedItems(items) ? 'failed' : 'completed';
    }
    if (stepStatus === 'failed') {
        return 'failed';
    }
    if (previousStatus && previousStatus !== 'queued') {
        return 'running';
    }
    return stepStatus;
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
    items: parseJson(row.items, []),
    payload: parseJson(row.payload, {}),
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
    if (!userId) {
        return false;
    }
    const user = await models.User.findOne({id: userId}, {withRelated: ['roles']});
    return Boolean(user?.related('roles')?.models?.some(role => ADMIN_ROLES.has(role.get('name'))));
};

const assertAccess = async (frame, row, write = false) => {
    const actor = currentUser(frame);
    if (integration(frame) || await isAdmin(actor)) {
        return;
    }
    if (!actor || row.user_id !== actor) {
        throw new errors.NoPermissionError({message: 'You are not allowed to access this news job.'});
    }
    if (write && row.group_id) {
        const group = await models.SocialGroup.findOne({id: row.group_id});
        if (!group || !(await models.SocialGroup.canAccessGroup(group, actor, 'write'))) {
            throw new errors.NoPermissionError({message: 'You are not allowed to write this news job.'});
        }
    }
};

const loadRow = async id => {
    if (!id) {
        throw new errors.ValidationError({message: '`id` is required.'});
    }
    const row = await models.Base.knex(TABLE).where({id}).first();
    if (!row) {
        throw new errors.NotFoundError({message: 'News job not found.'});
    }
    return row;
};

// A terminal job accepts no further transitions — the same rule this file already
// applies to `canceled`, extended to `completed`/`failed`. Without it a late tick
// from a worker that lost its lease would resurrect a finished run to `running`
// (and `queued` is worse still: it is what `claim` picks up) and would rewrite
// items[] AFTER the desk has already read the result.
const assertOpen = row => {
    if (row.status === 'canceled' || row.status === 'completed' || row.status === 'failed') {
        throw new errors.ValidationError({message: tpl(messages.invalidTransition)});
    }
};

// Only the claiming worker may move a running job forward.
const assertWorker = (frame, row) => {
    if (!integration(frame)) {
        throw new errors.NoPermissionError({message: tpl(messages.workerRequired)});
    }
    const caller = String(getActionPayload(frame).claim_worker_id || '').trim();
    if (row.claim_worker_id && caller && caller !== row.claim_worker_id) {
        throw new errors.ValidationError({message: tpl(messages.notLeaseHolder)});
    }
};

const controller = {
    docName: 'socialainewsjobs',

    browse: {
        options: ['limit', 'type', 'status', 'project_id', 'page', 'order', 'debug'],
        permissions: false,
        async query(frame) {
            const actor = currentUser(frame);
            const options = frame.options || {};
            const limit = Math.min(200, Math.max(1, Number(options.limit || 50) || 50));
            const query = models.Base.knex(TABLE).select('*').orderBy('updated_at', 'desc');
            if (!integration(frame) && !(await isAdmin(actor))) {
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
            // The api-framework maps `data` onto the docName key and passes `meta`
            // through, so the reply is {socialainewsjobs: [...], meta: {...}} —
            // the same envelope listByAssetTable and chart's findPage produce.
            // Returning a bare array here would nest the list one level deeper.
            return {
                data: rows.map(serialize),
                meta: {
                    pagination: {
                        page: 1,
                        limit,
                        pages: 1,
                        total: rows.length,
                        next: null,
                        prev: null
                    }
                }
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
            // A job always belongs to a user: `created_by`/`updated_by` are NOT NULL
            // with a users FK, so a caller with no user context (an integration such
            // as the worker) must name one explicitly.
            const actor = currentUser(frame) || String(payloadInput.user_id || '').trim() || null;
            if (!actor) {
                throw new errors.NoPermissionError({message: tpl(messages.userRequired)});
            }
            const type = validateCreateType(payloadInput);
            const owner = await models.Base.knex('users').where({id: actor}).first('id');
            if (!owner) {
                throw new errors.ValidationError({message: 'user_id does not exist.'});
            }
            if (payloadInput.project_id) {
                const project = await models.SocialAiProject.findOne({id: payloadInput.project_id});
                if (!project) {
                    throw new errors.NotFoundError({message: 'Project not found.'});
                }
            }

            const id = payloadInput.id || ObjectId().toHexString();
            const timestamp = now();
            const steps = buildSteps({...payloadInput, type});
            const items = normalizeItems(payloadInput.items) || [];
            const derived = deriveProgressFromItems(items);

            await models.Base.knex(TABLE).insert({
                id,
                type,
                status: 'queued',
                progress: derived === null ? 0 : derived,
                current_step_id: steps[0]?.id || null,
                status_message: summarizeItems(items) || 'Queued',
                steps: JSON.stringify(steps),
                items: JSON.stringify(items),
                payload: JSON.stringify(payloadInput.payload || {}),
                result: null,
                artifacts: null,
                project_id: payloadInput.project_id || null,
                user_id: actor,
                group_id: payloadInput.group_id || null,
                scope_type: payloadInput.scope_type || 'user',
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
            if (!integration(frame)) {
                throw new errors.NoPermissionError({message: tpl(messages.workerRequired)});
            }
            const types = acceptedTypes(payloadInput);
            const workerId = String(payloadInput.worker_id || 'news-runner');
            const timestamp = now();
            const row = await models.Base.knex(TABLE).whereIn('type', types).where(function () {
                this.where('status', 'queued').orWhere(function () {
                    this.where('status', 'running').andWhere('claim_expires_at', '<', timestamp);
                });
            }).orderBy('updated_at', 'asc').first();
            if (!row) {
                return [];
            }
            const affected = await models.Base.knex(TABLE).where({id: row.id, type: row.type}).whereIn('type', types).where(function () {
                this.where('status', 'queued').orWhere(function () {
                    this.where('status', 'running').andWhere('claim_expires_at', '<', timestamp);
                });
            }).update({
                status: 'running',
                claim_worker_id: workerId,
                claim_expires_at: leaseExpiry(),
                started_at: row.started_at || timestamp,
                updated_at: timestamp,
                updated_by: row.updated_by || row.user_id
            });
            if (!affected) {
                return [];
            }
            return serialize(await loadRow(row.id));
        }
    },

    progress: {
        options: ['id'],
        permissions: false,
        async query(frame) {
            const payloadInput = getActionPayload(frame);
            const row = await loadRow(jobId(frame));
            assertWorker(frame, row);
            assertOpen(row);

            const steps = parseJson(row.steps, []);
            const step = steps.find(item => item.id === payloadInput.step_id)
                || steps.find(item => item.status === 'running');
            if (step) {
                step.status = 'running';
                step.progress = Number(payloadInput.step_progress ?? payloadInput.progress ?? step.progress ?? 0);
                if (payloadInput.checkpoint) {
                    step.checkpoint = payloadInput.checkpoint;
                }
            }

            // The work list is REPLACED wholesale when sent. A per-item merge would
            // need the caller to echo state it may not have; a full replace is
            // idempotent, and N is small (~20 articles).
            let items = parseJson(row.items, []);
            if (Array.isArray(payloadInput.items)) {
                items = normalizeItems(payloadInput.items) || [];
            } else if (payloadInput.item_key) {
                // Single-article tick: the worker only has to name the article.
                const key = String(payloadInput.item_key);
                const item = items.find(entry => entry.key === key);
                if (item) {
                    item.status = payloadInput.item_status || 'running';
                    const itemProgress = Number(payloadInput.item_progress);
                    if (Number.isFinite(itemProgress)) {
                        item.progress = Math.max(0, Math.min(100, itemProgress));
                    }
                    if (payloadInput.status_message) {
                        item.message = payloadInput.status_message;
                    }
                }
            }

            const derived = deriveProgressFromItems(items);
            const progress = derived === null
                ? Math.min(100, Math.max(0, Number(payloadInput.progress ?? row.progress)))
                : derived;

            const timestamp = now();
            await models.Base.knex(TABLE).where({id: row.id}).update({
                // `claim` already moved the job to `running`; a progress report does
                // not decide status (same rule as chart). A caller that wants to
                // move it must say so explicitly.
                status: payloadInput.status || row.status,
                progress,
                current_step_id: payloadInput.step_id || row.current_step_id,
                status_message: payloadInput.status_message || summarizeItems(items) || row.status_message,
                steps: JSON.stringify(steps),
                items: JSON.stringify(items),
                claim_expires_at: leaseExpiry(),
                updated_at: timestamp,
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
            assertOpen(row);
            const timestamp = now();

            // (a) one article finished. This is the tick the desk watches:
            //     「1ニュース完了したら backend 更新」.
            const itemKey = String(payloadInput.item_key || '').trim();
            const items = parseJson(row.items, []);
            if (itemKey) {
                const item = items.find(entry => entry.key === itemKey);
                if (!item) {
                    throw new errors.NotFoundError({message: `News job item not found: ${itemKey}`});
                }
                item.status = 'completed';
                item.progress = 100;
                item.result = payloadInput.result || item.result || null;
                if (payloadInput.status_message) {
                    item.message = payloadInput.status_message;
                }
                item.completed_at = timestamp;
            }

            // (b) one pipeline stage finished. Only reached when no article is
            //     named, so an item tick can never complete a step by accident.
            const steps = parseJson(row.steps, []);
            const stepId = String(payloadInput.step_id || '').trim();
            const step = stepId
                ? steps.find(item => item.id === stepId)
                : (itemKey ? null : steps.find(item => item.status === 'running'));
            if (step) {
                step.status = 'completed';
                step.progress = 100;
                step.result = payloadInput.result || null;
                step.artifacts = payloadInput.artifacts || [];
                step.completed_at = timestamp;
            }

            // A failed article does NOT kill the run on the spot — the other articles
            // still go. But a run is only clean if every article finished clean: a
            // finished pipeline carrying a dead article settles as `failed`, with
            // items[] (and error_message) naming which one.
            const derived = deriveProgressFromItems(items);
            const status = resolveJobStatus(steps, items, row.status);
            const finished = status === 'completed' || status === 'failed';
            const failedItems = items.filter(item => item.status === 'failed');
            const itemFailure = status === 'failed' && failedItems.length
                ? `${failedItems.length} article(s) failed: ${failedItems.map(item => item.key).join(', ')}`
                : null;

            await models.Base.knex(TABLE).where({id: row.id}).update({
                status,
                progress: finished ? 100 : (derived === null ? row.progress : derived),
                status_message: payloadInput.status_message || summarizeItems(items) || row.status_message,
                steps: JSON.stringify(steps),
                items: JSON.stringify(items),
                result: payloadInput.result ? JSON.stringify(payloadInput.result) : row.result,
                artifacts: payloadInput.artifacts ? JSON.stringify(payloadInput.artifacts) : row.artifacts,
                error_code: itemFailure ? 'item_failed' : row.error_code,
                error_message: itemFailure || row.error_message,
                completed_at: finished ? timestamp : null,
                claim_worker_id: finished ? null : row.claim_worker_id,
                claim_expires_at: finished ? null : row.claim_expires_at,
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
            assertOpen(row);
            const timestamp = now();
            // The worker sends `error`; the host/UI may send error_message/error_code.
            const errorText = payloadInput.error || payloadInput.error_message || null;
            const items = parseJson(row.items, []);
            const steps = parseJson(row.steps, []);

            const itemKey = String(payloadInput.item_key || '').trim();
            if (itemKey && payloadInput.fail_job !== true) {
                // One article gave up; the run continues for the rest. It settles
                // here only when the pipeline was already done — the last article
                // dying must not leave the job hanging in `running` forever.
                const item = items.find(entry => entry.key === itemKey);
                if (!item) {
                    throw new errors.NotFoundError({message: `News job item not found: ${itemKey}`});
                }
                item.status = 'failed';
                item.error = errorText || 'item failed';
                item.completed_at = timestamp;
                const derived = deriveProgressFromItems(items);
                const status = resolveJobStatus(steps, items, row.status);
                const finished = status === 'completed' || status === 'failed';
                const failedItems = items.filter(entry => entry.status === 'failed');
                await models.Base.knex(TABLE).where({id: row.id}).update({
                    status,
                    progress: finished ? 100 : (derived === null ? row.progress : derived),
                    status_message: payloadInput.status_message || summarizeItems(items) || row.status_message,
                    items: JSON.stringify(items),
                    error_code: finished ? 'item_failed' : row.error_code,
                    error_message: finished ? `${failedItems.length} article(s) failed: ${failedItems.map(entry => entry.key).join(', ')}` : row.error_message,
                    completed_at: finished ? timestamp : null,
                    claim_worker_id: finished ? null : row.claim_worker_id,
                    claim_expires_at: finished ? null : row.claim_expires_at,
                    updated_at: timestamp,
                    updated_by: row.updated_by || row.user_id
                });
                return serialize(await loadRow(row.id));
            }

            const stepId = payloadInput.step_id || (steps[0] && steps[0].id);
            const step = steps.find(item => item.id === stepId);
            if (step) {
                step.status = 'failed';
                step.error = errorText || step.error;
            }
            await models.Base.knex(TABLE).where({id: row.id}).update({
                status: 'failed',
                error_code: payloadInput.error_code || 'step_failed',
                error_message: errorText || 'News job step failed',
                steps: JSON.stringify(steps),
                items: JSON.stringify(items),
                completed_at: timestamp,
                claim_worker_id: null,
                claim_expires_at: null,
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
            if (!integration(frame)) {
                throw new errors.NoPermissionError({message: tpl(messages.workerRequired)});
            }
            const knex = models.Base.knex;
            const row = await loadRow(jobId(frame));
            const payloadInput = getActionPayload(frame);
            const assets = Array.isArray(payloadInput.assets) ? payloadInput.assets : [];
            const removedKeys = Array.isArray(payloadInput.removed_keys)
                ? payloadInput.removed_keys.map(String).map(s => s.trim()).filter(Boolean)
                : [];
            const mediaIds = [];

            // Idempotency key is storage_key_hash ALONE (same rule as chart, H1):
            // a different job republishing the same S3 path reuses the existing row
            // and re-points news_job_id at the latest publisher — never a duplicate.
            for (const asset of assets) {
                const storageKey = String(asset.storage_key || '').trim();
                const storageUrl = String(asset.storage_url || '').trim();
                if (!storageKey || !storageUrl) {
                    continue;
                }
                const storageKeyHash = socialMediaAssets.buildStorageKeyHash(storageKey);
                const assetType = String(asset.asset_type || 'file').trim().toLowerCase();
                const VALID_ROLES = ['input', 'source', 'material', 'intermediate', 'preview', 'output'];
                const VALID_SOURCE_KINDS = ['real', 'ai', 'interview'];
                const role = VALID_ROLES.includes(asset.role) ? asset.role : 'output';
                const sourceKind = VALID_SOURCE_KINDS.includes(asset.source_kind) ? asset.source_kind : null;
                const sortOrder = Number.isFinite(Number(asset.sort_order)) ? Math.max(0, Number(asset.sort_order)) : 0;
                const timestamp = now();

                // project_id comes from the JOB, never from the worker's payload.
                const jobProjectId = row.project_id || null;
                let mediaId;
                const existing = await knex('social_media_assets')
                    .where({storage_key_hash: storageKeyHash})
                    .first();

                if (existing) {
                    await knex('social_media_assets')
                        .where({id: existing.id})
                        .update({
                            storage_key: storageKey,
                            storage_url: storageUrl,
                            thumbnail_url: asset.thumbnail_url || existing.thumbnail_url || null,
                            original_filename: asset.original_filename || existing.original_filename || null,
                            asset_type: assetType,
                            news_job_id: row.id,
                            project_id: jobProjectId || existing.project_id || null,
                            user_id: existing.user_id || row.user_id || null,
                            group_id: existing.group_id || row.group_id || null,
                            updated_at: timestamp
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
                                owner_scope: OWNER_SCOPE,
                                project_id: jobProjectId,
                                user_id: row.user_id || null,
                                group_id: row.group_id || null,
                                news_job_id: row.id,
                                created_at: timestamp,
                                updated_at: timestamp
                            });
                    } catch (err) {
                        // unique (news_job_id, storage_key_hash): a racing insert
                        // loses and we fall back to updating the winner's row.
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
                                    news_job_id: row.id,
                                    updated_at: timestamp
                                });
                            mediaId = dup.id;
                        } else {
                            throw err;
                        }
                    }
                }

                // Junction: WHICH article this artifact belongs to. This is what a
                // single link column cannot express, and why the news family needs
                // its own junction rather than chart's.
                const itemKey = String(asset.item_key || '').trim() || null;
                const postId = String(asset.post_id || '').trim() || null;
                const existingJunction = await knex(JUNCTION)
                    .where({news_job_id: row.id, media_id: mediaId})
                    .first();
                if (existingJunction) {
                    await knex(JUNCTION)
                        .where({id: existingJunction.id})
                        .update({
                            role: role || existingJunction.role,
                            source_kind: sourceKind || existingJunction.source_kind,
                            step_id: asset.step_id || existingJunction.step_id || null,
                            item_key: itemKey || existingJunction.item_key || null,
                            post_id: postId || existingJunction.post_id || null,
                            person_name: asset.person_name || existingJunction.person_name || null,
                            sort_order: Number.isFinite(Number(asset.sort_order))
                                ? Math.max(0, Number(asset.sort_order))
                                : existingJunction.sort_order,
                            caption: asset.caption || existingJunction.caption || null
                            // NB: the junction has no `updated_at` column — do not write one.
                        });
                } else {
                    await knex(JUNCTION)
                        .insert({
                            id: ObjectId().toHexString(),
                            news_job_id: row.id,
                            media_id: mediaId,
                            role,
                            source_kind: sourceKind,
                            step_id: asset.step_id || null,
                            item_key: itemKey,
                            post_id: postId,
                            person_name: asset.person_name || null,
                            sort_order: sortOrder,
                            caption: asset.caption || null,
                            created_at: timestamp
                        });
                }

                mediaIds.push(mediaId);
            }

            // A key that publishJob deleted from S3 must not keep its gallery row.
            // Scoped to this family's owner_scope; the junction rows cascade via FK.
            const removedSet = new Set(removedKeys);
            for (const key of removedSet) {
                const stillRegistered = assets.some(a => String(a.storage_key || '').trim() === key);
                if (stillRegistered) {
                    continue;
                }
                await knex('social_media_assets')
                    .where({storage_key: key, owner_scope: OWNER_SCOPE})
                    .del();
            }

            const artifacts = [...parseJson(row.artifacts, []), ...assets];
            await knex(TABLE).where({id: row.id}).update({
                artifacts: JSON.stringify(artifacts),
                updated_at: now(),
                updated_by: row.updated_by || row.user_id
            });

            return {
                media_ids: [...new Set(mediaIds)],
                count: mediaIds.length,
                removed_count: removedKeys.length
            };
        }
    },

    cancel: {
        options: ['id'],
        permissions: false,
        async query(frame) {
            const row = await loadRow(jobId(frame));
            await assertAccess(frame, row, true);
            if (!['queued', 'running'].includes(row.status)) {
                throw new errors.ValidationError({message: tpl(messages.invalidTransition)});
            }
            await models.Base.knex(TABLE).where({id: row.id}).update({
                status: 'canceled',
                completed_at: now(),
                updated_at: now(),
                updated_by: currentUser(frame) || row.updated_by || row.user_id
            });
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

            // A running job must not be deleted out from under its worker.
            if (['queued', 'running'].includes(row.status)) {
                throw new errors.ValidationError({message: tpl(messages.activeJob)});
            }

            // Best-effort S3 cleanup of this job's gallery work area
            // (gallery/news_jobs/{jobId}/). Never blocks the DB delete.
            try {
                const mediaStore = storage.getStorage('media');
                const deleteKey = async key => {
                    const clean = String(key || '').replace(/^\/+/, '').trim();
                    if (!clean) {
                        return;
                    }
                    const parts = clean.split('/');
                    const name = parts.pop();
                    const dir = parts.join('/');
                    await mediaStore.delete(name, dir);
                };
                if (mediaStore && typeof mediaStore.delete === 'function' && typeof mediaStore.list === 'function') {
                    const root = mediaStore.pathPrefix || mediaStore.storagePath || '';
                    const prefix = [root, 'gallery', OWNER_SCOPE, row.id]
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
            } catch (err) {
                logging.warn(`[social-ai-news-jobs] gallery S3 cleanup failed for job ${row.id}: ${err?.message || err}`);
            }

            // news_job_id is a plain link (no ON DELETE CASCADE), so delete rows
            // explicitly. Mirrors chart's H3 rule: for a project-scoped job only
            // the working area (…/jobs/{jobId}/…) is removed; artifacts live at
            // stable paths other jobs may reference and survive until project
            // deletion. A job without a project owns every row it created.
            try {
                await knex('social_media_assets')
                    .where(function () {
                        if (row.project_id) {
                            this.whereRaw('storage_key LIKE ?', [`%/jobs/${row.id}/%`]);
                        } else {
                            this.where('news_job_id', row.id);
                        }
                    })
                    .orWhereRaw('storage_key LIKE ?', [`%gallery/${OWNER_SCOPE}/${row.id}/%`])
                    .del();
            } catch (err) {
                logging.warn(`[social-ai-news-jobs] asset row cleanup failed for job ${row.id}: ${err?.message || err}`);
            }

            // Junction rows cascade via the news_job_id FK.
            await knex(TABLE).where({id: row.id}).del();

            return serialize({...row, status: 'deleted'});
        }
    }
};

module.exports = controller;
