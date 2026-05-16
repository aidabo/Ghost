const {addTable} = require('../../utils');

module.exports = addTable('estate_property_media', {
    id: {type: 'string', maxlength: 24, nullable: false, primary: true},
    property_id: {type: 'string', maxlength: 24, nullable: false, references: 'estate_properties.id'},
    media_id: {type: 'string', maxlength: 24, nullable: false, references: 'social_media_assets.id'},
    media_type: {type: 'string', maxlength: 50, nullable: false, defaultTo: 'image', validations: {isIn: [['image', 'video', 'pdf', 'document', 'other']]}},
    sort_order: {type: 'integer', nullable: true, defaultTo: 0},
    caption: {type: 'string', maxlength: 500, nullable: true},
    is_primary: {type: 'bool', nullable: true, defaultTo: false},
    created_at: {type: 'dateTime', nullable: false}
});
