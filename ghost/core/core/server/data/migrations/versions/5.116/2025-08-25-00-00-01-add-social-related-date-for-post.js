const {createAddColumnMigration} = require('../../utils');

module.exports = createAddColumnMigration('posts', 'related_date', {
    type: 'dateTime',
    nullable: true,
    index: true
});

