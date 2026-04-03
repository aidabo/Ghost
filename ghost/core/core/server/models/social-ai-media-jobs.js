const ObjectId = require('bson-objectid').default;
const ghostBookshelf = require('./base');
const errors = require('@tryghost/errors');
const models = require('./index');

const SocialAiMediaJob = ghostBookshelf.Model.extend({
    tableName: 'social_ai_media_jobs',

    defaults() {
        return {
            id: ObjectId().toHexString(),
            job_type: 'media_translation',
            visibility: 'private',
            scope_type: 'user',
            status: 'queued',
            progress: 0,
            priority: 0,
            mode: 'subtitle_only',
            source_lang: 'auto',
            subtitle_render: 'soft',
            output_playback_speed: 'normal',
            retry_count: 0,
            artifacts_json: '[]'
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
        const groupId = String(model.get('group_id') || '').trim();
        const targetLang = String(model.get('target_lang') || '').trim();
        const inputAssetUrl = String(model.get('input_asset_url') || '').trim();

        if (!userId) {
            throw new errors.ValidationError({message: 'user_id is required.'});
        }

        if (!targetLang) {
            throw new errors.ValidationError({message: 'target_lang is required.'});
        }

        if (!inputAssetUrl) {
            throw new errors.ValidationError({message: 'input_asset_url is required.'});
        }

        // @ts-ignore
        const user = await models.User.findOne({id: userId});
        if (!user) {
            throw new errors.ValidationError({message: `User ${userId} does not exist.`});
        }

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
    SocialAiMediaJob: ghostBookshelf.model('SocialAiMediaJob', SocialAiMediaJob)
};
