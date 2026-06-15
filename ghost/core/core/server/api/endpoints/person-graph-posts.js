const models = require('../../models');
const errors = require('@tryghost/errors');

const loadExistingPost = async (slug) => {
    if (!slug) {
        return null;
    }

    return models.Post.findOne({slug}, {context: {internal: true}});
};

const htmlToLexical = (() => {
    try {
        return require('@tryghost/kg-html-to-lexical').htmlToLexical;
    } catch {
        return null;
    }
})();

const preparePayload = (payload) => {
    if (!payload) {
        return payload;
    }

    // Convert html to lexical if html is provided but lexical is not
    if (payload.html && !payload.lexical && htmlToLexical) {
        try {
            payload.lexical = JSON.stringify(htmlToLexical(payload.html));
        } catch (e) {
            // Fall back to html-only if conversion fails
        }
    }

    return payload;
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

            preparePayload(payload);
            const existing = await loadExistingPost(payload.slug);
            const options = {context: {internal: true}};

            if (existing) {
                return models.Post.edit(payload, {id: existing.id, context: {internal: true}});
            }

            return models.Post.add(payload, options);
        }
    }
};
