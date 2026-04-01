const ObjectId = require('bson-objectid').default;
const ghostBookshelf = require('./base');
const errors = require('@tryghost/errors');
const models = require('./index');

const SocialAiUserPhone = ghostBookshelf.Model.extend({
    tableName: 'social_ai_user_phones',

    defaults() {
        return {
            id: ObjectId().toHexString(),
            status: 'pending'
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
        const phoneHash = String(model.get('phone_hash') || '').trim();
        const phoneE164 = String(model.get('phone_e164') || '').trim();
        if (!userId) {
            throw new errors.ValidationError({message: 'user_id is required.'});
        }
        if (!phoneHash) {
            throw new errors.ValidationError({message: 'phone_hash is required.'});
        }
        if (!phoneE164) {
            throw new errors.ValidationError({message: 'phone_e164 is required.'});
        }
        // @ts-ignore
        const user = await models.User.findOne({id: userId});
        if (!user) {
            throw new errors.ValidationError({message: `User ${userId} does not exist.`});
        }
    }
});

module.exports = {
    SocialAiUserPhone: ghostBookshelf.model('SocialAiUserPhone', SocialAiUserPhone)
};
