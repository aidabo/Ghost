const { addTable } = require('../../utils');

module.exports = addTable('social_user_logs', {
    id: { type: 'string', maxlength: 24, nullable: false, primary: true },
    user_id: { type: 'string', maxlength: 24, nullable: false, unique: false, references: 'users.id', cascadeDelete: true },
    function_used: { type: 'string', maxlength: 60, nullable: true },
    metadata: { type: 'text', maxlength: 1000000000, nullable: true },
    created_at: { type: 'dateTime', nullable: false },
    updated_at: { type: 'dateTime', nullable: true }
});

