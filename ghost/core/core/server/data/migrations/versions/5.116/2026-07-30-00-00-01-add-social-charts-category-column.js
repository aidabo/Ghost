const { createAddColumnMigration, combineNonTransactionalMigrations } = require('../../utils');

module.exports = combineNonTransactionalMigrations(
    createAddColumnMigration('social_charts', 'category',
        { type: 'string', maxlength: 100, nullable: true, index: true })
);
