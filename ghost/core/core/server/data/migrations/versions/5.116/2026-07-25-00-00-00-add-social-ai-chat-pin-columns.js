const {createAddColumnMigration} = require('../../utils');
const {combineNonTransactionalMigrations} = require('../../utils');

module.exports = combineNonTransactionalMigrations(
    createAddColumnMigration('social_ai_conversations', 'is_pinned', {
        type: 'bool',
        nullable: false,
        defaultTo: false
    }),
    createAddColumnMigration('social_ai_conversations', 'is_marked', {
        type: 'bool',
        nullable: false,
        defaultTo: false
    })
);
