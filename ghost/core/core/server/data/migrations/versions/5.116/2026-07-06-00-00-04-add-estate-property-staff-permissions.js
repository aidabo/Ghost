const {combineTransactionalMigrations, addPermissionWithRoles} = require('../../utils');

const DEFAULT_ROLES = [
    'Admin Integration',
    'Administrator',
    'Author',
    'Editor',
    'Contributor'
];

const WRITE_ROLES = [
    'Admin Integration',
    'Administrator',
    'Editor',
    'Super Editor'
];

const PERMISSIONS = [
    {name: 'Browse estate property staff', action: 'browse', object: 'estatepropertystaff'},
    {name: 'Add estate property staff', action: 'add', object: 'estatepropertystaff'},
    {name: 'Delete estate property staff', action: 'destroy', object: 'estatepropertystaff'}
];

module.exports = combineTransactionalMigrations(
    ...PERMISSIONS.map((permission) => {
        const roles = ['add', 'edit', 'destroy'].includes(permission.action) ? WRITE_ROLES : DEFAULT_ROLES;
        return addPermissionWithRoles(permission, roles);
    })
);
