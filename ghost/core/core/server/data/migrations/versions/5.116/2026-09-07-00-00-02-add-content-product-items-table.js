const {addTable} = require('../../utils');

module.exports = addTable('content_product_items', {
    id: {type: 'string', maxlength: 24, nullable: false, primary: true},
    content_product_id: {type: 'string', maxlength: 24, nullable: false, index: true, references: 'content_products.id', cascadeDelete: true},
    content_type: {type: 'string', maxlength: 50, nullable: false},
    content_id: {type: 'string', maxlength: 191, nullable: false},
    sort_order: {type: 'integer', nullable: false, defaultTo: 0},
    required: {type: 'boolean', nullable: false, defaultTo: true},
    created_at: {type: 'dateTime', nullable: false},
    updated_at: {type: 'dateTime', nullable: false},
    '@@INDEXES@@': [
        ['content_product_id', 'content_type', 'content_id']
    ]
});
