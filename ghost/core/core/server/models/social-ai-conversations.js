const ObjectId = require('bson-objectid').default;
const ghostBookshelf = require('./base');
const errors = require('@tryghost/errors');
const models = require('./index');

const SocialAiConversation = ghostBookshelf.Model.extend({
    tableName: 'social_ai_conversations',

    defaults() {
        return {
            id: ObjectId().toHexString(),
            visibility: 'private'
        };
    },

    user() {
        return this.belongsTo('User', 'user_id');
    },

    group() {
        return this.belongsTo('SocialGroup', 'group_id');
    },

    messages() {
        return this.hasMany('SocialAiMessage', 'conversation_id');
    },

    usages() {
        return this.hasMany('SocialAiUsage', 'conversation_id');
    },

    initialize() {
        ghostBookshelf.Model.prototype.initialize.call(this);
        this.on('saving', this.validateFields);
    },

    async validateFields(model) {
        const userId = model.get('user_id');
        const groupId = model.get('group_id');
        const visibility = model.get('visibility');

        if (!userId) {
            throw new errors.ValidationError({message: 'user_id is required.'});
        }

        if (visibility && !['private', 'group_shared'].includes(visibility)) {
            throw new errors.ValidationError({message: 'visibility must be private or group_shared.'});
        }

        const user = await models.User.findOne({id: userId});
        if (!user) {
            throw new errors.ValidationError({message: `User ${userId} does not exist.`});
        }

        if (groupId) {
            const group = await models.SocialGroup.findOne({id: groupId});
            if (!group) {
                throw new errors.ValidationError({message: `Group ${groupId} does not exist.`});
            }
        }
    }
});

module.exports = {
    SocialAiConversation: ghostBookshelf.model('SocialAiConversation', SocialAiConversation)
};
