const ObjectId = require('bson-objectid').default;
const ghostBookshelf = require('./base');

const EstatePropertyTag = ghostBookshelf.Model.extend({
    tableName: 'estate_property_tags',

    defaults() {
        return {
            id: ObjectId().toHexString()
        };
    },

    property() {
        return this.belongsTo('EstateProperty', 'property_id');
    },

    tag() {
        return this.belongsTo('Tag', 'tag_id');
    }
}, {
    permittedAttributes: ['id', 'property_id', 'tag_id', 'created_at'],

    relationships: ['property', 'tag']
});

module.exports = {
    EstatePropertyTag: ghostBookshelf.model('EstatePropertyTag', EstatePropertyTag)
};
