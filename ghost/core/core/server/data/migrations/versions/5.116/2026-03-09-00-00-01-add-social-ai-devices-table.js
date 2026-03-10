const { addTable } = require('../../utils');

module.exports = addTable('social_ai_devices', {
    id: { type: 'string', maxlength: 24, nullable: false, primary: true },
    user_id: { type: 'string', maxlength: 24, nullable: false, references: 'users.id', cascadeDelete: true },
    group_id: { type: 'string', maxlength: 24, nullable: true, references: 'social_groups.id', cascadeDelete: true },
    device_type: { type: 'string', maxlength: 24, nullable: false },
    device_key: { type: 'string', maxlength: 2000, nullable: false },
    locale: { type: 'string', maxlength: 16, nullable: true },
    timezone: { type: 'string', maxlength: 64, nullable: true },
    push_subscription: { type: 'text', maxlength: 1000000000, fieldtype: 'long', nullable: true },
    enabled: { type: 'bool', nullable: false, defaultTo: true },
    created_at: { type: 'dateTime', nullable: false },
    updated_at: { type: 'dateTime', nullable: false },
    '@@INDEXES@@': [
        ['user_id', 'enabled'],
        ['group_id', 'enabled', 'updated_at']
    ]
});
