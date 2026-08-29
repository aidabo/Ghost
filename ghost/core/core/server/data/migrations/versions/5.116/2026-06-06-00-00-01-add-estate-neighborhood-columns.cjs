const {createAddColumnMigration, combineNonTransactionalMigrations} = require('../../utils');

module.exports = combineNonTransactionalMigrations(
    createAddColumnMigration('estate_properties', 'street_view_url', {type: 'text', maxlength: 65535, nullable: true}),
    createAddColumnMigration('estate_properties', 'hazard_map_url', {type: 'text', maxlength: 65535, nullable: true}),
    createAddColumnMigration('estate_properties', 'nearby_stores', {type: 'text', maxlength: 5000, nullable: true}),
    createAddColumnMigration('estate_properties', 'nearby_hospitals', {type: 'text', maxlength: 5000, nullable: true}),
    createAddColumnMigration('estate_properties', 'nearby_schools', {type: 'text', maxlength: 5000, nullable: true}),
    createAddColumnMigration('estate_properties', 'nearby_parks', {type: 'text', maxlength: 5000, nullable: true}),
    createAddColumnMigration('estate_properties', 'building_auto_lock', {type: 'bool', nullable: true, defaultTo: false}),
    createAddColumnMigration('estate_properties', 'building_manager', {type: 'string', maxlength: 100, nullable: true})
);
