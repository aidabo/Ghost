const {combineTransactionalMigrations, addPermissionToRole} = require('../../utils');

module.exports = combineTransactionalMigrations(
    addPermissionToRole({permission: 'Browse estate dictionary terms', role: 'Super Editor'}),
    addPermissionToRole({permission: 'Read estate dictionary terms', role: 'Super Editor'})
);
