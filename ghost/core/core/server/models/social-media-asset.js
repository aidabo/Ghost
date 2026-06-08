const ObjectId = require('bson-objectid').default;
const ghostBookshelf = require('./base');

const SocialMediaAsset = ghostBookshelf.Model.extend({
    tableName: 'social_media_assets',

    defaults() {
        return {
            id: ObjectId().toHexString()
        };
    },

    user() {
        return this.belongsTo('User', 'user_id');
    },

    group() {
        return this.belongsTo('SocialGroup', 'group_id');
    },

    job() {
        return this.belongsTo('SocialAiMediaJob', 'job_id');
    },

    tag() {
        return this.belongsTo('Tag', 'tag_id');
    },

    // Virtual: expose storage_url as url for API consumers
    virtuals: {
        url() {
            return this.get('storage_url');
        }
    }
});

module.exports = {
    SocialMediaAsset: ghostBookshelf.model('SocialMediaAsset', SocialMediaAsset)
};
