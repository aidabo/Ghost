const ObjectId = require('bson-objectid').default;
const models = require('../../models');
const errors = require('@tryghost/errors');
const tpl = require('@tryghost/tpl');

const messages = {
    notFound: 'publish content not found.',
    invalidPost: 'Ghost post could not be created.'
};

/** Shared: serialize a publish_post + related post into API response shape */
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
            status: post.status,
            published_at: post.published_at,
            url: post.url,
            tags: Array.isArray(post.tags) ? post.tags.map(t => ({
                id: t.id,
                name: t.name,
                slug: t.slug
            })) : [],
            authors: Array.isArray(post.authors) ? post.authors.map(a => ({
                id: a.id,
                name: a.name,
                profile_image: a.profile_image
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
            'debug',
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
        permissions: {
            object: 'publishcontent',
            action: 'browse'
        },
        async query(frame) {
            const options = {
                ...frame.options,
                withRelated: ['post', 'post.tags', 'post.authors']
            };

            if (frame.options.content_type) {
                options.filter = options.filter
                    ? `content_type:${frame.options.content_type}+(${options.filter})`
                    : `content_type:${frame.options.content_type}`;
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
        permissions: {
            object: 'publishcontent',
            action: 'read'
        },
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
    },

    add: {
        statusCode: 201,
        headers: {
            cacheInvalidate: true
        },
        permissions: {
            object: 'publishcontent',
            action: 'add'
        },
        async query(frame) {
            const payload = frame.data.publishcontent ? frame.data.publishcontent[0] : frame.data;

            // 1. Create the Ghost post (use internal context — publish_posts holds our permissions)
            const postPayload = {
                title: payload.title,
                slug: payload.slug,
                mobiledoc: payload.mobiledoc,
                lexical: payload.lexical,
                html: payload.html,
                feature_image: payload.feature_image,
                excerpt: payload.excerpt,
                status: payload.status || 'draft',
                published_at: payload.published_at || new Date().toISOString(),
                tags: Array.isArray(payload.tags) ? payload.tags.map(t => typeof t === 'string' ? {name: t} : t) : [],
                type: 'post'
            };

            const post = await models.Post.add(postPayload, {context: {internal: true}});

            if (!post) {
                throw new errors.InternalServerError({
                    message: tpl(messages.invalidPost)
                });
            }

            // 2. Create the publish_posts link
            const publishPayload = {
                post_id: post.id,
                content_type: payload.content_type || 'news',
                section: payload.section || null,
                featured: payload.featured || false,
                metadata_json: payload.metadata_json
                    ? (typeof payload.metadata_json === 'string' ? payload.metadata_json : JSON.stringify(payload.metadata_json))
                    : null,
                sort_order: payload.sort_order || 0
            };

            const entry = await models.PublishPost.add(publishPayload, frame.options);

            // 3. Return combined result
            const combined = await models.PublishPost.findOne({
                id: entry.id
            }, {
                ...frame.options,
                withRelated: ['post', 'post.tags', 'post.authors']
            });

            return serializePublishPost(combined);
        }
    },

    edit: {
        headers: {
            cacheInvalidate: true
        },
        options: [
            'id'
        ],
        validation: {
            options: {
                id: {required: true}
            }
        },
        permissions: {
            object: 'publishcontent',
            action: 'edit'
        },
        async query(frame) {
            const entry = await models.PublishPost.findOne({
                id: frame.options.id
            }, {
                ...frame.options,
                withRelated: ['post']
            });

            if (!entry) {
                throw new errors.NotFoundError({
                    message: tpl(messages.notFound)
                });
            }

            const payload = frame.data.publishcontent ? frame.data.publishcontent[0] : frame.data;

            // Update publish_posts fields
            const publishUpdate = {};
            if (payload.content_type) publishUpdate.content_type = payload.content_type;
            if (payload.section !== undefined) publishUpdate.section = payload.section;
            if (payload.featured !== undefined) publishUpdate.featured = payload.featured;
            if (payload.metadata_json !== undefined) {
                publishUpdate.metadata_json = typeof payload.metadata_json === 'string'
                    ? payload.metadata_json
                    : JSON.stringify(payload.metadata_json);
            }
            if (payload.sort_order !== undefined) publishUpdate.sort_order = payload.sort_order;

            if (Object.keys(publishUpdate).length > 0) {
                await models.PublishPost.edit(publishUpdate, {
                    ...frame.options,
                    id: entry.id
                });
            }

            // Update Ghost post if needed
            if (entry.related('post') && (payload.title || payload.html || payload.status || payload.feature_image)) {
                const postUpdate = {};
                if (payload.title) postUpdate.title = payload.title;
                if (payload.html) postUpdate.html = payload.html;
                if (payload.mobiledoc) postUpdate.mobiledoc = payload.mobiledoc;
                if (payload.lexical) postUpdate.lexical = payload.lexical;
                if (payload.status) postUpdate.status = payload.status;
                if (payload.feature_image !== undefined) postUpdate.feature_image = payload.feature_image;
                if (payload.excerpt !== undefined) postUpdate.excerpt = payload.excerpt;
                if (payload.tags !== undefined) {
                    postUpdate.tags = Array.isArray(payload.tags) ? payload.tags.map(t => typeof t === 'string' ? {name: t} : t) : [];
                }

                await models.Post.edit(postUpdate, {
                    ...frame.options,
                    id: entry.get('post_id'),
                    context: {internal: true}
                });
            }

            // Return updated
            const updated = await models.PublishPost.findOne({
                id: entry.id
            }, {
                ...frame.options,
                withRelated: ['post', 'post.tags', 'post.authors']
            });

            return serializePublishPost(updated);
        }
    },

    destroy: {
        statusCode: 204,
        headers: {
            cacheInvalidate: true
        },
        options: [
            'id'
        ],
        validation: {
            options: {
                id: {required: true}
            }
        },
        permissions: {
            object: 'publishcontent',
            action: 'destroy'
        },
        async query(frame) {
            const entry = await models.PublishPost.findOne({
                id: frame.options.id
            }, frame.options);

            if (!entry) {
                throw new errors.NotFoundError({
                    message: tpl(messages.notFound)
                });
            }

            return models.PublishPost.destroy({
                ...frame.options,
                require: true,
                id: frame.options.id
            });
        }
    }
};

module.exports = controller;
