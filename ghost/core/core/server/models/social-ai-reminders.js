const ObjectId = require('bson-objectid').default;
const ghostBookshelf = require('./base');
const errors = require('@tryghost/errors');
const models = require('./index');

const VALID_STATUS = new Set(['active', 'cancelled']);
const VALID_RECURRENCE_TYPES = new Set(['none', 'daily', 'weekly', 'monthly']);

const SocialAiReminder = ghostBookshelf.Model.extend({
    tableName: 'social_ai_reminders',

    defaults() {
        return {
            id: ObjectId().toHexString(),
            status: 'active',
            recurrence_type: 'none',
            recurrence_interval: 1
        };
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
        const userId = model.get('user_id');
        const groupId = model.get('group_id');
        const title = String(model.get('title') || '').trim();
        const remindAt = model.get('remind_at');
        const status = String(model.get('status') || '').trim();
        const recurrenceType = String(model.get('recurrence_type') || 'none').trim();
        const recurrenceInterval = Number(model.get('recurrence_interval') || 1);

        if (!userId) {
            throw new errors.ValidationError({message: 'user_id is required.'});
        }
        if (!title) {
            throw new errors.ValidationError({message: 'title is required.'});
        }
        if (!remindAt) {
            throw new errors.ValidationError({message: 'remind_at is required.'});
        }
        if (!status || !VALID_STATUS.has(status)) {
            throw new errors.ValidationError({message: 'status must be active or cancelled.'});
        }
        if (!VALID_RECURRENCE_TYPES.has(recurrenceType)) {
            throw new errors.ValidationError({
                message: 'recurrence_type must be one of: none, daily, weekly, monthly.'
            });
        }
        if (!Number.isInteger(recurrenceInterval) || recurrenceInterval < 1 || recurrenceInterval > 365) {
            throw new errors.ValidationError({
                message: 'recurrence_interval must be an integer between 1 and 365.'
            });
        }

        const [user, group] = await Promise.all([
            models.User.findOne({id: userId}),
            groupId ? models.SocialGroup.findOne({id: groupId}) : Promise.resolve(null)
        ]);

        if (!user) {
            throw new errors.ValidationError({message: `User ${userId} does not exist.`});
        }
        if (groupId && !group) {
            throw new errors.ValidationError({message: `Group ${groupId} does not exist.`});
        }
    }
});

module.exports = {
    SocialAiReminder: ghostBookshelf.model('SocialAiReminder', SocialAiReminder)
};
