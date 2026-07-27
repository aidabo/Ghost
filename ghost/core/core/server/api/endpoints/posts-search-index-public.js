const models = require('../../models');
const {searchPosts} = require('../../services/post-search-index/search');

// Public post keyword search backed by the post_search_index FULLTEXT(ngram) index
// + shared Redis cache. Ranking runs in the search service; this controller
// hydrates the ranked ids into full Post models (via findPage) and returns them in
// rank order — mirroring the estate search controller.
//
// docName is `posts` so the response goes through Ghost's own `posts` output
// serializer (identical public-safe mapping to GET /content/posts — strips
// mobiledoc/lexical/private fields, applies member gating). The custom `search`
// method has no posts input serializer/validator handler, so those are skipped;
// only the global input validator runs. The route lives under /search/* (not
// /posts/*) to avoid the core `/posts/:id` route capturing it.
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
            'keyword',
            'q',
            'query',
            'field'
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
                page
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

            // findPage returns rows in its own order; restore the search relevance rank.
            const byId = new Map((result.data || []).map(model => [model.id, model]));
            const ordered = safeIds.map(id => byId.get(id)).filter(Boolean);

            return {data: ordered, meta: {pagination: buildPagination(total, page, limit)}};
        }
    }
};
