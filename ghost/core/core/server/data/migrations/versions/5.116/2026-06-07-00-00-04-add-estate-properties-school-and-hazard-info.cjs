const {createAddColumnMigration, combineNonTransactionalMigrations} = require('../../utils');

module.exports = combineNonTransactionalMigrations(
    createAddColumnMigration('estate_properties', 'elementary_school_info', {type: 'text', maxlength: 5000, nullable: true}),
    createAddColumnMigration('estate_properties', 'junior_school_info', {type: 'text', maxlength: 5000, nullable: true}),
    createAddColumnMigration('estate_properties', 'school_info', {type: 'text', maxlength: 5000, nullable: true}),
    createAddColumnMigration('estate_properties', 'preschool_info', {type: 'text', maxlength: 5000, nullable: true}),
    createAddColumnMigration('estate_properties', 'liquefaction_info', {type: 'text', maxlength: 5000, nullable: true}),
    createAddColumnMigration('estate_properties', 'flood_inundation_info', {type: 'text', maxlength: 5000, nullable: true}),
    createAddColumnMigration('estate_properties', 'storm_surge_info', {type: 'text', maxlength: 5000, nullable: true}),
    createAddColumnMigration('estate_properties', 'tsunami_info', {type: 'text', maxlength: 5000, nullable: true}),
    createAddColumnMigration('estate_properties', 'landslide_warning_info', {type: 'text', maxlength: 5000, nullable: true}),
    createAddColumnMigration('estate_properties', 'disaster_hazard_area_info', {type: 'text', maxlength: 5000, nullable: true}),
    createAddColumnMigration('estate_properties', 'large_scale_fill_info', {type: 'text', maxlength: 5000, nullable: true}),
    createAddColumnMigration('estate_properties', 'landslide_prevention_info', {type: 'text', maxlength: 5000, nullable: true}),
    createAddColumnMigration('estate_properties', 'steep_slope_info', {type: 'text', maxlength: 5000, nullable: true})
);
