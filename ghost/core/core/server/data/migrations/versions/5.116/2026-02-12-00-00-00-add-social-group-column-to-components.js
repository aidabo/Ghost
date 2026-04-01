const {createAddColumnMigration} = require('../../utils');

module.exports = createAddColumnMigration('social_components', 'group_id', {
    type: 'string',
    maxlength: 24,
    nullable: true
});

