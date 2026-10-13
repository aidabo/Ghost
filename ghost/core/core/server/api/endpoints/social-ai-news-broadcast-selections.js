const errors = require('@tryghost/errors');
const models = require('../../models');

const TABLE = 'social_ai_avatar_broadcast_selections';
const JOBS = 'social_ai_news_jobs';
const JUNCTION = 'social_ai_news_job_media';
const ASSETS = 'social_media_assets';
const ADMIN_ROLES = new Set(['Owner', 'Administrator', 'Admin']);

const currentUser = frame => frame.options?.context?.user || null;
const integration = frame => frame.options?.context?.integration || null;
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
    if (!actor || job.user_id !== actor || integration(frame)) {
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
            const actor = currentUser(frame);
            const trustedIntegration = integration(frame);
            const admin = await isAdmin(actor);
            if (!trustedIntegration && !admin && !actor) {
                throw new errors.NoPermissionError({message: 'An authenticated user is required to browse news broadcast selections.'});
            }
            const raw = String(frame.options?.post_ids || '').trim();
            const postIds = [...new Set(raw.split(',').map(value => value.trim()).filter(Boolean))];
            if (postIds.length > 200 || postIds.some(id => !/^[a-f0-9]{24}$/i.test(id))) {
                throw new errors.ValidationError({message: 'post_ids must contain up to 200 valid post IDs.'});
            }
            if (!postIds.length) {
                return {data: [], meta: {pagination: {page: 1, limit: 0, pages: 0, total: 0, next: null, prev: null}}};
            }
            const rows = await selectionQuery(models.Base.knex).whereIn('s.post_id', postIds);
            const visibleRows = [];
            for (const row of rows) {
                if (trustedIntegration || admin || row.updated_by === actor) {
                    visibleRows.push(row);
                    continue;
                }
                if (!row.news_job_id) {
                    continue;
                }
                const job = await models.Base.knex(JOBS).where({id: row.news_job_id}).first();
                if (!job) continue;
                try {
                    await assertJobAccess(frame, job, false);
                    visibleRows.push(row);
                } catch (err) {
                    // Do not reveal another owner's selected media URL.
                }
            }
            return {
                data: visibleRows.map(serializeSelection),
                meta: {pagination: {page: 1, limit: postIds.length, pages: 1, total: visibleRows.length, next: null, prev: null}}
            };
        }
    },

    select: {
        permissions: false,
        async query(frame) {
            if (integration(frame)) {
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
