// 会員のログイン・登録を、メールの 6 桁のコード（OTC）で
// （jibunsee-react docs/planning/staff-password-reset-code.md §8）
const assert = require('assert/strict');
const {agentProvider, mockManager, fixtureManager, dbUtils} = require('../../utils/e2e-framework');
const settingsCache = require('../../../core/shared/settings-cache');
const models = require('../../../core/server/models');
const spamPrevention = require('../../../core/server/web/shared/middleware/api/spam-prevention');
const {OTC_VALIDITY} = require('../../../core/server/services/members/SingleUseTokenProvider');

let membersAgent;
// 試験ごと・呼ぶごとに別の IP（IP ごとの回数の制限を、ほかの試験と分ける）
let ipCounter = 0;
function nextIp() {
    ipCounter += 1;
    return `10.9.${Math.floor(ipCounter / 250)}.${(ipCounter % 250) + 1}`;
}

function sentEmails(mailReceiver) {
    const list = [];
    while (mailReceiver.getSentEmail(list.length)) {
        list.push(mailReceiver.getSentEmail(list.length));
    }
    return list;
}

function codeOf(mail) {
    return /^(\d{6}) /.exec(mail.subject)?.[1];
}

function tokenOf(mail) {
    return /[?&]token=([^&\s"]+)/.exec(mail.text)?.[1];
}

async function sendWithOTC(email, emailType = 'signin') {
    const res = await membersAgent.post('/api/send-magic-link')
        .header('X-Forwarded-For', nextIp())
        .body({email, emailType, includeOTC: true})
        .expectStatus(201);
    return res.body.otc_ref;
}

function verify(otcRef, otc, ip) {
    return membersAgent.post('/api/verify-otc')
        .header('X-Forwarded-For', ip || nextIp())
        .body({otcRef, otc});
}

describe('Members sign in / sign up with a one-time code', function () {
    let mailReceiver;

    before(async function () {
        const agents = await agentProvider.getAgentsForMembers();
        membersAgent = agents.membersAgent;
        await fixtureManager.init('members');
    });

    beforeEach(async function () {
        mailReceiver = mockManager.mockMail();
        spamPrevention.reset();
        // 回数の記録（brute の表）も試験ごとに空に（spamPrevention.reset は表を消さない。signin.test.js と同じ）
        await dbUtils.truncate('brute');
        settingsCache.set('members_signup_access', {value: 'all'});
    });

    afterEach(function () {
        mockManager.restore();
    });

    it('sends the code (first in the subject) and returns only otc_ref', async function () {
        const otcRef = await sendWithOTC('member1@test.com');
        assert.match(otcRef, /^[0-9a-f]{24}$/);

        const [mail] = sentEmails(mailReceiver);
        const code = codeOf(mail);
        assert.match(code, /^\d{6}$/);
        assert.ok(mail.text.includes(`Your code: ${code}`));
        assert.ok(tokenOf(mail), 'the link is still in the email');
        assert.ok(mail.html.includes(code));
        // 応答に 6 桁も token も入れない
        const res = await membersAgent.post('/api/send-magic-link').body({email: 'member1@test.com', emailType: 'signin', includeOTC: true});
        assert.deepEqual(Object.keys(res.body), ['otc_ref']);
    });

    it('without includeOTC, nothing changes (no code, plain "Created.")', async function () {
        const res = await membersAgent.post('/api/send-magic-link')
            .body({email: 'member1@test.com', emailType: 'signin'})
            .expectStatus(201);
        assert.equal(res.text, 'Created.');
        const [mail] = sentEmails(mailReceiver);
        assert.equal(codeOf(mail), undefined);
    });

    it('signs in with the right code: sets the member cookie and never returns the token', async function () {
        const otcRef = await sendWithOTC('member1@test.com');
        const [mail] = sentEmails(mailReceiver);

        const res = await verify(otcRef, codeOf(mail))
            .expectStatus(200)
            .expectHeader('Set-Cookie', /members-ssr.*/);
        assert.deepEqual(res.body, {success: true});
        assert.ok(!res.text.includes(tokenOf(mail)));

        // 同じコードでもう一度は入れない（token は一度使われた）
        await verify(otcRef, codeOf(mail)).expectStatus(400);
    });

    it('signs up a new member with the code', async function () {
        const email = 'new-by-code@test.com';
        const otcRef = await sendWithOTC(email, 'signup');
        const [mail] = sentEmails(mailReceiver);
        assert.match(mail.subject, /^\d{6} is your sign-up code for /);

        await verify(otcRef, codeOf(mail)).expectStatus(200);
        const member = await models.Member.findOne({email});
        assert.ok(member, 'the member was created');
    });

    it('refuses a wrong code, an unknown otcRef, and a code that is not 6 digits, the same way', async function () {
        const otcRef = await sendWithOTC('member1@test.com');
        const code = codeOf(sentEmails(mailReceiver)[0]);
        const wrong = String((Number(code) + 1) % 1000000).padStart(6, '0');

        const a = await verify(otcRef, wrong).expectStatus(400);
        const b = await verify('000000000000000000000000', code).expectStatus(400);
        const c = await verify(otcRef, '12ab').expectStatus(400);
        assert.equal(a.body.errors[0].message, b.body.errors[0].message);
        assert.equal(a.body.errors[0].message, c.body.errors[0].message);
    });

    it('refuses the code after 10 minutes (the link is still valid for 24 hours)', async function () {
        const otcRef = await sendWithOTC('member1@test.com');
        const [mail] = sentEmails(mailReceiver);
        await models.SingleUseToken.edit(
            {created_at: new Date(Date.now() - OTC_VALIDITY - 60 * 1000)},
            {id: otcRef}
        );
        await verify(otcRef, codeOf(mail)).expectStatus(400);

        await membersAgent.get(`/?token=${tokenOf(mail)}`)
            .expectStatus(302)
            .expectHeader('Location', /\?\w*success=true/);
    });

    it('refuses the code once the link of the same email was used', async function () {
        const otcRef = await sendWithOTC('member1@test.com');
        const [mail] = sentEmails(mailReceiver);
        await membersAgent.get(`/?token=${tokenOf(mail)}`).expectStatus(302);
        await verify(otcRef, codeOf(mail)).expectStatus(400);
    });

    it('after sending again, the earlier code still works until it expires (decided in the plan)', async function () {
        const firstRef = await sendWithOTC('member1@test.com');
        const secondRef = await sendWithOTC('member1@test.com');
        const [first, second] = sentEmails(mailReceiver);
        assert.notEqual(firstRef, secondRef);
        await verify(firstRef, codeOf(first)).expectStatus(200);
        await verify(secondRef, codeOf(second)).expectStatus(200);
    });

    it('allows a few typos: three wrong codes, then the right one still signs in (same ref, same IP)', async function () {
        const otcRef = await sendWithOTC('member1@test.com');
        const code = codeOf(sentEmails(mailReceiver)[0]);
        const wrong = String((Number(code) + 1) % 1000000).padStart(6, '0');
        for (let i = 0; i < 3; i += 1) {
            await verify(otcRef, wrong, '10.7.0.1').expectStatus(400);
        }
        await verify(otcRef, code, '10.7.0.1').expectStatus(200);
    });

    it('limits tries per otcRef even when the IP changes', async function () {
        const otcRef = await sendWithOTC('member1@test.com');
        const code = codeOf(sentEmails(mailReceiver)[0]);
        const wrong = String((Number(code) + 1) % 1000000).padStart(6, '0');
        let last;
        for (let i = 0; i < 6; i += 1) {
            last = await verify(otcRef, wrong, `10.1.0.${i + 1}`);
        }
        assert.equal(last.statusCode, 429);
        // 正しいコードでも、この otcRef は止まっている
        const blocked = await verify(otcRef, code, '10.1.1.1');
        assert.equal(blocked.statusCode, 429);
    });

    it('refuses an otcRef written differently (upper case, spaces), even with the right code', async function () {
        const otcRef = await sendWithOTC('member1@test.com');
        const code = codeOf(sentEmails(mailReceiver)[0]);
        await verify(otcRef.toUpperCase(), code, '10.3.0.1').expectStatus(400);
        await verify(`${otcRef} `, code, '10.3.0.2').expectStatus(400);
        await verify(` ${otcRef}`, code, '10.3.0.3').expectStatus(400);
        // 正しい書き方なら入れる（上の失敗はこの ref の回数に数えられていない）
        await verify(otcRef, code, '10.3.0.4').expectStatus(200);
    });

    it('cannot get around the per-otcRef limit by writing the otcRef differently', async function () {
        const otcRef = await sendWithOTC('member1@test.com');
        const code = codeOf(sentEmails(mailReceiver)[0]);
        const wrong = String((Number(code) + 1) % 1000000).padStart(6, '0');
        const variants = [otcRef.toUpperCase(), `${otcRef} `, `${otcRef}  `, ` ${otcRef}`, `${otcRef}\t`, otcRef.replace(/[a-f]/, c => c.toUpperCase())];
        const statuses = [];
        for (const [i, ref] of variants.entries()) {
            statuses.push((await verify(ref, wrong, `10.4.0.${i + 1}`)).statusCode);
        }
        // 書き方を変えたものは、まとめて 1 つの鍵で数えられ、やがて止まる
        assert.ok(statuses.every(st => st === 400 || st === 429));
        assert.equal(statuses[statuses.length - 1], 429);
    });

    it('the same right code sent twice at the same time signs in only once', async function () {
        const otcRef = await sendWithOTC('member1@test.com');
        const code = codeOf(sentEmails(mailReceiver)[0]);
        const results = await Promise.all([verify(otcRef, code), verify(otcRef, code), verify(otcRef, code)]);
        // 通るのは 1 つだけ。残りは失敗（400。同じ鍵の回数の記録が同時に書かれると、今の brute-knex は
        // MySQL のデッドロックで 500 を返すことがあるが、どちらにしてもセッションは作られない）
        const statuses = results.map(r => r.statusCode);
        assert.equal(statuses.filter(st => st === 200).length, 1);
        assert.ok(statuses.filter(st => st !== 200).every(st => st === 400 || st === 500));
    });

    it('verifyOTC marks the token used at once: a second check of the same code gets nothing, even together', async function () {
        const provider = require('../../../core/server/services/members').api.tokenProvider;
        const {token, ref} = await provider.createWithRef({email: 'member1@test.com', type: 'signin'});
        const otc = provider.deriveOTC(ref, token);
        const together = await Promise.all([provider.verifyOTC(ref, otc), provider.verifyOTC(ref, otc)]);
        assert.equal(together.filter(Boolean).length, 1);
        assert.equal(await provider.verifyOTC(ref, otc), null);
    });

    it('limits sending with a code per email, even when the IP changes (sending without a code is unchanged)', async function () {
        const email = 'member2@test.com';
        const statuses = [];
        for (let i = 0; i < 6; i += 1) {
            const res = await membersAgent.post('/api/send-magic-link')
                .header('X-Forwarded-For', nextIp())
                .body({email, emailType: 'signin', includeOTC: true});
            statuses.push(res.statusCode);
        }
        assert.equal(statuses[statuses.length - 1], 429);
        await membersAgent.post('/api/send-magic-link')
            .header('X-Forwarded-For', nextIp())
            .body({email, emailType: 'signin'})
            .expectStatus(201);
    });

    it('limits tries per IP across many otcRefs', async function () {
        let last;
        for (let i = 0; i < 6; i += 1) {
            last = await verify(`00000000000000000000000${i}`, '123456', '10.2.0.1');
        }
        assert.equal(last.statusCode, 429);
    });
});
