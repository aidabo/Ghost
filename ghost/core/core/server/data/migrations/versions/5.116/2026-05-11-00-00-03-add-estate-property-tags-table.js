const {addTable} = require('../../utils');

module.exports = addTable('estate_property_tags', {
    id: {type: 'string', maxlength: 24, nullable: false, primary: true},
    property_id: {type: 'string', maxlength: 24, nullable: false, references: 'estate_properties.id'},
    tag_id: {type: 'string', maxlength: 24, nullable: false, references: 'tags.id'},
    created_at: {type: 'dateTime', nullable: false}
});
