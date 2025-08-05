const {combineTransactionalMigrations, addPermissionWithRoles} = require('../../utils');

module.exports = combineTransactionalMigrations(
    addPermissionWithRoles({
        name: 'Browse SocialPostCommentLikes',
        action: 'browse',
        object: 'socialpostcommentlike'
    }, ['Administrator', 'Editor', 'Author']),
    addPermissionWithRoles({
        name: 'Read SocialPostCommentLikes',
        action: 'read',
        object: 'socialpostcommentlike'
    }, ['Administrator', 'Editor', 'Author']),
    addPermissionWithRoles({
        name: 'Add SocialPostCommentLikes',
        action: 'add',
        object: 'socialpostcommentlike'
    }, ['Administrator', 'Editor', 'Author']),
    addPermissionWithRoles({
        name: 'Delete SocialPostCommentLikes',
        action: 'destroy',
        object: 'socialpostcommentlike'
    }, ['Administrator', 'Editor', 'Author'])
);
