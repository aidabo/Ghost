const { createAddColumnMigration, combineNonTransactionalMigrations } = require('../../utils');

module.exports = combineNonTransactionalMigrations(
    createAddColumnMigration('social_charts', 'thumbnail',
        { type: 'string', maxlength: 2000, nullable: true })
);
