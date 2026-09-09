const {addTable} = require('../../utils');

module.exports = addTable('member_entitlements', {
    id: {type: 'string', maxlength: 24, nullable: false, primary: true},
    member_id: {type: 'string', maxlength: 24, nullable: false, index: true, references: 'members.id', cascadeDelete: true},
    content_product_id: {type: 'string', maxlength: 24, nullable: false, index: true, references: 'content_products.id', cascadeDelete: true},
    order_id: {type: 'string', maxlength: 24, nullable: false, unique: true, references: 'content_product_orders.id', cascadeDelete: true},
    status: {type: 'string', maxlength: 30, nullable: false, defaultTo: 'active', index: true},
    granted_at: {type: 'dateTime', nullable: false},
    expires_at: {type: 'dateTime', nullable: true},
    refunded_at: {type: 'dateTime', nullable: true},
    revoked_at: {type: 'dateTime', nullable: true},
    created_at: {type: 'dateTime', nullable: false},
    updated_at: {type: 'dateTime', nullable: false},
    '@@INDEXES@@': [
        ['member_id', 'content_product_id', 'status']
    ]
});
