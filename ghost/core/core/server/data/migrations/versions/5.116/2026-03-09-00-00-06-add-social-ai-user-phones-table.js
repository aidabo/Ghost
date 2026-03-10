const { addTable } = require('../../utils');

module.exports = addTable('social_ai_user_phones', {
    id: { type: 'string', maxlength: 24, nullable: false, primary: true },
    user_id: { type: 'string', maxlength: 24, nullable: false, references: 'users.id', cascadeDelete: true },
    phone_e164: { type: 'string', maxlength: 32, nullable: false },
    phone_hash: { type: 'string', maxlength: 128, nullable: false },
    phone_last4: { type: 'string', maxlength: 8, nullable: true },
    status: { type: 'string', maxlength: 24, nullable: false, defaultTo: 'pending' },
    verification_code_hash: { type: 'string', maxlength: 128, nullable: true },
    code_expires_at: { type: 'dateTime', nullable: true },
    verified_at: { type: 'dateTime', nullable: true },
    created_at: { type: 'dateTime', nullable: false },
    updated_at: { type: 'dateTime', nullable: false },
    '@@INDEXES@@': [
        ['user_id', 'phone_hash'],
        ['status', 'updated_at']
    ]
});
