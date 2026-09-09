const {addTable} = require('../../utils');

module.exports = addTable('content_products', {
    id: {type: 'string', maxlength: 24, nullable: false, primary: true},
    slug: {type: 'string', maxlength: 191, nullable: false, unique: true},
    name: {type: 'string', maxlength: 191, nullable: false},
    description: {type: 'text', nullable: true},
    product_type: {type: 'string', maxlength: 50, nullable: false, index: true},
    status: {type: 'string', maxlength: 20, nullable: false, defaultTo: 'draft', index: true},
    created_by: {type: 'string', maxlength: 24, nullable: true, index: true, references: 'users.id'},
    created_at: {type: 'dateTime', nullable: false},
    updated_at: {type: 'dateTime', nullable: false}
});
