const ObjectId = require('bson-objectid').default;
const ghostBookshelf = require('./base');

const EstatePropertyMedium = ghostBookshelf.Model.extend({
    tableName: 'estate_property_media',

    defaults() {
        return {
            id: ObjectId().toHexString(),
            media_type: 'image',
            sort_order: 0,
            is_primary: false
        };
    },

    property() {
        return this.belongsTo('EstateProperty', 'property_id');
    },

    media() {
        return this.belongsTo('SocialMediaAsset', 'media_id');
    }
}, {
    permittedAttributes: ['id', 'property_id', 'media_id', 'media_type', 'sort_order', 'caption', 'is_primary', 'created_at'],

    relationships: ['property', 'media']
});

module.exports = {
    EstatePropertyMedium: ghostBookshelf.model('EstatePropertyMedium', EstatePropertyMedium)
};
