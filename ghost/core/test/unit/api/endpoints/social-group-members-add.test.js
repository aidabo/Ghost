// グループの一員を足す・変える・外すのは、そのグループの持ち主・管理者（canManageGroupMembers が true の人）だけ。
// グループは保存されている行のものを使い、要求の body の group_id は信じない。行を別のグループ・人に移せない
// （jibunsee-react docs/planning/invite-links.md の D6）
const assert = require('assert/strict');
const sinon = require('sinon');
const models = require('../../../../core/server/models');

const fakeModel = attrs => ({id: attrs.id, get: key => attrs[key], related: () => attrs._related});

describe('Social group members: only the group owner or an admin manages members', function () {
    let endpoint;
    let canManage;

    before(function () {
        models.init();
        endpoint = require('../../../../core/server/api/endpoints/social-group-members');
    });

    beforeEach(function () {
        canManage = sinon.stub(models.SocialGroupMember, 'canManageGroupMembers');
    });

    afterEach(function () {
        sinon.restore();
    });

    const frame = (user, member = {}, options = {}) => ({
        options: {...options, context: user ? {user} : {api_key: {id: 'k', type: 'admin'}, integration: {id: 'i1'}}},
        data: {socialgroupmembers: [member]}
    });

    describe('add', function () {
        let add;
        beforeEach(function () {
            add = sinon.stub(models.SocialGroupMember, 'add').resolves({id: 'm1'});
            sinon.stub(models.SocialGroup, 'findOne').callsFake(async ({id}) => (id === 'g1' ? fakeModel({id: 'g1', status: 'active'}) : null));
        });

        it('the group owner or a group admin can add someone', async function () {
            canManage.resolves(true);
            assert.deepEqual(await endpoint.add.query(frame('owner-1', {group_id: 'g1', user_id: 'u2', role_id: 'r1', status: 'active'})), {id: 'm1'});
            assert.ok(canManage.calledOnceWithExactly('g1', 'owner-1'));
        });

        it('anyone else is refused and nothing is added (also not themselves as Owner)', async function () {
            canManage.resolves(false);
            await assert.rejects(endpoint.add.query(frame('stranger', {group_id: 'g1', user_id: 'stranger', role_id: 'r-owner', status: 'active'})), {errorType: 'NoPermissionError'});
            assert.ok(add.notCalled);
        });

        it('a request without a signed-in user is refused (fail closed)', async function () {
            await assert.rejects(endpoint.add.query(frame(null, {group_id: 'g1', user_id: 'u2', role_id: 'r1', status: 'active'})), {errorType: 'NoPermissionError'});
            assert.ok(add.notCalled);
        });

        it('an unknown group is the same NotFound for everyone (before the permission check)', async function () {
            canManage.resolves(true);
            await assert.rejects(endpoint.add.query(frame('admin', {group_id: 'nope', user_id: 'u2', role_id: 'r1', status: 'active'})), {errorType: 'NotFoundError'});
            assert.ok(canManage.notCalled);
        });
    });

    describe('edit and destroy use the stored row\'s group', function () {
        let edit;
        let destroy;
        beforeEach(function () {
            sinon.stub(models.SocialGroupMember, 'findOne').resolves(fakeModel({id: 'row1', group_id: 'g-other', user_id: 'u-victim'}));
            edit = sinon.stub(models.SocialGroupMember, 'edit').resolves({id: 'row1'});
            destroy = sinon.stub(models.SocialGroupMember, 'destroy').resolves();
        });

        it('a manager of another group cannot change the row by sending their own group_id', async function () {
            canManage.callsFake(async groupId => groupId === 'g-mine');
            await assert.rejects(endpoint.edit.query(frame('attacker', {group_id: 'g-other', role_id: 'r-owner'}, {id: 'row1'})), {errorType: 'NoPermissionError'});
            await assert.rejects(endpoint.destroy.query(frame('attacker', {group_id: 'g-mine'}, {id: 'row1'})), {errorType: 'NoPermissionError'});
            assert.ok(edit.notCalled);
            assert.ok(destroy.notCalled);
            assert.ok(canManage.alwaysCalledWith('g-other', 'attacker'), 'checked against the stored group');
        });

        it('a row cannot be moved to another group or person (even by a manager)', async function () {
            canManage.resolves(true);
            await assert.rejects(endpoint.edit.query(frame('owner', {group_id: 'g-mine'}, {id: 'row1'})), {errorType: 'ValidationError'});
            await assert.rejects(endpoint.edit.query(frame('owner', {user_id: 'me'}, {id: 'row1'})), {errorType: 'ValidationError'});
            assert.ok(edit.notCalled);
        });

        it('the group\'s manager can change the role or remove the member (the panel sends the same group and user)', async function () {
            canManage.resolves(true);
            await endpoint.edit.query(frame('owner', {group_id: 'g-other', user_id: 'u-victim', role_id: 'r-admin', status: 'active'}, {id: 'row1'}));
            await endpoint.destroy.query(frame('owner', {group_id: 'g-other'}, {id: 'row1'}));
            assert.ok(edit.calledOnce);
            assert.ok(destroy.calledOnce);
        });

        it('an unknown row is NotFound', async function () {
            models.SocialGroupMember.findOne.resolves(null);
            await assert.rejects(endpoint.edit.query(frame('owner', {role_id: 'r'}, {id: 'nope'})), {errorType: 'NotFoundError'});
        });
    });

    describe('canManageGroupMembers (who counts as a manager)', function () {
        const userWithRole = name => fakeModel({id: 'u', _related: {some: fn => [fakeModel({name})].some(fn)}});

        beforeEach(function () {
            canManage.restore();
        });

        it('site Administrator/Owner, the group creator, and the group Owner/Admin: yes; a plain member: no', async function () {
            const findUser = sinon.stub(models.User, 'findOne');
            const findGroup = sinon.stub(models.SocialGroup, 'findOne').resolves(fakeModel({id: 'g1', creator_id: 'creator'}));
            const findMember = sinon.stub(models.SocialGroupMember, 'findOne');

            findUser.resolves(userWithRole('Administrator'));
            assert.equal(await models.SocialGroupMember.canManageGroupMembers('g1', 'site-admin'), true);

            findUser.resolves(userWithRole('Author'));
            assert.equal(await models.SocialGroupMember.canManageGroupMembers('g1', 'creator'), true);

            for (const [role, expected] of [['Social Group Owner', true], ['Social Group Admin', true], ['Social Group Member', false]]) {
                findMember.resolves({related: () => fakeModel({name: role})});
                assert.equal(await models.SocialGroupMember.canManageGroupMembers('g1', 'someone'), expected, role);
            }
            findMember.resolves(null);
            assert.equal(await models.SocialGroupMember.canManageGroupMembers('g1', 'outsider'), false);
            assert.equal(await models.SocialGroupMember.canManageGroupMembers('g1', undefined), false);
            assert.ok(findGroup.called);
        });
    });
});
