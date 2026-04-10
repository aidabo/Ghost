const {combineNonTransactionalMigrations, createAddColumnMigration} = require('../../utils');

module.exports = combineNonTransactionalMigrations(
    createAddColumnMigration('social_media_assets', 'thumbnail_storage_key', {
        type: 'string',
        maxlength: 2000,
        nullable: true
    }),
    createAddColumnMigration('social_media_assets', 'thumbnail_url', {
        type: 'string',
        maxlength: 2000,
        nullable: true
    })
);
