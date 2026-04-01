const {createAddColumnMigration} = require('../../utils');

module.exports = createAddColumnMigration('social_components', 'tag', {
    type: 'string',
    maxlength: 191,
    nullable: true
});

