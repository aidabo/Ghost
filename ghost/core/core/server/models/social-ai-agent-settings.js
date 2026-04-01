const ObjectId = require('bson-objectid').default;
const ghostBookshelf = require('./base');
const errors = require('@tryghost/errors');
const models = require('./index');

const SocialAiAgentSetting = ghostBookshelf.Model.extend({
    tableName: 'social_ai_agent_settings',

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
        const userId = model.get('user_id');
        if (!userId) {
            throw new errors.ValidationError({message: 'user_id is required.'});
        }
        // @ts-ignore
        const user = await models.User.findOne({id: userId});
        if (!user) {
            throw new errors.ValidationError({message: `User ${userId} does not exist.`});
        }
    }
});

module.exports = {
    SocialAiAgentSetting: ghostBookshelf.model('SocialAiAgentSetting', SocialAiAgentSetting)
};
