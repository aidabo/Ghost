const ObjectId = require('bson-objectid').default;
const ghostBookshelf = require('./base');
const errors = require('@tryghost/errors');
const models = require('./index');

// Generic project container (P1, plan §0-1/§3-1). Holds jobs of any type;
// `status` is a user-controlled PUBLICATION state — enum: draft | published,
// set from the project detail page / edit dialog (review M2: the old derived
// draft/active/completed scheme was removed).
const SocialAiProject = ghostBookshelf.Model.extend({
    tableName: 'social_ai_projects',

    defaults() {
        return {
            id: ObjectId().toHexString(),
            status: 'draft',
            tags: '[]'
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
        const name = String(model.get('name') || '').trim();
        if (!name) {
            throw new errors.ValidationError({message: 'name is required.'});
        }

        const userId = String(model.get('user_id') || '').trim();
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
    SocialAiProject: ghostBookshelf.model('SocialAiProject', SocialAiProject)
};
