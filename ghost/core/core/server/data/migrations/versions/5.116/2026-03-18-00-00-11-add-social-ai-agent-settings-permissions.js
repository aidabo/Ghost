const { combineTransactionalMigrations, addPermissionWithRoles } = require('../../utils');

const ROLES = [
    'Admin Integration',
    'Administrator',
    'Author',
    'Editor',
    'Super Editor'
];

const PERMISSIONS = [
    {
        name: 'Browse Social AI Agent Settings',
        action: 'browse',
        object: 'socialaiagentsetting'
    },
    {
        name: 'Read Social AI Agent Settings',
        action: 'read',
        object: 'socialaiagentsetting'
    },
    {
        name: 'Add Social AI Agent Settings',
        action: 'add',
        object: 'socialaiagentsetting'
    },
    {
        name: 'Edit Social AI Agent Settings',
        action: 'edit',
        object: 'socialaiagentsetting'
    }
];

module.exports = combineTransactionalMigrations(
    ...PERMISSIONS.map(permission => addPermissionWithRoles(permission, ROLES))
);
