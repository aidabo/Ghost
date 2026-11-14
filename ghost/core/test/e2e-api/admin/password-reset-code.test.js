// スタッフがパスワードを忘れたとき、メールの 6 桁のコードで決め直す口
// （services/auth/password-reset-code.js、jibunsee-react docs/planning/staff-password-reset-code.md §3）
const assert = require('assert/strict');
const {agentProvider, fixtureManager, mockManager} = require('../../utils/e2e-framework');
const models = require('../../../core/server/models');
const resetCode = require('../../../core/server/services/auth/password-reset-code');

function sentCount(mailReceiver) {
    let n = 0;
    while (mailReceiver.getSentEmail(n)) {
        n += 1;
    }
    return n;
}

/** 送る口のメールは待たずに送るので、届くまで少し待つ */
async function waitForEmails(mailReceiver, count) {
    for (let i = 0; i < 50 && sentCount(mailReceiver) < count; i += 1) {
        await new Promise((r) => {
            setTimeout(r, 20);
        });
    }
}

async function codeFor(email) {
    const user = await models.User.getByEmail(email);
    return resetCode._totp.generate(resetCode._codeSecret(user));
}

describe('Password reset code API', function () {
    let agent;
    let mailReceiver;
    let email;

    before(async function () {
        agent = await agentProvider.getAdminAPIAgent();
        await fixtureManager.init('users');
        const owner = await models.User.getOwnerUser();
        email = owner.get('email');
    });

    beforeEach(function () {
        mailReceiver = mockManager.mockMail();
    });

    afterEach(async function () {
        mockManager.restore();
        // 回数の制限を、試験ごとに戻す
        await models.Base.knex('brute').del();
    });

    it('sends a 6-digit code (in the subject) and the reset link to a known staff email', async function () {
        await agent
            .post('authentication/password_reset_code')
            .body({password_reset_code: [{email, locale: 'ja'}]})
            .expectStatus(200);

        await waitForEmails(mailReceiver, 1);
        const sent = mailReceiver.getSentEmail(0);
        assert.equal(sent.to, email);
        assert.match(sent.subject, /^\d{6} はパスワードを決め直すためのコードです$/);
        const code = sent.subject.slice(0, 6);
        assert.ok(sent.text.includes(code));
        assert.ok(sent.text.includes('5 分以内'));
        assert.match(sent.text, /\/reset\/[^/\s]+\//);
        assert.equal(code, await codeFor(email));
    });

    it('answers the same for an unknown email and sends nothing', async function () {
        const known = await agent
            .post('authentication/password_reset_code')
            .body({password_reset_code: [{email}]})
            .expectStatus(200);
        const unknown = await agent
            .post('authentication/password_reset_code')
            .body({password_reset_code: [{email: 'nobody-here@example.com'}]})
            .expectStatus(200);
        assert.deepEqual(unknown.body, known.body);

        await waitForEmails(mailReceiver, 1);
        await new Promise((r) => {
            setTimeout(r, 200);
        });
        assert.equal(sentCount(mailReceiver), 1);
        assert.equal(mailReceiver.getSentEmail(0).to, email);
    });

    it('refuses a body without the root key, and a bad email', async function () {
        await agent
            .post('authentication/password_reset_code')
            .body({email})
            .expectStatus(400);
        await agent
            .post('authentication/password_reset_code')
            .body({password_reset_code: [{email: 'not-an-email'}]})
            .expectStatus(400);
    });

    it('refuses a wrong code, an unknown email, and a code that is not 6 digits, the same way', async function () {
        const wrong = await agent
            .put('authentication/password_reset_code')
            .body({password_reset_code: [{email, code: '000000', newPassword: 'NewPassword1234!', ne2Password: 'NewPassword1234!'}]})
            .expectStatus(400);
        const unknown = await agent
            .put('authentication/password_reset_code')
            .body({password_reset_code: [{email: 'nobody-here@example.com', code: '123456', newPassword: 'NewPassword1234!', ne2Password: 'NewPassword1234!'}]})
            .expectStatus(400);
        assert.equal(wrong.body.errors[0].message, unknown.body.errors[0].message);

        await agent
            .put('authentication/password_reset_code')
            .body({password_reset_code: [{email, code: '12ab', newPassword: 'NewPassword1234!', ne2Password: 'NewPassword1234!'}]})
            .expectStatus(400);
        await agent
            .put('authentication/password_reset_code')
            .body({password_reset_code: [{email, code: await codeFor(email), newPassword: 'NewPassword1234!', ne2Password: 'Different1234!'}]})
            .expectStatus(422);
    });

    it('changes the password with the right code; the same code (and the old link) cannot be used again', async function () {
        const code = await codeFor(email);
        const before = await models.User.getByEmail(email);
        const oldHash = before.get('password');

        await agent
            .put('authentication/password_reset_code')
            .body({password_reset_code: [{email, code, newPassword: 'ChangedByCode1234!', ne2Password: 'ChangedByCode1234!'}]})
            .expectStatus(200);

        const after = await models.User.getByEmail(email);
        assert.notEqual(after.get('password'), oldHash);
        assert.equal(after.get('status'), 'active');
        assert.equal(await models.User.isPasswordCorrect({plainPassword: 'ChangedByCode1234!', hashedPassword: after.get('password')}).then(() => true, () => false), true);

        // パスワードが変わったので、同じコードはもう通らない
        await agent
            .put('authentication/password_reset_code')
            .body({password_reset_code: [{email, code, newPassword: 'Again1234567!', ne2Password: 'Again1234567!'}]})
            .expectStatus(400);
    });

    it('accepts the code from the previous 5-minute step, but not older ones', async function () {
        const user = await models.User.getByEmail(email);
        const secret = resetCode._codeSecret(user);
        const now = Date.now();
        const totp = resetCode._totp;
        const at = epoch => totp.clone({epoch}).generate(secret);
        assert.ok(totp.check(at(now - 300 * 1000), secret), 'one step back is still valid');
        assert.ok(!totp.check(at(now - 600 * 1000), secret), 'two steps back is expired');
        assert.ok(!totp.check(at(now + 300 * 1000), secret), 'a future step is not valid');
    });

    it('limits tries per email even when the IP changes', async function () {
        const body = {password_reset_code: [{email, code: '000000', newPassword: 'NewPassword1234!', ne2Password: 'NewPassword1234!'}]};
        let lastStatus = 0;
        for (let i = 0; i < 6; i += 1) {
            const res = await agent
                .put('authentication/password_reset_code')
                .header('X-Forwarded-For', `10.0.0.${i + 1}`)
                .body(body);
            lastStatus = res.statusCode;
        }
        assert.equal(lastStatus, 429);

        // 同じメールは、新しい IP からでも止まる（メールごとの制限）
        const sameEmail = await agent
            .put('authentication/password_reset_code')
            .header('X-Forwarded-For', '10.0.1.1')
            .body(body);
        assert.equal(sameEmail.statusCode, 429);
        // 別のメールは、新しい IP なら止まらない（IP ごとの制限には当たっていない）
        const otherEmail = await agent
            .put('authentication/password_reset_code')
            .header('X-Forwarded-For', '10.0.1.2')
            .body({password_reset_code: [{...body.password_reset_code[0], email: 'someone-else@example.com'}]});
        assert.equal(otherEmail.statusCode, 400);
    });

    it('limits tries per IP across many emails', async function () {
        let lastStatus = 0;
        for (let i = 0; i < 6; i += 1) {
            const res = await agent
                .put('authentication/password_reset_code')
                .header('X-Forwarded-For', '10.0.2.1')
                .body({password_reset_code: [{email: `guess${i}@example.com`, code: '000000', newPassword: 'NewPassword1234!', ne2Password: 'NewPassword1234!'}]});
            lastStatus = res.statusCode;
        }
        assert.equal(lastStatus, 429);
    });
});
