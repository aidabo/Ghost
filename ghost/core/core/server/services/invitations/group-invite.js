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

const GROUP_MANAGER_ROLES = ['Social Group Owner', 'Social Group Admin'];

/** そのグループ自身の管理者か（グループを作った人、またはグループの Owner・Admin の一員）。サイト全体の役割は見ない */
async function managesGroupItself(group, userId) {
    if (group.get('creator_id') === userId) {
        return true;
    }
    const member = await models.SocialGroupMember.findOne({group_id: group.id, user_id: userId, status: 'active'}, {...internal, withRelated: ['role']});
    const roleName = member && member.related('role') && member.related('role').get('name');
    return GROUP_MANAGER_ROLES.includes(roleName);
}

/**
 * 招待に group_id を付けてよいか。招く人が、そのグループの持ち主・管理者であること。招く人が分からない要求は断る。
 * - ログインしている人: canManageGroupMembers（サイトの管理者も含む。一員を足すときと同じ）
 * - サーバーの鍵が名指しした人（named）: そのグループ自身の管理者だけ（サイトの Owner などの id を名指しして、どのグループにも招けないように）
 * @param {string} groupId
 * @param {string} [userId] 招く人
 * @param {{named?: boolean}} [opts]
 */
async function assertCanInviteToGroup(groupId, userId, {named = false} = {}) {
    const group = await models.SocialGroup.findOne({id: groupId}, internal);
    if (!group || group.get('status') !== 'active') {
        throw new errors.ValidationError({message: tpl(messages.groupNotFound)});
    }
    const allowed = Boolean(userId) && (named
        ? await managesGroupItself(group, userId)
        : await models.SocialGroupMember.canManageGroupMembers(groupId, userId));
    if (!allowed) {
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
    const [found, inviter] = await Promise.all([
        groupId ? models.SocialGroup.findOne({id: groupId}, internal) : null,
        models.User.findOne({id: invite.get('created_by')}, internal)
    ]);
    // 止まった（active でない）グループには登録しても入らない（joinInvitedGroup）ので、一般ユーザーの招待として答える
    const group = found && found.get('status') === 'active' ? found : null;
    return {
        kind: kindOf(group),
        group_name: group ? group.get('group_name') : null,
        invited_by: inviter ? inviter.get('name') : null
    };
}

/**
 * グループの招待で、招く人は誰か。ログインしている人の要求ならその人。
 * サーバー同士の連携の鍵（front のサーバー）の要求なら、front がブラウザのログインで確かめた人を invited_by で名指しできる
 * （家族の持ち主はふつう Author で、自分ではスタッフの招待を作れないため）。どちらも無ければ無し（断られる）
 * @param {object} frame
 * @param {object} invite frame.data.invites[0]
 * @returns {string|undefined}
 */
function inviterOf(frame, invite) {
    const context = (frame.options && frame.options.context) || {};
    if (context.user) {
        return context.user;
    }
    const fromIntegration = Boolean(context.integration && context.integration.id);
    return fromIntegration && invite && typeof invite.invited_by === 'string' && invite.invited_by ? invite.invited_by : undefined;
}

/**
 * 招待のメールに書く招いた人（User の model）。ログインしている人なら frame.user。
 * front のサーバーが招く人の代わりに送るグループの招待なら（入力の検査で、その人がグループの持ち主・管理者と確かめ済み）、
 * その人にし、記録上の招いた人（created_by）もその人にする（frame.options.context.user を替える）。invited_by は保存しない
 * @param {object} frame
 * @returns {Promise<object|null>}
 */
async function resolveInviter(frame) {
    const invite = frame.data.invites[0];
    let inviter = frame.user || null;
    const named = inviterOf(frame, invite);
    if (!inviter && invite.group_id && named) {
        inviter = await models.User.findOne({id: named}, internal);
        if (inviter) {
            frame.options.context = {...frame.options.context, user: inviter.id};
        }
    }
    delete invite.invited_by;
    return inviter;
}

module.exports = {assertCanInviteToGroup, joinInvitedGroup, invitationInfo, kindOf, inviterOf, resolveInviter};
