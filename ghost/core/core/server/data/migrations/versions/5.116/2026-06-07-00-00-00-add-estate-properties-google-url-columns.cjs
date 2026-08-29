const {createAddColumnMigration, combineNonTransactionalMigrations} = require('../../utils');

module.exports = combineNonTransactionalMigrations(
    createAddColumnMigration('estate_properties', 'google_map_url', {type: 'text', maxlength: 65535, nullable: true}),
    createAddColumnMigration('estate_properties', 'google_3d_url', {type: 'text', maxlength: 65535, nullable: true})
);
