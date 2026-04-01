const {createAddColumnMigration} = require('../../utils');

module.exports = createAddColumnMigration('posts', 'post_approved', {
    type: 'boolean',
    nullable: true,
    index: true, 
    defaultTo: true
});
