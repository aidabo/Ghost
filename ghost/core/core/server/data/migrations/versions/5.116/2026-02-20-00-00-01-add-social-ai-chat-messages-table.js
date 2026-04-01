const {addTable} = require('../../utils');

module.exports = addTable('social_ai_messages', {
    id: {type: 'string', maxlength: 24, nullable: false, primary: true},
    conversation_id: {type: 'string', maxlength: 24, nullable: false, index: true, references: 'social_ai_conversations.id', cascadeDelete: true},
    user_id: {type: 'string', maxlength: 24, nullable: false, index: true, references: 'users.id', cascadeDelete: true},
    role: {type: 'string', maxlength: 20, nullable: false, index: true},
    content: {type: 'text', maxlength: 1000000000, fieldtype: 'long', nullable: false},
    created_at: {type: 'dateTime', nullable: false, index: true},
    '@@INDEXES@@': [
        ['conversation_id', 'created_at']
    ]
});
