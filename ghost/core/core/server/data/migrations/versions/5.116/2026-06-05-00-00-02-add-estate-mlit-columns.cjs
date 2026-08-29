const {createAddColumnMigration, combineNonTransactionalMigrations} = require('../../utils');

module.exports = combineNonTransactionalMigrations(
    createAddColumnMigration('estate_properties', 'mlit_data', {type: 'text', maxlength: 16777215, fieldtype: 'medium', nullable: true})
);
