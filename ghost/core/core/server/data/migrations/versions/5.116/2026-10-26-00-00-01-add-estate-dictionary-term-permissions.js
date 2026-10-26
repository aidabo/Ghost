const {combineTransactionalMigrations, addPermissionWithRoles} = require('../../utils');

const PERMISSIONS = [
    {name: 'Browse estate dictionary terms', action: 'browse', object: 'estatedictionaryterm'},
    {name: 'Read estate dictionary terms', action: 'read', object: 'estatedictionaryterm'},
    {name: 'Add estate dictionary terms', action: 'add', object: 'estatedictionaryterm'},
    {name: 'Edit estate dictionary terms', action: 'edit', object: 'estatedictionaryterm'},
    {name: 'Delete estate dictionary terms', action: 'destroy', object: 'estatedictionaryterm'}
];

const DEFAULT_ROLES = ['Admin Integration', 'Administrator', 'Author', 'Editor', 'Contributor'];
const WRITE_ROLES = ['Admin Integration', 'Administrator', 'Editor', 'Super Editor'];

module.exports = combineTransactionalMigrations(
    ...PERMISSIONS.map((permission) => addPermissionWithRoles(
        permission,
        ['add', 'edit', 'destroy'].includes(permission.action) ? WRITE_ROLES : DEFAULT_ROLES
    ))
);
