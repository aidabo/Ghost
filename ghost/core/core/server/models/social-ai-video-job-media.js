const ObjectId = require('bson-objectid').default;
const ghostBookshelf = require('./base');

const SocialAiVideoJobMedia = ghostBookshelf.Model.extend({
    tableName: 'social_ai_video_job_media',

    defaults() {
        return {
            id: ObjectId().toHexString(),
            role: 'output',
            sort_order: 0
        };
    },

    videoJob() {
        return this.belongsTo('SocialAiVideoJob', 'video_job_id');
    },

    mediaAsset() {
        return this.belongsTo('SocialMediaAsset', 'media_id');
    }
});

module.exports = {
    SocialAiVideoJobMedia: ghostBookshelf.model('SocialAiVideoJobMedia', SocialAiVideoJobMedia)
};
