/* eslint-disable ghost/ghost-custom/max-api-complexity */
const db = require('../../data/db');
const allowedTypes = new Set(['image', 'video', 'audio']);

/** @type {import('@tryghost/api-framework').Controller} */
module.exports = {
    docName: 'post_media',
    browse: {
        headers: {cacheInvalidate: false},
        options: ['keyword', 'q', 'query', 'media_types', 'limit', 'page'],
        permissions: false,
        async query(frame) {
            const limit = Math.max(1, Math.min(100, Number(frame.options.limit) || 25));
            const page = Math.max(1, Number(frame.options.page) || 1);
            const keyword = String(frame.options.keyword || frame.options.q || frame.options.query || '').trim();
            const requestedTypes = String(frame.options.media_types || '').split(',').map(value => value.trim()).filter(value => allowedTypes.has(value));
            const types = requestedTypes.length ? requestedTypes : [...allowedTypes];
            const base = db.knex('post_media as pm').join('posts as p', 'p.id', 'pm.post_id').where('p.type', 'post').where('p.status', 'published').where('p.visibility', 'public').where('p.public_post', true).whereIn('pm.media_type', types);
            if (keyword) {
                base.andWhere(query => query.where('p.title', 'like', `%${keyword}%`).orWhere('pm.caption', 'like', `%${keyword}%`).orWhere('pm.alt', 'like', `%${keyword}%`));
            }
            const countRow = await base.clone().clearSelect().clearOrder().countDistinct({total: 'pm.id'}).first();
            const rows = await base.clone().select('pm.id', 'pm.post_id', 'pm.media_id', db.knex.raw('pm.media_type as asset_type'), db.knex.raw('pm.source_url as media_url'), 'pm.thumbnail_url', 'pm.caption', 'pm.alt', 'pm.role', 'pm.sort_order', db.knex.raw('p.title as title'), 'p.slug', 'p.published_at').orderBy('p.published_at', 'desc').orderBy('pm.sort_order', 'asc').limit(limit).offset((page - 1) * limit);
            rows.forEach((row) => {
                row.clickLink = row.slug ? `/${row.slug}/` : '';
                delete row.slug;
            });
            const total = Number(countRow && countRow.total || 0);
            const pages = Math.ceil(total / limit);
            return {data: rows, meta: {pagination: {page, limit, pages, total, next: page < pages ? page + 1 : null, prev: page > 1 ? page - 1 : null}}};
        }
    }
};
