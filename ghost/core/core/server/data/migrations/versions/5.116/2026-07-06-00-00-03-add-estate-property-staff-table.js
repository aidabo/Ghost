const {addTable} = require('../../utils');

module.exports = addTable('estate_property_staff', {
    id: {type: 'string', maxlength: 24, nullable: false, primary: true},
    property_id: {type: 'string', maxlength: 24, nullable: false, references: 'estate_properties.id'},
    user_id: {type: 'string', maxlength: 24, nullable: false, references: 'users.id'},
    role: {type: 'string', maxlength: 100, nullable: true, defaultTo: '担当者'},
    sort_order: {type: 'integer', nullable: true, defaultTo: 0},
    is_primary: {type: 'bool', nullable: true, defaultTo: false},
    created_at: {type: 'dateTime', nullable: false},
    updated_at: {type: 'dateTime', nullable: true}
});
