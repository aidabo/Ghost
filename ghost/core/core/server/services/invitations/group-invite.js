// 家族・グループの招待（jibunsee-react docs/planning/invite-links.md の D3・D4・D10）。
// - 招く: 招待に group_id を付けられるのは、そのグループの持ち主・管理者だけ（一員を足すときと同じ canManageGroupMembers）
// - 登録: 招待に group_id があれば、登録した人をそのグループの一員（Social Group Member）にする
// - 読む: token で 1 件だけ、種類・グループ名・招いた人の名前を返す（メールアドレス・id は返さない）
const errors = require('@tryghost/errors');
const tpl = require('@tryghost/tpl');
const security = require('@tryghost/security');
const models = require('../../models');

const messages = {
    groupNotFound: 'The group was not found or is not active.',
    noPermission: 'Only the group owner or a group admin can invite people to this group.',
    inviteNotFound: 'Invite not found.'
};

const MEMBER_ROLE = 'Social Group Member';
const internal = {context: {internal: true}};

/** 招待の種類: グループが無ければ user、family のグループなら family、ほかは group */
function kindOf(group) {
    if (!group) {
        return 'user';
    }
    return group.get('type') === 'family' ? 'family' : 'group';
}

/**
 * 招待に group_id を付けてよいか。ログインしている人の要求なら、そのグループの持ち主・管理者であること。
 * @param {string} groupId
 * @param {string} [userId] 招く人（サーバー同士の連携の鍵では無し）
 */
async function assertCanInviteToGroup(groupId, userId) {
    const group = await models.SocialGroup.findOne({id: groupId}, internal);
    if (!group || group.get('status') !== 'active') {
        throw new errors.ValidationError({message: tpl(messages.groupNotFound)});
    }
    if (userId && !(await models.SocialGroupMember.canManageGroupMembers(groupId, userId))) {
        throw new errors.NoPermissionError({message: tpl(messages.noPermission)});
    }
    return group;
}

/**
 * 登録した人を、招待のグループの一員にする（group_id が無い・グループが無いときは何もしない）。
 * @param {object} invite Invite の model
 * @param {object} user 登録した User の model
 * @param {object} [options]
 */
async function joinInvitedGroup(invite, user, options = internal) {
    const groupId = invite.get('group_id');
    if (!groupId) {
        return null;
    }
    const group = await models.SocialGroup.findOne({id: groupId}, options);
    const role = await models.Role.findOne({name: MEMBER_ROLE}, options);
    if (!group || group.get('status') !== 'active' || !role) {
        return null;
    }
    const existing = await models.SocialGroupMember.findOne({group_id: groupId, user_id: user.id}, options);
    if (existing) {
        return existing;
    }
    return models.SocialGroupMember.add({group_id: groupId, user_id: user.id, role_id: role.id, status: 'active'}, options);
}

/**
 * token（メールのリンクの値。base64 のまま）で招待を 1 件読む。返すのは画面に要るものだけ。
 * 無い・期限切れ・使い済みは同じ NotFound（どれか言わない）。
 * @param {string} token
 * @returns {Promise<{kind: 'user'|'family'|'group', group_name: string|null, invited_by: string|null}>}
 */
async function invitationInfo(token) {
    let inviteToken;
    try {
        inviteToken = security.url.decodeBase64(String(token || ''));
    } catch (e) {
        inviteToken = '';
    }
    const invite = inviteToken ? await models.Invite.findOne({token: inviteToken, status: 'sent'}, internal) : null;
    if (!invite || invite.get('expires') < Date.now()) {
        throw new errors.NotFoundError({message: tpl(messages.inviteNotFound)});
    }
    const groupId = invite.get('group_id');
    const group = groupId ? await models.SocialGroup.findOne({id: groupId}, internal) : null;
    const inviter = await models.User.findOne({id: invite.get('created_by')}, internal);
    return {
        kind: kindOf(group),
        group_name: group ? group.get('group_name') : null,
        invited_by: inviter ? inviter.get('name') : null
    };
}

module.exports = {assertCanInviteToGroup, joinInvitedGroup, invitationInfo, kindOf};
