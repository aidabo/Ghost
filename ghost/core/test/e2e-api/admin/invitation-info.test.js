// 招待を受けるページが token で招待を 1 件読む口（jibunsee-react docs/planning/invite-links.md の D10）。
// 種類・グループ名・招いた人の名前だけを返す。メールアドレス・id は返さない。無い token は同じ 404
const assert = require('assert/strict');
const {agentProvider, fixtureManager, mockManager, dbUtils} = require('../../utils/e2e-framework');
const models = require('../../../core/server/models');

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
        await fixtureManager.init('users');
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
