const ObjectId = require('bson-objectid').default;
const ghostBookshelf = require('./base');

const EstatePropertyPost = ghostBookshelf.Model.extend({
    tableName: 'estate_property_posts',

    defaults() {
        return {
            id: ObjectId().toHexString(),
            locale: 'ja',
            sort_order: 0,
            is_primary: false
        };
    },

    property() {
        return this.belongsTo('EstateProperty', 'property_id');
    },

    post() {
        return this.belongsTo('Post', 'post_id');
    }
}, {
    permittedAttributes: ['id', 'property_id', 'post_id', 'locale', 'sort_order', 'is_primary', 'created_at'],

    relationships: ['property', 'post']
});

module.exports = {
    EstatePropertyPost: ghostBookshelf.model('EstatePropertyPost', EstatePropertyPost)
};
