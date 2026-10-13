const {combineTransactionalMigrations, addPermissionWithRoles, addPermissionToRole} = require('../../utils');

const OBJECT = 'socialaiavatarbroadcastselection';
const BROWSE_PERMISSION = 'Browse Avatar Broadcast Selections';
const EDIT_PERMISSION = 'Edit Avatar Broadcast Selections';

const ALL_READER_ROLES = ['Owner', 'Administrator', 'Editor', 'Author', 'Contributor', 'Super Editor', 'Admin Integration'];
const ADDITIONAL_BROWSE_ROLES = ['Owner', 'Editor', 'Author', 'Contributor', 'Super Editor'];
const WRITER_ROLES = ['Owner', 'Administrator', 'Editor', 'Author', 'Super Editor'];
const ADDITIONAL_EDIT_ROLES = ['Owner', 'Editor', 'Author', 'Super Editor'];

module.exports = combineTransactionalMigrations(
    ...ADDITIONAL_BROWSE_ROLES.map(role => addPermissionToRole({permission: BROWSE_PERMISSION, role})),
    addPermissionWithRoles({
        name: 'Read Avatar Broadcast Selections',
        action: 'read',
        object: OBJECT
    }, ALL_READER_ROLES),
    ...ADDITIONAL_EDIT_ROLES.map(role => addPermissionToRole({permission: EDIT_PERMISSION, role})),
    addPermissionWithRoles({
        name: 'Add Avatar Broadcast Selections',
        action: 'add',
        object: OBJECT
    }, WRITER_ROLES),
    addPermissionWithRoles({
        name: 'Delete Avatar Broadcast Selections',
        action: 'destroy',
        object: OBJECT
    }, WRITER_ROLES)
);
