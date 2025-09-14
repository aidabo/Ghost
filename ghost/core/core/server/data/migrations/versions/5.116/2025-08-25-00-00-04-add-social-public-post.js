const {createAddColumnMigration} = require('../../utils');

/**
 * group.type === 'public' -> public_post = true
 * group.type !== 'public' -> public_post = false
 * no group -> public_post = true
 */
module.exports = createAddColumnMigration('posts', 'public_post', {
    type: 'boolean',
    nullable: true,
    index: true, 
    defaultTo: true
});

