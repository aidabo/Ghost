const {createAddColumnMigration} = require('../../utils');

module.exports = createAddColumnMigration('social_ai_usages', 'usage_source', {
    type: 'string',
    maxlength: 32,
    nullable: true
});
