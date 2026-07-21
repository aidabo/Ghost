const {createAddColumnMigration} = require('../../utils');

module.exports = createAddColumnMigration('social_ai_dzi_jobs', 'is_public', {
    type: 'bool',
    nullable: false,
    defaultTo: false,
    index: true
});
