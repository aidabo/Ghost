const { createAddColumnMigration, combineNonTransactionalMigrations } = require('../../utils');

module.exports = combineNonTransactionalMigrations(
    createAddColumnMigration('social_components', 'slug',
        { type: 'string', maxlength: 191, nullable: true, unique: true })
);
