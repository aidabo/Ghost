const {addTable} = require('../../utils');

module.exports = addTable('social_ai_reminders', {
    id: {type: 'string', maxlength: 24, nullable: false, primary: true},
    user_id: {type: 'string', maxlength: 24, nullable: false, index: true, references: 'users.id', cascadeDelete: true},
    group_id: {type: 'string', maxlength: 24, nullable: true, index: true, references: 'social_groups.id', cascadeDelete: true},
    title: {type: 'string', maxlength: 500, nullable: false},
    note: {type: 'text', maxlength: 1000000, nullable: true},
    remind_at: {type: 'dateTime', nullable: false, index: true},
    timezone: {type: 'string', maxlength: 64, nullable: true},
    status: {type: 'string', maxlength: 20, nullable: false, defaultTo: 'active', index: true},
    cancelled_at: {type: 'dateTime', nullable: true, index: true},
    created_at: {type: 'dateTime', nullable: false, index: true},
    updated_at: {type: 'dateTime', nullable: false, index: true},
    '@@INDEXES@@': [
        ['user_id', 'group_id', 'status', 'remind_at'],
        ['group_id', 'status', 'remind_at']
    ]
});

