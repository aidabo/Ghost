const ObjectId = require('bson-objectid').default;
const ghostBookshelf = require('./base');

const EstatePropertyStaff = ghostBookshelf.Model.extend({
    tableName: 'estate_property_staff',

    defaults() {
        return {
            id: ObjectId().toHexString(),
            role: '担当者',
            sort_order: 0,
            is_primary: false
        };
    },

    property() {
        return this.belongsTo('EstateProperty', 'property_id');
    },

    user() {
        return this.belongsTo('User', 'user_id');
    }
}, {
    permittedAttributes: ['id', 'property_id', 'user_id', 'role', 'sort_order', 'is_primary', 'created_at', 'updated_at'],

    relationships: ['property', 'user']
});

module.exports = {
    EstatePropertyStaff: ghostBookshelf.model('EstatePropertyStaff', EstatePropertyStaff)
};
