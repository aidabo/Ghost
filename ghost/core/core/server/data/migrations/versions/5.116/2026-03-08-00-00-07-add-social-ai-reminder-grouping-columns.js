const {combineNonTransactionalMigrations, createAddColumnMigration} = require('../../utils');

module.exports = combineNonTransactionalMigrations(
    createAddColumnMigration('social_ai_reminders', 'reminder_message_id', {
        type: 'string',
        maxlength: 24,
        nullable: true,
        index: true
    }),
    createAddColumnMigration('social_ai_reminders', 'reminder_batch_id', {
        type: 'string',
        maxlength: 24,
        nullable: true,
        index: true
    }),
    createAddColumnMigration('social_ai_reminders', 'source_message_id', {
        type: 'string',
        maxlength: 24,
        nullable: true,
        index: true
    }),
    createAddColumnMigration('social_ai_reminders', 'created_by_user_message_id', {
        type: 'string',
        maxlength: 24,
        nullable: true,
        index: true
    })
);
