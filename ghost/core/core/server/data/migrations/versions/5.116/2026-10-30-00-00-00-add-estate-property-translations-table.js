const {addTable} = require('../../utils');

module.exports = addTable('estate_property_translations', {
    id: {type: 'string', maxlength: 24, nullable: false, primary: true},
    property_id: {type: 'string', maxlength: 24, nullable: false, references: 'estate_properties.id'},
    field: {type: 'string', maxlength: 100, nullable: false},
    locale: {type: 'string', maxlength: 10, nullable: false},
    source_hash: {type: 'string', maxlength: 128, nullable: false},
    text: {type: 'text', maxlength: 16777215, fieldtype: 'medium', nullable: false},
    origin: {type: 'string', maxlength: 20, nullable: false, defaultTo: 'ai'},
    dictionary_version: {type: 'string', maxlength: 100, nullable: true},
    created_at: {type: 'dateTime', nullable: false},
    updated_at: {type: 'dateTime', nullable: false}
});
