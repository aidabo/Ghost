const {addTable} = require('../../utils');

module.exports = addTable('estate_dictionary_terms', {
    id: {type: 'string', maxlength: 24, nullable: false, primary: true},
    source: {type: 'string', maxlength: 500, nullable: false, unique: true},
    ja: {type: 'string', maxlength: 1000, nullable: false},
    en: {type: 'string', maxlength: 1000, nullable: false},
    zh: {type: 'string', maxlength: 1000, nullable: false},
    category: {type: 'string', maxlength: 100, nullable: false, defaultTo: '共通'},
    notes: {type: 'text', maxlength: 5000, nullable: true},
    sort_order: {type: 'integer', nullable: true, defaultTo: 0},
    created_at: {type: 'dateTime', nullable: false},
    updated_at: {type: 'dateTime', nullable: true}
});
