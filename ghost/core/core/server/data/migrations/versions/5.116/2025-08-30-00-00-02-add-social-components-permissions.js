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

module.exports = combineTransactionalMigrations(...PERMISSIONS.map(p => addPermissionWithRoles(p, ROLES)));

