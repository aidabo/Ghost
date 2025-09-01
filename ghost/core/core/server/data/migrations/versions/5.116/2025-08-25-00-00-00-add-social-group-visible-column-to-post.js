const {createAddColumnMigration} = require('../../utils');

module.exports = createAddColumnMigration('posts', 'group_visible', {
    type: 'string',
    maxlength: 20,
    nullable: true,
    index: true, 
    defaultTo: 'none',
    validations: {isIn: [['none', 'public', 'private']]}
});
