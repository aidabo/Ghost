const ObjectId = require('bson-objectid').default;
const ghostBookshelf = require('./base');

const SocialAiNewsJobMedia = ghostBookshelf.Model.extend({
    tableName: 'social_ai_news_job_media',

    defaults() {
        return {
            id: ObjectId().toHexString(),
            role: 'output',
            sort_order: 0
        };
    },

    newsJob() {
        return this.belongsTo('SocialAiNewsJob', 'news_job_id');
    },

    mediaAsset() {
        return this.belongsTo('SocialMediaAsset', 'media_id');
    }
});

module.exports = {
    SocialAiNewsJobMedia: ghostBookshelf.model('SocialAiNewsJobMedia', SocialAiNewsJobMedia)
};
