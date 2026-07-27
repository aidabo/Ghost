const models = require('../../models');
const {searchPosts} = require('../../services/post-search-index/search');

// Authenticated (admin) post keyword search over the post_search_index. Includes
// drafts / non-public posts (status/visibility filters relaxed) — for logged-in
// surfaces like "my home". Hydrates the ranked ids into full Post models (via
// findPage, admin context) and returns them in rank order.
//
// docName is `posts` so the response goes through Ghost's own `posts` output
// serializer (admin context → full fields). The custom `search` method has no
// posts input serializer/validator handler, so those are skipped; only the global
// input validator runs. The route lives under /search/* (not /posts/*) to avoid
// the core `/posts/:id` route capturing it.
const buildPagination = (total, page, limit) => {
    const pages = limit > 0 ? Math.ceil(total / limit) : 0;
    return {
        page,
        limit,
        pages,
        total,
        next: page < pages ? page + 1 : null,
        prev: page > 1 ? page - 1 : null
    };
};

module.exports = {
    docName: 'posts',

    search: {
        headers: {
            cacheInvalidate: false
        },
        options: [
            'include',
            'fields',
            'formats',
            'limit',
            'page',
            'order',
            'status',
            'keyword',
            'q',
            'query',
            'field',
            'author_id',
            'group_id'
        ],
        permissions: false,
        async query(frame) {
            const limit = Math.max(1, Math.min(50, Number(frame.options.limit) || 12));
            const page = Math.max(1, Number(frame.options.page) || 1);
            const keyword = frame.options.keyword || frame.options.q || frame.options.query || '';

            const {ids, total} = await searchPosts({
                keyword,
                field: frame.options.field,
                order: frame.options.order,
                limit,
                page,
                status: frame.options.status || 'all',
                visibility: 'all',
                // Scope to the logged-in user's posts / a selected group (my-home).
                authorId: frame.options.author_id,
                groupId: frame.options.group_id
            });

            // Defense-in-depth: ids come from our own index (Ghost 24-hex ids), but
            // never interpolate a non-conforming value into the NQL id filter.
            const safeIds = ids.filter(id => /^[0-9a-f]{24}$/.test(String(id)));
            if (!safeIds.length) {
                return {data: [], meta: {pagination: buildPagination(total, page, limit)}};
            }

            const withRelated = String(frame.options.include || 'tags,authors')
                .split(',').map(s => s.trim()).filter(Boolean);
            const result = await models.Post.findPage({
                filter: `id:[${safeIds.join(',')}]`,
                withRelated,
                formats: frame.options.formats,
                limit: 'all',
                context: frame.options.context
            });

            const byId = new Map((result.data || []).map(model => [model.id, model]));
            const ordered = safeIds.map(id => byId.get(id)).filter(Boolean);

            return {data: ordered, meta: {pagination: buildPagination(total, page, limit)}};
        }
    }
};
