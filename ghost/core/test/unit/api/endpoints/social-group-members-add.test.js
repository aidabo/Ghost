// グループに一員を足せるのは、そのグループの持ち主・管理者（canManageGroupMembers が true の人）だけ
// （jibunsee-react docs/planning/invite-links.md の D6。すでにいる一員を変えるときと同じ決まり）
const assert = require('assert/strict');
const sinon = require('sinon');
const models = require('../../../../core/server/models');

describe('Social group members: who can add a member', function () {
    let endpoint;
    let canManage;
    let add;

    before(function () {
        models.init();
        endpoint = require('../../../../core/server/api/endpoints/social-group-members');
    });

    beforeEach(function () {
        canManage = sinon.stub(models.SocialGroupMember, 'canManageGroupMembers');
        add = sinon.stub(models.SocialGroupMember, 'add').resolves({id: 'm1'});
    });

    afterEach(function () {
        sinon.restore();
    });

    const frame = (context, member = {group_id: 'g1', user_id: 'u2', role_id: 'r1', status: 'active'}) => ({
        options: {context},
        data: {socialgroupmembers: [member]}
    });

    it('the group owner or a group admin can add someone', async function () {
        canManage.resolves(true);
        const result = await endpoint.add.query(frame({user: 'owner-1'}));
        assert.deepEqual(result, {id: 'm1'});
        assert.ok(canManage.calledOnceWithExactly('g1', 'owner-1'));
        assert.ok(add.calledOnce);
    });

    it('anyone else is refused, and nothing is added (also not themselves)', async function () {
        canManage.resolves(false);
        for (const member of [
            {group_id: 'g1', user_id: 'u2', role_id: 'r1', status: 'active'},
            {group_id: 'g1', user_id: 'stranger', role_id: 'r-owner', status: 'active'}
        ]) {
            await assert.rejects(endpoint.add.query(frame({user: 'stranger'}, member)), {errorType: 'NoPermissionError'});
        }
        assert.ok(add.notCalled);
    });

    it('a server-to-server key without a user is as before (not checked here)', async function () {
        await endpoint.add.query(frame({api_key: {id: 'k', type: 'admin'}, integration: {id: 'i1'}}));
        assert.ok(canManage.notCalled);
        assert.ok(add.calledOnce);
    });
});
