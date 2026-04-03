const {combineTransactionalMigrations, addPermissionWithRoles} = require('../../utils');

const ROLES = [
    'Admin Integration',
    'Administrator',
    'Author',
    'Editor',
    'Super Editor'
];

const PERMISSIONS = [
    {
        name: 'Browse Social AI Media Jobs',
        action: 'browse',
        object: 'socialaimediajob'
    },
    {
        name: 'Read Social AI Media Jobs',
        action: 'read',
        object: 'socialaimediajob'
    },
    {
        name: 'Add Social AI Media Jobs',
        action: 'add',
        object: 'socialaimediajob'
    },
    {
        name: 'Edit Social AI Media Jobs',
        action: 'edit',
        object: 'socialaimediajob'
    },
    {
        name: 'Cancel Social AI Media Jobs',
        action: 'cancel',
        object: 'socialaimediajob'
    },
    {
        name: 'Retry Social AI Media Jobs',
        action: 'retry',
        object: 'socialaimediajob'
    },
    {
        name: 'Claim Social AI Media Jobs',
        action: 'claim',
        object: 'socialaimediajob'
    },
    {
        name: 'Progress Social AI Media Jobs',
        action: 'progress',
        object: 'socialaimediajob'
    },
    {
        name: 'Complete Social AI Media Jobs',
        action: 'complete',
        object: 'socialaimediajob'
    },
    {
        name: 'Fail Social AI Media Jobs',
        action: 'fail',
        object: 'socialaimediajob'
    }
];

module.exports = combineTransactionalMigrations(
    ...PERMISSIONS.map(permission => addPermissionWithRoles(permission, ROLES))
);
