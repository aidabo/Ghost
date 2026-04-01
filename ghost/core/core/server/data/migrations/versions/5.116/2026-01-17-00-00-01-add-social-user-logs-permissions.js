const { combineTransactionalMigrations, addPermissionWithRoles } = require('../../utils');

const ROLES = [
    'Admin Integration',
    'Administrator',
    'Author',
    'Editor',
    'Contributor'
];

const PERMISSIONS = [
    {
        name: 'Browse Social User Logs',
        action: 'browse',
        object: 'socialuserlog'
    },
    {
        name: 'Read Social User Logs',
        action: 'read',
        object: 'socialuserlog'
    },
    {
        name: 'Add Social User Logs',
        action: 'add',
        object: 'socialuserlog'
    },
    {
        name: 'Edit Social User Logs',
        action: 'edit',
        object: 'socialuserlog'
    },
    {
        name: 'Delete Social User Logs',
        action: 'destroy',
        object: 'socialuserlog'
    }
];

module.exports = combineTransactionalMigrations(...PERMISSIONS.map(p => addPermissionWithRoles(p, ROLES)));

