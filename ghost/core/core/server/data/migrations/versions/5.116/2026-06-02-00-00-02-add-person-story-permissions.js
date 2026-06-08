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
    {name: 'Browse person stories', action: 'browse', object: 'personstory'},
    {name: 'Read person stories', action: 'read', object: 'personstory'},
    {name: 'Add person stories', action: 'add', object: 'personstory'},
    {name: 'Edit person stories', action: 'edit', object: 'personstory'},
    {name: 'Delete person stories', action: 'destroy', object: 'personstory'}
];

module.exports = combineTransactionalMigrations(
    ...PERMISSIONS.map((permission) => {
        const roles = ['add', 'edit', 'destroy'].includes(permission.action) ? WRITE_ROLES : DEFAULT_ROLES;
        return addPermissionWithRoles(permission, roles);
    })
);
