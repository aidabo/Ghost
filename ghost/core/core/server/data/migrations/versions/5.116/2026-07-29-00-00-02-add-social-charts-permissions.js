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
        name: 'Browse Social Charts',
        action: 'browse',
        object: 'socialchart'
    },
    {
        name: 'Read Social Charts',
        action: 'read',
        object: 'socialchart'
    },
    {
        name: 'Add Social Charts',
        action: 'add',
        object: 'socialchart'
    },
    {
        name: 'Edit Social Charts',
        action: 'edit',
        object: 'socialchart'
    },
    {
        name: 'Delete Social Charts',
        action: 'destroy',
        object: 'socialchart'
    }
];

module.exports = combineTransactionalMigrations(
    ...PERMISSIONS.map((permission) => {
        const roles = ['add', 'edit', 'destroy'].includes(permission.action) ? WRITE_ROLES : DEFAULT_ROLES;
        return addPermissionWithRoles(permission, roles);
    })
);
