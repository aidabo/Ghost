// 家族・グループの招待（jibunsee-react docs/planning/invite-links.md の D3・D4・D10）
const assert = require('assert/strict');
const sinon = require('sinon');
const security = require('@tryghost/security');
const models = require('../../../../../core/server/models');

const fakeModel = attrs => ({id: attrs.id, get: key => attrs[key]});

describe('Group invites', function () {
    let groupInvite;

    before(function () {
        models.init();
        groupInvite = require('../../../../../core/server/services/invitations/group-invite');
    });

    afterEach(function () {
        sinon.restore();
    });

    describe('kindOf', function () {
        it('no group → user, a family group → family, any other group → group', function () {
            assert.equal(groupInvite.kindOf(null), 'user');
            assert.equal(groupInvite.kindOf(fakeModel({type: 'family'})), 'family');
            assert.equal(groupInvite.kindOf(fakeModel({type: 'general'})), 'group');
        });
    });

    describe('assertCanInviteToGroup (who may invite to a group)', function () {
        it('the group owner or a group admin may', async function () {
            sinon.stub(models.SocialGroup, 'findOne').resolves(fakeModel({id: 'g1', status: 'active'}));
            sinon.stub(models.SocialGroupMember, 'canManageGroupMembers').resolves(true);
            await groupInvite.assertCanInviteToGroup('g1', 'u1');
        });

        it('anyone else may not, and an unknown or inactive group is refused', async function () {
            const findGroup = sinon.stub(models.SocialGroup, 'findOne');
            const canManage = sinon.stub(models.SocialGroupMember, 'canManageGroupMembers').resolves(false);
            findGroup.resolves(fakeModel({id: 'g1', status: 'active'}));
            await assert.rejects(groupInvite.assertCanInviteToGroup('g1', 'stranger'), {errorType: 'NoPermissionError'});
            findGroup.resolves(null);
            await assert.rejects(groupInvite.assertCanInviteToGroup('nope', 'u1'), {errorType: 'ValidationError'});
            findGroup.resolves(fakeModel({id: 'g1', status: 'archived'}));
            await assert.rejects(groupInvite.assertCanInviteToGroup('g1', 'u1'), {errorType: 'ValidationError'});
            assert.ok(canManage.calledOnce);
        });
    });

    describe('joinInvitedGroup (after signing up)', function () {
        it('adds the new user to the invite\'s group as a Social Group Member', async function () {
            sinon.stub(models.SocialGroup, 'findOne').resolves(fakeModel({id: 'g1', status: 'active'}));
            sinon.stub(models.Role, 'findOne').resolves(fakeModel({id: 'r-member'}));
            sinon.stub(models.SocialGroupMember, 'findOne').resolves(null);
            const add = sinon.stub(models.SocialGroupMember, 'add').resolves({id: 'm1'});
            await groupInvite.joinInvitedGroup(fakeModel({group_id: 'g1'}), {id: 'u-new'});
            assert.ok(add.calledOnce);
            assert.deepEqual(add.firstCall.args[0], {group_id: 'g1', user_id: 'u-new', role_id: 'r-member', status: 'active'});
        });

        it('does nothing for a user invite (no group), and does not add twice', async function () {
            const add = sinon.stub(models.SocialGroupMember, 'add');
            assert.equal(await groupInvite.joinInvitedGroup(fakeModel({group_id: null}), {id: 'u'}), null);
            sinon.stub(models.SocialGroup, 'findOne').resolves(fakeModel({id: 'g1', status: 'active'}));
            sinon.stub(models.Role, 'findOne').resolves(fakeModel({id: 'r-member'}));
            sinon.stub(models.SocialGroupMember, 'findOne').resolves({id: 'already'});
            assert.deepEqual(await groupInvite.joinInvitedGroup(fakeModel({group_id: 'g1'}), {id: 'u'}), {id: 'already'});
            assert.ok(add.notCalled);
        });
    });

    describe('invitationInfo (read one invite by its token)', function () {
        const token = security.url.encodeBase64('cmF3dG9rZW4+Lw==');

        it('returns only the kind, the group name and the inviter\'s name', async function () {
            const findInvite = sinon.stub(models.Invite, 'findOne').resolves(fakeModel({token: 'cmF3dG9rZW4+Lw==', group_id: 'g1', created_by: 'u1', expires: Date.now() + 1000, email: 'secret@example.com'}));
            sinon.stub(models.SocialGroup, 'findOne').resolves(fakeModel({id: 'g1', type: 'family', group_name: 'Yamada'}));
            sinon.stub(models.User, 'findOne').resolves(fakeModel({id: 'u1', name: 'Aki'}));
            const info = await groupInvite.invitationInfo(token);
            assert.deepEqual(info, {kind: 'family', group_name: 'Yamada', invited_by: 'Aki'});
            assert.equal(findInvite.firstCall.args[0].token, 'cmF3dG9rZW4+Lw==');
            assert.equal(findInvite.firstCall.args[0].status, 'sent');
        });

        it('an unknown, expired or empty token is the same NotFound', async function () {
            const findInvite = sinon.stub(models.Invite, 'findOne');
            findInvite.resolves(null);
            await assert.rejects(groupInvite.invitationInfo(token), {errorType: 'NotFoundError'});
            findInvite.resolves(fakeModel({expires: Date.now() - 1}));
            await assert.rejects(groupInvite.invitationInfo(token), {errorType: 'NotFoundError'});
            await assert.rejects(groupInvite.invitationInfo(''), {errorType: 'NotFoundError'});
        });
    });
});
