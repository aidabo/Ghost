const errors = require('@tryghost/errors');
const models = require('../../models');
const ObjectId = require('bson-objectid').default;
const staffScope = require('./utils/staff-scope');
const {isIntegrationRequest} = require('./utils/integration-context');
const {assertAssetsUsable} = require('./utils/video-asset-access');

// Consent to use a person's face photo as a video avatar (front repo
// docs/planning/video-job-runner-plan.md §7.2).
//
// - Only a logged-in staff user records a consent, and only for a photo they can
//   use (their own gallery asset, a group asset they can write, or any asset for a
//   system admin). Integrations (the worker) can only read one.
// - A consent is never deleted. Revoking stamps revoked_at, refuses new video jobs
//   that name it (social-ai-video-jobs add) and cancels the open jobs that use it.
//   The worker drops the face cache for the photo when it sees the revocation.
// - `uses` says what the person agreed to: 'video_avatar' (the photo appears in a
//   video) and 'lipsync' (the photo and the script's voice are sent to the
//   external lip-sync AI to make a talking face). Only 'lipsync' is enforced by
//   video job add (plan decision: a consent is required only for lip-sync). A
//   still avatar is guarded by the asset owner check instead (another user's
//   private photo is refused); 'video_avatar' is kept as the record of what the
//   person agreed to.
// - user_id is a plain column (NOT a users FK with cascade), so deleting the
//   staff user who recorded a consent does not delete the consent record.
const TABLE = 'social_ai_avatar_consents';
const JOBS = 'social_ai_video_jobs';
const USES = ['video_avatar', 'lipsync'];

const now = () => new Date().toISOString().slice(0, 19).replace('T', ' ');

// @ts-ignore
const getPayload = frame => frame.data?.socialaiavatarconsents?.[0] || frame.data || {};
// @ts-ignore
const currentUser = frame => frame.options?.context?.user || null;
// @ts-ignore
const consentId = frame => frame.options?.id || frame.data?.id || null;

const parseJson = (value, fallback) => {
    try {
        return value ? JSON.parse(value) : fallback;
    } catch (err) {
        return fallback;
    }
};

const serialize = row => ({
    id: row.id,
    photo_asset_id: row.photo_asset_id,
    subject_name: row.subject_name,
    consented_by_name: row.consented_by_name || null,
    consented_at: row.consented_at,
    uses: parseJson(row.uses, []),
    note: row.note || null,
    user_id: row.user_id,
    active: !row.revoked_at,
    revoked_at: row.revoked_at || null,
    revoked_by: row.revoked_by || null,
    revoke_reason: row.revoke_reason || null,
    created_at: row.created_at,
    updated_at: row.updated_at
});

const requireStaff = (frame) => {
    const actor = currentUser(frame);
    if (!actor || isIntegrationRequest(frame)) {
        throw new errors.NoPermissionError({message: 'A logged-in staff user is required.'});
    }
    return actor;
};

const isSystemAdmin = async actor => (await staffScope.getStaffScope(actor)).isSystemAdmin;

const text = (value, field, max, required = false) => {
    if (value === undefined || value === null || value === '') {
        if (required) {
            throw new errors.ValidationError({message: `${field} is required.`});
        }
        return null;
    }
    if (typeof value !== 'string' || !value.trim() || value.length > max) {
        throw new errors.ValidationError({message: `${field} must be a string of at most ${max} characters.`});
    }
    return value.trim();
};

// MySQL DATETIME ('YYYY-MM-DD HH:MM:SS', UTC). Defaults to now; never the future.
const consentedAt = (value) => {
    if (value === undefined || value === null || value === '') {
        return now();
    }
    const date = new Date(value);
    if (typeof value !== 'string' || Number.isNaN(date.getTime()) || date.getTime() > Date.now() + 60000) {
        throw new errors.ValidationError({message: 'consented_at must be a past date.'});
    }
    return date.toISOString().slice(0, 19).replace('T', ' ');
};

const assertPhoto = async (actor, photoAssetId) => {
    if (typeof photoAssetId !== 'string' || !/^[a-f0-9]{24}$/.test(photoAssetId)) {
        throw new errors.ValidationError({message: 'photo_asset_id must be a gallery asset id.'});
    }
    await assertAssetsUsable({
        knex: models.Base.knex,
        // @ts-ignore
        SocialGroup: models.SocialGroup,
        isSystemAdmin
    }, actor, [photoAssetId]);
};

const loadRow = async (id) => {
    if (!id) {
        throw new errors.ValidationError({message: '`id` is required.'});
    }
    const row = await models.Base.knex(TABLE).where({id}).first();
    if (!row) {
        throw new errors.NotFoundError({message: 'Avatar consent not found.'});
    }
    return row;
};

const assertOwnerOrAdmin = async (frame, row) => {
    if (isIntegrationRequest(frame)) {
        return;
    }
    const actor = currentUser(frame);
    if (!actor || (row.user_id !== actor && !(await isSystemAdmin(actor)))) {
        throw new errors.NoPermissionError({message: 'You are not allowed to access this avatar consent.'});
    }
};

const controller = {
    docName: 'socialaiavatarconsents',

    // The caller's own consents (newest first). Filters: photo_asset_id, active.
    browse: {
        options: ['photo_asset_id', 'active', 'limit'],
        permissions: false,
        async query(frame) {
            const actor = requireStaff(frame);
            const options = frame.options || {};
            const limit = Math.min(200, Math.max(1, Number(options.limit || 100) || 100));
            const query = models.Base.knex(TABLE).where('user_id', actor).orderBy('created_at', 'desc');
            if (options.photo_asset_id) {
                query.where('photo_asset_id', String(options.photo_asset_id));
            }
            if (String(options.active) === 'true') {
                query.whereNull('revoked_at');
            } else if (String(options.active) === 'false') {
                query.whereNotNull('revoked_at');
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
            const row = await loadRow(consentId(frame));
            await assertOwnerOrAdmin(frame, row);
            return serialize(row);
        }
    },

    add: {
        statusCode: 201,
        headers: {cacheInvalidate: false},
        permissions: false,
        async query(frame) {
            const actor = requireStaff(frame);
            const input = getPayload(frame);
            await assertPhoto(actor, input.photo_asset_id);
            const uses = input.uses === undefined ? ['video_avatar'] : input.uses;
            if (!Array.isArray(uses) || !uses.length || uses.some(use => !USES.includes(use))) {
                throw new errors.ValidationError({message: `uses must be a nonempty array of ${USES.join(', ')}.`});
            }
            const timestamp = now();
            const id = ObjectId().toHexString();
            await models.Base.knex(TABLE).insert({
                id,
                photo_asset_id: input.photo_asset_id,
                subject_name: text(input.subject_name, 'subject_name', 191, true),
                consented_by_name: text(input.consented_by_name, 'consented_by_name', 191),
                consented_at: consentedAt(input.consented_at),
                uses: JSON.stringify([...new Set(uses)]),
                note: text(input.note, 'note', 2000),
                user_id: actor,
                created_at: timestamp,
                created_by: actor,
                updated_at: timestamp,
                updated_by: actor
            });
            return serialize(await loadRow(id));
        }
    },

    // Revoke: idempotent. Cancels the open (queued / running) video jobs that use
    // this consent; a running worker sees the cancel on its next tick.
    revoke: {
        options: ['id'],
        permissions: false,
        async query(frame) {
            const actor = requireStaff(frame);
            const row = await loadRow(consentId(frame));
            await assertOwnerOrAdmin(frame, row);
            const input = getPayload(frame);
            const timestamp = now();
            let canceledJobs = 0;
            await models.Base.knex.transaction(async (trx) => {
                // Lock the consent row first: video job add reads it FOR UPDATE in
                // the transaction that inserts the job, so a job is either refused
                // (revoked_at seen) or already inserted and canceled below.
                const locked = await trx(TABLE).where({id: row.id}).forUpdate().first();
                if (!locked) {
                    throw new errors.NotFoundError({message: 'Avatar consent not found.'});
                }
                if (!locked.revoked_at) {
                    await trx(TABLE).where({id: row.id}).whereNull('revoked_at').update({
                        revoked_at: timestamp,
                        revoked_by: actor,
                        revoke_reason: text(input.reason, 'reason', 500),
                        updated_at: timestamp,
                        updated_by: actor
                    });
                }
                canceledJobs = await trx(JOBS)
                    .where({avatar_consent_id: row.id})
                    .whereIn('status', ['queued', 'running'])
                    .update({
                        status: 'canceled',
                        error_code: 'consent_revoked',
                        error_message: 'The avatar consent was revoked.',
                        claim_token: null,
                        claim_worker_id: null,
                        claim_expires_at: null,
                        completed_at: timestamp,
                        updated_at: timestamp,
                        updated_by: actor
                    });
            });
            return {...serialize(await loadRow(row.id)), canceled_jobs: canceledJobs};
        }
    }
};

module.exports = controller;
