const {addTable} = require('../../utils');

module.exports = addTable('content_product_orders', {
    id: {type: 'string', maxlength: 24, nullable: false, primary: true},
    member_id: {type: 'string', maxlength: 24, nullable: false, index: true, references: 'members.id', cascadeDelete: true},
    content_product_id: {type: 'string', maxlength: 24, nullable: false, index: true, references: 'content_products.id', cascadeDelete: true},
    content_product_price_id: {type: 'string', maxlength: 24, nullable: false, references: 'content_product_prices.id'},
    stripe_customer_id: {type: 'string', maxlength: 191, nullable: true, index: true},
    stripe_checkout_session_id: {type: 'string', maxlength: 191, nullable: false, unique: true},
    stripe_payment_intent_id: {type: 'string', maxlength: 191, nullable: true, index: true},
    status: {type: 'string', maxlength: 30, nullable: false, defaultTo: 'pending', index: true},
    amount: {type: 'integer', nullable: false, unsigned: true},
    currency: {type: 'string', maxlength: 10, nullable: false},
    created_at: {type: 'dateTime', nullable: false},
    updated_at: {type: 'dateTime', nullable: false}
});
