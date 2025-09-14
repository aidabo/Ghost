const {createAddColumnMigration} = require('../../utils');

module.exports = createAddColumnMigration('posts', 'post_comment_closed', {
    type: 'boolean',
    nullable: true,
    defaultTo: false
});

