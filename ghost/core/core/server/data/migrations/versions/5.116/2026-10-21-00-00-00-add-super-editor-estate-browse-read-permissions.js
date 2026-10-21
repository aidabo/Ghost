// Super Editor already has estate write permissions, but the original estate
// permission migration assigned browse/read only to DEFAULT_ROLES. This made
// estate registration fail at the first list request with:
// "You do not have permission to browse estateproperties".
//
// The property staff endpoint also checks estateproperty read/edit permissions
// (rather than the junction object's permission), so the parent property read
// permission is required for the registration editor's staff include.
const {combineTransactionalMigrations, addPermissionToRole} = require('../../utils');

const ROLE = 'Super Editor';

const READ_PERMISSIONS = [
    'Browse estate properties',
    'Read estate properties',
    'Browse estate property posts',
    'Browse estate property tags',
    'Browse estate property media',
    'Browse estate inquiries',
    'Read estate inquiries',
    'Browse estate settings',
    'Read estate settings'
];

module.exports = combineTransactionalMigrations(
    ...READ_PERMISSIONS.map(permission => addPermissionToRole({permission, role: ROLE}))
);
