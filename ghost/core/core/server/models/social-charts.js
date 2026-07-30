// @ts-nocheck
const ObjectId = require('bson-objectid').default;
const ghostBookshelf = require('./base');
const errors = require('@tryghost/errors');
const logging = require('@tryghost/logging');
const models = require('./index');

const SocialChart = ghostBookshelf.Model.extend({
    tableName: 'social_charts',

    permittedAttributes() {
        return [
            'id', 'slug', 'title', 'excerpt', 'image',
            'chart_props', 'group_id', 'status', 'category', 'thumbnail',
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

    initialize() {
        ghostBookshelf.Model.prototype.initialize.call(this);
        this.on('saving', this.validateFields);
    },

    async validateFields(model) {
        logging.info(JSON.stringify(model));

        const title = model.get('title');
        const status = model.get('status');
        const groupId = model.get('group_id');

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
    SocialChart: ghostBookshelf.model('SocialChart', SocialChart)
};
