/* eslint-disable ghost/ghost-custom/max-api-complexity */
const db = require('../../data/db');
const allowedTypes = new Set(['image', 'video', 'audio']);
const OWN_POSTS_ONLY_ROLES = new Set(['Author', 'Contributor']);

/**
 * Staff read of post_media (the news desk "素材" tab).
 *
 * Unlike the public `/content/post-media/` endpoint this one:
 *  - includes drafts and scheduled posts (the desk works on unpublished articles),
 *  - can be scoped to one article with `post_id`.
 *
 * Scope = the newsroom only: `public_post = true`, the same line Post.defaultFilters
 * draws for an admin posts browse without `group_id`. Family/group posts
 * (public_post = false) are personal content and must never mix in here — they are
 * served by the group-scoped, membership-checked paths instead.
 *
 * Authors and Contributors only see media of posts they author.
 * Session/admin-key auth only.
 */
async function ownPostsOnlyUserId(frame) {
    const userId = frame.options?.context?.user;
    if (!userId) {
        return null;
    }
    const roles = await db.knex('roles_users as ru').join('roles as r', 'r.id', 'ru.role_id').where('ru.user_id', userId).pluck('r.name');
    if (roles.length && roles.every(name => OWN_POSTS_ONLY_ROLES.has(name))) {
        return userId;
    }
    return null;
}

/** @type {import('@tryghost/api-framework').Controller} */
module.exports = {
    docName: 'post_media',
    browse: {
        headers: {cacheInvalidate: false},
        options: ['post_id', 'keyword', 'q', 'query', 'media_types', 'limit', 'page'],
        permissions: {docName: 'post', method: 'browse'},
        async query(frame) {
            const limit = Math.max(1, Math.min(100, Number(frame.options.limit) || 25));
            const page = Math.max(1, Number(frame.options.page) || 1);
            const postId = String(frame.options.post_id || '').trim();
            const keyword = String(frame.options.keyword || frame.options.q || frame.options.query || '').trim();
            const requestedTypes = String(frame.options.media_types || '').split(',').map(value => value.trim()).filter(value => allowedTypes.has(value));
            const types = requestedTypes.length ? requestedTypes : [...allowedTypes];

            const base = db.knex('post_media as pm').join('posts as p', 'p.id', 'pm.post_id').where('p.type', 'post').where('p.public_post', true).whereIn('pm.media_type', types);
            if (postId) {
                base.andWhere('pm.post_id', postId);
            }
            const ownUserId = await ownPostsOnlyUserId(frame);
            if (ownUserId) {
                base.whereIn('pm.post_id', db.knex('posts_authors').select('post_id').where('author_id', ownUserId));
            }
            if (keyword) {
                base.andWhere(query => query.where('p.title', 'like', `%${keyword}%`).orWhere('pm.caption', 'like', `%${keyword}%`).orWhere('pm.alt', 'like', `%${keyword}%`));
            }

            const countRow = await base.clone().clearSelect().clearOrder().countDistinct({total: 'pm.id'}).first();
            const rows = await base.clone()
                .select('pm.id', 'pm.post_id', 'pm.media_id', db.knex.raw('pm.media_type as asset_type'), db.knex.raw('pm.source_url as media_url'), 'pm.thumbnail_url', 'pm.caption', 'pm.alt', 'pm.role', 'pm.sort_order', db.knex.raw('p.title as title'), 'p.slug', 'p.status', 'p.published_at', 'p.updated_at')
                // Drafts have no published_at — fall back to updated_at so they sort among the rest.
                .orderByRaw('COALESCE(p.published_at, p.updated_at) DESC')
                .orderBy('pm.post_id', 'asc')
                .orderBy('pm.sort_order', 'asc')
                .limit(limit)
                .offset((page - 1) * limit);

            const total = Number(countRow && countRow.total || 0);
            const pages = Math.ceil(total / limit);
            return {data: rows, meta: {pagination: {page, limit, pages, total, next: page < pages ? page + 1 : null, prev: page > 1 ? page - 1 : null}}};
        }
    }
};
