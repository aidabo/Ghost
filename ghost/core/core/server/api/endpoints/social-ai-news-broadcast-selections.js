const errors = require('@tryghost/errors');
const models = require('../../models');
const permissionsService = require('../../services/permissions');
const staffScope = require('./utils/staff-scope');

const TABLE = 'social_ai_avatar_broadcast_selections';
const JOBS = 'social_ai_news_jobs';
const JUNCTION = 'social_ai_news_job_media';
const ASSETS = 'social_media_assets';
const ADMIN_ROLES = new Set(['Owner', 'Administrator', 'Admin']);

const currentUser = frame => frame.options?.context?.user || null;
const {isIntegrationRequest} = require('./utils/integration-context');
const payloadOf = frame => frame.data?.socialainewsbroadcastselections?.[0] || frame.data || {};
const now = () => new Date().toISOString().slice(0, 19).replace('T', ' ');
const parseJson = value => {
    if (typeof value !== 'string') {
        return Array.isArray(value) ? value : [];
    }
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
        return [];
    }
};

const isAdmin = async userId => {
    if (!userId) {
        return false;
    }
    const user = await models.User.findOne({id: userId}, {withRelated: ['roles']});
    return Boolean(user?.related('roles')?.models?.some(role => ADMIN_ROLES.has(role.get('name'))));
};

const assertJobAccess = async (frame, job, write = false) => {
    const actor = currentUser(frame);
    if (await isAdmin(actor)) {
        return;
    }
    if (!actor || job.user_id !== actor || isIntegrationRequest(frame)) {
        throw new errors.NoPermissionError({message: 'You are not allowed to select a broadcast for this news job.'});
    }
    if (write && job.group_id) {
        const group = await models.SocialGroup.findOne({id: job.group_id});
        if (!group || !(await models.SocialGroup.canAccessGroup(group, actor, 'write'))) {
            throw new errors.NoPermissionError({message: 'You are not allowed to select a broadcast for this group.'});
        }
    }
};

const renditionOf = (itemKey, name) => {
    if (name === `${itemKey}-avatar.mp4`) {
        return 'news-panel-static';
    }
    if (name === `${itemKey}-photo-avatar.mp4`) {
        return 'photo-slideshow-static';
    }
    const prefix = `${itemKey}-photo-avatar-lipsync-`;
    const suffix = '.mp4';
    if (name.startsWith(prefix) && name.endsWith(suffix)) {
        const jobId = name.slice(prefix.length, -suffix.length);
        if (/^[a-f0-9]{24}$/i.test(jobId)) {
            return 'photo-slideshow-lipsync';
        }
    }
    return null;
};

const selectionQuery = (knex) => knex(`${TABLE} as s`)
    .leftJoin(`${ASSETS} as a`, 'a.id', 's.media_id')
    .leftJoin(`${JUNCTION} as jm`, function () {
        this.on('jm.media_id', '=', 'a.id')
            .andOn('jm.post_id', '=', 's.post_id')
            .andOn('jm.news_job_id', '=', 'a.news_job_id');
    })
    .leftJoin(`${JOBS} as j`, 'j.id', 'jm.news_job_id')
    .select(
        's.post_id', 's.project_id', 's.rendition', 's.revision', 's.updated_at',
        's.updated_by', 'jm.item_key', 'jm.news_job_id', 'a.id as media_id', 'a.storage_url', 'a.storage_key', 'a.original_filename'
    );

// The job that produced the selected media, checked live at read time: a
// selection validated when it was made must stop being served once its job or
// project moves to a private group.
const joinMediaJob = query => query
    .leftJoin(`${JOBS} as mj`, 'mj.id', 'a.news_job_id');

// SQL mirror of staffScope.isNewsroomJob for the media's job: its own group is
// none or an active public group, and its project (if it still exists) too.
const whereMediaJobIsNewsroom = (qb, scope) => {
    qb.whereNotNull('mj.id')
        .where(group => staffScope.whereNewsroomGroup(group, 'mj.group_id', scope));
    staffScope.whereNewsroomProject(qb, 'mj.project_id', scope);
};

// Unauthenticated broadcast lookups (the public reader) reveal only active
// renditions on newsroom posts that the public Content API would expose, made
// by a job that is still newsroom. Browse and `/:id` share this query.
const publicSelectionQuery = (knex, scope) => joinMediaJob(selectionQuery(knex))
    .join('posts as p', 'p.id', 's.post_id')
    .where('p.type', 'post')
    .andWhere('p.public_post', true)
    .whereIn('p.status', ['published', 'sent'])
    .andWhere('p.visibility', 'public')
    // Active selections only: a legacy-default tombstone tells the reader
    // nothing it would not do anyway (fall back to the legacy avatar).
    .whereNotNull('s.media_id')
    .whereNot('s.rendition', 'legacy-default')
    // An active selection must point to a playable video asset; a stale or
    // corrupted generic selection must not become a reader-side video URL.
    .where('a.asset_type', 'video')
    .whereNotNull('a.storage_url')
    .where(qb => whereMediaJobIsNewsroom(qb, scope));

const publicScope = async () => ({publicGroupIds: await staffScope.loadPublicGroupIds()});

// Staff lookups (NewsAgent / desk, session only): any status, tombstones
// included (NewsAgent needs their revision). Posts: newsroom posts, every Post
// for a system admin.
const staffSelectionQuery = (knex, scope) => {
    const query = joinMediaJob(selectionQuery(knex))
        .join('posts as p', 'p.id', 's.post_id')
        .where('p.type', 'post');
    return scope.isSystemAdmin ? query : query.andWhere('p.public_post', true);
};

// Media a non-admin may see on a selection: its job is newsroom or their own
// (the staff job read, social-ai-news-jobs). A system admin sees all.
const whereStaffMayReadMedia = (qb, scope, actor) => {
    qb.where(newsroom => whereMediaJobIsNewsroom(newsroom, scope))
        .orWhere('mj.user_id', actor);
};

// A selection whose media the viewer may not see keeps its row — post,
// rendition and revision — so the viewer's next write carries the right
// expected_revision instead of 0 (a permanent 409). Only the media is withheld.
const withoutMedia = row => ({
    ...serializeSelection(row),
    project_id: null,
    news_job_id: null,
    item_key: null,
    media_id: null,
    name: null,
    storage_url: null
});

const postIdsOf = (frame) => {
    const raw = String(frame.options?.post_ids || '').trim();
    const postIds = [...new Set(raw.split(',').map(value => value.trim()).filter(Boolean))];
    if (postIds.length > 200 || postIds.some(id => !/^[a-f0-9]{24}$/i.test(id))) {
        throw new errors.ValidationError({message: 'post_ids must contain up to 200 valid post IDs.'});
    }
    return postIds;
};

const emptyPage = () => ({data: [], meta: {pagination: {page: 1, limit: 0, pages: 0, total: 0, next: null, prev: null}}});

// What anyone may see: which Post, which rendition, and the file. Internal ids
// (project / job / media), item key and revision stay on the staff read.
const serializePublicSelection = row => ({
    post_id: row.post_id,
    rendition: row.rendition,
    name: row.original_filename || String(row.storage_key || '').split('/').pop() || null,
    storage_url: row.storage_url || null
});

const serializeSelection = row => ({
    post_id: row.post_id,
    project_id: row.project_id || null,
    news_job_id: row.news_job_id || null,
    item_key: row.item_key || null,
    media_id: row.media_id || null,
    rendition: row.rendition,
    name: row.original_filename || String(row.storage_key || '').split('/').pop() || null,
    storage_url: row.storage_url || null,
    revision: Number(row.revision),
    updated_at: row.updated_at
});

const controller = {
    docName: 'socialainewsbroadcastselections',

    browse: {
        options: ['post_ids'],
        permissions: false,
        async query(frame) {
            const postIds = postIdsOf(frame);
            if (!postIds.length) {
                return emptyPage();
            }
            const rows = await publicSelectionQuery(models.Base.knex, await publicScope()).whereIn('s.post_id', postIds);
            return {
                data: rows.map(serializePublicSelection),
                meta: {pagination: {page: 1, limit: postIds.length, pages: 1, total: rows.length, next: null, prev: null}}
            };
        }
    },

    read: {
        options: ['id'],
        permissions: false,
        async query(frame) {
            const postId = String(frame.options?.id || '').trim();
            if (!/^[a-f0-9]{24}$/i.test(postId)) {
                throw new errors.ValidationError({message: 'A valid post id is required.'});
            }
            const row = await publicSelectionQuery(models.Base.knex, await publicScope()).where('s.post_id', postId).first();
            if (!row) {
                throw new errors.NotFoundError({message: 'Broadcast selection not found.'});
            }
            return {data: [serializePublicSelection(row)], meta: {}};
        }
    },

    staffBrowse: {
        options: ['post_ids'],
        // Every staff role browses posts; the selection permission would leave
        // out roles that read the desk today.
        permissions: {docName: 'post', method: 'browse'},
        async query(frame) {
            const actor = currentUser(frame);
            if (!actor || isIntegrationRequest(frame)) {
                throw new errors.NoPermissionError({message: 'A user session is required to read broadcast selections.'});
            }
            const postIds = postIdsOf(frame);
            if (!postIds.length) {
                return emptyPage();
            }
            const scope = await staffScope.getNewsroomReadScope(actor);
            if (!scope) {
                throw new errors.NoPermissionError({message: 'A staff user is required to read broadcast selections.'});
            }
            const knex = models.Base.knex;
            const rows = await staffSelectionQuery(knex, scope).whereIn('s.post_id', postIds);
            const mediaVisible = scope.isSystemAdmin
                ? null
                : new Set(await staffSelectionQuery(knex, scope)
                    .whereIn('s.post_id', postIds)
                    .whereNotNull('s.media_id')
                    .where(qb => whereStaffMayReadMedia(qb, scope, actor))
                    .pluck('s.post_id'));
            return {
                data: rows.map(row => (!mediaVisible || !row.media_id || mediaVisible.has(row.post_id)
                    ? serializeSelection(row)
                    : withoutMedia(row))),
                meta: {pagination: {page: 1, limit: postIds.length, pages: 1, total: rows.length, next: null, prev: null}}
            };
        }
    },

    select: {
        permissions(frame) {
            const input = payloadOf(frame);
            const action = Number(input.expected_revision) === 0 ? 'add' : 'edit';
            return permissionsService.canThis(frame.options.context)[action].socialaiavatarbroadcastselection(input.post_id);
        },
        async query(frame) {
            if (isIntegrationRequest(frame)) {
                throw new errors.NoPermissionError({message: 'A user session is required to select a public news broadcast.'});
            }
            const input = payloadOf(frame);
            const postId = String(input.post_id || '').trim();
            const jobId = String(input.news_job_id || '').trim();
            const itemKey = String(input.item_key || '').trim();
            const requestedName = String(input.name || '').trim();
            const expectedRevision = Number(input.expected_revision);
            if (!/^[a-f0-9]{24}$/i.test(postId) || !Number.isInteger(expectedRevision) || expectedRevision < 0) {
                throw new errors.ValidationError({message: 'post_id and expected_revision are required.'});
            }

            const knex = models.Base.knex;
            const actor = currentUser(frame);
            if (input.action === 'clear') {
                if (!actor) {
                    throw new errors.NoPermissionError({message: 'A user session is required to restore the default broadcast.'});
                }
                return knex.transaction(async trx => {
                    const post = await trx('posts').where({id: postId}).forUpdate().first('id');
                    if (!post) {
                        throw new errors.NotFoundError({message: 'Post not found.'});
                    }
                    const existing = await trx(TABLE).where({post_id: postId}).forUpdate().first();
                    const actualRevision = existing ? Number(existing.revision) : 0;
                    if (actualRevision !== expectedRevision) {
                        throw new errors.ConflictError({message: 'The broadcast selection changed. Reload and try again.'});
                    }
                    if (!(await isAdmin(actor))) {
                        if (!existing || existing.updated_by !== actor) {
                            if (!existing?.media_id) {
                                throw new errors.NoPermissionError({message: 'You are not allowed to restore this broadcast.'});
                            }
                            const selectedMedia = await trx(ASSETS).where({id: existing.media_id}).first();
                            const sourceJob = selectedMedia?.news_job_id
                                ? await trx(JOBS).where({id: selectedMedia.news_job_id}).first()
                                : null;
                            if (!sourceJob) {
                                throw new errors.NoPermissionError({message: 'You are not allowed to restore this broadcast.'});
                            }
                            await assertJobAccess(frame, sourceJob, true);
                        }
                    }
                    const timestamp = now();
                    const next = {
                        post_id: postId,
                        project_id: null,
                        media_id: null,
                        rendition: 'legacy-default',
                        revision: actualRevision + 1,
                        updated_by: actor,
                        updated_at: timestamp
                    };
                    if (existing) {
                        const changed = await trx(TABLE).where({post_id: postId, revision: actualRevision}).update(next);
                        if (!changed) {
                            throw new errors.ConflictError({message: 'The broadcast selection changed. Reload and try again.'});
                        }
                    } else {
                        await trx(TABLE).insert({...next, created_by: actor, created_at: timestamp});
                    }
                    return serializeSelection(await selectionQuery(trx).where('s.post_id', postId).first());
                });
            }

            if (!/^[a-f0-9]{24}$/i.test(jobId) || !itemKey || !requestedName) {
                throw new errors.ValidationError({message: 'news_job_id, item_key, and name are required.'});
            }
            const job = await knex(JOBS).where({id: jobId}).first();
            if (!job) {
                throw new errors.NotFoundError({message: 'News job not found.'});
            }
            await assertJobAccess(frame, job, true);
            if (job.status !== 'completed' || !['news-read', 'news-avatar-lipsync'].includes(job.type)) {
                throw new errors.ValidationError({message: 'Only completed News Agent jobs can provide a broadcast.'});
            }
            const item = parseJson(job.items).find(entry => entry?.key === itemKey && entry?.post_id === postId && entry?.status === 'completed');
            if (!item) {
                throw new errors.ValidationError({message: 'The completed job item does not match this post.'});
            }

            const candidate = await knex(`${JUNCTION} as jm`)
                .join(`${ASSETS} as a`, 'a.id', 'jm.media_id')
                .where({
                    'jm.news_job_id': jobId,
                    'jm.item_key': itemKey,
                    'jm.post_id': postId,
                    'jm.role': 'output',
                    'a.asset_type': 'video',
                    'a.owner_scope': 'news_jobs',
                    'a.project_id': job.project_id || null
                })
                .select('jm.media_id', 'a.storage_url', 'a.storage_key', 'a.original_filename')
                .then(rows => rows.find(row => (row.original_filename || String(row.storage_key || '').split('/').pop()) === requestedName));
            if (!candidate || !/^https?:\/\//i.test(String(candidate.storage_url || ''))) {
                throw new errors.NotFoundError({message: 'The selected broadcast artifact is not available.'});
            }

            const actualName = candidate.original_filename || String(candidate.storage_key).split('/').pop();
            const rendition = renditionOf(itemKey, actualName);
            if (!rendition
                || (job.type === 'news-read' && rendition === 'photo-slideshow-lipsync')
                || (job.type === 'news-avatar-lipsync' && rendition !== 'photo-slideshow-lipsync')) {
                throw new errors.ValidationError({message: 'This artifact is not an adoptable avatar broadcast rendition.'});
            }

            const timestamp = now();
            const result = await knex.transaction(async trx => {
                const post = await trx('posts').where({id: postId}).forUpdate().first('id');
                if (!post) {
                    throw new errors.NotFoundError({message: 'Post not found.'});
                }
                const existing = await trx(TABLE).where({post_id: postId}).forUpdate().first();
                const actualRevision = existing ? Number(existing.revision) : 0;
                if (actualRevision !== expectedRevision) {
                    throw new errors.ConflictError({message: 'The broadcast selection changed. Reload and try again.'});
                }
                const next = {
                    post_id: postId,
                    project_id: job.project_id || null,
                    media_id: candidate.media_id,
                    rendition,
                    revision: actualRevision + 1,
                    updated_by: actor,
                    updated_at: timestamp
                };
                if (existing) {
                    const changed = await trx(TABLE).where({post_id: postId, revision: actualRevision}).update(next);
                    if (!changed) {
                        throw new errors.ConflictError({message: 'The broadcast selection changed. Reload and try again.'});
                    }
                } else {
                    await trx(TABLE).insert({...next, created_by: actor, created_at: timestamp});
                }
                const selected = await selectionQuery(trx).where('s.post_id', postId).first();
                return serializeSelection(selected);
            });
            return result;
        }
    }
};

module.exports = controller;
