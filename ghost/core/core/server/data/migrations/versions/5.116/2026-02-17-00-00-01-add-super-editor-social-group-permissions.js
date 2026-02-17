const {combineTransactionalMigrations, addPermissionToRole} = require('../../utils');

const ROLE = 'Super Editor';

const PERMISSIONS = [
    'Browse SocialGroups',
    'Read SocialGroups',
    'Add SocialGroups',
    'Edit SocialGroups',
    'Delete SocialGroups',
    'Count SocialGroups',
    'Browse SocialGroupMembers',
    'Read SocialGroupMembers',
    'Add SocialGroupMembers',
    'Edit SocialGroupMembers',
    'Delete SocialGroupMembers'
];

module.exports = combineTransactionalMigrations(
    ...PERMISSIONS.map((permission) => addPermissionToRole({permission, role: ROLE}))
);

