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
    {
        name: 'Browse Social Components',
        action: 'browse',
        object: 'socialcomponent'
    },
    {
        name: 'Read Social Components',
        action: 'read',
        object: 'socialcomponent'
    },
    {
        name: 'Add Social Components',
        action: 'add',
        object: 'socialcomponent'
    },
    {
        name: 'Edit Social Components',
        action: 'edit',
        object: 'socialcomponent'
    },
    {
        name: 'Delete Social Components',
        action: 'destroy',
        object: 'socialcomponent'
    }
];

module.exports = combineTransactionalMigrations(
    ...PERMISSIONS.map((permission) => {
        const roles = ['add', 'edit', 'destroy'].includes(permission.action) ? WRITE_ROLES : DEFAULT_ROLES;
        return addPermissionWithRoles(permission, roles);
    })
);
