const {createAddColumnMigration, combineNonTransactionalMigrations} = require('../../utils');

module.exports = combineNonTransactionalMigrations(
    createAddColumnMigration('estate_properties', 'mlit_summary_data', {type: 'text', maxlength: 1000000000, fieldtype: 'long', nullable: true})
);
