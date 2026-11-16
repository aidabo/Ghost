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
            // 招く人が分からない要求（サーバーの鍵など）も断る（確かめずに通さない）
            await assert.rejects(groupInvite.assertCanInviteToGroup('g1', undefined), {errorType: 'NoPermissionError'});
            findGroup.resolves(null);
            await assert.rejects(groupInvite.assertCanInviteToGroup('nope', 'u1'), {errorType: 'ValidationError'});
            findGroup.resolves(fakeModel({id: 'g1', status: 'archived'}));
            await assert.rejects(groupInvite.assertCanInviteToGroup('g1', 'u1'), {errorType: 'ValidationError'});
            assert.ok(canManage.calledOnce);
        });
    });

    describe('inviterOf (who is inviting)', function () {
        const frame = context => ({options: {context}});

        it('a signed-in user is the inviter (invited_by in the body is ignored)', function () {
            assert.equal(groupInvite.inviterOf(frame({user: 'u1'}), {invited_by: 'someone-else'}), 'u1');
        });

        it('the front\'s server key may name the inviter it checked from the browser login', function () {
            assert.equal(groupInvite.inviterOf(frame({api_key: {id: 'k', type: 'admin'}, integration: {id: 'i1'}}), {invited_by: 'u7'}), 'u7');
        });

        it('nobody otherwise: no integration, no name, or not a string', function () {
            assert.equal(groupInvite.inviterOf(frame({}), {invited_by: 'u7'}), undefined);
            assert.equal(groupInvite.inviterOf(frame({integration: {id: 'i1'}}), {}), undefined);
            assert.equal(groupInvite.inviterOf(frame({integration: {id: 'i1'}}), {invited_by: {id: 'x'}}), undefined);
            assert.equal(groupInvite.inviterOf(frame({integration: {id: null}}), {invited_by: 'u7'}), undefined);
        });
    });

    describe('a named inviter (sent by the front\'s server key) must manage the group itself', function () {
        beforeEach(function () {
            sinon.stub(models.SocialGroup, 'findOne').resolves(fakeModel({id: 'g1', status: 'active', creator_id: 'creator'}));
        });

        it('the group\'s creator or its Owner/Admin may; the site Owner shortcut does not apply', async function () {
            const canManage = sinon.stub(models.SocialGroupMember, 'canManageGroupMembers').resolves(true);
            const findMember = sinon.stub(models.SocialGroupMember, 'findOne');
            await groupInvite.assertCanInviteToGroup('g1', 'creator', {named: true});
            findMember.resolves({related: () => fakeModel({name: 'Social Group Admin'})});
            await groupInvite.assertCanInviteToGroup('g1', 'admin', {named: true});
            // サイトの Owner（id 1）は canManageGroupMembers では true でも、名指しの経路では断る
            findMember.resolves(null);
            await assert.rejects(groupInvite.assertCanInviteToGroup('g1', '1', {named: true}), {errorType: 'NoPermissionError'});
            findMember.resolves({related: () => fakeModel({name: 'Social Group Member'})});
            await assert.rejects(groupInvite.assertCanInviteToGroup('g1', 'member', {named: true}), {errorType: 'NoPermissionError'});
            assert.ok(canManage.notCalled);
        });
    });

    describe('resolveInviter (who appears as the inviter)', function () {
        it('a signed-in request keeps its own user', async function () {
            const user = fakeModel({id: 'u1', name: 'Me'});
            const frame = {user, options: {context: {user: 'u1'}}, data: {invites: [{email: 'a@x', group_id: 'g1', invited_by: 'other'}]}};
            assert.equal(await groupInvite.resolveInviter(frame), user);
            assert.equal(frame.data.invites[0].invited_by, undefined, 'invited_by is not saved');
        });

        const activeUser = attrs => ({...fakeModel(attrs), isActive: () => attrs.status !== 'inactive'});

        it('the front\'s server key: the named person becomes the inviter and created_by', async function () {
            sinon.stub(models.User, 'findOne').resolves(activeUser({id: 'u7', name: 'Aki'}));
            const frame = {options: {context: {integration: {id: 'i1'}}}, data: {invites: [{email: 'a@x', group_id: 'g1', invited_by: 'u7'}]}};
            const inviter = await groupInvite.resolveInviter(frame);
            assert.equal(inviter.get('name'), 'Aki');
            assert.equal(frame.options.context.user, 'u7');
            assert.equal(frame.data.invites[0].invited_by, undefined);
        });

        it('a member invite (no group) also gets the named person as the inviter, for the invite history', async function () {
            sinon.stub(models.User, 'findOne').resolves(activeUser({id: 'u7', name: 'Aki'}));
            const frame = {options: {context: {integration: {id: 'i1'}}}, data: {invites: [{email: 'a@x', invited_by: 'u7'}]}};
            assert.equal((await groupInvite.resolveInviter(frame)).get('name'), 'Aki');
            assert.equal(frame.options.context.user, 'u7');
        });

        it('a named person who does not exist or is suspended is refused (not sent as the key\'s own invite)', async function () {
            const findUser = sinon.stub(models.User, 'findOne');
            for (const found of [null, activeUser({id: 'u7', status: 'inactive'})]) {
                findUser.resolves(found);
                const frame = {options: {context: {integration: {id: 'i1'}}}, data: {invites: [{email: 'a@x', invited_by: 'u7'}]}};
                await assert.rejects(groupInvite.resolveInviter(frame), {errorType: 'NoPermissionError'});
                assert.equal(frame.options.context.user, undefined);
            }
        });

        it('the key without a named person stays as before (no inviter)', async function () {
            const frame = {options: {context: {integration: {id: 'i1'}}}, data: {invites: [{email: 'a@x'}]}};
            assert.equal(await groupInvite.resolveInviter(frame), null);
            assert.equal(frame.options.context.user, undefined);
        });
    });

    describe('invitationInfo (read one invite by its token)', function () {
        const token = security.url.encodeBase64('cmF3dG9rZW4+Lw==');

        it('returns only the kind, the group name and the inviter\'s name', async function () {
            const findInvite = sinon.stub(models.Invite, 'findOne').resolves(fakeModel({token: 'cmF3dG9rZW4+Lw==', group_id: 'g1', created_by: 'u1', expires: Date.now() + 1000, email: 'secret@example.com'}));
            sinon.stub(models.SocialGroup, 'findOne').resolves(fakeModel({id: 'g1', type: 'family', group_name: 'Yamada', status: 'active'}));
            sinon.stub(models.User, 'findOne').resolves(fakeModel({id: 'u1', name: 'Aki'}));
            const info = await groupInvite.invitationInfo(token);
            assert.deepEqual(info, {kind: 'family', group_name: 'Yamada', invited_by: 'Aki'});
            assert.equal(findInvite.firstCall.args[0].token, 'cmF3dG9rZW4+Lw==');
            assert.equal(findInvite.firstCall.args[0].status, 'sent');
        });

        it('a group that is no longer active is answered as a user invite (signing up will not join it)', async function () {
            sinon.stub(models.Invite, 'findOne').resolves(fakeModel({token: 'cmF3dG9rZW4+Lw==', group_id: 'g1', created_by: 'u1', expires: Date.now() + 1000}));
            sinon.stub(models.SocialGroup, 'findOne').resolves(fakeModel({id: 'g1', type: 'family', group_name: 'Yamada', status: 'archived'}));
            sinon.stub(models.User, 'findOne').resolves(fakeModel({id: 'u1', name: 'Aki'}));
            assert.deepEqual(await groupInvite.invitationInfo(token), {kind: 'user', group_name: null, invited_by: 'Aki'});
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
