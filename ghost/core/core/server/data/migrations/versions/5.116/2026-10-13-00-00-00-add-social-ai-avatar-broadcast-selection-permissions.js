const {combineTransactionalMigrations, addPermissionWithRoles} = require('../../utils');

const OBJECT = 'socialaiavatarbroadcastselection';

module.exports = combineTransactionalMigrations(
    addPermissionWithRoles({
        name: 'Browse Avatar Broadcast Selections',
        action: 'browse',
        object: OBJECT
    }, ['Administrator', 'Admin Integration']),
    addPermissionWithRoles({
        name: 'Edit Avatar Broadcast Selections',
        action: 'edit',
        object: OBJECT
    }, ['Administrator'])
);
