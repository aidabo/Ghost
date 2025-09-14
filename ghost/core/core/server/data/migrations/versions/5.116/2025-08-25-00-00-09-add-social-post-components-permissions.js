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
        name: 'Browse Post Components',
        action: 'browse',
        object: 'postcomponent'
    },
    {
        name: 'Read Post Components',
        action: 'read',
        object: 'postcomponent'
    },
    {
        name: 'Add Post Components',
        action: 'add',
        object: 'postcomponent'
    },
    {
        name: 'Edit Post Components',
        action: 'edit',
        object: 'postcomponent'
    },
    {
        name: 'Delete Post Components',
        action: 'destroy',
        object: 'postcomponent'
    }
];

module.exports = combineTransactionalMigrations(...PERMISSIONS.map(p => addPermissionWithRoles(p, ROLES)));

