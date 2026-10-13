// @ts-ignore
const tpl = require('@tryghost/tpl');
const errors = require('@tryghost/errors');
const models = require('../../models');
const staffScope = require('./utils/staff-scope');
const ObjectId = require('bson-objectid').default;

// Project Content Links — Phase 1: browse/add/destroy links attaching
// posts, StackPages, or gallery entries to a project.
// project_id lives in the URL for browse/add; link id lives in the URL for destroy.

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

    // System admin: every project. Super Editor: newsroom (no-group /
    // public-group) projects only (read and link writes, as before); other
    // group projects need membership below.
    const scope = await staffScope.getStaffScope(currentUserId);
    if (staffScope.bypassesRowCheck(scope, project)) {
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

// Link target tables + owner column per link_type, looked up in order. The
// host stores a Ghost page id (posts, type=page) as a stackpage link_id; a
// social_components id is accepted too.
const LINK_TARGETS = {
    post: [['posts', 'created_by']],
    stackpage: [['social_components', 'created_by'], ['posts', 'created_by']],
    gallery: [['social_media_assets', 'user_id']]
};

// A Super Editor reading another user's newsroom project sees only the links
// whose target it may read itself (newsroom target, its own, or a group it is
// a member of): a newsroom project can link family / private content. Gallery
// targets are judged with the gallery's newsroom-asset rule. A link whose
// target is not found is kept: its title / URL came from the project writer,
// not from a protected row.
// @ts-ignore
const filterReadableLinks = async (knex, rows, userId, scope) => {
    const targets = new Map();
    for (const [type, tables] of Object.entries(LINK_TARGETS)) {
        let ids = [...new Set(rows.filter(row => row.link_type === type).map(row => String(row.link_id)))];
        for (const [table, ownerColumn] of tables) {
            if (!ids.length) {
                break;
            }
            const found = await knex(table).whereIn('id', ids).select('id', 'group_id', `${ownerColumn} as owner_id`);
            let newsroomAssets = null;
            if (table === 'social_media_assets' && found.length) {
                newsroomAssets = new Set((await knex('social_media_assets as sma')
                    .whereIn('sma.id', found.map(target => target.id))
                    .where(qb => staffScope.whereNewsroomAsset(qb, scope))
                    .pluck('sma.id')).map(String));
            }
            found.forEach((target) => {
                const newsroom = newsroomAssets
                    ? newsroomAssets.has(String(target.id))
                    : staffScope.isNewsroomRow(target, scope.publicGroupIds);
                targets.set(`${type}:${target.id}`, {...target, newsroom});
            });
            const foundIds = new Set(found.map(target => String(target.id)));
            ids = ids.filter(id => !foundIds.has(id));
        }
    }

    const memberOf = new Map();
    const canReadGroup = async (groupId) => {
        if (!groupId) {
            return false;
        }
        if (!memberOf.has(groupId)) {
            // @ts-ignore
            const group = await models.SocialGroup.findOne({id: groupId});
            // @ts-ignore
            memberOf.set(groupId, Boolean(group && await models.SocialGroup.canAccessGroup(group, userId, 'read')));
        }
        return memberOf.get(groupId);
    };

    const readable = [];
    for (const row of rows) {
        const target = targets.get(`${row.link_type}:${row.link_id}`);
        if (
            !target ||
            target.newsroom ||
            String(target.owner_id || '') === String(userId) ||
            await canReadGroup(target.group_id)
        ) {
            readable.push(row);
        }
    }
    return readable;
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
            const project = await assertProjectAccess(knex, projectId, frame, 'read');
            let rows = await knex(TABLE)
                .where({project_id: projectId})
                .orderBy('sort_order', 'asc')
                .orderBy('created_at', 'asc');
            const currentUserId = getCurrentUserId(frame);
            const scope = await staffScope.getStaffScope(currentUserId);
            if (
                !getCurrentIntegrationId(frame) &&
                staffScope.canReadRowAsNoGroupReader(scope, project) &&
                String(project.user_id || '') !== String(currentUserId)
            ) {
                rows = await filterReadableLinks(knex, rows, currentUserId, scope);
            }
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
