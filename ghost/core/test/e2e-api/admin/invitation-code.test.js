// 「アカウント作成」の招待に 6 桁の認証コード（services/auth/invitation-code.js、
// jibunsee-react docs/planning/staff-signup-code.md §3）:
// - POST /invites/?include_code=true のときだけ、招待メールの件名の頭と本文に 6 桁、応答に code_ref
// - POST /authentication/invitation_code で 6 桁が合えば、招待の token（リンクの /signup/ の後ろと同じ値）を返す
// - 10 分・5 回・1 回きり・送り直すと前の 6 桁は使えない・印が無ければ今までどおり
const assert = require('assert/strict');
const sinon = require('sinon');
const {agentProvider, fixtureManager, mockManager, dbUtils} = require('../../utils/e2e-framework');
const models = require('../../../core/server/models');
const invitationCode = require('../../../core/server/services/auth/invitation-code');
const resetCode = require('../../../core/server/services/auth/password-reset-code');
const security = require('@tryghost/security');

let ipCounter = 0;
function nextIp() {
    ipCounter += 1;
    return `10.9.${Math.floor(ipCounter / 250)}.${(ipCounter % 250) + 1}`;
}

let emailCounter = 0;
function nextEmail() {
    emailCounter += 1;
    return `invite-code-${emailCounter}@example.com`;
}

describe('Invitation code API', function () {
    let agent;
    let mailReceiver;
    let authorRoleId;

    /** 招待を送る（include_code の印つき）。応答の招待と、届いたメールを返す */
    async function invite(email, {locale = 'ja', includeCode = true, ip} = {}) {
        const query = includeCode ? `?include_code=true${locale ? `&locale=${locale}` : ''}` : '';
        const res = await agent
            .post(`invites/${query}`)
            .header('X-Forwarded-For', ip || nextIp())
            .body({invites: [{email, role_id: authorRoleId}]})
            .expectStatus(201);
        const count = mailCount();
        const sent = mailReceiver.getSentEmail(count - 1);
        return {invite: res.body.invites[0], sent, code: sent.subject.slice(0, 6)};
    }

    function mailCount() {
        let n = 0;
        while (mailReceiver.getSentEmail(n)) {
            n += 1;
        }
        return n;
    }

    function verify(body, ip) {
        return agent
            .post('authentication/invitation_code')
            .header('X-Forwarded-For', ip || nextIp())
            .body({invitation_code: [body]});
    }

    /** メールのリンクの /signup/<token>/ の token */
    function linkToken(sent) {
        return /\/signup\/([^/\s"]+)\//.exec(sent.text)[1];
    }

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

    it('with include_code, puts a 6-digit code first in the subject and in the body, and returns code_ref', async function () {
        const email = nextEmail();
        const {invite: created, sent, code} = await invite(email);
        assert.match(sent.subject, /^\d{6} は.+のスタッフ登録の認証コードです$/);
        assert.ok(sent.text.includes(code));
        assert.ok(sent.text.includes('10 分以内'));
        assert.ok(sent.html.includes(code));
        // 今のリンクも入っている
        assert.ok(linkToken(sent));

        assert.equal(typeof created.code_ref, 'string');
        assert.ok(created.code_ref.length >= 24);
        // 6 桁そのものは保存しない。行の種類は staff_invite_code
        const row = await models.SingleUseToken.findOne({token: created.code_ref});
        assert.ok(row);
        assert.ok(!row.get('data').includes(code));
        assert.equal(JSON.parse(row.get('data')).type, invitationCode.TOKEN_TYPE);
    });

    it('code_ref is not the invite token (nor its base64), so it cannot be turned into a sign-up link', async function () {
        const {invite: created, sent} = await invite(nextEmail());
        const token = linkToken(sent);
        const rawToken = security.url.decodeBase64(token);
        assert.notEqual(created.code_ref, token);
        assert.notEqual(created.code_ref, rawToken);
        assert.notEqual(security.url.encodeBase64(created.code_ref), token);
        assert.equal(created.token, undefined);
    });

    it('the right code returns the same token as the link, and that token signs up', async function () {
        const email = nextEmail();
        const {invite: created, sent, code} = await invite(email);
        const res = await verify({email, ref: created.code_ref, code}).expectStatus(200);
        const token = res.body.invitation_code[0].token;
        assert.equal(token, linkToken(sent));
        // 1 回きり: 登録の前でも、同じ 6 桁はもう通らない（行は消えている）
        await verify({email, ref: created.code_ref, code}).expectStatus(400);
        assert.equal(await models.SingleUseToken.findOne({token: created.code_ref}), null);

        await agent
            .post('authentication/invitation')
            .body({invitation: [{token, email, name: 'Code Signup', password: 'CodeSignup1234!'}]})
            .expectStatus(200);
        const user = await models.User.getByEmail(email);
        assert.ok(user);
    });

    it('a wrong code, another email, a made-up ref, staff reset rows and member tokens all fail with the same 400', async function () {
        const email = nextEmail();
        const {invite: created, code} = await invite(email);
        const wrong = String((Number(code) + 1) % 1000000).padStart(6, '0');
        const a = await verify({email, ref: created.code_ref, code: wrong}).expectStatus(400);
        const b = await verify({email: 'someone-else@example.com', ref: created.code_ref, code}).expectStatus(400);
        const c = await verify({email, ref: 'made-up-ref-made-up-ref-made-up', code}).expectStatus(400);
        const resetRow = await models.SingleUseToken.add({data: JSON.stringify({type: resetCode.TOKEN_TYPE, user_id: '1', code_hash: 'x'})});
        const d = await verify({email, ref: resetRow.get('token'), code}).expectStatus(400);
        const memberRow = await models.SingleUseToken.add({data: JSON.stringify({email, type: 'signup'})});
        const e = await verify({email, ref: memberRow.get('token'), code}).expectStatus(400);
        for (const res of [b, c, d, e]) {
            assert.equal(res.body.errors[0].message, a.body.errors[0].message);
        }
        // 間違えたあとでも、残りの回数のうちなら正しい 6 桁は通る
        await verify({email, ref: created.code_ref, code}).expectStatus(200);
    });

    it('a row of another type is refused even with a real invite and a correct hash', async function () {
        const email = nextEmail();
        const {sent} = await invite(email);
        const inviteToken = security.url.decodeBase64(linkToken(sent));
        const createdInvite = await models.Invite.findOne({token: inviteToken});
        const ref = 'other-type-ref-other-type-ref-01';
        await models.SingleUseToken.add({
            token: ref,
            data: JSON.stringify({type: resetCode.TOKEN_TYPE, invite_id: createdInvite.id, code_hash: invitationCode._codeHash(ref, inviteToken, '123456')})
        });
        await verify({email, ref, code: '123456'}).expectStatus(400);
    });

    it('five wrong tries use up the code', async function () {
        const email = nextEmail();
        const {invite: created, code} = await invite(email);
        const wrong = String((Number(code) + 1) % 1000000).padStart(6, '0');
        for (let i = 0; i < invitationCode.MAX_FAILURES; i += 1) {
            // IP を毎回変え、メールごとの上限にも当たらないよう brute を空にする（数えているのは行の used_count）
            await dbUtils.truncate('brute');
            await verify({email, ref: created.code_ref, code: wrong}).expectStatus(400);
        }
        await dbUtils.truncate('brute');
        await verify({email, ref: created.code_ref, code}).expectStatus(400);
    });

    it('a code older than 10 minutes is refused', async function () {
        const email = nextEmail();
        const {invite: created, code} = await invite(email);
        const clock = sinon.useFakeTimers({now: Date.now() + invitationCode.CODE_VALIDITY + 1000, shouldAdvanceTime: true});
        try {
            await verify({email, ref: created.code_ref, code}).expectStatus(400);
        } finally {
            clock.restore();
        }
    });

    it('sending again makes a new invite, so the old code no longer works and the new one does', async function () {
        const email = nextEmail();
        const first = await invite(email);
        const second = await invite(email);
        assert.notEqual(second.invite.code_ref, first.invite.code_ref);
        await verify({email, ref: first.invite.code_ref, code: first.code}).expectStatus(400);
        await verify({email, ref: second.invite.code_ref, code: second.code}).expectStatus(200);
    });

    it('without include_code nothing changes: no code in the mail, no code_ref and no row', async function () {
        const before = await models.SingleUseToken.findAll();
        const email = nextEmail();
        const {invite: created, sent} = await invite(email, {includeCode: false});
        assert.equal(created.code_ref, undefined);
        assert.doesNotMatch(sent.subject, /^\d{6} /);
        const after = await models.SingleUseToken.findAll();
        assert.equal(after.length, before.length);
    });

    it('the mail follows locale (ja, zh, en)', async function () {
        const zh = await invite(nextEmail(), {locale: 'zh'});
        assert.match(zh.sent.subject, /^\d{6} 是 .+ 的员工注册验证码$/);
        assert.ok(zh.sent.text.includes('6 位验证码'));
        const en = await invite(nextEmail(), {locale: 'en'});
        assert.match(en.sent.subject, /^\d{6} is your verification code to sign up for /);
        assert.ok(en.sent.text.includes('verification code'));
    });

    it('if the mail cannot be sent, the code row is removed', async function () {
        mockManager.restore();
        mockManager.mockMail();
        const mailService = require('../../../core/server/services/mail');
        const send = sinon.stub(mailService.GhostMailer.prototype, 'send').rejects(new Error('smtp down'));
        try {
            const before = await models.SingleUseToken.findAll();
            await agent
                .post('invites/?include_code=true&locale=ja')
                .header('X-Forwarded-For', nextIp())
                .body({invites: [{email: nextEmail(), role_id: authorRoleId}]})
                .expectStatus(500);
            const after = await models.SingleUseToken.findAll();
            assert.equal(after.length, before.length);
        } finally {
            send.restore();
        }
    });

    it('limits sending with a code per email even when the IP changes, and per IP across emails', async function () {
        const email = nextEmail();
        let last;
        for (let i = 0; i < 6; i += 1) {
            last = await agent
                .post('invites/?include_code=true&locale=ja')
                .header('X-Forwarded-For', nextIp())
                .body({invites: [{email, role_id: authorRoleId}]});
        }
        assert.equal(last.statusCode, 429);

        await dbUtils.truncate('brute');
        const ip = nextIp();
        for (let i = 0; i < 6; i += 1) {
            last = await agent
                .post('invites/?include_code=true&locale=ja')
                .header('X-Forwarded-For', ip)
                .body({invites: [{email: nextEmail(), role_id: authorRoleId}]});
        }
        assert.equal(last.statusCode, 429);
    });

    it('invites without include_code are not limited by the code limits', async function () {
        const email = nextEmail();
        for (let i = 0; i < 6; i += 1) {
            await agent
                .post('invites/')
                .header('X-Forwarded-For', nextIp())
                .body({invites: [{email, role_id: authorRoleId}]})
                .expectStatus(201);
        }
    });

    it('limits checking per email even when the IP changes', async function () {
        const email = nextEmail();
        const {invite: created} = await invite(email);
        let last;
        for (let i = 0; i < 6; i += 1) {
            last = await verify({email, ref: created.code_ref, code: '000000'});
        }
        assert.equal(last.statusCode, 429);
    });

    it('a broken body is 400, not 500', async function () {
        await agent.post('authentication/invitation_code').header('X-Forwarded-For', nextIp()).body({}).expectStatus(400);
        await verify({email: 'not-an-email', ref: 'x', code: '123456'}).expectStatus(400);
        await verify({email: nextEmail(), ref: 'x', code: '12ab'}).expectStatus(400);
        await verify({email: nextEmail(), code: '123456'}).expectStatus(400);
    });
});
