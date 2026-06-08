const models = require('../../models');
const errors = require('@tryghost/errors');

const loadExistingPost = async (slug) => {
    if (!slug) {
        return null;
    }

    return models.Post.findOne({slug}, {context: {internal: true}});
};

module.exports = {
    docName: 'posts',
    add: {
        headers: {
            cacheInvalidate: true
        },
        permissions: true,
        async query(frame) {
            const payload = frame.data.posts?.[0] || frame.data.persongraphposts?.[0] || frame.data.post?.[0];

            if (!payload || !payload.slug) {
                throw new errors.BadRequestError({
                    message: 'Post payload with slug is required.'
                });
            }

            const existing = await loadExistingPost(payload.slug);
            const options = {context: {internal: true}};

            if (existing) {
                return models.Post.edit(payload, {id: existing.id, context: {internal: true}});
            }

            return models.Post.add(payload, options);
        }
    }
};
