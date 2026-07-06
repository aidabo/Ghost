const ObjectId = require('bson-objectid').default;
const ghostBookshelf = require('./base');

const EstateInquiryProperty = ghostBookshelf.Model.extend({
    tableName: 'estate_inquiry_properties',

    defaults() {
        return {
            id: ObjectId().toHexString()
        };
    },

    inquiry() {
        return this.belongsTo('EstateInquiry', 'inquiry_id');
    },

    property() {
        return this.belongsTo('EstateProperty', 'property_id');
    }
}, {
    permittedAttributes: [
        'id', 'inquiry_id', 'property_id',
        'internal_inquiry_id', 'property_name', 'address',
        'created_at'
    ],

    relationships: ['inquiry', 'property']
});

module.exports = {
    EstateInquiryProperty: ghostBookshelf.model('EstateInquiryProperty', EstateInquiryProperty)
};
