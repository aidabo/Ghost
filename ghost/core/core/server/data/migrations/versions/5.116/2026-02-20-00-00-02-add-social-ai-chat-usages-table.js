const {addTable} = require('../../utils');

module.exports = addTable('social_ai_usages', {
    id: {type: 'string', maxlength: 24, nullable: false, primary: true},
    conversation_id: {type: 'string', maxlength: 24, nullable: false, index: true, references: 'social_ai_conversations.id', cascadeDelete: true},
    user_id: {type: 'string', maxlength: 24, nullable: false, index: true, references: 'users.id', cascadeDelete: true},
    group_id: {type: 'string', maxlength: 24, nullable: true, index: true, references: 'social_groups.id', cascadeDelete: true},
    provider: {type: 'string', maxlength: 50, nullable: true, index: true},
    model: {type: 'string', maxlength: 191, nullable: true},
    prompt_tokens: {type: 'integer', nullable: false, unsigned: true, defaultTo: 0},
    completion_tokens: {type: 'integer', nullable: false, unsigned: true, defaultTo: 0},
    total_tokens: {type: 'integer', nullable: false, unsigned: true, defaultTo: 0},
    cost_usd_micros: {type: 'bigInteger', nullable: false, unsigned: true, defaultTo: 0},
    currency: {type: 'string', maxlength: 10, nullable: false, defaultTo: 'USD'},
    created_at: {type: 'dateTime', nullable: false, index: true},
    '@@INDEXES@@': [
        ['user_id', 'group_id', 'created_at'],
        ['provider', 'model', 'created_at']
    ]
});
