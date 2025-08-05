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
        name: 'Browse SocialPostComments',
        action: 'browse',
        object: 'socialpostcomment'
    },
    {
        name: 'Read SocialPostComments',
        action: 'read',
        object: 'socialpostcomment'
    },
    {
        name: 'Add SocialPostComments',
        action: 'add',
        object: 'socialpostcomment'
    },
    {
        name: 'Edit SocialPostComments',
        action: 'edit',
        object: 'socialpostcomment'
    },
    {
        name: 'Replies SocialPostComments',
        action: 'replies',
        object: 'socialpostcomment'
    },
    {
        name: 'Like SocialPostComments',
        action: 'like',
        object: 'socialpostcomment'
    },
    {
        name: 'Unlike SocialPostComments',
        action: 'unlike',
        object: 'socialpostcomment'
    },
    {
        name: 'Count SocialPostComments',
        action: 'counts',
        object: 'socialpostcomment'
    },
    {
        name: 'Delete SocialPostComments',
        action: 'destroy',
        object: 'socialpostcomment'
    },
    {
        name: 'Report SocialPostComments',
        action: 'report',
        object: 'socialpostcomment'
    }

];

module.exports = combineTransactionalMigrations(...PERMISSIONS.map(p => addPermissionWithRoles(p, ROLES)));

