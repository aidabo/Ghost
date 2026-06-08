const {combineNonTransactionalMigrations, createAddColumnMigration} = require('../../utils');

module.exports = combineNonTransactionalMigrations(
    createAddColumnMigration('estate_properties', 'source', {
        type: 'string',
        maxlength: 50,
        nullable: true
    }),
    createAddColumnMigration('estate_properties', 'source_company', {
        type: 'string',
        maxlength: 500,
        nullable: true
    }),
    createAddColumnMigration('estate_properties', 'source_url', {
        type: 'string',
        maxlength: 2000,
        nullable: true
    }),
    createAddColumnMigration('estate_properties', 'source_pdf_url', {
        type: 'string',
        maxlength: 2000,
        nullable: true
    }),
    createAddColumnMigration('estate_properties', 'source_id', {
        type: 'string',
        maxlength: 200,
        nullable: true
    }),
    createAddColumnMigration('estate_properties', 'registered_by', {
        type: 'string',
        maxlength: 50,
        nullable: true
    })
);
