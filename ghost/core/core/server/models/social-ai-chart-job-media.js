const ObjectId = require('bson-objectid').default;
const ghostBookshelf = require('./base');

const SocialAiChartJobMedia = ghostBookshelf.Model.extend({
    tableName: 'social_ai_chart_job_media',

    defaults() {
        return {
            id: ObjectId().toHexString(),
            role: 'output',
            sort_order: 0
        };
    },

    chartJob() {
        return this.belongsTo('SocialAiChartJob', 'chart_job_id');
    },

    mediaAsset() {
        return this.belongsTo('SocialMediaAsset', 'media_id');
    }
});

module.exports = {
    SocialAiChartJobMedia: ghostBookshelf.model('SocialAiChartJobMedia', SocialAiChartJobMedia)
};
