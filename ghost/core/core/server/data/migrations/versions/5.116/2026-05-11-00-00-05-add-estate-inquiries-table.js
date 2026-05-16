const {addTable} = require('../../utils');

module.exports = addTable('estate_inquiries', {
    id: {type: 'string', maxlength: 24, nullable: false, primary: true},
    property_id: {type: 'string', maxlength: 24, nullable: true, references: 'estate_properties.id'},
    name: {type: 'string', maxlength: 200, nullable: false},
    email: {type: 'string', maxlength: 254, nullable: false},
    phone: {type: 'string', maxlength: 50, nullable: true},
    message: {type: 'text', maxlength: 10000, nullable: true},
    inquiry_type: {type: 'string', maxlength: 50, nullable: true, defaultTo: 'general'},
    status: {type: 'string', maxlength: 20, nullable: false, defaultTo: 'unread', validations: {isIn: [['unread', 'read', 'responded', 'closed']]}},
    referrer_url: {type: 'string', maxlength: 2000, nullable: true},
    metadata: {type: 'text', maxlength: 10000, nullable: true},
    user_agent: {type: 'string', maxlength: 500, nullable: true},
    ip_address: {type: 'string', maxlength: 45, nullable: true},
    created_at: {type: 'dateTime', nullable: false},
    updated_at: {type: 'dateTime', nullable: true}
});
