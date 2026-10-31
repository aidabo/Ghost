// @ts-ignore
const tpl = require('@tryghost/tpl');
const errors = require('@tryghost/errors');
const ObjectId = require('bson-objectid').default;
const models = require('../../models');
const logging = require('@tryghost/logging');
const storage = require('../../adapters/storage');
const socialAiProjectsUtil = require('./utils/social-ai-projects');
const staffScope = require('./utils/staff-scope');

const ALLOWED_INCLUDES = ['user', 'group'];
const PROJECT_MEMBERS = 'social_ai_project_members';
const STAFF_ROLES = ['Owner', 'Administrator', 'Super Editor', 'Editor', 'Author', 'Contributor'];

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
    },
    {
        name: 'content-bundle',
        jobsTable: 'social_ai_content_bundle_jobs',
        junctionTable: null,
        linkColumn: null,
        assetLinkColumn: null,
        galleryPrefixParts: ['gallery', 'content_bundles']
    },
    {
        // News Agent family (2026-09-29) — its own table, own asset link column,
        // own junction (which carries item_key/post_id: one job = many articles)
        // and own owner_scope/S3 prefix. Never chart's.
        name: 'news',
        jobsTable: 'social_ai_news_jobs',
        junctionTable: 'social_ai_news_job_media',
        linkColumn: 'news_job_id',
        assetLinkColumn: 'news_job_id',
        galleryPrefixParts: ['gallery', 'news_jobs']
    }
];

const messages = {
    userRequired: 'No login user authentication.',
    notFound: 'Project not found.',
    noPermission: 'You are not allowed to access this project.',
    groupNotFound: 'Group not found.',
    invalidProjectId: '`id` is required.',
    nameRequired: 'Project name is required.',
    activeJobs: 'Cannot delete a project while it has queued or running jobs.',
    selectedBroadcastAssets: 'Cannot delete a project while one of its assets is selected for a virtual broadcast. Clear the broadcast selection first.'
};

// @ts-ignore
const getPayload = (frame) => frame.data?.socialaiprojects?.[0] || {};
// @ts-ignore
const getCurrentUserId = frame => frame.options?.context?.user || null;
// @ts-ignore
const {getIntegrationId: getCurrentIntegrationId} = require('./utils/integration-context');
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

// System admin (Owner / Administrator / Admin). Super Editor is not: it reads
// and manages newsroom (no-group / public-group) projects only (assertRowAccess
// / assertCanWriteRow / browse).
// @ts-ignore
const isAdminUser = async userId => (await staffScope.getStaffScope(userId)).isSystemAdmin;

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
    const scope = await staffScope.getStaffScope(currentUserId);
    if (scope.isSystemAdmin) {
        return;
    }
    // Super Editor reads a public group without membership (writes unchanged).
    if (permission === 'read' && staffScope.isNewsroomGroup(scope, groupId)) {
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
    const scope = await staffScope.getStaffScope(currentUserId);

    if (integrationId || scope.isSystemAdmin) {
        return;
    }
    const newsroomReadScope = permission === 'read' ? await staffScope.getNewsroomReadScope(currentUserId) : null;
    if (permission === 'read' && (staffScope.canReadRowAsNoGroupReader(scope, row) || staffScope.canReadPublishedProject(newsroomReadScope, row))) {
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

// Write (edit/destroy) is restricted to system admin, the content author
// (user_id), or a group owner/admin of the project's group. A regular group
// member — even an active one — cannot mutate a project they did not create
// (canAccessGroup('write') would allow any active member, which is too broad).
// Integration/host context (workers, server-to-server) bypasses. Single source
// of truth: SocialGroupMember.canEditGroupContent. Super Editor manages
// newsroom projects (no group / public group) of any owner.
// @ts-ignore
const assertCanWriteRow = async ({ frame, row }) => {
    const integrationId = getCurrentIntegrationId(frame);
    if (integrationId) {
        return;
    }
    const currentUserId = getCurrentUserId(frame);
    const scope = await staffScope.getStaffScope(currentUserId);
    if (staffScope.canManageAsNewsroomEditor(scope, row)) {
        // Returned so cascading writes can keep a newsroom-rule Super Editor
        // inside newsroom content (assertCascadeIsNewsroom).
        return staffScope.actsAsNewsroomEditor(scope, row.user_id, currentUserId) ? scope : null;
    }
    const targetUserId = await resolveTargetUserId(frame);
    // @ts-ignore
    const allowed = await models.SocialGroupMember.canEditGroupContent({
        groupId: row.group_id,
        authorId: row.user_id,
        userId: targetUserId || currentUserId
    });
    if (!allowed) {
        throw new errors.NoPermissionError({message: tpl(messages.noPermission)});
    }
};

// A Super Editor that may write a newsroom project only through the newsroom
// rule must not destroy / clear what is not newsroom inside it: a newsroom
// project can hold jobs of non-public groups (and their assets). Refuse when
// the project holds any such job (job families, or DZI jobs linked through
// social_ai_dzi_job_projects) or any asset the gallery would hide from it.
const assertCascadeIsNewsroom = async (knex, project, scope) => {
    const nonNewsroom = (query, column) => {
        query.whereNotNull(column);
        if (scope.publicGroupIds.length) {
            query.whereNotIn(column, scope.publicGroupIds);
        }
        return query;
    };
    const refuse = () => {
        throw new errors.NoPermissionError({message: tpl(messages.noPermission)});
    };
    for (const family of JOB_FAMILIES) {
        if (await nonNewsroom(knex(family.jobsTable).where({project_id: project.id}), 'group_id').first('id')) {
            refuse();
        }
    }
    const dzi = knex('social_ai_dzi_job_projects as djp')
        .join('social_ai_dzi_jobs as j', 'j.id', 'djp.dzi_job_id')
        .where('djp.project_id', project.id);
    if (await nonNewsroom(dzi, 'j.group_id').first('j.id')) {
        refuse();
    }
    await staffScope.assertAssetsAreNewsroom(knex, scope, (qb) => {
        qb.where('sma.project_id', project.id);
        for (const family of JOB_FAMILIES) {
            if (family.assetLinkColumn) {
                qb.orWhereIn(`sma.${family.assetLinkColumn}`, knex(family.jobsTable).where({project_id: project.id}).select('id'));
            }
        }
    });
};

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

// Stamp computed `can_edit` on each returned project so the frontend shows/hides
// edit controls (backend single source of truth). Mirrors the write gate.
const attachCanEdit = async (entryOrCollection, userId, isAdmin, scope = null) => {
    let list = [];
    const src = (entryOrCollection && entryOrCollection.data !== undefined) ? entryOrCollection.data : entryOrCollection;
    if (Array.isArray(src)) {
        list = src;
    } else if (src && Array.isArray(src.models)) {
        list = src.models;
    } else if (src && typeof src.get === 'function') {
        list = [src];
    }
    for (const m of list) {
        if (!m || typeof m.get !== 'function') {
            continue;
        }
        const canEdit = isAdmin || staffScope.canManageAsNewsroomEditor(scope, m) || await models.SocialGroupMember.canEditGroupContent({
            groupId: m.get('group_id'),
            authorId: m.get('user_id'),
            userId
        });
        m.set('can_edit', canEdit);
    }
    return entryOrCollection;
};

const serializeProjectMember = row => ({
    id: row.id,
    project_id: row.project_id,
    user_id: row.user_id,
    role: row.role,
    email: row.email || null,
    name: row.name || null,
    created_at: row.created_at,
    updated_at: row.updated_at
});

const loadProjectMember = async (knex, id) => knex(`${PROJECT_MEMBERS} as pm`)
    .join('users as u', 'u.id', 'pm.user_id')
    .where('pm.id', id)
    .select('pm.*', 'u.email', 'u.name')
    .first();

const assertProjectMemberWrite = async (frame, projectId) => {
    const row = await loadRowOrThrow(models.Base.knex, projectId);
    await assertCanWriteRow({frame, row});
    return row;
};

const projectMembersController = {
    docName: 'socialaiprojectmembers',
    browse: {
        options: ['id'],
        permissions: false,
        async query(frame) {
            const project = await loadRowOrThrow(models.Base.knex, frame.options?.id);
            await assertCanReadRow({frame, row: project});
            const rows = await models.Base.knex(`${PROJECT_MEMBERS} as pm`)
                .join('users as u', 'u.id', 'pm.user_id')
                .where('pm.project_id', project.id)
                .select('pm.*', 'u.email', 'u.name')
                .orderBy('u.name', 'asc')
                .orderBy('u.email', 'asc');
            return {data: rows.map(serializeProjectMember)};
        }
    },
    staff: {
        options: ['id', 'q', 'limit'],
        permissions: false,
        async query(frame) {
            const project = await loadRowOrThrow(models.Base.knex, frame.options?.id);
            await assertCanReadRow({frame, row: project});
            const limit = Math.min(100, Math.max(1, Number(frame.options?.limit || 50) || 50));
            const q = String(frame.options?.q || '').trim();
            const query = models.Base.knex('users as u')
                .join('roles_users as ru', 'ru.user_id', 'u.id')
                .join('roles as r', 'r.id', 'ru.role_id')
                .whereIn('r.name', STAFF_ROLES)
                .select('u.id as user_id', 'u.email', 'u.name')
                .distinct()
                .orderBy('u.name', 'asc')
                .orderBy('u.email', 'asc')
                .limit(limit);
            if (q) {
                query.andWhere(function () {
                    this.where('u.email', 'like', `%${q}%`).orWhere('u.name', 'like', `%${q}%`);
                });
            }
            return {data: await query};
        }
    },
    add: {
        options: ['id'],
        permissions: false,
        async query(frame) {
            const project = await assertProjectMemberWrite(frame, frame.options?.id);
            const actor = getCurrentUserId(frame);
            if (!actor) {
                throw new errors.NoPermissionError({message: tpl(messages.userRequired)});
            }
            const input = frame.data?.socialaiprojectmembers?.[0] || frame.data || {};
            const userId = String(input.user_id || '').trim();
            const role = String(input.role || 'viewer').trim();
            if (!userId || !STAFF_ROLES.length || !['viewer', 'editor'].includes(role)) {
                throw new errors.ValidationError({message: '`user_id` and a valid `role` are required.'});
            }
            const staff = await models.Base.knex('users as u')
                .join('roles_users as ru', 'ru.user_id', 'u.id')
                .join('roles as r', 'r.id', 'ru.role_id')
                .where('u.id', userId)
                .whereIn('r.name', STAFF_ROLES)
                .first('u.id');
            if (!staff) {
                throw new errors.ValidationError({message: 'The selected user is not an active staff user.'});
            }
            const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
            const existing = await models.Base.knex(PROJECT_MEMBERS).where({project_id: project.id, user_id: userId}).first();
            if (existing) {
                await models.Base.knex(PROJECT_MEMBERS).where({id: existing.id}).update({role, updated_by: actor || null, updated_at: now});
            } else {
                await models.Base.knex(PROJECT_MEMBERS).insert({
                    id: ObjectId().toHexString(),
                    project_id: project.id,
                    user_id: userId,
                    role,
                    created_by: actor,
                    created_at: now,
                    updated_at: now,
                    updated_by: actor || null
                });
            }
            return serializeProjectMember(await loadProjectMember(models.Base.knex, existing?.id || (await models.Base.knex(PROJECT_MEMBERS).where({project_id: project.id, user_id: userId}).first('id')).id));
        }
    },
    destroy: {
        options: ['id'],
        permissions: false,
        async query(frame) {
            const member = await loadProjectMember(models.Base.knex, frame.options?.id);
            if (!member) throw new errors.NotFoundError({message: 'Project member not found.'});
            await assertProjectMemberWrite(frame, member.project_id);
            await models.Base.knex(PROJECT_MEMBERS).where({id: member.id}).del();
            return {id: member.id, deleted: true};
        }
    }
};

/** @type {import('@tryghost/api-framework').Controller} */
const controller = {
    docName: 'socialaiprojects',
    members: projectMembersController,

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
            const scope = targetUserId ? await staffScope.getStaffScope(targetUserId) : null;
            const isAdmin = Boolean(scope?.isSystemAdmin);
            let options = { ...frame.options, withRelated: ALLOWED_INCLUDES };
            // Scope clauses are AND-ed through staffScope.andFilter, so the
            // caller filter can never escape them.
            if (!integrationId && !isAdmin && !groupId && targetUserId) {
                // Published no-group/public-group Projects are shared staff
                // containers. The owner remains visible for draft/private rows.
                const readScope = await staffScope.getNewsroomReadScope(targetUserId);
                options = {
                    ...options,
                    filter: staffScope.andFilter(frame.options?.filter, staffScope.publishedProjectOrOwnFilter(readScope, targetUserId, 'user_id'))
                };
            } else if (!integrationId && !isAdmin && groupId) {
                // The checked group must reach the query: the bare group_id
                // option is not a permitted findPage option, so without this a
                // member of one group listed every project (and a Super Editor
                // passing a public group listed everything).
                options = {
                    ...options,
                    filter: staffScope.andFilter(frame.options?.filter, `group_id:${staffScope.nqlId(groupId, 'group_id')}`)
                };
            }

            // @ts-ignore
            const result = await SocialAiProjectModel.findPage(options);
            await attachCanEdit(result, targetUserId || getCurrentUserId(frame), isAdmin, scope);
            return result;
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
            const newsroomScope = await assertCanWriteRow({ frame, row });
            // Checked before the cascade (and before its S3 cleanup, which
            // runs in `finally` even when the transaction fails).
            if (newsroomScope) {
                await assertCascadeIsNewsroom(knex, row, newsroomScope);
            }

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
                    const selectedBroadcast = await trx('social_ai_avatar_broadcast_selections as s')
                        .join('social_media_assets as sma', 'sma.id', 's.media_id')
                        .where('sma.project_id', row.id)
                        .first('s.post_id');
                    if (selectedBroadcast) {
                        throw new errors.ValidationError({message: tpl(messages.selectedBroadcastAssets)});
                    }

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
            const newsroomScope = await assertCanWriteRow({ frame, row });
            if (newsroomScope) {
                await assertCascadeIsNewsroom(knex, row, newsroomScope);
            }

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
