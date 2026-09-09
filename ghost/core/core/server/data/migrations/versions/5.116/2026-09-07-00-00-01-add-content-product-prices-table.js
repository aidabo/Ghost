const {addTable} = require('../../utils');

module.exports = addTable('content_product_prices', {
    id: {type: 'string', maxlength: 24, nullable: false, primary: true},
    content_product_id: {type: 'string', maxlength: 24, nullable: false, index: true, references: 'content_products.id', cascadeDelete: true},
    stripe_product_id: {type: 'string', maxlength: 191, nullable: true, index: true},
    stripe_price_id: {type: 'string', maxlength: 191, nullable: true, unique: true},
    amount: {type: 'integer', nullable: false, unsigned: true},
    currency: {type: 'string', maxlength: 10, nullable: false},
    active: {type: 'boolean', nullable: false, defaultTo: true, index: true},
    created_at: {type: 'dateTime', nullable: false},
    updated_at: {type: 'dateTime', nullable: false}
});
