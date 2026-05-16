const {addTable} = require('../../utils');

module.exports = addTable('estate_property_posts', {
    id: {type: 'string', maxlength: 24, nullable: false, primary: true},
    property_id: {type: 'string', maxlength: 24, nullable: false, references: 'estate_properties.id'},
    post_id: {type: 'string', maxlength: 24, nullable: false, references: 'posts.id'},
    locale: {type: 'string', maxlength: 10, nullable: false, defaultTo: 'ja'},
    sort_order: {type: 'integer', nullable: true, defaultTo: 0},
    is_primary: {type: 'bool', nullable: true, defaultTo: false},
    created_at: {type: 'dateTime', nullable: false}
});
