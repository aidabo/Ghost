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
        name: 'Browse Social AI SMS Logs',
        action: 'browse',
        object: 'socialaismslog'
    },
    {
        name: 'Add Social AI SMS Logs',
        action: 'add',
        object: 'socialaismslog'
    }
];

module.exports = combineTransactionalMigrations(
    ...PERMISSIONS.map(permission => addPermissionWithRoles(permission, ROLES))
);
