const ObjectId = require('bson-objectid').default;
const ghostBookshelf = require('./base');

const SocialAiContentBundleJob = ghostBookshelf.Model.extend({
    tableName: 'social_ai_content_bundle_jobs',
    defaults() {
        return {
            id: ObjectId().toHexString(),
            type: 'content-bundle',
            status: 'queued',
            progress: 0
        };
    },
    user() {
        return this.belongsTo('User', 'user_id');
    },
    group() {
        return this.belongsTo('SocialGroup', 'group_id');
    }
});

module.exports = {
    SocialAiContentBundleJob: ghostBookshelf.model('SocialAiContentBundleJob', SocialAiContentBundleJob)
};
