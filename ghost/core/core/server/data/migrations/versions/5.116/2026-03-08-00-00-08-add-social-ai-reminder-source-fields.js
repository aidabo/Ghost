const {combineNonTransactionalMigrations, createAddColumnMigration} = require('../../utils');

module.exports = combineNonTransactionalMigrations(
    createAddColumnMigration('social_ai_reminders', 'source_type', {
        type: 'string',
        maxlength: 32,
        nullable: true,
        index: true
    }),
    createAddColumnMigration('social_ai_reminders', 'source_id', {
        type: 'string',
        maxlength: 24,
        nullable: true,
        index: true
    })
);
