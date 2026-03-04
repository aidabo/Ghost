const ObjectId = require('bson-objectid').default;
const logging = require('@tryghost/logging');
const {createTransactionalMigration} = require('../../utils');

const ROLE = 'Super Editor';

const PERMISSIONS = [
    'Browse Social AI Chats',
    'Read Social AI Chats',
    'Add Social AI Chats'
];

module.exports = createTransactionalMigration(
    async function up(knex) {
        const role = await knex('roles').where({name: ROLE}).first();
        if (!role) {
            logging.warn(`Role "${ROLE}" not found; skipping AI chat permission grants.`);
            return;
        }

        const permissions = await knex('permissions')
            .whereIn('name', PERMISSIONS)
            .select('id', 'name');

        if (!permissions.length) {
            logging.warn('No AI chat permissions found; skipping Super Editor grants.');
            return;
        }

        for (const permission of permissions) {
            const existing = await knex('permissions_roles')
                .where({permission_id: permission.id, role_id: role.id})
                .first();

            if (!existing) {
                await knex('permissions_roles').insert({
                    id: ObjectId().toHexString(),
                    permission_id: permission.id,
                    role_id: role.id
                });
            }
        }
    },
    async function down(knex) {
        const role = await knex('roles').where({name: ROLE}).first();
        if (!role) {
            return;
        }

        const permissionIds = await knex('permissions')
            .whereIn('name', PERMISSIONS)
            .pluck('id');

        if (!permissionIds.length) {
            return;
        }

        await knex('permissions_roles')
            .where({role_id: role.id})
            .whereIn('permission_id', permissionIds)
            .del();
    }
);
