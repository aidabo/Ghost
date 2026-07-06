const {addTable} = require('../../utils');

// Junction table: one estate inquiry can reference many properties (single- or
// multi-property inquiries). Snapshots internal_inquiry_id / property_name /
// address at inquiry time (property data may change or be removed later).
module.exports = addTable('estate_inquiry_properties', {
    id: {type: 'string', maxlength: 24, nullable: false, primary: true},
    inquiry_id: {type: 'string', maxlength: 24, nullable: false, references: 'estate_inquiries.id', cascadeDelete: true},
    property_id: {type: 'string', maxlength: 24, nullable: true, references: 'estate_properties.id', setNullDelete: true},
    internal_inquiry_id: {type: 'string', maxlength: 100, nullable: true},
    property_name: {type: 'string', maxlength: 500, nullable: true},
    address: {type: 'string', maxlength: 1000, nullable: true},
    created_at: {type: 'dateTime', nullable: false}
});
