/* eslint-disable max-lines, ghost/ghost-custom/max-api-complexity */
const errors = require('@tryghost/errors');
const db = require('../../data/db');

const ALLOWED_ASSET_TYPES = new Set(['image', 'video', 'audio', 'file']);

const parseLimit = value => Math.min(100, Math.max(1, Number(value) || 24));
const parsePage = value => Math.max(1, Number(value) || 1);

const parseOrder = (value, fallback = 'updated_at desc') => {
    const [requestedField, requestedDirection] = String(value || fallback).replace(':', ' ').trim().split(/\s+/);
    const field = ['name', 'created_at', 'updated_at'].includes(requestedField) ? requestedField : fallback.split(' ')[0];
    return {field, direction: requestedDirection === 'asc' ? 'asc' : 'desc'};
};

const applyPublicProjectScope = (query, alias = 'p') => query
    .where(`${alias}.status`, 'published')
    .andWhere(function () {
        this.whereNull(`${alias}.group_id`).orWhere(function () {
            this.where('g.type', 'public').andWhere('g.status', 'active');
        });
    });

const parseTags = (value) => {
    if (Array.isArray(value)) {
        return value;
    }
    try {
        return JSON.parse(value || '[]');
    } catch (err) {
        return [];
    }
};

const publicProjectQuery = () => applyPublicProjectScope(
    db.knex('social_ai_projects as p').leftJoin('social_groups as g', 'g.id', 'p.group_id')
);

const serializeProject = row => ({
    id: row.id,
    name: row.name,
    description: row.description || null,
    tags: parseTags(row.tags),
    status: 'published',
    group_id: row.group_id || null,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null
});

const findPublicProject = async projectId => publicProjectQuery()
    .where('p.id', projectId)
    .first('p.id', 'p.name', 'p.group_id');

const buildProjectBrowseQuery = (frame) => {
    const query = publicProjectQuery();
    const id = String(frame.options.id || '').trim();
    const name = String(frame.options.name || '').trim();
    const keyword = String(frame.options.keyword || frame.options.query || frame.options.q || '').trim();
    if (id) {
        query.andWhere('p.id', id);
    }
    if (name) {
        query.andWhereRaw('LOWER(p.name) = ?', [name.toLowerCase()]);
    }
    if (keyword) {
        query.andWhere(function () {
            this.where('p.name', 'like', `%${keyword}%`)
                .orWhere('p.description', 'like', `%${keyword}%`)
                .orWhere('p.tags', 'like', `%${keyword}%`);
        });
    }
    return query;
};

const buildGalleryQuery = (projectId, type, keyword) => {
    const query = db.knex('social_media_assets as sma')
        .leftJoin('tags as t', 't.id', 'sma.tag_id')
        .where('sma.owner_scope', 'chart_jobs')
        .andWhere('sma.project_id', projectId);
    if (type === 'file') {
        query.whereNotIn('sma.asset_type', ['image', 'video', 'audio']);
    } else if (type !== 'all') {
        query.andWhere('sma.asset_type', type);
    }
    if (keyword) {
        query.andWhere(function () {
            this.where('sma.original_filename', 'like', `%${keyword}%`)
                .orWhere('t.name', 'like', `%${keyword}%`)
                .orWhere('t.slug', 'like', `%${keyword}%`);
        });
    }
    return query;
};

/** @type {import('@tryghost/api-framework').Controller} */
module.exports = {
    docName: 'socialaiprojects',

    browse: {
        headers: {cacheInvalidate: false},
        options: ['id', 'name', 'keyword', 'query', 'q', 'limit', 'page', 'order'],
        permissions: true,
        async query(frame) {
            const limit = parseLimit(frame.options.limit);
            const page = parsePage(frame.options.page);
            const order = parseOrder(frame.options.order);
            const base = buildProjectBrowseQuery(frame);
            const countRow = await base.clone().clearSelect().clearOrder().countDistinct({total: 'p.id'}).first();
            const rows = await base
                .select('p.id', 'p.name', 'p.description', 'p.tags', 'p.group_id', 'p.created_at', 'p.updated_at')
                .orderBy(`p.${order.field}`, order.direction)
                .limit(limit)
                .offset((page - 1) * limit);
            const total = Number(countRow?.total || 0);
            const pages = Math.ceil(total / limit);
            return {
                data: rows.map(serializeProject),
                meta: {pagination: {page, limit, pages, total, next: page < pages ? page + 1 : null, prev: page > 1 ? page - 1 : null}, status: 'published'}
            };
        }
    },

    gallery: {
        headers: {cacheInvalidate: false},
        options: ['keyword', 'query', 'q', 'type', 'limit', 'page', 'order'],
        data: ['id'],
        permissions: true,
        async query(frame) {
            const projectId = String(frame.data.id || '').trim();
            const project = await findPublicProject(projectId);
            if (!project) {
                throw new errors.NotFoundError({message: 'Published Social AI project not found.'});
            }
            const limit = parseLimit(frame.options.limit);
            const page = parsePage(frame.options.page);
            const requestedType = String(frame.options.type || 'all').toLowerCase().trim();
            const type = requestedType === 'all' || ALLOWED_ASSET_TYPES.has(requestedType) ? requestedType : 'all';
            const keyword = String(frame.options.keyword || frame.options.query || frame.options.q || '').trim();
            const order = parseOrder(frame.options.order, 'created_at desc');
            const base = buildGalleryQuery(projectId, type, keyword);
            const countRow = await base.clone().clearSelect().clearOrder().countDistinct({total: 'sma.id'}).first();
            const rows = await base
                .select(
                    'sma.id',
                    db.knex.raw('sma.storage_url as url'),
                    'sma.thumbnail_url',
                    db.knex.raw('sma.original_filename as name'),
                    'sma.original_filename',
                    'sma.asset_type',
                    't.name as category',
                    'sma.created_at',
                    'sma.updated_at'
                )
                .orderBy(`sma.${order.field === 'name' ? 'created_at' : order.field}`, order.direction)
                .limit(limit)
                .offset((page - 1) * limit);
            const total = Number(countRow?.total || 0);
            const pages = Math.ceil(total / limit);
            return {
                data: rows.map(row => ({...row, asset_id: row.id, media_url: row.url, type: row.asset_type, project_id: project.id, project_name: project.name})),
                meta: {pagination: {page, limit, pages, total, next: page < pages ? page + 1 : null, prev: page > 1 ? page - 1 : null}, status: 'published', project_id: project.id}
            };
        }
    }
};
