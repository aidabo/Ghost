const ObjectId = require('bson-objectid').default;
const logging = require('@tryghost/logging');
const {createTransactionalMigration} = require('../../utils');

const ROLE = 'Super Editor';

const PERMISSIONS = [
    'Browse SocialFollows',
    'Read SocialFollows',
    'Add SocialFollows',
    'Delete SocialFollows',

    'Browse SocialBookmarks',
    'Read SocialBookmarks',
    'Add SocialBookmarks',
    'Delete SocialBookmarks',

    'Browse SocialFavors',
    'Read SocialFavors',
    'Add SocialFavors',
    'Delete SocialFavors',

    'Browse SocialForwards',
    'Read SocialForwards',
    'Add SocialForwards',
    'Delete SocialForwards',

    'Browse SocialGroups',
    'Read SocialGroups',
    'Add SocialGroups',
    'Edit SocialGroups',
    'Delete SocialGroups',
    'Count SocialGroups',

    'Browse SocialGroupMembers',
    'Read SocialGroupMembers',
    'Add SocialGroupMembers',
    'Edit SocialGroupMembers',
    'Delete SocialGroupMembers',

    'Browse SocialPostComments',
    'Read SocialPostComments',
    'Add SocialPostComments',
    'Edit SocialPostComments',
    'Replies SocialPostComments',
    'Like SocialPostComments',
    'Unlike SocialPostComments',
    'Count SocialPostComments',
    'Delete SocialPostComments',
    'Report SocialPostComments',

    'Browse SocialPostCommentLikes',
    'Read SocialPostCommentLikes',
    'Add SocialPostCommentLikes',
    'Delete SocialPostCommentLikes',

    'Browse SocialPostCommentReports',
    'Read SocialPostCommentReports',
    'Add SocialPostCommentReports',
    'Edit SocialPostCommentReports',
    'Delete SocialPostCommentReports',

    'Browse Social Components',
    'Read Social Components',
    'Add Social Components',
    'Edit Social Components',
    'Delete Social Components',
    // Legacy/alternate naming without spaces
    'Browse SocialComponents',
    'Read SocialComponents',
    'Add SocialComponents',
    'Edit SocialComponents',
    'Delete SocialComponents',

    'Browse Social Post Components',
    'Read Social Post Components',
    'Add Social Post Components',
    'Edit Social Post Components',
    'Delete Social Post Components',
    // Legacy/alternate naming without spaces
    'Browse SocialPostComponents',
    'Read SocialPostComponents',
    'Add SocialPostComponents',
    'Edit SocialPostComponents',
    'Delete SocialPostComponents',

    'Browse Social User Logs',
    'Read Social User Logs',
    'Add Social User Logs',
    'Edit Social User Logs',
    'Delete Social User Logs',
    // Legacy/alternate naming without spaces
    'Browse SocialUserLogs',
    'Read SocialUserLogs',
    'Add SocialUserLogs',
    'Edit SocialUserLogs',
    'Delete SocialUserLogs'
];

module.exports = createTransactionalMigration(
    async function up(knex) {
        const role = await knex('roles').where({name: ROLE}).first();
        if (!role) {
            logging.warn(`Role "${ROLE}" not found; skipping social permission grants.`);
            return;
        }

        const permissions = await knex('permissions')
            .whereIn('name', PERMISSIONS)
            .select('id', 'name');

        if (!permissions.length) {
            logging.warn('No matching social permissions found; skipping Super Editor grants.');
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
