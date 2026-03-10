const { combineTransactionalMigrations, addPermissionWithRoles } = require('../../utils');

const ROLES = [
    'Admin Integration',
    'Administrator',
    'Author',
    'Editor',
    'Super Editor'
];

const PERMISSIONS = [
    {
        name: 'Browse Social AI User Phones',
        action: 'browse',
        object: 'socialaiuserphone'
    },
    {
        name: 'Add Social AI User Phones',
        action: 'add',
        object: 'socialaiuserphone'
    },
    {
        name: 'Edit Social AI User Phones',
        action: 'edit',
        object: 'socialaiuserphone'
    }
];

module.exports = combineTransactionalMigrations(
    ...PERMISSIONS.map(permission => addPermissionWithRoles(permission, ROLES))
);
