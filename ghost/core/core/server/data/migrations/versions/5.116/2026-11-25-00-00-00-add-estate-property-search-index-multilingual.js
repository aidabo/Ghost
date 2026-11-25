const {addTable} = require('../../utils');

module.exports = addTable('estate_property_search_index_i18n', {
    property_id: {type: 'string', maxlength: 24, nullable: false, references: 'estate_properties.id'},
    locale: {type: 'string', maxlength: 10, nullable: false},
    searchable_text: {type: 'text', maxlength: 65535, nullable: true},
    normalized_text: {type: 'text', maxlength: 65535, nullable: true},
    title_text: {type: 'text', maxlength: 10000, nullable: true},
    translation_text: {type: 'text', maxlength: 65535, nullable: true},
    indexed_at: {type: 'dateTime', nullable: false},
    '@@INDEXES@@': [
        ['property_id', 'locale']
    ],
    '@@UNIQUE_CONSTRAINTS@@': [
        ['property_id', 'locale']
    ]
});
