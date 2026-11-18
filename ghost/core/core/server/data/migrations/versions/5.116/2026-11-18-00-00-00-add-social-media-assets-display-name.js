const {createAddColumnMigration} = require('../../utils');

// Display name (alias) for a gallery file. The S3 object and original_filename are not changed.
module.exports = createAddColumnMigration('social_media_assets', 'display_name', {
    type: 'string',
    maxlength: 1000,
    nullable: true
});
