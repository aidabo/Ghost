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
    {name: 'Browse persons', action: 'browse', object: 'person'},
    {name: 'Read persons', action: 'read', object: 'person'},
    {name: 'Add persons', action: 'add', object: 'person'},
    {name: 'Edit persons', action: 'edit', object: 'person'},
    {name: 'Delete persons', action: 'destroy', object: 'person'},

    {name: 'Browse person roles', action: 'browse', object: 'personrole'},
    {name: 'Read person roles', action: 'read', object: 'personrole'},
    {name: 'Add person roles', action: 'add', object: 'personrole'},
    {name: 'Edit person roles', action: 'edit', object: 'personrole'},
    {name: 'Delete person roles', action: 'destroy', object: 'personrole'},

    {name: 'Browse person life events', action: 'browse', object: 'personlifeevent'},
    {name: 'Read person life events', action: 'read', object: 'personlifeevent'},
    {name: 'Add person life events', action: 'add', object: 'personlifeevent'},
    {name: 'Edit person life events', action: 'edit', object: 'personlifeevent'},
    {name: 'Delete person life events', action: 'destroy', object: 'personlifeevent'},

    {name: 'Browse person story series', action: 'browse', object: 'personstoryseries'},
    {name: 'Read person story series', action: 'read', object: 'personstoryseries'},
    {name: 'Add person story series', action: 'add', object: 'personstoryseries'},
    {name: 'Edit person story series', action: 'edit', object: 'personstoryseries'},
    {name: 'Delete person story series', action: 'destroy', object: 'personstoryseries'},

    {name: 'Browse person story episodes', action: 'browse', object: 'personstoryepisode'},
    {name: 'Read person story episodes', action: 'read', object: 'personstoryepisode'},
    {name: 'Add person story episodes', action: 'add', object: 'personstoryepisode'},
    {name: 'Edit person story episodes', action: 'edit', object: 'personstoryepisode'},
    {name: 'Delete person story episodes', action: 'destroy', object: 'personstoryepisode'},

    {name: 'Browse person relations', action: 'browse', object: 'personrelation'},
    {name: 'Read person relations', action: 'read', object: 'personrelation'},
    {name: 'Add person relations', action: 'add', object: 'personrelation'},
    {name: 'Edit person relations', action: 'edit', object: 'personrelation'},
    {name: 'Delete person relations', action: 'destroy', object: 'personrelation'},

    {name: 'Browse person post relations', action: 'browse', object: 'personpostrelation'},
    {name: 'Read person post relations', action: 'read', object: 'personpostrelation'},
    {name: 'Add person post relations', action: 'add', object: 'personpostrelation'},
    {name: 'Edit person post relations', action: 'edit', object: 'personpostrelation'},
    {name: 'Delete person post relations', action: 'destroy', object: 'personpostrelation'},

    {name: 'Browse person gallery assets', action: 'browse', object: 'persongalleryasset'},
    {name: 'Read person gallery assets', action: 'read', object: 'persongalleryasset'},
    {name: 'Add person gallery assets', action: 'add', object: 'persongalleryasset'},
    {name: 'Edit person gallery assets', action: 'edit', object: 'persongalleryasset'},
    {name: 'Delete person gallery assets', action: 'destroy', object: 'persongalleryasset'}
];

module.exports = combineTransactionalMigrations(
    ...PERMISSIONS.map((permission) => {
        const roles = ['add', 'edit', 'destroy'].includes(permission.action) ? WRITE_ROLES : DEFAULT_ROLES;
        return addPermissionWithRoles(permission, roles);
    })
);
