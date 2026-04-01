const {createAddColumnMigration} = require('../../utils');

module.exports = createAddColumnMigration('posts', 'related_events', {
    type: 'string',
    maxlength: 2000,
    nullable: true
});

