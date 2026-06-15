const {createAddColumnMigration} = require('../../utils');

module.exports = createAddColumnMigration('person_media', 'updated_at', {
    type: 'dateTime',
    nullable: true
});
