// eslint-disable-next-line no-unused-vars
const _ = require('lodash');
// @ts-nocheck
const ObjectId = require('bson-objectid').default;
const ghostBookshelf = require('./base');
const errors = require('@tryghost/errors');
const logging = require('@tryghost/logging');

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

    initialize() {
        // @ts-ignore
        ghostBookshelf.Model.prototype.initialize.call(this);
        this.on('saving', this.validateFields);
    },

    async validateFields(model) {
        logging.info(JSON.stringify(model));

        const type = model.get('type');
        const title = model.get('title');
        const status = model.get('status');

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
    }
},{

});

module.exports = {
    SocialComponent: ghostBookshelf.model('SocialComponent', SocialComponent)
};

