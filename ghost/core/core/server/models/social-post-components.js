// eslint-disable-next-line no-unused-vars
const _ = require('lodash');
// @ts-nocheck
const ObjectId = require('bson-objectid').default;
const ghostBookshelf = require('./base');
const errors = require('@tryghost/errors');
const logging = require('@tryghost/logging');

const SocialPostComponent = ghostBookshelf.Model.extend({
    tableName: 'social_post_components',

    defaults() {
        return {
            id: ObjectId().toHexString()
        };
    },

    initialize() {
        // @ts-ignore
        ghostBookshelf.Model.prototype.initialize.call(this);
        this.on('saving', this.validateFields);
    },

    posts() {
        return this.belongsTo('Post', 'post_id');
    },   

    components() {
        return this.belongsTo('SocialComponent', 'component_id');
    },   

    async validateFields(model) {
        logging.info(JSON.stringify(model));

        const postId = model.get('post_id');
        const componentId = model.get('component_id');

        if (!postId) {
            throw new errors.ValidationError({message: 'post_id is required.'});
        }

        if (!componentId) {
            throw new errors.ValidationError({message: 'component_id is required.'});
        }
    }
},{

});

module.exports = {
    SocialPostComponent: ghostBookshelf.model('SocialPostComponent', SocialPostComponent)
};

