const ObjectId = require('bson-objectid').default;
const ghostBookshelf = require('./base');

const PublishPost = ghostBookshelf.Model.extend({
    tableName: 'publish_posts',

    defaults() {
        return {
            id: ObjectId().toHexString(),
            content_type: 'news',
            featured: false,
            sort_order: 0
        };
    },

    post() {
        return this.belongsTo('Post', 'post_id');
    }
}, {
    orderDefaultOptions() {
        return {
            'publish_posts.sort_order': 'ASC',
            'publish_posts.updated_at': 'DESC'
        };
    },

    permittedAttributes: [
        'id',
        'post_id',
        'content_type',
        'section',
        'featured',
        'metadata_json',
        'sort_order',
        'created_at',
        'updated_at'
    ],

    /**
     * @TODO: Use full name mapping like Ghost core models
     */
    relationships: ['post'],

    includeRelations: []
});

const PublishPosts = ghostBookshelf.Collection.extend({
    model: PublishPost
});

module.exports = {
    PublishPost: ghostBookshelf.model('PublishPost', PublishPost),
    PublishPosts: ghostBookshelf.collection('PublishPosts', PublishPosts)
};
