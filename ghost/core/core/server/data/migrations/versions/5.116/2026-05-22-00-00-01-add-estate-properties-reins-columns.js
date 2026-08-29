const {combineNonTransactionalMigrations, createAddColumnMigration} = require('../../utils');

module.exports = combineNonTransactionalMigrations(
    createAddColumnMigration('estate_properties', 'building_name', {
        type: 'string',
        maxlength: 500,
        nullable: true
    }),
    createAddColumnMigration('estate_properties', 'management_company', {
        type: 'string',
        maxlength: 500,
        nullable: true
    }),
    createAddColumnMigration('estate_properties', 'current_rent', {
        type: 'bigInteger',
        nullable: true
    }),
    createAddColumnMigration('estate_properties', 'price_valuation', {
        type: 'bigInteger',
        nullable: true
    }),
    createAddColumnMigration('estate_properties', 'registration_date', {
        type: 'string',
        maxlength: 50,
        nullable: true
    }),
    createAddColumnMigration('estate_properties', 'expiry_date', {
        type: 'string',
        maxlength: 50,
        nullable: true
    }),
    createAddColumnMigration('estate_properties', 'land_leasehold', {
        type: 'string',
        maxlength: 50,
        nullable: true
    }),
    createAddColumnMigration('estate_properties', 'fixtures_and_fittings', {
        type: 'text',
        maxlength: 16777215,
        fieldtype: 'medium',
        nullable: true
    }),
    createAddColumnMigration('estate_properties', 'reins_listing_number', {
        type: 'string',
        maxlength: 100,
        nullable: true
    }),
    // Source tracking columns (already used by ghostWriter.ts but missing from schema)
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
        type: 'text',
        maxlength: 65535,
        nullable: true
    }),
    createAddColumnMigration('estate_properties', 'source_pdf_url', {
        type: 'text',
        maxlength: 65535,
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
