const {createAddColumnMigration} = require('../../utils');

module.exports = createAddColumnMigration('social_groups', 'media_folder_alias', {
    type: 'string',
    maxlength: 32,
    nullable: true,
    unique: true
});
