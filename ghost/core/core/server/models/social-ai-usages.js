const ObjectId = require('bson-objectid').default;
const ghostBookshelf = require('./base');
const errors = require('@tryghost/errors');
const models = require('./index');

const SocialAiUsage = ghostBookshelf.Model.extend({
    tableName: 'social_ai_usages',

    defaults() {
        return {
            id: ObjectId().toHexString(),
            prompt_tokens: 0,
            completion_tokens: 0,
            total_tokens: 0,
            cost_usd_micros: 0,
            currency: 'USD'
        };
    },

    conversation() {
        return this.belongsTo('SocialAiConversation', 'conversation_id');
    },

    user() {
        return this.belongsTo('User', 'user_id');
    },

    group() {
        return this.belongsTo('SocialGroup', 'group_id');
    },

    initialize() {
        ghostBookshelf.Model.prototype.initialize.call(this);
        this.on('saving', this.validateFields);
    },

    async validateFields(model) {
        const conversationId = model.get('conversation_id');
        const userId = model.get('user_id');
        const groupId = model.get('group_id');
        const currency = String(model.get('currency') || 'USD').toUpperCase();

        if (!conversationId) {
            throw new errors.ValidationError({message: 'conversation_id is required.'});
        }

        if (!userId) {
            throw new errors.ValidationError({message: 'user_id is required.'});
        }

        const checks = [
            models.SocialAiConversation.findOne({id: conversationId}),
            models.User.findOne({id: userId})
        ];
        if (groupId) {
            checks.push(models.SocialGroup.findOne({id: groupId}));
        }

        const [conversation, user, group] = await Promise.all(checks);
        if (!conversation) {
            throw new errors.ValidationError({message: `Conversation ${conversationId} does not exist.`});
        }
        if (!user) {
            throw new errors.ValidationError({message: `User ${userId} does not exist.`});
        }
        if (groupId && !group) {
            throw new errors.ValidationError({message: `Group ${groupId} does not exist.`});
        }

        model.set('currency', currency);
    }
});

module.exports = {
    SocialAiUsage: ghostBookshelf.model('SocialAiUsage', SocialAiUsage)
};
