const {combineTransactionalMigrations, addPermissionWithRoles} = require('../../utils');

const ROLES = [
    'Admin Integration',
    'Administrator',
    'Author',
    'Editor',
    'Contributor'
];

const PERMISSIONS = [
    {
        name: 'Browse Social AI Chats',
        action: 'browse',
        object: 'socialaichat'
    },
    {
        name: 'Read Social AI Chats',
        action: 'read',
        object: 'socialaichat'
    },
    {
        name: 'Add Social AI Chats',
        action: 'add',
        object: 'socialaichat'
    }
];

module.exports = combineTransactionalMigrations(
    ...PERMISSIONS.map(permission => addPermissionWithRoles(permission, ROLES))
);
