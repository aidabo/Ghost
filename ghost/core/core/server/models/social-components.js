// eslint-disable-next-line no-unused-vars
const _ = require('lodash');
// @ts-nocheck
const ObjectId = require('bson-objectid').default;
const ghostBookshelf = require('./base');
const errors = require('@tryghost/errors');
const logging = require('@tryghost/logging');
const models = require('./index');
const TAG_ID_REGEX = /^[a-f0-9]{24}$/;

const SocialComponent = ghostBookshelf.Model.extend({
    tableName: 'social_components',

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

    async validateFields(model) {
        logging.info(JSON.stringify(model));

        const type = model.get('type');
        const title = model.get('title');
        const tag = model.get('tag');
        const status = model.get('status');
        const groupId = model.get('group_id');

        if (!type) {
            throw new errors.ValidationError({message: 'type of component is required.'});
        }

        if (!title) {
            throw new errors.ValidationError({message: 'title is required.'});
        }

        if (!status) {
            throw new errors.ValidationError({message: 'status is required.'});
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
