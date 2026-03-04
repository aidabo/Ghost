const ObjectId = require('bson-objectid').default;
const ghostBookshelf = require('./base');
const errors = require('@tryghost/errors');
const models = require('./index');

const SocialAiMessage = ghostBookshelf.Model.extend({
    tableName: 'social_ai_messages',

    defaults() {
        return {
            id: ObjectId().toHexString(),
            role: 'turn'
        };
    },

    conversation() {
        return this.belongsTo('SocialAiConversation', 'conversation_id');
    },

    user() {
        return this.belongsTo('User', 'user_id');
    },

    initialize() {
        ghostBookshelf.Model.prototype.initialize.call(this);
        this.on('saving', this.validateFields);
    },

    async validateFields(model) {
        const conversationId = model.get('conversation_id');
        const userId = model.get('user_id');
        const role = model.get('role');
        const content = model.get('content');

        if (!conversationId) {
            throw new errors.ValidationError({message: 'conversation_id is required.'});
        }

        if (!userId) {
            throw new errors.ValidationError({message: 'user_id is required.'});
        }

        if (!role) {
            throw new errors.ValidationError({message: 'role is required.'});
        }

        if (!content || String(content).trim() === '') {
            throw new errors.ValidationError({message: 'content is required.'});
        }

        const [conversation, user] = await Promise.all([
            models.SocialAiConversation.findOne({id: conversationId}),
            models.User.findOne({id: userId})
        ]);

        if (!conversation) {
            throw new errors.ValidationError({message: `Conversation ${conversationId} does not exist.`});
        }

        if (!user) {
            throw new errors.ValidationError({message: `User ${userId} does not exist.`});
        }
    }
});

module.exports = {
    SocialAiMessage: ghostBookshelf.model('SocialAiMessage', SocialAiMessage)
};
