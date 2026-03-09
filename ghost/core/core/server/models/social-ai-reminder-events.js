const ObjectId = require('bson-objectid').default;
const ghostBookshelf = require('./base');
const errors = require('@tryghost/errors');
const models = require('./index');

const VALID_ANSWER_TYPES = new Set(['acknowledged', 'done', 'skipped', 'snoozed']);

const SocialAiReminderEvent = ghostBookshelf.Model.extend({
    tableName: 'social_ai_reminder_events',

    defaults() {
        return {
            id: ObjectId().toHexString(),
            answer_type: 'acknowledged'
        };
    },

    reminder() {
        return this.belongsTo('SocialAiReminder', 'reminder_id');
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
        const reminderId = model.get('reminder_id');
        const userId = model.get('user_id');
        const groupId = model.get('group_id');
        const answerType = String(model.get('answer_type') || 'acknowledged').trim();

        if (!reminderId) {
            throw new errors.ValidationError({message: 'reminder_id is required.'});
        }
        if (!userId) {
            throw new errors.ValidationError({message: 'user_id is required.'});
        }
        if (!VALID_ANSWER_TYPES.has(answerType)) {
            throw new errors.ValidationError({
                message: 'answer_type must be one of: acknowledged, done, skipped, snoozed.'
            });
        }

        const [reminder, user, group] = await Promise.all([
            models.SocialAiReminder.findOne({id: reminderId}),
            models.User.findOne({id: userId}),
            groupId ? models.SocialGroup.findOne({id: groupId}) : Promise.resolve(null)
        ]);

        if (!reminder) {
            throw new errors.ValidationError({message: `Reminder ${reminderId} does not exist.`});
        }
        if (!user) {
            throw new errors.ValidationError({message: `User ${userId} does not exist.`});
        }
        if (groupId && !group) {
            throw new errors.ValidationError({message: `Group ${groupId} does not exist.`});
        }
    }
});

module.exports = {
    SocialAiReminderEvent: ghostBookshelf.model('SocialAiReminderEvent', SocialAiReminderEvent)
};

