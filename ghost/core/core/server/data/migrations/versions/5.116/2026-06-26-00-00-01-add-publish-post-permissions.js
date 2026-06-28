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
    {name: 'Browse publish content', action: 'browse', object: 'publishcontent'},
    {name: 'Read publish content', action: 'read', object: 'publishcontent'},
    {name: 'Add publish content', action: 'add', object: 'publishcontent'},
    {name: 'Edit publish content', action: 'edit', object: 'publishcontent'},
    {name: 'Delete publish content', action: 'destroy', object: 'publishcontent'}
];

module.exports = combineTransactionalMigrations(
    ...PERMISSIONS.map((permission) => {
        const roles = ['add', 'edit', 'destroy'].includes(permission.action) ? WRITE_ROLES : DEFAULT_ROLES;
        return addPermissionWithRoles(permission, roles);
    })
);
