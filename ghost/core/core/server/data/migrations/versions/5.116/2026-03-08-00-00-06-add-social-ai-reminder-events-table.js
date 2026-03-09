const {addTable} = require('../../utils');

module.exports = addTable('social_ai_reminder_events', {
    id: {type: 'string', maxlength: 24, nullable: false, primary: true},
    reminder_id: {type: 'string', maxlength: 24, nullable: false, index: true, references: 'social_ai_reminders.id', cascadeDelete: true},
    user_id: {type: 'string', maxlength: 24, nullable: false, index: true, references: 'users.id', cascadeDelete: true},
    group_id: {type: 'string', maxlength: 24, nullable: true, index: true, references: 'social_groups.id', cascadeDelete: true},
    scheduled_at: {type: 'dateTime', nullable: true, index: true},
    prompted_at: {type: 'dateTime', nullable: true, index: true},
    answered_at: {type: 'dateTime', nullable: true, index: true},
    answer_type: {type: 'string', maxlength: 32, nullable: false, defaultTo: 'acknowledged', index: true},
    answer_text: {type: 'text', maxlength: 1000000, nullable: true},
    channel: {type: 'string', maxlength: 32, nullable: true, index: true},
    created_at: {type: 'dateTime', nullable: false, index: true},
    updated_at: {type: 'dateTime', nullable: false, index: true},
    '@@INDEXES@@': [
        ['user_id', 'group_id', 'created_at'],
        ['reminder_id', 'answered_at']
    ]
});

