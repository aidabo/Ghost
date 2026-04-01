const {createAddColumnMigration, combineNonTransactionalMigrations} = require('../../utils');

module.exports = combineNonTransactionalMigrations(
    createAddColumnMigration('social_ai_reminders', 'recurrence_type', {
        type: 'string',
        maxlength: 20,
        nullable: false,
        defaultTo: 'none'
    }),
    createAddColumnMigration('social_ai_reminders', 'recurrence_interval', {
        type: 'integer',
        nullable: false,
        unsigned: true,
        defaultTo: 1
    })
);
