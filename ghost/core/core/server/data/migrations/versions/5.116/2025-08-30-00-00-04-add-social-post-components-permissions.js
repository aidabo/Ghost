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
        name: 'Browse Social Post Components',
        action: 'browse',
        object: 'socialpostcomponent'
    },
    {
        name: 'Read Social Post Components',
        action: 'read',
        object: 'socialpostcomponent'
    },
    {
        name: 'Add Social Post Components',
        action: 'add',
        object: 'socialpostcomponent'
    },
    {
        name: 'Edit Social Post Components',
        action: 'edit',
        object: 'socialpostcomponent'
    },
    {
        name: 'Delete Social Post Components',
        action: 'destroy',
        object: 'socialpostcomponent'
    }
];

module.exports = combineTransactionalMigrations(...PERMISSIONS.map(p => addPermissionWithRoles(p, ROLES)));

