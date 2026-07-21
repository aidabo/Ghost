const models = require('../../models');
const errors = require('@tryghost/errors');
const tpl = require('@tryghost/tpl');

const serialize = row => ({
    id: row.id,
    publication_name: row.publication_name,
    edition: row.edition,
    source_name: row.source_name || null,
    status: row.status,
    pages: row.pages ? JSON.parse(row.pages) : [],
    preview_url: row.preview_url || null,
    created_at: row.created_at || null,
    completed_at: row.completed_at || null,
    is_public: true
});

// The API framework serializes Bookshelf models. Returning plain knex rows
// here produces empty objects in the Content API response, so wrap the already
// sanitized values in the DZI model before returning them. Do not return the
// raw job row: it contains user/group ownership and source storage paths.
const asPublicCollection = rows => models.SocialAiDziJob.collection(
    rows.map(row => new models.SocialAiDziJob(serialize(row)))
);

const controller = {
    docName: 'socialaidzijobs',
    browse: {
        headers: {cacheInvalidate: false},
        options: ['limit', 'page', 'order'],
        permissions: true,
        async query(frame) {
            const limit = Math.min(100, Math.max(1, Number(frame.options?.limit || 20)));
            const page = Math.max(1, Number(frame.options?.page || 1));
            const rows = await models.Base.knex('social_ai_dzi_jobs')
                .where({status: 'completed', is_public: true})
                .orderBy('completed_at', 'desc')
                .limit(limit)
                .offset((page - 1) * limit);
            return asPublicCollection(rows);
        }
    },
    read: {
        headers: {cacheInvalidate: false},
        options: ['id'],
        permissions: true,
        async query(frame) {
            const id = frame.data?.id || frame.options?.id;
            const row = await models.Base.knex('social_ai_dzi_jobs').where({id, status: 'completed', is_public: true}).first();
            if (!row) throw new errors.NotFoundError({message: tpl('DZI job not found.')});
            return new models.SocialAiDziJob(serialize(row));
        }
    }
};

module.exports = controller;
