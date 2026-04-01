// @ts-nocheck
const ObjectId = require('bson-objectid').default;
const ghostBookshelf = require('./base');
const errors = require('@tryghost/errors');
const logging = require('@tryghost/logging');

const SocialUserLog = ghostBookshelf.Model.extend({
    tableName: 'social_user_logs',

    defaults() {
        return {
            id: ObjectId().toHexString()
        };
    },

    user() {
        return this.belongsTo('User', 'user_id');
    },

    initialize() {
        // @ts-ignore
        ghostBookshelf.Model.prototype.initialize.call(this);
        this.on('saving', this.validateFields);
    },

    async validateFields(model) {
        logging.info(JSON.stringify(model));

        const userId = model.get('user_id');
        const functionUsed = model.get('function_used');

        if (!userId) {
            throw new errors.ValidationError({ message: 'user_id is required.' });
        }

        if (!functionUsed) {
            throw new errors.ValidationError({ message: 'function name is required.' });
        }
    }
}, {

});

module.exports = {
    SocialUserLog: ghostBookshelf.model('SocialUserLog', SocialUserLog)
};

