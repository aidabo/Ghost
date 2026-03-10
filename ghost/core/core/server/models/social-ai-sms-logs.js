const ObjectId = require('bson-objectid').default;
const ghostBookshelf = require('./base');
const errors = require('@tryghost/errors');
const models = require('./index');

const SocialAiSmsLog = ghostBookshelf.Model.extend({
    tableName: 'social_ai_sms_logs',

    defaults() {
        return {
            id: ObjectId().toHexString()
        };
    },

    user() {
        return this.belongsTo('User', 'user_id');
    },

    group() {
        return this.belongsTo('SocialGroup', 'group_id');
    },

    initialize() {
        // @ts-ignore
        ghostBookshelf.Model.prototype.initialize.call(this);
        this.on('saving', this.validateFields);
    },

    async validateFields(model) {
        const userId = model.get('user_id');
        const groupId = model.get('group_id');
        const phoneHash = String(model.get('phone_hash') || '').trim();
        const provider = String(model.get('provider') || '').trim();
        const status = String(model.get('status') || '').trim();

        if (!userId) {
            throw new errors.ValidationError({message: 'user_id is required.'});
        }
        if (!phoneHash) {
            throw new errors.ValidationError({message: 'phone_hash is required.'});
        }
        if (!provider) {
            throw new errors.ValidationError({message: 'provider is required.'});
        }
        if (!status) {
            throw new errors.ValidationError({message: 'status is required.'});
        }

        const checks = [
            // @ts-ignore
            models.User.findOne({id: userId})
        ];
        if (groupId) {
            // @ts-ignore
            checks.push(models.SocialGroup.findOne({id: groupId}));
        }

        const [user, group] = await Promise.all(checks);
        if (!user) {
            throw new errors.ValidationError({message: `User ${userId} does not exist.`});
        }
        if (groupId && !group) {
            throw new errors.ValidationError({message: `Group ${groupId} does not exist.`});
        }
    }
});

module.exports = {
    SocialAiSmsLog: ghostBookshelf.model('SocialAiSmsLog', SocialAiSmsLog)
};
