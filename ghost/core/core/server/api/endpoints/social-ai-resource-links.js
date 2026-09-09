// @ts-ignore
const tpl = require('@tryghost/tpl');
const errors = require('@tryghost/errors');
const models = require('../../models');

// Resource Links browse — find all project_links for a given resource (post, stackpage, gallery).
// Query: GET /social/ai/resource-links?link_type=post&link_id={id}
// Returns socialairesourcelinks: [{...link, project_name}]

const TABLE = 'social_ai_project_links';
const PROJECTS_TABLE = 'social_ai_projects';

const messages = {
    missingParams: '`link_type` and `link_id` query params are required.'
};

// @ts-ignore
const serializeRow = (row) => ({
    id: row.id,
    project_id: row.project_id,
    project_name: row.project_name || null,
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
    docName: 'socialairesourcelinks',

    browse: {
        headers: {cacheInvalidate: false},
        options: ['link_type', 'link_id'],
        permissions: false,
        async query(frame) {
            const knex = models.Base.knex;
            // @ts-ignore
            const linkType = String(frame.options?.link_type || '').trim();
            // @ts-ignore
            const linkId = String(frame.options?.link_id || '').trim();
            if (!linkType || !linkId) {
                throw new errors.ValidationError({message: tpl(messages.missingParams)});
            }
            const rows = await knex(TABLE)
                .leftJoin(PROJECTS_TABLE, `${TABLE}.project_id`, `${PROJECTS_TABLE}.id`)
                .where(`${TABLE}.link_type`, linkType)
                .where(`${TABLE}.link_id`, linkId)
                .select(
                    `${TABLE}.*`,
                    `${PROJECTS_TABLE}.name as project_name`
                )
                .orderBy(`${TABLE}.sort_order`, 'asc')
                .orderBy(`${TABLE}.created_at`, 'asc');
            return {data: rows.map(serializeRow), meta: {}};
        }
    }
};

module.exports = controller;
