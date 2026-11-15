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
    noPermissionToAdd: 'Only the group owner or a group admin can add members to this group.',
    noPermissionToManage: 'Only the group owner or a group admin can change or remove members of this group.',
    groupNotFound: 'The group was not found or is not active.',
    memberNotFound: 'Group member not found.',
    cannotMoveMember: 'A group member cannot be moved to another group or person. Remove it and add a new one.'
};

// 一員を足す・変える・外すのは、そのグループの持ち主・管理者（Social Group Owner・Admin）、グループを作った人、サイトの管理者だけ
// （canManageGroupMembers。jibunsee-react docs/planning/invite-links.md の D6）。グループは**保存されている行**のものを使い、
// 要求の body の group_id は信じない。ログインしている人が分からない要求は断る（同梱の連携の鍵は一員を足す権限を持たない）
async function assertCanManageGroup(groupId, frame, message) {
    const userId = frame.options && frame.options.context && frame.options.context.user;
    if (!userId || !(await models.SocialGroupMember.canManageGroupMembers(groupId, userId))) {
        throw new errors.NoPermissionError({message: tpl(message)});
    }
}

async function storedMember(frame) {
    const id = frame.options && frame.options.id;
    // @ts-ignore
    const row = id ? await models.SocialGroupMember.findOne({id}, {transacting: frame.options.transacting}) : null;
    if (!row) {
        throw new errors.NotFoundError({message: tpl(messages.memberNotFound)});
    }
    return row;
}

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
            const member = frame.data.socialgroupmembers[0] || {};
            // 無い・止まったグループは、誰が頼んでも同じ答え（権限より先に見る）
            // @ts-ignore
            const group = member.group_id ? await models.SocialGroup.findOne({id: member.group_id}) : null;
            if (!group || group.get('status') !== 'active') {
                throw new errors.NotFoundError({message: tpl(messages.groupNotFound)});
            }
            await assertCanManageGroup(member.group_id, frame, messages.noPermissionToAdd);
            try {
                // @ts-ignore
                return await models.SocialGroupMember.add(member, frame.options);
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
                // 変えられるのは、保存されている行のグループの持ち主・管理者だけ（役割でも状態でも）。
                // 行を別のグループ・別の人に移すことはできない（移すと「足す」の決まりを回り込めるため）
                const row = await storedMember(frame);
                for (const key of ['group_id', 'user_id']) {
                    if (payload[key] !== undefined && payload[key] !== row.get(key)) {
                        throw new errors.ValidationError({message: tpl(messages.cannotMoveMember)});
                    }
                }
                await assertCanManageGroup(row.get('group_id'), frame, messages.noPermissionToManage);
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
            // 外せるのは、保存されている行のグループの持ち主・管理者だけ（body の group_id は使わない）
            const row = await storedMember(frame);
            await assertCanManageGroup(row.get('group_id'), frame, messages.noPermissionToManage);
            // @ts-ignore
            return await models.SocialGroupMember.destroy({...frame.options, require: true});
        }
    }
};

module.exports = controller;
