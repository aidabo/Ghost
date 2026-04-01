const { createAddColumnMigration } = require('../../utils');

/**
 * Add source to save datasource definition for social components
 */
module.exports = createAddColumnMigration('social_components', 'source', {
    type: 'text',
    maxlength: 1000000000,
    nullable: true
});

