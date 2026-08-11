// @ts-ignore
const tpl = require('@tryghost/tpl');
const errors = require('@tryghost/errors');
const models = require('../../models');
const logging = require('@tryghost/logging');
const storage = require('../../adapters/storage');
const socialAiProjectsUtil = require('./utils/social-ai-projects');

const ADMIN_ROLES = new Set(['Owner', 'Administrator', 'Admin']);
const ALLOWED_INCLUDES = ['user', 'group'];

// Review 2026-08-07 #2: families that hang off the generic project path.
// destroy iterates this list for its active-jobs check and cascade — add an
// entry when a new job family (media_jobs …) is wired to /social/ai/projects.
const JOB_FAMILIES = [
    {
        name: 'chart',
        jobsTable: 'social_ai_chart_jobs',
        junctionTable: 'social_ai_chart_job_media',
        linkColumn: 'chart_job_id',
        galleryPrefix: 'gallery/chart_jobs'
    }
];

const messages = {
    userRequired: 'No login user authentication.',
    notFound: 'Project not found.',
    noPermission: 'You are not allowed to access this project.',
    groupNotFound: 'Group not found.',
    invalidProjectId: '`id` is required.',
    nameRequired: 'Project name is required.',
    activeJobs: 'Cannot delete a project while it has queued or running jobs.'
};

// @ts-ignore
const getPayload = (frame) => frame.data?.socialaiprojects?.[0] || {};
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
const SocialAiProjectModel = models.SocialAiProject;
// @ts-ignore
const TABLE = SocialAiProjectModel?.prototype?.tableName || 'social_ai_projects';

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
    name: row.name,
    description: row.description || null,
    tags: parseJson(row.tags, []),
    status: row.status,
    user_id: row.user_id || null,
    group_id: row.group_id || null,
    created_at: row.created_at,
    updated_at: row.updated_at
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

// Review 2026-08-07 #1: destructive operations (destroy) must require write
// permission — `read` is granted to any valid group member, including archived
// ones, so a read-only member could otherwise cascade-delete the project.
// @ts-ignore
const assertCanWriteRow = (args) => assertRowAccess({ ...args, permission: 'write' });

// @ts-ignore
const loadModelOrThrow = async (id) => {
    if (!id) {
        throw new errors.ValidationError({
            message: tpl(messages.invalidProjectId)
        });
    }
    // @ts-ignore
    const model = await SocialAiProjectModel.findOne({ id });
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
            message: tpl(messages.invalidProjectId)
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
    docName: 'socialaiprojects',

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

            // H3 pattern (mirror social-ai-chart-jobs): a non-admin browser user
            // only sees their own projects. Integration/host + admins keep the
            // full listing.
            const integrationId = getCurrentIntegrationId(frame);
            const isAdmin = targetUserId ? await isAdminUser(targetUserId) : false;
            let options = { ...frame.options, withRelated: ALLOWED_INCLUDES };
            if (!integrationId && !isAdmin && !groupId && targetUserId) {
                const baseFilter = String(frame.options?.filter || '').trim();
                options = {
                    ...options,
                    filter: baseFilter ? `${baseFilter}+user_id:${targetUserId}` : `user_id:${targetUserId}`
                };
            }

            // @ts-ignore
            return await SocialAiProjectModel.findPage(options);
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
            const model = await loadModelOrThrow(frame.options.id);
            await assertCanReadRow({ frame, row: model.toJSON() });
            return model;
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
            'name',
            'description',
            'tags'
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

            const name = String(payloadInput.name || '').trim();
            if (!name) {
                throw new errors.ValidationError({
                    message: tpl(messages.nameRequired)
                });
            }

            // @ts-ignore
            const added = await SocialAiProjectModel.add({
                name,
                description: payloadInput.description || null,
                tags: typeof payloadInput.tags === 'string'
                    ? payloadInput.tags
                    : JSON.stringify(payloadInput.tags || []),
                status: socialAiProjectsUtil.PROJECT_STATUS.DRAFT,
                user_id: targetUserId || currentUserId,
                group_id: groupId
            }, frame.options);

            return added;
        }
    },

    // @ts-ignore
    edit: {
        headers: { cacheInvalidate: false },
        options: ['id'],
        data: ['name', 'description', 'tags'],
        permissions: false,
        async query(frame) {
            const knex = models.Base.knex;
            const payloadInput = getPayload(frame);
            const currentUserId = getCurrentUserId(frame);
            const row = await loadRowOrThrow(knex, frame.options?.id);
            // Write permission (not read) — editing metadata is a mutation.
            await assertCanWriteRow({ frame, row });

            const update = {};
            if (payloadInput.name !== undefined) {
                const name = String(payloadInput.name || '').trim();
                if (!name) {
                    throw new errors.ValidationError({ message: tpl(messages.nameRequired) });
                }
                update.name = name;
            }
            if (payloadInput.description !== undefined) {
                update.description = payloadInput.description || null;
            }
            if (payloadInput.tags !== undefined) {
                update.tags = typeof payloadInput.tags === 'string'
                    ? payloadInput.tags
                    : JSON.stringify(payloadInput.tags || []);
            }
            update.updated_at = new Date().toISOString().slice(0, 19).replace('T', ' ');
            // RAW update (avoid toJSON dropping updated_by, which is NOT NULL).
            update.updated_by = knex.raw('COALESCE(?, updated_by, user_id)', [currentUserId || null]);

            await knex(TABLE).where({ id: row.id }).update(update);
            // @ts-ignore
            return await loadModelOrThrow(row.id);
        }
    },

    // @ts-ignore
    destroy: {
        options: ['id'],
        permissions: false,
        async query(frame) {
            const knex = models.Base.knex;
            const row = await loadRowOrThrow(knex, frame.options?.id);
            await assertCanWriteRow({ frame, row });

            // Review 2026-08-07 #2: the project is generic — the active-jobs
            // check and the cascade iterate the registered job families
            // instead of hardcoding social_ai_chart_jobs, so a 2nd family
            // (media_jobs …) hangs off the same project without breaking
            // destroy. Add a family entry when a new family ships.
            const deletedJobs = [];
            // Best-effort gallery-bucket object cleanup (mirrors job destroy).
            // Must not block the DB delete — failures are logged.
            const cleanupGalleryBucket = async (childId) => {
                try {
                    const mediaStore = storage.getStorage('media');
                    if (!mediaStore || typeof mediaStore.delete !== 'function') {
                        return;
                    }
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
                    if (typeof mediaStore.list === 'function') {
                        const root = mediaStore.pathPrefix || mediaStore.storagePath || '';
                        const prefix = [root, 'gallery', 'chart_jobs', childId]
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
                    logging.warn(`[social-ai-projects] gallery S3 cleanup failed for job ${childId}: ${err?.message || err}`);
                }
            };

            try {
                await knex.transaction(async (trx) => {
                    for (const family of JOB_FAMILIES) {
                        // M7: reject while any child job is queued/running —
                        // deleting an active project is irreversible and would
                        // strand a worker mid-run. Check INSIDE the same
                        // transaction as the cascade (review #4: no
                        // check-then-delete race with worker claim).
                        const active = await trx(family.jobsTable)
                            .where({project_id: row.id})
                            .whereIn('status', ['queued', 'running'])
                            .select('id');
                        if (active.length > 0) {
                            throw new errors.ValidationError({
                                message: tpl(messages.activeJobs)
                            });
                        }

                        const childJobs = await trx(family.jobsTable)
                            .where({project_id: row.id})
                            .select('id');
                        const childIds = childJobs.map((j) => j.id);
                        if (childIds.length === 0) {
                            continue;
                        }
                        deletedJobs.push(...childIds);

                        await trx(family.junctionTable)
                            .whereIn(family.linkColumn, childIds)
                            .del();

                        // Asset rows of the project's jobs. The project is
                        // going away entirely, so ALL of its rows go (unlike
                        // job destroy — H3 — where artifacts rows must survive
                        // for other jobs). Review #3: gallery paths are
                        // per-JOB (`gallery/chart_jobs/{jobId}/`), so the LIKE
                        // clauses enumerate the child job ids — the old
                        // project-id clause never matched.
                        const galleryLikes = childIds.map((cid) => `storage_key LIKE ?`);
                        const galleryParams = childIds.flatMap((cid) => [`%gallery/chart_jobs/${cid}/%`]);
                        const jobAreaLikes = childIds.map(() => `storage_key LIKE ?`);
                        const jobAreaParams = childIds.flatMap((cid) => [`%/jobs/${cid}/%`]);
                        await trx('social_media_assets')
                            .where(function () {
                                this.whereIn(family.linkColumn, childIds)
                                    .orWhereRaw(`(${jobAreaLikes.join(' OR ')})`, jobAreaParams);
                            })
                            .orWhereRaw(`(${galleryLikes.join(' OR ')})`, galleryParams)
                            .del();

                        await trx(family.jobsTable)
                            .whereIn('id', childIds)
                            .del();
                    }

                    await trx(TABLE).where({ id: row.id }).del();
                });
            } finally {
                // Gallery-bucket objects: best-effort, after the transaction
                // (objects have no FK; deleting them must never roll back the
                // DB cascade).
                for (const cid of deletedJobs) {
                    await cleanupGalleryBucket(cid);
                }
            }

            return {
                ...serializeRow({
                    ...row,
                    status: 'deleted'
                }),
                deleted_jobs: deletedJobs.length
            };
        }
    },

    // Clear a project's job MEDIA to reclaim S3 space after completion, KEEPING
    // the job rows (decision #4). Deletes the project's social_media_assets rows
    // (junction cascades on media_id FK), marks each job result.cleared so the
    // job page stops showing the (now gone) artifacts, then best-effort empties
    // the S3 folders. include_artifacts=false keeps the published artifacts/.
    clearArtifacts: {
        options: ['id', 'include_artifacts'],
        permissions: false,
        async query(frame) {
            const knex = models.Base.knex;
            const row = await loadRowOrThrow(knex, frame.options?.id);
            await assertCanWriteRow({ frame, row });

            // Default true: clear published media too (user chose media deletion
            // for space). Pass include_artifacts=false to keep artifacts/.
            const includeArtifacts = String(frame.options?.include_artifacts ?? 'true') !== 'false';
            const clearedJobs = [];
            const clearedAt = new Date();

            await knex.transaction(async (trx) => {
                for (const family of JOB_FAMILIES) {
                    const active = await trx(family.jobsTable)
                        .where({project_id: row.id})
                        .whereIn('status', ['queued', 'running'])
                        .select('id');
                    if (active.length > 0) {
                        throw new errors.ValidationError({
                            message: tpl(messages.activeJobs)
                        });
                    }

                    const childJobs = await trx(family.jobsTable)
                        .where({project_id: row.id})
                        .select('id', 'result');
                    const childIds = childJobs.map((j) => j.id);
                    if (childIds.length === 0) {
                        continue;
                    }

                    // Delete the project's media rows: direct project uploads
                    // (project_id) + job-linked + working/gallery paths. Junction
                    // rows cascade via the media_id FK. Jobs are KEPT.
                    const galleryLikes = childIds.map(() => 'storage_key LIKE ?');
                    const galleryParams = childIds.flatMap((cid) => [`%gallery/chart_jobs/${cid}/%`]);
                    const jobAreaLikes = childIds.map(() => 'storage_key LIKE ?');
                    const jobAreaParams = childIds.flatMap((cid) => [`%/jobs/${cid}/%`]);
                    await trx('social_media_assets')
                        .where(function () {
                            this.where('project_id', row.id)
                                .orWhereIn(family.linkColumn, childIds)
                                .orWhereRaw(`(${jobAreaLikes.join(' OR ')})`, jobAreaParams)
                                .orWhereRaw(`(${galleryLikes.join(' OR ')})`, galleryParams);
                        })
                        .del();

                    // Mark each job cleared (job row stays; UI hides artifacts).
                    for (const j of childJobs) {
                        let result = {};
                        try {
                            result = j.result ? JSON.parse(j.result) : {};
                        } catch (err) {
                            result = {};
                        }
                        if (!result || typeof result !== 'object') {
                            result = {};
                        }
                        result.cleared = true;
                        result.cleared_at = clearedAt.toISOString();
                        await trx(family.jobsTable).where({id: j.id}).update({result: JSON.stringify(result)});
                    }
                    clearedJobs.push(...childIds);
                }
            });

            // Best-effort S3 emptying AFTER the transaction (objects have no FK,
            // so failures must never roll back the DB clear).
            const mediaStore = storage.getStorage('media');
            const emptyPrefix = async (prefix) => {
                const clean = String(prefix || '').replace(/^\/+/, '');
                if (!clean || !mediaStore) {
                    return 0;
                }
                try {
                    if (typeof mediaStore.deletePrefix === 'function') {
                        return await mediaStore.deletePrefix(clean);
                    }
                    // Fallback for adapters without bulk delete (filesystem/local).
                    if (typeof mediaStore.list === 'function' && typeof mediaStore.delete === 'function') {
                        let cursor = null;
                        let count = 0;
                        do {
                            const listed = await mediaStore.list({prefix: clean, limit: 1000, continuationToken: cursor});
                            const items = Array.isArray(listed?.items) ? listed.items : [];
                            for (const item of items) {
                                const key = String(item.key || item.path || '').replace(/^\/+/, '');
                                if (!key) {
                                    continue;
                                }
                                const parts = key.split('/');
                                const name = parts.pop();
                                await mediaStore.delete(name, parts.join('/'));
                                count += 1;
                            }
                            cursor = listed?.nextCursor || null;
                        } while (cursor);
                        return count;
                    }
                } catch (err) {
                    logging.warn(`[social-ai-projects] clear S3 cleanup failed for ${clean}: ${err?.message || err}`);
                }
                return 0;
            };

            const root = (mediaStore && (mediaStore.pathPrefix || mediaStore.storagePath)) || '';
            const withRoot = (p) => [root, p].filter(Boolean).join('/').replace(/\/+/g, '/');
            let deletedObjects = 0;
            for (const cid of clearedJobs) {
                deletedObjects += await emptyPrefix(withRoot(`gallery/chart_jobs/${cid}/`));
            }
            deletedObjects += await emptyPrefix(withRoot(`gallery/chart_projects/${row.id}/`));
            // Worker areas live under the chart-jobs/{projectId}/ prefix (same bucket).
            deletedObjects += await emptyPrefix(`chart-jobs/${row.id}/jobs/`);
            if (includeArtifacts) {
                deletedObjects += await emptyPrefix(`chart-jobs/${row.id}/artifacts/`);
            }

            return {
                ...serializeRow(row),
                cleared_jobs: clearedJobs.length,
                deleted_objects: deletedObjects,
                include_artifacts: includeArtifacts
            };
        }
    }
};

module.exports = controller;
