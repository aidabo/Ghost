// @ts-ignore
const tpl = require('@tryghost/tpl');
const errors = require('@tryghost/errors');
const models = require('../../models');
const ObjectId = require('bson-objectid').default;

// Project Content Links — Phase 1: browse/add/destroy links attaching
// posts, StackPages, or gallery entries to a project.
// project_id lives in the URL for browse/add; link id lives in the URL for destroy.

// Super Editor added to align with bbfcc5ab78 / 79b09f3d0e admin-roles policy.
const ADMIN_ROLES = new Set(['Owner', 'Administrator', 'Admin', 'Super Editor']);
const VALID_LINK_TYPES = new Set(['post', 'stackpage', 'gallery']);
const TABLE = 'social_ai_project_links';
const PROJECTS_TABLE = 'social_ai_projects';

const messages = {
    userRequired: 'No login user authentication.',
    projectNotFound: 'Project not found.',
    linkNotFound: 'Project link not found.',
    noPermission: 'You are not allowed to access this project.',
    invalidProjectId: '`id` is required.',
    linkTypeRequired: '`link_type` must be one of: post, stackpage, gallery.',
    linkIdRequired: '`link_id` is required.',
    duplicateLink: 'This resource is already linked to the project.'
};

// @ts-ignore
const getCurrentUserId = frame => frame.options?.context?.user || null;
// @ts-ignore
const getCurrentIntegrationId = frame => frame.options?.context?.integration || null;
// @ts-ignore
const getProjectId = frame => frame.options?.id || null;
const nowMySql = () => new Date().toISOString().slice(0, 19).replace('T', ' ');

// @ts-ignore
const isAdminUser = async (userId) => {
    if (!userId) {
        return false;
    }
    // @ts-ignore
    const user = await models.User.findOne({id: userId}, {withRelated: ['roles']});
    if (!user) {
        return false;
    }
    const roles = user.related('roles')?.models || [];
    // @ts-ignore
    return roles.some(role => ADMIN_ROLES.has(role.get('name')));
};

// Verify caller can access the given project with the requested permission.
// Returns the project row on success; throws otherwise.
// @ts-ignore
const assertProjectAccess = async (knex, projectId, frame, permission = 'read') => {
    if (!projectId) {
        throw new errors.ValidationError({message: tpl(messages.invalidProjectId)});
    }

    const project = await knex(PROJECTS_TABLE).where({id: projectId}).first();
    if (!project) {
        throw new errors.NotFoundError({message: tpl(messages.projectNotFound)});
    }

    const currentUserId = getCurrentUserId(frame);
    const integrationId = getCurrentIntegrationId(frame);

    // Integration / admin tokens bypass user checks.
    if (integrationId) {
        return project;
    }

    if (!currentUserId) {
        throw new errors.NoPermissionError({message: tpl(messages.userRequired)});
    }

    const isAdmin = await isAdminUser(currentUserId);
    if (isAdmin) {
        return project;
    }

    // Group-scoped project: verify group membership.
    if (project.group_id) {
        // @ts-ignore
        const group = await models.SocialGroup.findOne({id: project.group_id});
        // @ts-ignore
        const allowed = group ? await models.SocialGroup.canAccessGroup(group, currentUserId, permission) : false;
        if (!allowed) {
            throw new errors.NoPermissionError({message: tpl(messages.noPermission)});
        }
        return project;
    }

    // User-scoped project: must be the owner.
    if (project.user_id !== currentUserId) {
        throw new errors.NoPermissionError({message: tpl(messages.noPermission)});
    }

    return project;
};

// @ts-ignore
const serializeLink = row => ({
    id: row.id,
    project_id: row.project_id,
    link_type: row.link_type,
    link_id: row.link_id,
    link_title: row.link_title || null,
    link_url: row.link_url || null,
    sort_order: row.sort_order != null ? Number(row.sort_order) : null,
    created_at: row.created_at,
    created_by: row.created_by || null
});

/** @type {import('@tryghost/api-framework').Controller} */
const controller = {
    docName: 'socialaiprojectlinks',

    // GET /social/ai/projects/:id/links — list all links for a project.
    browse: {
        headers: {cacheInvalidate: false},
        options: ['id'],
        permissions: false,
        async query(frame) {
            const knex = models.Base.knex;
            const projectId = getProjectId(frame);
            await assertProjectAccess(knex, projectId, frame, 'read');
            const rows = await knex(TABLE)
                .where({project_id: projectId})
                .orderBy('sort_order', 'asc')
                .orderBy('created_at', 'asc');
            // Return {data, meta} so Ghost's default serializer re-keys it
            // under the docName: {socialaiprojectlinks: [...]} in the response.
            return {data: rows.map(serializeLink), meta: {}};
        }
    },

    // POST /social/ai/projects/:id/links — add a link to a project.
    add: {
        statusCode: 201,
        headers: {cacheInvalidate: false},
        options: ['id'],
        data: ['link_type', 'link_id', 'link_title', 'link_url', 'sort_order'],
        permissions: false,
        async query(frame) {
            const knex = models.Base.knex;
            const projectId = getProjectId(frame);
            await assertProjectAccess(knex, projectId, frame, 'write');

            // @ts-ignore
            const payload = frame.data?.socialaiprojectlinks?.[0] || {};

            const linkType = String(payload.link_type || '').trim();
            if (!linkType || !VALID_LINK_TYPES.has(linkType)) {
                throw new errors.ValidationError({message: tpl(messages.linkTypeRequired)});
            }
            const linkId = String(payload.link_id || '').trim();
            if (!linkId) {
                throw new errors.ValidationError({message: tpl(messages.linkIdRequired)});
            }

            // Prevent duplicate (project_id, link_type, link_id) entries.
            const existing = await knex(TABLE)
                .where({project_id: projectId, link_type: linkType, link_id: linkId})
                .first();
            if (existing) {
                throw new errors.ValidationError({message: tpl(messages.duplicateLink)});
            }

            const currentUserId = getCurrentUserId(frame);
            const id = new ObjectId().toHexString();
            const now = nowMySql();

            const row = {
                id,
                project_id: projectId,
                link_type: linkType,
                link_id: linkId,
                link_title: String(payload.link_title || '').trim() || null,
                link_url: String(payload.link_url || '').trim() || null,
                sort_order: payload.sort_order != null ? Number(payload.sort_order) : null,
                created_at: now,
                created_by: currentUserId || null
            };

            await knex(TABLE).insert(row);
            return {data: [serializeLink(row)], meta: {}};
        }
    },

    // DELETE /social/ai/project-links/:id — remove a specific link by its own id.
    // Verifies project write access before deleting.
    destroy: {
        options: ['id'],
        permissions: false,
        async query(frame) {
            const knex = models.Base.knex;
            const linkId = getProjectId(frame); // :id in /project-links/:id route = link id

            if (!linkId) {
                throw new errors.ValidationError({message: tpl(messages.invalidProjectId)});
            }

            const link = await knex(TABLE).where({id: linkId}).first();
            if (!link) {
                throw new errors.NotFoundError({message: tpl(messages.linkNotFound)});
            }

            // Check write permission on the owning project before deleting.
            await assertProjectAccess(knex, link.project_id, frame, 'write');
            await knex(TABLE).where({id: linkId}).del();
            return serializeLink(link);
        }
    }
};

module.exports = controller;
