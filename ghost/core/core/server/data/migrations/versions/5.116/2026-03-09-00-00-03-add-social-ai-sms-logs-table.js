const { addTable } = require('../../utils');

module.exports = addTable('social_ai_sms_logs', {
    id: { type: 'string', maxlength: 24, nullable: false, primary: true },
    user_id: { type: 'string', maxlength: 24, nullable: false, references: 'users.id', cascadeDelete: true },
    group_id: { type: 'string', maxlength: 24, nullable: true, references: 'social_groups.id', cascadeDelete: true },
    phone_hash: { type: 'string', maxlength: 128, nullable: false },
    phone_last4: { type: 'string', maxlength: 8, nullable: true },
    message: { type: 'text', maxlength: 1000000000, fieldtype: 'long', nullable: true },
    message_category: { type: 'string', maxlength: 32, nullable: true },
    provider: { type: 'string', maxlength: 32, nullable: false },
    message_id: { type: 'string', maxlength: 128, nullable: true },
    status: { type: 'string', maxlength: 24, nullable: false },
    error: { type: 'text', maxlength: 1000000000, fieldtype: 'long', nullable: true },
    region: { type: 'string', maxlength: 64, nullable: true },
    sender_id: { type: 'string', maxlength: 128, nullable: true },
    sms_type: { type: 'string', maxlength: 32, nullable: true },
    created_at: { type: 'dateTime', nullable: false },
    updated_at: { type: 'dateTime', nullable: false },
    '@@INDEXES@@': [
        ['user_id', 'created_at'],
        ['status', 'created_at'],
        ['provider', 'created_at']
    ]
});
