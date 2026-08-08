const ObjectId = require('bson-objectid').default;
const ghostBookshelf = require('./base');
const errors = require('@tryghost/errors');
const models = require('./index');

const SocialAiChartJob = ghostBookshelf.Model.extend({
    tableName: 'social_ai_chart_jobs',

    defaults() {
        return {
            id: ObjectId().toHexString(),
            type: 'image-fetch',
            status: 'queued',
            progress: 0
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
        const userId = String(model.get('user_id') || '').trim();
        const type = String(model.get('type') || '').trim();

        if (!type) {
            throw new errors.ValidationError({message: 'type is required.'});
        }

        if (userId) {
            // @ts-ignore
            const user = await models.User.findOne({id: userId});
            if (!user) {
                throw new errors.ValidationError({message: `User ${userId} does not exist.`});
            }
        }

        const groupId = String(model.get('group_id') || '').trim();
        if (groupId) {
            // @ts-ignore
            const group = await models.SocialGroup.findOne({id: groupId});
            if (!group) {
                throw new errors.ValidationError({message: `Group ${groupId} does not exist.`});
            }
        }
    }
});

module.exports = {
    SocialAiChartJob: ghostBookshelf.model('SocialAiChartJob', SocialAiChartJob)
};
