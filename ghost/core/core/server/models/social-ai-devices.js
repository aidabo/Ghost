const ObjectId = require('bson-objectid').default;
const ghostBookshelf = require('./base');
const errors = require('@tryghost/errors');
const models = require('./index');

const SocialAiDevice = ghostBookshelf.Model.extend({
    tableName: 'social_ai_devices',

    defaults() {
        return {
            id: ObjectId().toHexString(),
            enabled: true
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
        const deviceType = String(model.get('device_type') || '').trim().toLowerCase();
        const deviceKey = String(model.get('device_key') || '').trim();

        if (!userId) {
            throw new errors.ValidationError({message: 'user_id is required.'});
        }
        if (!deviceType) {
            throw new errors.ValidationError({message: 'device_type is required.'});
        }
        if (!deviceKey) {
            throw new errors.ValidationError({message: 'device_key is required.'});
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

        model.set('device_type', deviceType);
        model.set('device_key', deviceKey);
    }
});

module.exports = {
    SocialAiDevice: ghostBookshelf.model('SocialAiDevice', SocialAiDevice)
};
