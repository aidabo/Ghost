const models = require('../../models');
const errors = require('@tryghost/errors');
const tpl = require('@tryghost/tpl');

const messages = {
    notFound: 'publish content not found.'
};

const serializePublishPost = (entry) => {
    const json = entry.toJSON ? entry.toJSON() : entry;
    const post = json.post || {};

    return {
        id: json.id,
        post_id: json.post_id,
        content_type: json.content_type,
        section: json.section,
        featured: json.featured,
        metadata_json: json.metadata_json ? JSON.parse(json.metadata_json) : null,
        sort_order: json.sort_order,
        created_at: json.created_at,
        updated_at: json.updated_at,
        post: {
            id: post.id,
            title: post.title,
            slug: post.slug,
            excerpt: post.excerpt || post.custom_excerpt,
            html: post.html,
            feature_image: post.feature_image,
            featured: post.featured,
            published_at: post.published_at,
            tags: Array.isArray(post.tags) ? post.tags.map(t => ({
                id: t.id, name: t.name, slug: t.slug
            })) : [],
            authors: Array.isArray(post.authors) ? post.authors.map(a => ({
                id: a.id, name: a.name, profile_image: a.profile_image
            })) : []
        }
    };
};

const controller = {
    docName: 'publishcontent',

    browse: {
        headers: {
            cacheInvalidate: false
        },
        options: [
            'filter',
            'limit',
            'order',
            'page',
            'content_type',
            'section',
            'featured'
        ],
        validation: {
            options: {
                content_type: {
                    values: ['news', 'government', 'publication', 'comic', 'entertainment']
                }
            }
        },
        permissions: true,
        async query(frame) {
            const filter = frame.options.filter
                ? `status:published+(${frame.options.filter})`
                : 'status:published';

            const options = {
                ...frame.options,
                filter,
                withRelated: ['post', 'post.tags', 'post.authors']
            };

            if (frame.options.content_type) {
                options.filter = options.filter
                    ? `content_type:${frame.options.content_type}+(${options.filter})`
                    : `content_type:${frame.options.content_type}+${options.filter}`;
            }

            const result = await models.PublishPost.findPage(options);
            result.data = result.data.map(serializePublishPost);
            return result;
        }
    },

    read: {
        headers: {
            cacheInvalidate: false
        },
        options: [
            'filter'
        ],
        data: ['id'],
        permissions: true,
        async query(frame) {
            const entry = await models.PublishPost.findOne({
                id: frame.data.id
            }, {
                ...frame.options,
                withRelated: ['post', 'post.tags', 'post.authors']
            });

            if (!entry) {
                throw new errors.NotFoundError({
                    message: tpl(messages.notFound)
                });
            }

            return serializePublishPost(entry);
        }
    }
};

module.exports = controller;
