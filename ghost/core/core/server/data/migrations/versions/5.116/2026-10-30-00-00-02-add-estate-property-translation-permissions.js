const {combineTransactionalMigrations, addPermissionWithRoles} = require('../../utils');

const permissions = [
    {name: 'Browse estate property translations', action: 'browse', object: 'estatepropertytranslation'},
    {name: 'Read estate property translations', action: 'read', object: 'estatepropertytranslation'},
    {name: 'Add estate property translations', action: 'add', object: 'estatepropertytranslation'},
    {name: 'Edit estate property translations', action: 'edit', object: 'estatepropertytranslation'},
    {name: 'Delete estate property translations', action: 'destroy', object: 'estatepropertytranslation'}
];
const readRoles = ['Admin Integration', 'Administrator', 'Editor', 'Super Editor'];
const writeRoles = ['Admin Integration', 'Administrator', 'Editor', 'Super Editor'];

module.exports = combineTransactionalMigrations(
    ...permissions.map((permission) => addPermissionWithRoles(permission, ['browse', 'read'].includes(permission.action) ? readRoles : writeRoles))
);
