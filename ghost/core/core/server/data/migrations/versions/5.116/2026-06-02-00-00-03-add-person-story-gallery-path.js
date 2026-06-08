const {createAddColumnMigration} = require('../../utils');

module.exports = createAddColumnMigration('person_stories', 'gallery_path', {
    type: 'string',
    maxlength: 2000,
    nullable: true
});
