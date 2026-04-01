const {createAddColumnMigration} = require('../../utils');

module.exports = createAddColumnMigration('social_media_assets', 'original_filename', {
    type: 'string',
    maxlength: 1000,
    nullable: true
});
