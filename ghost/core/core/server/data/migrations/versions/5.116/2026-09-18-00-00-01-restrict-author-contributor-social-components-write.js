// Author and Contributor held the full Social Components permission set
// (add/edit/destroy plus browse/read), unlike Social Charts where the two roles
// hold browse/read only. Align pages with charts: Author/Contributor may VIEW
// pages but must not create/edit/delete them. Unlink only add/edit/destroy from
// those two roles — the permissions themselves stay for the higher roles, and
// browse/read remain so viewing still works.
//
// No exported helper removes a single (role, permission) link (the utils only
// expose add + full-permission removal), so delete the permissions_roles rows
// directly. down() re-grants for a clean rollback. One small migration per
// (role, permission) pair, combined — migrations forbid loop constructs, so the
// pairs are produced with map/flatMap.
const {createTransactionalMigration, combineTransactionalMigrations} = require('../../utils');
const logging = require('@tryghost/logging');
const ObjectId = require('bson-objectid').default;

const ROLES = ['Author', 'Contributor'];
const PERMISSIONS = [
    'Add Social Components',
    'Edit Social Components',
    'Delete Social Components'
];

const PAIRS = ROLES.flatMap(roleName => PERMISSIONS.map(permissionName => ({roleName, permissionName})));

function unlinkMigration({roleName, permissionName}) {
    return createTransactionalMigration(
        async function up(connection) {
            const role = await connection('roles').where({name: roleName}).first();
            const permission = await connection('permissions').where({name: permissionName}).first();
            if (!role || !permission) {
                logging.warn(`Unlink ${permissionName} from ${roleName} - role or permission not found, skipping`);
                return;
            }
            const removed = await connection('permissions_roles')
                .where({role_id: role.id, permission_id: permission.id})
                .del();
            if (removed) {
                logging.info(`Removed permission(${permissionName}) from role(${roleName})`);
            }
        },
        async function down(connection) {
            const role = await connection('roles').where({name: roleName}).first();
            const permission = await connection('permissions').where({name: permissionName}).first();
            if (!role || !permission) {
                return;
            }
            const existing = await connection('permissions_roles')
                .where({role_id: role.id, permission_id: permission.id})
                .first();
            if (!existing) {
                await connection('permissions_roles').insert({
                    id: ObjectId().toHexString(),
                    role_id: role.id,
                    permission_id: permission.id
                });
            }
        }
    );
}

module.exports = combineTransactionalMigrations(
    ...PAIRS.map(unlinkMigration)
);
