// @ts-ignore
const tpl = require('@tryghost/tpl');
const errors = require('@tryghost/errors');
const models = require('../../models');
// @ts-ignore
const logging = require('@tryghost/logging');
const ALLOWED_INCLUDES = ['group', 'user', 'role'];

const messages = {
    notFound: 'group member not found.',
    duplicateEntry: 'group member already exists for this group and user.',
    noRoleChangePermission: 'You do not have permission to change a member role.'
};

/** @type {import('@tryghost/api-framework').Controller} */
const controller = {
    docName: 'socialgroupmembers',

    browse: {
        headers: {
            cacheInvalidate: false
        },
        options: [
            'include',
            'page',
            'limit',
            'fields',
            'filter',
            'order',
            'debug'
        ],
        validation: {
            options: {
                include: ALLOWED_INCLUDES
            }
        },
        permissions: true,
        query(frame) {  
            // @ts-ignore
            return models.SocialGroupMember.findPage({...frame.options, withRelated: ALLOWED_INCLUDES});
        }

    },

    read: {
        headers: {cacheInvalidate: false},
        options: [
            'filter',
            'include'
        ],
        data: ['id'],
        permissions: true,
        query(frame) {
            // @ts-ignore
            return models.SocialGroupMember.findOne(frame.data, {...frame.options, withRelated: ALLOWED_INCLUDES})
                .then((entry) => {
                    if (!entry) {
                        return Promise.reject(new errors.NotFoundError({
                            message: tpl(messages.notFound)
                        }));
                    }
                    return entry;
                });
        }
    },

    add: {
        statusCode: 201,
        headers: {cacheInvalidate: false},
        options: ['include'],
        data: [
            'group_id', 
            'user_id', 
            'status'
        ],
        permissions: true,
        async query(frame) {
            try {
                // @ts-ignore
                return await models.SocialGroupMember.add(frame.data.socialgroupmembers[0], frame.options);
            } catch (err) {
                logging.error(err);
                if (err.code === 'ER_DUP_ENTRY') {
                    throw new errors.InternalServerError({
                        message: tpl(messages.duplicateEntry, frame.data.socialgroupmembers)
                    });
                }
                throw err;
            }
        }
    }, 

    edit: {
        statusCode: 200,
        headers: {cacheInvalidate: false},
        options: [
            'filter',
            'include',
            'id',
            'transacting'
        ],
        data: [
            'group_id',
            'user_id',
            'status',
            // role_id was previously omitted, so the promote/demote UI sent it
            // but the API framework dropped it and the group role never changed.
            'role_id'
        ],
        permissions: true,
        async query(frame) {
            try {
                const payload = frame.data.socialgroupmembers[0] || {};
                // Changing a member's group role (promote/demote) is restricted
                // to system admins and the group's owner/admins — the same gate
                // as adding/removing members.
                if (payload.role_id !== undefined) {
                    // @ts-ignore
                    const allowed = await models.SocialGroupMember.canManageGroupMembers(
                        payload.group_id,
                        frame.options?.context?.user
                    );
                    if (!allowed) {
                        throw new errors.NoPermissionError({
                            message: tpl(messages.noRoleChangePermission)
                        });
                    }
                }
                // @ts-ignore
                return await models.SocialGroupMember.edit(payload, frame.options);
            } catch (err) {
                logging.error(err);
                if (err.code === 'ER_DUP_ENTRY') {
                    throw new errors.InternalServerError({
                        message: tpl(messages.duplicateEntry, frame.data.socialgroupmembers)
                    });
                }
                throw err;
            }
        }
    },

    destroy: {
        statusCode: 204,
        headers: {cacheInvalidate: false},
        options: ['id'],
        permissions: true,
        async query(frame) {
            // @ts-ignore
            await models.SocialGroupMember.validateDestroyMemberPermission(frame.data.socialgroupmembers[0].group_id, frame.options.context.user);
            // @ts-ignore
            return await models.SocialGroupMember.destroy({...frame.options, require: true});
        }
    }
};

module.exports = controller;
