const {addTable} = require('../../utils');

module.exports = addTable('social_ai_conversations', {
    id: {type: 'string', maxlength: 24, nullable: false, primary: true},
    user_id: {type: 'string', maxlength: 24, nullable: false, index: true, references: 'users.id', cascadeDelete: true},
    group_id: {type: 'string', maxlength: 24, nullable: true, index: true, references: 'social_groups.id', cascadeDelete: true},
    title: {type: 'string', maxlength: 500, nullable: true},
    provider: {type: 'string', maxlength: 50, nullable: true, index: true},
    model: {type: 'string', maxlength: 191, nullable: true},
    response_mode: {type: 'string', maxlength: 50, nullable: true},
    visibility: {type: 'string', maxlength: 50, nullable: false, defaultTo: 'private', index: true},
    created_at: {type: 'dateTime', nullable: false, index: true},
    updated_at: {type: 'dateTime', nullable: false, index: true},
    '@@INDEXES@@': [
        ['user_id', 'group_id', 'updated_at']
    ]
});
