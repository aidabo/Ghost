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
// Phase 3: media jobs family added. destroy iterates this list for
// active-jobs check and cascade — add an entry when a new family ships.
// Phase 3: media jobs family added. destroy iterates this list for
// active-jobs check and cascade — add an entry when a new family ships.
// assetLinkColumn: column on social_media_assets that links to this family's job id.
// junctionTable/linkColumn: null when the family has no media junction table.
const JOB_FAMILIES = [
    {
        name: 'chart',
        jobsTable: 'social_ai_chart_jobs',
        junctionTable: 'social_ai_chart_job_media',
        linkColumn: 'chart_job_id',
        assetLinkColumn: 'chart_job_id',
        galleryPrefixParts: ['gallery', 'chart_jobs']
    },
    {
        name: 'media',
        jobsTable: 'social_ai_media_jobs',
        junctionTable: null,
        linkColumn: null,
        assetLinkColumn: 'job_id',
        galleryPrefixParts: ['gallery', 'media_jobs']
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
        data: ['name', 'description', 'tags', 'status'],
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
            if (payloadInput.status !== undefined) {
                // User-controlled publication state — enum: draft | published.
                // (The old derived draft/active/completed scheme was removed —
                // review M2: job transitions no longer touch project status.)
                const status = String(payloadInput.status || '').trim();
                if (status !== 'draft' && status !== 'published') {
                    throw new errors.ValidationError({
                        message: '`status` must be one of: draft, published.'
                    });
                }
                update.status = status;
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
            const cleanupGalleryPrefix = async (prefixParts) => {
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
                        const prefix = [root, ...prefixParts]
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
                    logging.warn(`[social-ai-projects] gallery S3 cleanup failed for prefix ${prefixParts.join('/')}: ${err?.message || err}`);
                }
            };
            const cleanupGalleryBucket = (family, childId) =>
                cleanupGalleryPrefix([...family.galleryPrefixParts, childId]);

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
                        deletedJobs.push({family, ids: childIds});

                        // Junction table (chart → chart_job_media; media → none).
                        if (family.junctionTable) {
                            await trx(family.junctionTable)
                                .whereIn(family.linkColumn, childIds)
                                .del();
                        }

                        // Asset rows of the project's jobs. The project is
                        // going away entirely, so ALL of its rows go (unlike
                        // job destroy — H3 — where artifacts rows must survive
                        // for other jobs). gallery paths are per-JOB, so the
                        // LIKE clauses enumerate the child job ids.
                        const galleryPfx = family.galleryPrefixParts.join('/');
                        const galleryLikes = childIds.map(() => `storage_key LIKE ?`);
                        const galleryParams = childIds.flatMap((cid) => [`%${galleryPfx}/${cid}/%`]);
                        const jobAreaLikes = childIds.map(() => `storage_key LIKE ?`);
                        const jobAreaParams = childIds.flatMap((cid) => [`%/jobs/${cid}/%`]);
                        const assetCol = family.assetLinkColumn;
                        await trx('social_media_assets')
                            .where(function () {
                                if (assetCol) {
                                    this.whereIn(assetCol, childIds);
                                }
                                this.orWhereRaw(`(${jobAreaLikes.join(' OR ')})`, jobAreaParams);
                            })
                            .orWhereRaw(`(${galleryLikes.join(' OR ')})`, galleryParams)
                            .del();

                        await trx(family.jobsTable)
                            .whereIn('id', childIds)
                            .del();
                    }

                    // Direct project-stamped rows: uploads that target the
                    // project tree itself (media → gallery/projects/{pid}/…,
                    // legacy chart → gallery/chart_projects/{pid}/). The
                    // per-family cascade above covers rows linked through job
                    // families; these are project-direct uploads.
                    await trx('social_media_assets').where({project_id: row.id}).del();

                    // Phase 1: project content links (posts/StackPages/gallery).
                    await trx('social_ai_project_links').where({project_id: row.id}).del();

                    await trx(TABLE).where({ id: row.id }).del();
                });
            } finally {
                // Gallery-bucket objects: best-effort, after the transaction
                // (objects have no FK; deleting them must never roll back the
                // DB cascade).
                for (const {family, ids} of deletedJobs) {
                    for (const cid of ids) {
                        await cleanupGalleryBucket(family, cid);
                    }
                }
                // Project tree: direct uploads into the project itself (media →
                // gallery/projects/{pid}/…, legacy chart →
                // gallery/chart_projects/{pid}/) are prefixed by the project
                // id, not by any child job id.
                await cleanupGalleryPrefix(['gallery', 'chart_projects', row.id]);
                await cleanupGalleryPrefix(['gallery', 'projects', row.id]);
            }

            return {
                ...serializeRow({
                    ...row,
                    status: 'deleted'
                }),
                deleted_jobs: deletedJobs.reduce((sum, {ids}) => sum + ids.length, 0)
            };
        }
    },

    // Clear a project's INTERMEDIATE worker output to reclaim S3 space after
    // completion, KEEPING everything the project's charts consume:
    //   - job rows stay untouched (decision #4) — no result.cleared marking
    //   - social_media_assets rows stay untouched — the gallery display and
    //     screen search are driven by them, and the published artifacts/
    //     objects are their S3 backing
    //   - S3: ONLY chart-jobs/{projectId}/jobs/** is emptied — the worker's
    //     intermediate work area. Outputs were consolidated into artifacts/,
    //     so jobs/** is no longer needed. artifacts/ and gallery/* prefixes
    //     are NEVER touched (charts reference artifact URLs).
    // The S3 emptying itself is performed by the HOST route: this endpoint's
    // media storage points at the gallery bucket, NOT the jobs bucket
    // (think-ai-jobs/chart-jobs/...) the worker writes into — the host holds
    // the jobs-bucket credentials (socialAiChartJobS3Cleanup). This endpoint
    // is the authority for permission + active-job validation and returns the
    // cleared-job count; the host empties the prefix after this succeeds.
    clearArtifacts: {
        options: ['id'],
        permissions: false,
        async query(frame) {
            const knex = models.Base.knex;
            const row = await loadRowOrThrow(knex, frame.options?.id);
            await assertCanWriteRow({ frame, row });

            // Refuse while any job is queued/running — an in-flight run writes
            // into jobs/{jobId}/, so emptying it mid-run would corrupt output.
            let clearedJobCount = 0;
            for (const family of JOB_FAMILIES) {
                const active = await knex(family.jobsTable)
                    .where({project_id: row.id})
                    .whereIn('status', ['queued', 'running'])
                    .select('id');
                if (active.length > 0) {
                    throw new errors.ValidationError({
                        message: tpl(messages.activeJobs)
                    });
                }
                const [{c}] = await knex(family.jobsTable)
                    .where({project_id: row.id})
                    .count('id as c');
                clearedJobCount += Number(c || 0);
            }

            return {
                ...serializeRow(row),
                cleared_jobs: clearedJobCount
            };
        }
    }
};

module.exports = controller;
