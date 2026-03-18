const { addTable } = require('../../utils');

module.exports = addTable('social_ai_agent_settings', {
    id: { type: 'string', maxlength: 24, nullable: false, primary: true },
    user_id: { type: 'string', maxlength: 24, nullable: false, references: 'users.id', cascadeDelete: true },
    settings_json: { type: 'text', maxlength: 1000000000, fieldtype: 'long', nullable: false },
    created_at: { type: 'dateTime', nullable: false },
    updated_at: { type: 'dateTime', nullable: false },
    '@@INDEXES@@': [
        ['user_id']
    ],
    '@@UNIQUE_CONSTRAINTS@@': [
        ['user_id']
    ]
});
