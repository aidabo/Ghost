// 招待を受けるページが token で招待を 1 件読む口（jibunsee-react docs/planning/invite-links.md の D10）。
// 種類・グループ名・招いた人の名前だけを返す。メールアドレス・id は返さない。無い token は同じ 404
const assert = require('assert/strict');
const {agentProvider, fixtureManager, mockManager, dbUtils} = require('../../utils/e2e-framework');
const models = require('../../../core/server/models');
const config = require('../../../core/shared/config');
const AdminAPITestAgent = require('../../utils/agents/admin-api-test-agent');
const localUtils = require('./utils');

let ipCounter = 0;
function nextIp() {
    ipCounter += 1;
    return `10.12.${Math.floor(ipCounter / 250)}.${(ipCounter % 250) + 1}`;
}

describe('Invitation info API', function () {
    let agent;
    let mailReceiver;
    let authorRoleId;

    before(async function () {
        agent = await agentProvider.getAdminAPIAgent();
        await fixtureManager.init('users', 'api_keys');
        await agent.loginAsOwner();
        const roles = await agent.get('roles/').expectStatus(200);
        authorRoleId = roles.body.roles.find(role => role.name === 'Author').id;
    });

    beforeEach(async function () {
        mailReceiver = mockManager.mockMail();
        await dbUtils.truncate('brute');
    });

    afterEach(function () {
        mockManager.restore();
    });

    it('reads a user invite by the token in the mail: kind, inviter, no email or id', async function () {
        await agent.post('invites/').header('X-Forwarded-For', nextIp())
            .body({invites: [{email: 'info-user@example.com', role_id: authorRoleId}]}).expectStatus(201);
        const sent = mailReceiver.getSentEmail(0);
        const token = /\/signup\/([^/\s"]+)\//.exec(sent.text)[1];

        const res = await agent.get(`authentication/invitation_info/?token=${encodeURIComponent(token)}`)
            .header('X-Forwarded-For', nextIp()).expectStatus(200);
        const info = res.body.invitation_info[0];
        assert.deepEqual(Object.keys(info).sort(), ['group_name', 'invited_by', 'kind']);
        assert.equal(info.kind, 'user');
        assert.equal(info.group_name, null);
        assert.equal(typeof info.invited_by, 'string');
        assert.ok(!JSON.stringify(res.body).includes('info-user@example.com'), 'no email');
    });

    it('after signing up, the invite stays as accepted (for the history) and its token cannot be used again', async function () {
        const email = 'info-accept@example.com';
        await agent.post('invites/').header('X-Forwarded-For', nextIp())
            .body({invites: [{email, role_id: authorRoleId}]}).expectStatus(201);
        const token = /\/signup\/([^/\s"]+)\//.exec(mailReceiver.getSentEmail(0).text)[1];

        await agent.post('authentication/invitation/')
            .body({invitation: [{token, email, name: 'New Person', password: 'Tq7#vLm2!pWz9xRe'}]})
            .expectStatus(200);

        const invite = await models.Invite.findOne({email}, {context: {internal: true}});
        assert.ok(invite, 'the invite row is kept');
        assert.equal(invite.get('status'), 'accepted');
        assert.ok(await models.User.findOne({email}), 'the user was created');

        // もう読めない・もう一度は受けられない
        await agent.get(`authentication/invitation_info/?token=${encodeURIComponent(token)}`).header('X-Forwarded-For', nextIp()).expectStatus(404);
        const again = await agent.get(`authentication/invitation/?email=${encodeURIComponent(email)}`).expectStatus(200);
        assert.equal(again.body.invitation[0].valid, false);

        // 一覧の既定には出ない（Ghost の管理画面の「招待中」）。status を書いて頼めば出る（招いた人の履歴）
        const plain = await agent.get('invites/').expectStatus(200);
        assert.ok(!plain.body.invites.some(i => i.email === email), 'not in the default list');
        const history = await agent.get(`invites/?filter=${encodeURIComponent('status:[pending,sent,accepted]')}`).expectStatus(200);
        const row = history.body.invites.find(i => i.email === email);
        assert.equal(row && row.status, 'accepted');
        assert.equal(row.token, undefined, 'no token in the list');

        // front のサーバーが使う連携の鍵（セッション無し）でも読める（連携の鍵の許可の invites: GET と Admin Integration の権限）
        const keyAgent = new AdminAPITestAgent(agent.app, {apiURL: '/ghost/api/admin/', originURL: config.get('url')});
        const byKey = await keyAgent.get(`invites/?filter=${encodeURIComponent('status:[pending,sent,accepted]')}`)
            .header('Authorization', `Ghost ${localUtils.getValidAdminToken('/admin/')}`)
            .expectStatus(200);
        const keyRow = byKey.body.invites.find(i => i.email === email);
        assert.equal(keyRow && keyRow.status, 'accepted');
        assert.equal(keyRow.token, undefined);

        // 同じ token でもう一度受けることはできない
        await agent.post('authentication/invitation/')
            .body({invitation: [{token, email, name: 'Again', password: 'Tq7#vLm2!pWz9xRe'}]})
            .expectStatus(404);

        // 登録した人に同じメールで招き直すことはできない（もうユーザー）。登録済みの行は消されず同じ行のまま残る
        await agent.post('invites/').header('X-Forwarded-For', nextIp())
            .body({invites: [{email, role_id: authorRoleId}]}).expectStatus(422);
        const kept = await models.Invite.findOne({email}, {context: {internal: true}});
        assert.equal(kept.get('status'), 'accepted');
        assert.equal(kept.id, invite.id, 'the same row, not deleted and made again');
    });

    it('a member invite sent by the front\'s key for a signed-in person is recorded as theirs (for their history)', async function () {
        const me = (await agent.get('users/me/').expectStatus(200)).body.users[0];
        const keyAgent = new AdminAPITestAgent(agent.app, {apiURL: '/ghost/api/admin/', originURL: config.get('url')});
        const auth = () => `Ghost ${localUtils.getValidAdminToken('/admin/')}`;
        const email = 'info-member@example.com';
        await keyAgent.post('invites/').header('Authorization', auth()).header('X-Forwarded-For', nextIp())
            .body({invites: [{email, role_id: authorRoleId, invited_by: me.id}]}).expectStatus(201);

        const row = await models.Invite.findOne({email}, {context: {internal: true}});
        assert.equal(row.get('created_by'), me.id);
        // メールの「… さんから」もその人
        assert.ok(mailReceiver.getSentEmail(0).html.includes(me.name));
        const history = await keyAgent.get(`invites/?filter=${encodeURIComponent(`status:[pending,sent,accepted]+created_by:'${me.id}'`)}`)
            .header('Authorization', auth()).expectStatus(200);
        assert.ok(history.body.invites.some(i => i.email === email));

        // いない人を名指しすると断る（黙って連携の鍵の招待にしない）
        await keyAgent.post('invites/').header('Authorization', auth()).header('X-Forwarded-For', nextIp())
            .body({invites: [{email: 'info-member2@example.com', role_id: authorRoleId, invited_by: 'aaaaaaaaaaaaaaaaaaaaaaaa'}]}).expectStatus(403);
        assert.equal(await models.Invite.findOne({email: 'info-member2@example.com'}, {context: {internal: true}}), null, 'no invite row');

        // 止められている人（inactive）を名指ししても断る
        const other = (await models.User.findAll({context: {internal: true}})).models.find(u => u.id !== me.id);
        await models.User.edit({status: 'inactive'}, {id: other.id, context: {internal: true}});
        try {
            await keyAgent.post('invites/').header('Authorization', auth()).header('X-Forwarded-For', nextIp())
                .body({invites: [{email: 'info-member3@example.com', role_id: authorRoleId, invited_by: other.id}]}).expectStatus(403);
            assert.equal(await models.Invite.findOne({email: 'info-member3@example.com'}, {context: {internal: true}}), null);
        } finally {
            await models.User.edit({status: 'active'}, {id: other.id, context: {internal: true}});
        }
    });

    it('an unknown token and a missing token are refused', async function () {
        await agent.get('authentication/invitation_info/?token=bm9wZQ').header('X-Forwarded-For', nextIp()).expectStatus(404);
        await agent.get('authentication/invitation_info/').header('X-Forwarded-For', nextIp()).expectStatus(422);
    });

    it('an invite cannot name a group the inviter does not manage (or that does not exist)', async function () {
        await agent.post('invites/').header('X-Forwarded-For', nextIp())
            .body({invites: [{email: 'info-group@example.com', role_id: authorRoleId, group_id: 'aaaaaaaaaaaaaaaaaaaaaaaa'}]})
            .expectStatus(422);
    });
});
