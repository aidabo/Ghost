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
        name: 'Browse Social AI Devices',
        action: 'browse',
        object: 'socialaidevice'
    },
    {
        name: 'Read Social AI Devices',
        action: 'read',
        object: 'socialaidevice'
    },
    {
        name: 'Add Social AI Devices',
        action: 'add',
        object: 'socialaidevice'
    },
    {
        name: 'Edit Social AI Devices',
        action: 'edit',
        object: 'socialaidevice'
    },
    {
        name: 'Delete Social AI Devices',
        action: 'destroy',
        object: 'socialaidevice'
    }
];

module.exports = combineTransactionalMigrations(
    ...PERMISSIONS.map(permission => addPermissionWithRoles(permission, ROLES))
);
