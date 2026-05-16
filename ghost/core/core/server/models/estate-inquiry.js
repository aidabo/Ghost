const ObjectId = require('bson-objectid').default;
const ghostBookshelf = require('./base');

const EstateInquiry = ghostBookshelf.Model.extend({
    tableName: 'estate_inquiries',

    defaults() {
        return {
            id: ObjectId().toHexString(),
            status: 'unread',
            inquiry_type: 'general'
        };
    },

    property() {
        return this.belongsTo('EstateProperty', 'property_id');
    }
}, {
    orderDefaultOptions() {
        return {
            'estate_inquiries.created_at': 'DESC'
        };
    },

    permittedAttributes: [
        'id', 'property_id',
        'name', 'email', 'phone', 'message',
        'inquiry_type', 'status',
        'referrer_url', 'metadata', 'user_agent', 'ip_address',
        'created_at', 'updated_at'
    ],

    relationships: ['property']
});

module.exports = {
    EstateInquiry: ghostBookshelf.model('EstateInquiry', EstateInquiry)
};
