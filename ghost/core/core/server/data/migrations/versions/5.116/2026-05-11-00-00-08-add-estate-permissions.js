const {combineTransactionalMigrations, addPermissionWithRoles} = require('../../utils');

const DEFAULT_ROLES = [
    'Admin Integration',
    'Administrator',
    'Author',
    'Editor',
    'Contributor'
];

const WRITE_ROLES = [
    'Admin Integration',
    'Administrator',
    'Editor',
    'Super Editor'
];

const PERMISSIONS = [
    // Properties
    {name: 'Browse estate properties', action: 'browse', object: 'estateproperty'},
    {name: 'Read estate properties', action: 'read', object: 'estateproperty'},
    {name: 'Add estate properties', action: 'add', object: 'estateproperty'},
    {name: 'Edit estate properties', action: 'edit', object: 'estateproperty'},
    {name: 'Delete estate properties', action: 'destroy', object: 'estateproperty'},

    // Property posts junction
    {name: 'Browse estate property posts', action: 'browse', object: 'estatepropertypost'},
    {name: 'Add estate property posts', action: 'add', object: 'estatepropertypost'},
    {name: 'Delete estate property posts', action: 'destroy', object: 'estatepropertypost'},

    // Property tags junction
    {name: 'Browse estate property tags', action: 'browse', object: 'estatepropertytag'},
    {name: 'Add estate property tags', action: 'add', object: 'estatepropertytag'},
    {name: 'Delete estate property tags', action: 'destroy', object: 'estatepropertytag'},

    // Property media junction
    {name: 'Browse estate property media', action: 'browse', object: 'estatepropertymedium'},
    {name: 'Add estate property media', action: 'add', object: 'estatepropertymedium'},
    {name: 'Edit estate property media', action: 'edit', object: 'estatepropertymedium'},
    {name: 'Delete estate property media', action: 'destroy', object: 'estatepropertymedium'},

    // Property staff junction
    {name: 'Browse estate property staff', action: 'browse', object: 'estatepropertystaff'},
    {name: 'Add estate property staff', action: 'add', object: 'estatepropertystaff'},
    {name: 'Delete estate property staff', action: 'destroy', object: 'estatepropertystaff'},

    // Inquiries
    {name: 'Browse estate inquiries', action: 'browse', object: 'estateinquiry'},
    {name: 'Read estate inquiries', action: 'read', object: 'estateinquiry'},
    {name: 'Add estate inquiries', action: 'add', object: 'estateinquiry'},
    {name: 'Edit estate inquiries', action: 'edit', object: 'estateinquiry'},
    {name: 'Delete estate inquiries', action: 'destroy', object: 'estateinquiry'},

    // Settings
    {name: 'Browse estate settings', action: 'browse', object: 'estatesetting'},
    {name: 'Read estate settings', action: 'read', object: 'estatesetting'},
    {name: 'Edit estate settings', action: 'edit', object: 'estatesetting'}
];

module.exports = combineTransactionalMigrations(
    ...PERMISSIONS.map((permission) => {
        const roles = ['add', 'edit', 'destroy'].includes(permission.action) ? WRITE_ROLES : DEFAULT_ROLES;
        return addPermissionWithRoles(permission, roles);
    })
);
