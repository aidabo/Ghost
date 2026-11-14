// スタッフがパスワードを忘れたとき、メールの 6 桁のコードで決め直す口
// （services/auth/password-reset-code.js、jibunsee-react docs/planning/staff-password-reset-code.md §3）
// 6 桁は「送る」を頼んだときにだけ作り、tokens の表に hash で残す。送る口が返す ref と組で使う。
const assert = require('assert/strict');
const {agentProvider, fixtureManager, mockManager, dbUtils, configUtils, resetRateLimits} = require('../../utils/e2e-framework');
const models = require('../../../core/server/models');
const resetCode = require('../../../core/server/services/auth/password-reset-code');
const SingleUseTokenProvider = require('../../../core/server/services/members/SingleUseTokenProvider');

const PASSWORDS = {newPassword: 'ChangedByCode1234!', ne2Password: 'ChangedByCode1234!'};

let ipCounter = 0;
function nextIp() {
    ipCounter += 1;
    return `10.8.${Math.floor(ipCounter / 250)}.${(ipCounter % 250) + 1}`;
}

function sentCount(mailReceiver) {
    let n = 0;
    while (mailReceiver.getSentEmail(n)) {
        n += 1;
    }
    return n;
}

function sleep(ms) {
    return new Promise((r) => {
        setTimeout(r, ms);
    });
}

/** 送る口のメールは待たずに送るので、届くまで少し待つ */
async function waitForEmails(mailReceiver, count) {
    for (let i = 0; i < 50 && sentCount(mailReceiver) < count; i += 1) {
        await sleep(20);
    }
}

/** 後ろで行が作られるのを待つ */
async function waitForRow(ref) {
    for (let i = 0; i < 50; i += 1) {
        const row = await models.SingleUseToken.findOne({token: ref});
        if (row) {
            return row;
        }
        await sleep(20);
    }
    return null;
}

describe('Password reset code API', function () {
    let agent;
    let mailReceiver;
    let email;

    async function request(to, locale) {
        const res = await agent
            .post('authentication/password_reset_code')
            .header('X-Forwarded-For', nextIp())
            .body({password_reset_code: [{email: to, ...(locale ? {locale} : {})}]})
            .expectStatus(200);
        return res.body.password_reset_code[0].ref;
    }

    /** 送って、届いたメールの 6 桁と ref を返す */
    async function requestAndRead(to) {
        const ref = await request(to || email);
        await waitForEmails(mailReceiver, 1);
        const sent = mailReceiver.getSentEmail(0);
        return {ref, code: sent.subject.slice(0, 6), sent};
    }

    function reset(body, ip) {
        return agent
            .put('authentication/password_reset_code')
            .header('X-Forwarded-For', ip || nextIp())
            .body({password_reset_code: [{email, ...PASSWORDS, ...body}]});
    }

    before(async function () {
        agent = await agentProvider.getAdminAPIAgent();
        await fixtureManager.init('users');
        const owner = await models.User.getOwnerUser();
        email = owner.get('email');
    });

    beforeEach(async function () {
        mailReceiver = mockManager.mockMail();
        await dbUtils.truncate('brute');
    });

    afterEach(function () {
        mockManager.restore();
    });

    it('sends a random 6-digit code (first in the subject) and the reset link, and returns a ref', async function () {
        const ref = await request(email, 'ja');
        assert.equal(typeof ref, 'string');
        assert.ok(ref.length >= 24);

        await waitForEmails(mailReceiver, 1);
        const sent = mailReceiver.getSentEmail(0);
        assert.equal(sent.to, email);
        assert.match(sent.subject, /^\d{6} はパスワードを決め直すための認証コードです$/);
        const code = sent.subject.slice(0, 6);
        assert.ok(sent.text.includes(code));
        assert.ok(sent.text.includes('10 分以内'));
        assert.match(sent.text, /\/reset\/[^/\s]+\//);

        // 6 桁そのものは保存しない（hash だけ）
        const row = await waitForRow(ref);
        assert.ok(row);
        assert.ok(!row.get('data').includes(code));
        assert.equal(JSON.parse(row.get('data')).type, resetCode.TOKEN_TYPE);
    });

    it('answers the same for an unknown email (a ref of the same shape), sends nothing and makes no row', async function () {
        const known = await request(email);
        const unknown = await request('nobody-here@example.com');
        assert.equal(typeof unknown, 'string');
        assert.equal(unknown.length, known.length);

        await waitForEmails(mailReceiver, 1);
        await sleep(200);
        assert.equal(sentCount(mailReceiver), 1);
        assert.equal(mailReceiver.getSentEmail(0).to, email);
        assert.equal(await models.SingleUseToken.findOne({token: unknown}), null);
    });

    it('without a request there is nothing to guess: any code with a made-up ref is refused', async function () {
        await reset({ref: 'made-up-ref-made-up-ref-made-up', code: '123456'}).expectStatus(400);
    });

    it('changes the password with the code from the email; the same code (and the old link) cannot be used again', async function () {
        const {ref, code, sent} = await requestAndRead();
        const linkToken = /\/reset\/([^/\s]+)\//.exec(sent.text)[1];
        const before = await models.User.getByEmail(email);

        await reset({ref, code}).expectStatus(200);

        const after = await models.User.getByEmail(email);
        assert.notEqual(after.get('password'), before.get('password'));
        assert.equal(after.get('status'), 'active');
        const correct = await models.User.isPasswordCorrect({plainPassword: PASSWORDS.newPassword, hashedPassword: after.get('password')}).then(() => true, () => false);
        assert.equal(correct, true);
        // 行は消える
        assert.equal(await models.SingleUseToken.findOne({token: ref}), null);

        await reset({ref, code, newPassword: 'Again1234567!', ne2Password: 'Again1234567!'}).expectStatus(400);
        await agent
            .put('authentication/password_reset')
            .header('X-Forwarded-For', nextIp())
            .body({password_reset: [{token: linkToken, newPassword: 'ByOldLink1234!', ne2Password: 'ByOldLink1234!'}]})
            .expectStatus(400);
    });

    it('once the password was changed with the link sent together, the code no longer works', async function () {
        const {ref, code, sent} = await requestAndRead();
        const linkToken = /\/reset\/([^/\s]+)\//.exec(sent.text)[1];
        await agent
            .put('authentication/password_reset')
            .header('X-Forwarded-For', nextIp())
            .body({password_reset: [{token: linkToken, newPassword: 'ByLinkFirst1234!', ne2Password: 'ByLinkFirst1234!'}]})
            .expectStatus(200);
        await reset({ref, code}).expectStatus(400);
        // 断った理由は「6 桁（今のパスワードの hash）が合わない」: 行は残り、間違えの数が 1 つ増える
        const row = await models.SingleUseToken.findOne({token: ref});
        assert.ok(row);
        assert.equal(row.get('used_count'), 1);
    });

    it('after asking twice, the first code still works with its own ref (and not with the second ref)', async function () {
        const first = await requestAndRead();
        // 偶然同じ 6 桁になったら（100 万分の 1）、違う 6 桁になるまで送り直す。毎回「ref と組」を確かめるため
        let secondRef;
        let secondCode = first.code;
        for (let sent = 1; secondCode === first.code; sent += 1) {
            assert.ok(sent <= 3, 'got the same 6 digits three times in a row');
            secondRef = await request(email);
            await waitForEmails(mailReceiver, sent + 1);
            await waitForRow(secondRef);
            secondCode = mailReceiver.getSentEmail(sent).subject.slice(0, 6);
        }
        assert.notEqual(secondRef, first.ref);
        // 前の 6 桁を新しい ref で使っても通らない（ref と組）
        await reset({ref: secondRef, code: first.code}).expectStatus(400);
        await reset({ref: first.ref, code: first.code, newPassword: 'FirstCode1234!', ne2Password: 'FirstCode1234!'}).expectStatus(200);
    });

    it('a member magic-link token, or a row with broken data, used as the ref is refused', async function () {
        const memberRow = await models.SingleUseToken.add({data: JSON.stringify({email, type: 'signin'})});
        await reset({ref: memberRow.get('token'), code: '123456'}).expectStatus(400);
        const broken = await models.SingleUseToken.add({data: '{not json'});
        await reset({ref: broken.get('token'), code: '123456'}).expectStatus(400);
    });

    it('a wrong code and a made-up ref fail with the same message', async function () {
        const {ref, code} = await requestAndRead();
        const wrong = String((Number(code) + 1) % 1000000).padStart(6, '0');
        const a = await reset({ref, code: wrong}).expectStatus(400);
        const b = await reset({ref: 'made-up-ref-made-up-ref-made-up', code}).expectStatus(400);
        const c = await reset({ref, code, email: 'someone-else@example.com'}).expectStatus(400);
        assert.equal(a.body.errors[0].message, b.body.errors[0].message);
        assert.equal(a.body.errors[0].message, c.body.errors[0].message);
    });

    it('a wrong code counts; after 5 wrong codes the right one is refused too', async function () {
        const {ref, code} = await requestAndRead();
        const wrong = String((Number(code) + 1) % 1000000).padStart(6, '0');
        for (let i = 0; i < resetCode.MAX_FAILURES; i += 1) {
            // brute の制限ではなく、行の間違えの数で止まることを見るので、毎回 brute を空にして IP も変える
            await dbUtils.truncate('brute');
            await reset({ref, code: wrong}).expectStatus(400);
        }
        const row = await models.SingleUseToken.findOne({token: ref});
        assert.equal(row.get('used_count'), resetCode.MAX_FAILURES);
        await dbUtils.truncate('brute');
        await reset({ref, code}).expectStatus(400);
    });

    it('a few typos are fine: two wrong codes, then the right one changes the password', async function () {
        const {ref, code} = await requestAndRead();
        const wrong = String((Number(code) + 1) % 1000000).padStart(6, '0');
        const ip = nextIp();
        await reset({ref, code: wrong}, ip).expectStatus(400);
        await reset({ref, code: wrong}, ip).expectStatus(400);
        await reset({ref, code, newPassword: 'AfterTypos1234!', ne2Password: 'AfterTypos1234!'}, ip).expectStatus(200);
    });

    it('refuses the code after 10 minutes', async function () {
        const {ref, code} = await requestAndRead();
        const row = await models.SingleUseToken.findOne({token: ref});
        await models.SingleUseToken.edit(
            {created_at: new Date(Date.now() - resetCode.CODE_VALIDITY - 60 * 1000)},
            {id: row.id}
        );
        await reset({ref, code}).expectStatus(400);
    });

    it('refuses a ref sent to someone else, even with their right code', async function () {
        const {ref, code} = await requestAndRead();
        await reset({ref, code, email: 'someone-else@example.com'}).expectStatus(400);
    });

    it('a staff reset row cannot be used as a member magic link', async function () {
        const {ref} = await requestAndRead();
        await waitForRow(ref);
        const provider = new SingleUseTokenProvider({
            SingleUseTokenModel: models.SingleUseToken,
            validityPeriod: 24 * 60 * 60 * 1000,
            validityPeriodAfterUsage: 10 * 60 * 1000,
            maxUsageCount: 3
        });
        await assert.rejects(provider.validate(ref), /Invalid token/);
    });

    it('refuses bodies without the ref, passwords, or a root item with 400 (not 500)', async function () {
        await reset({ref: undefined, code: '123456'}).expectStatus(400);
        await agent
            .put('authentication/password_reset_code')
            .header('X-Forwarded-For', nextIp())
            .body({password_reset_code: [{email, ref: 'x', code: '123456'}]})
            .expectStatus(400);
        await agent
            .put('authentication/password_reset_code')
            .header('X-Forwarded-For', nextIp())
            .body({password_reset_code: {}})
            .expectStatus(400);
        await reset({ref: 'x', code: '12ab'}).expectStatus(400);
        await reset({ref: 'x', code: '123456', ne2Password: 'Different1234!'}).expectStatus(422);
        await agent
            .post('authentication/password_reset_code')
            .header('X-Forwarded-For', nextIp())
            .body({email})
            .expectStatus(400);
    });

    it('the code limits follow the spam settings after a reset (settings changed in a test take effect)', async function () {
        // 先に 1 回使って、今の設定で数えるものを作っておく（reset で作り直さないと、新しい設定が効かない）
        await reset({ref: 'x', code: '000000', email: 'warm-up@example.com'}).expectStatus(400);
        // configUtils.restore() は設定全体を読み込んだ時の形に戻す（startGhost が決めた paths:contentPath も戻る）ので、
        // 変えたキーだけ元の値に戻す
        const key = 'spam:user_verification:freeRetries';
        const before = configUtils.config.get(key);
        configUtils.set(key, 1);
        await resetRateLimits();
        await dbUtils.truncate('brute');
        try {
            const statuses = [];
            for (let i = 0; i < 3; i += 1) {
                statuses.push((await reset({ref: 'x', code: '000000', email: 'reset-settings@example.com'})).statusCode);
            }
            assert.equal(statuses[2], 429);
        } finally {
            configUtils.set(key, before);
            await resetRateLimits();
        }
    });

    it('the send limit follows spam.user_reset after a reset (the send side, too)', async function () {
        // 先に 1 回送って、今の設定で数えるものを作っておく（この試験だけ回しても、reset で作り直さないと落ちるように）
        await agent
            .post('authentication/password_reset_code')
            .header('X-Forwarded-For', nextIp())
            .body({password_reset_code: [{email: 'send-warm-up@example.com'}]})
            .expectStatus(200);
        const key = 'spam:user_reset:freeRetries';
        const before = configUtils.config.get(key);
        configUtils.set(key, 1);
        await resetRateLimits();
        await dbUtils.truncate('brute');
        try {
            const statuses = [];
            for (let i = 0; i < 3; i += 1) {
                // IP を毎回変える: 数えているのはメールごとの上限
                const res = await agent
                    .post('authentication/password_reset_code')
                    .header('X-Forwarded-For', nextIp())
                    .body({password_reset_code: [{email: 'send-settings@example.com'}]});
                statuses.push(res.statusCode);
            }
            assert.deepEqual(statuses.slice(0, 2), [200, 200]);
            assert.equal(statuses[2], 429);
        } finally {
            configUtils.set(key, before);
            await resetRateLimits();
            await dbUtils.truncate('brute');
        }
    });

    it('limits sending per email even when the IP changes', async function () {
        let last;
        for (let i = 0; i < 6; i += 1) {
            last = await agent
                .post('authentication/password_reset_code')
                .header('X-Forwarded-For', nextIp())
                .body({password_reset_code: [{email: 'send-limit@example.com'}]});
        }
        assert.equal(last.statusCode, 429);
        // 上限の文は 6 桁のコードの文（パスワード再設定の試行の文ではない。#63 の brute.js codeLimiter）
        assert.match(last.body.errors[0].message, /Too many codes requested/);
    });

    it('limits tries per email even when the IP changes, and per IP across emails', async function () {
        let last = 0;
        let limited;
        for (let i = 0; i < 6; i += 1) {
            limited = await reset({ref: 'x', code: '000000'});
            last = limited.statusCode;
        }
        assert.equal(last, 429);
        assert.match(limited.body.errors[0].message, /Too many tries with the code/);

        const ip = nextIp();
        for (let i = 0; i < 6; i += 1) {
            last = (await reset({ref: 'x', code: '000000', email: `guess${i}@example.com`}, ip)).statusCode;
        }
        assert.equal(last, 429);
    });
});
