// eslint-disable-next-line no-unused-vars
const _ = require('lodash');
// @ts-nocheck
const ObjectId = require('bson-objectid').default;
const ghostBookshelf = require('./base');
const errors = require('@tryghost/errors');
const logging = require('@tryghost/logging');
const models = require('./index');
const TAG_ID_REGEX = /^[a-f0-9]{24}$/;
const PUBLIC_PATH_SEGMENT_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RESERVED_PUBLIC_PATH_SEGMENTS = new Set([
    'api', 'ghost', '_next', 'pages', 'pages-public', 'editor', 'signin', 'signup',
    'reset', 'panel', 'dashboard', 'article', 'author', 'tag', 'person', 'persons',
    'person-stories', 'gallery', 'charts', 'jobs', 'deepzoom', 'viewer', 'social-ai',
    'estate', 'home', 'link', 'dev', 'ai', 'stories', 'profile', 'group-article',
    'robots.txt', 'sitemap.xml', 'favicon.ico'
]);

const normalizePublicPath = (value) => {
    if (value === undefined || value === null || value === '') {
        return null;
    }

    if (typeof value !== 'string') {
        throw new errors.ValidationError({message: 'public_path must be a string.'});
    }

    const trimmed = value.trim().toLowerCase();
    if (!trimmed) {
        return null;
    }

    if (trimmed.length > 191) {
        throw new errors.ValidationError({message: 'public_path must be 191 characters or fewer.'});
    }
    if (!trimmed.startsWith('/') || trimmed === '/' || trimmed.endsWith('//')) {
        throw new errors.ValidationError({message: 'public_path must start with / and contain at least one path segment.'});
    }
    if (/[?#]/.test(trimmed) || trimmed.includes('://') || trimmed.includes('\\') || trimmed.includes('//') || /%2f|%5c/i.test(trimmed)) {
        throw new errors.ValidationError({message: 'public_path must not contain a URL, query, fragment, duplicate slash, or encoded separator.'});
    }

    const normalized = trimmed.length > 1 ? trimmed.replace(/\/+$/, '') : trimmed;
    const segments = normalized.slice(1).split('/');
    if (segments.length > 20 || segments.some(segment => !PUBLIC_PATH_SEGMENT_REGEX.test(segment) || segment === '.' || segment === '..')) {
        throw new errors.ValidationError({message: 'public_path must contain at most 20 lowercase URL-safe path segments.'});
    }
    if (RESERVED_PUBLIC_PATH_SEGMENTS.has(segments[0])) {
        throw new errors.ValidationError({message: `public_path uses reserved route: ${segments[0]}.`});
    }

    return normalized;
};

const SocialComponent = ghostBookshelf.Model.extend({
    tableName: 'social_components',

    permittedAttributes() {
        return [
            'id', 'slug', 'public_path', 'type', 'title', 'tag', 'excerpt', 'image',
            'attributes', 'layout', 'source', 'group_id', 'status',
            'published_at', 'created_at', 'created_by', 'updated_at', 'updated_by'
        ];
    },

    defaults() {
        return {
            id: ObjectId().toHexString()
        };
    },

    user() {
        return this.belongsTo('User', 'created_by');
    },

    group() {
        return this.belongsTo('SocialGroup', 'group_id');
    },

    tag() {
        return this.belongsTo('Tag', 'tag', 'id');
    },

    initialize() {
        // @ts-ignore
        ghostBookshelf.Model.prototype.initialize.call(this);
        this.on('saving', this.validateFields);
    },

    async validateFields(model, attrs, options = {}) {
        logging.info(JSON.stringify(model));

        const type = model.get('type');
        const title = model.get('title');
        const tag = model.get('tag');
        const status = model.get('status');
        const groupId = model.get('group_id');
        const previousTitle = model.previous('title');
        const previousSlug = model.previous('slug');
        const wasPublished = Boolean(model.previous('published_at'));

        if (!type) {
            throw new errors.ValidationError({message: 'type of component is required.'});
        }

        if (!title) {
            throw new errors.ValidationError({message: 'title is required.'});
        }

        if (!status) {
            throw new errors.ValidationError({message: 'status is required.'});
        }

        const currentSlug = model.get('slug');
        if (model.hasChanged('slug') || !currentSlug) {
            const generatedSlug = await ghostBookshelf.Model.generateSlug(
                SocialComponent,
                currentSlug || title,
                {modelId: model.id, transacting: options.transacting}
            );
            model.set('slug', generatedSlug);
        } else if (previousTitle !== undefined && title !== previousTitle && status === 'draft' && !wasPublished) {
            const previousTitleSlug = await ghostBookshelf.Model.generateSlug(
                SocialComponent,
                previousTitle,
                {modelId: model.id, transacting: options.transacting}
            );
            if (previousTitleSlug === previousSlug) {
                const generatedSlug = await ghostBookshelf.Model.generateSlug(
                    SocialComponent,
                    title,
                    {modelId: model.id, transacting: options.transacting}
                );
                model.set('slug', generatedSlug);
            }
        }

        const normalizedPublicPath = normalizePublicPath(model.get('public_path'));
        model.set('public_path', normalizedPublicPath);
        if (normalizedPublicPath) {
            const existingPath = await SocialComponent.findOne(
                {public_path: normalizedPublicPath},
                {transacting: options.transacting}
            );
            if (existingPath && existingPath.id !== model.id) {
                throw new errors.ValidationError({message: 'public_path is already used by another page.'});
            }
        }

        if (status && !['published', 'draft'].includes(status)) {
            throw new errors.ValidationError({message: 'status must be either published or draft.'});
        }

        // Keep `published_at` aligned with publish status.
        // - On publish: set timestamp if missing.
        // - On draft transition: clear published timestamp.
        if (status === 'published') {
            if (!model.get('published_at')) {
                model.set('published_at', new Date());
            }
        } else if (status === 'draft' && model.hasChanged('status')) {
            model.set('published_at', null);
        }

        if (tag === '') {
            model.set('tag', null);
        }

        const normalizedTagValue = model.get('tag');

        if (normalizedTagValue && typeof normalizedTagValue !== 'string') {
            throw new errors.ValidationError({message: 'tag must be a valid tag id, slug, or name.'});
        }

        if (normalizedTagValue) {
            const normalizedTag = normalizedTagValue.trim();
            let resolvedTag = null;

            if (!normalizedTag) {
                model.set('tag', null);
                resolvedTag = null;
            }

            if (!resolvedTag && TAG_ID_REGEX.test(normalizedTag)) {
                // @ts-ignore
                const foundById = await models.Tag.findOne({id: normalizedTag});
                if (foundById) {
                    resolvedTag = foundById.get('id');
                }
            } else if (!resolvedTag) {
                // @ts-ignore
                const foundBySlug = await models.Tag.findOne({slug: normalizedTag});
                if (foundBySlug) {
                    resolvedTag = foundBySlug.get('id');
                } else {
                    // @ts-ignore
                    const foundByName = await models.Tag.findOne({name: normalizedTag});
                    if (foundByName) {
                        resolvedTag = foundByName.get('id');
                    }
                }
            }

            if (!resolvedTag && normalizedTag) {
                throw new errors.ValidationError({message: 'tag must reference an existing tag id, slug, or name.'});
            }

            if (model.get('tag') !== resolvedTag) {
                model.set('tag', resolvedTag);
            }
        }

        if (groupId && !/^[a-f0-9]{24}$/.test(groupId)) {
            throw new errors.ValidationError({message: 'group_id must be a valid 24-char id.'});
        }

        if (groupId) {
            // @ts-ignore
            const group = await models.SocialGroup.findOne({id: groupId});
            if (!group) {
                throw new errors.NotFoundError({message: `Group with ID ${groupId} not found.`});
            }
        }
    }
},{

});

module.exports = {
    SocialComponent: ghostBookshelf.model('SocialComponent', SocialComponent)
};
