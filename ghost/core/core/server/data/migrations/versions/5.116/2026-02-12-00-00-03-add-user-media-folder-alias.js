const {createAddColumnMigration} = require('../../utils');

module.exports = createAddColumnMigration('users', 'media_folder_alias', {
    type: 'string',
    maxlength: 32,
    nullable: true,
    unique: true
});

