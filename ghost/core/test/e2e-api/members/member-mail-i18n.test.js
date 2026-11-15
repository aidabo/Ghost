// 会員のメール（ログイン・登録のリンク＋6 桁、メールアドレスの変更の確認）を、front が送った画面の言葉で
// （jibunsee-react docs/planning/mail-i18n.md の M1・M2、D7）。無い・言葉の形でない・ja/en/zh 以外はサイトの言葉（試験では en）。
const assert = require('assert/strict');
const DomainEvents = require('@tryghost/domain-events');
const {agentProvider, mockManager, fixtureManager, dbUtils} = require('../../utils/e2e-framework');
const settingsCache = require('../../../core/shared/settings-cache');
const spamPrevention = require('../../../core/server/web/shared/middleware/api/spam-prevention');
const membersService = require('../../../core/server/services/members');

let membersAgent;
let ipCounter = 0;
function nextIp() {
    ipCounter += 1;
    return `10.11.${Math.floor(ipCounter / 250)}.${(ipCounter % 250) + 1}`;
}

async function sendMagicLink(body) {
    await membersAgent.post('/api/send-magic-link')
        .header('X-Forwarded-For', nextIp())
        .body({email: 'member1@test.com', emailType: 'signin', ...body})
        .expectStatus(201);
}

describe('Member mails in the screen\'s language', function () {
    let mailReceiver;
    let siteTitle;

    before(async function () {
        const agents = await agentProvider.getAgentsForMembers();
        membersAgent = agents.membersAgent;
        await fixtureManager.init('members');
    });

    beforeEach(async function () {
        mailReceiver = mockManager.mockMail();
        spamPrevention.reset();
        await dbUtils.truncate('brute');
        settingsCache.set('members_signup_access', {value: 'all'});
        siteTitle = settingsCache.get('title');
    });

    afterEach(function () {
        mockManager.restore();
    });

    it('the sign in link mail is in ja / zh / en from the screen', async function () {
        for (const [locale, subject, greeting] of [
            ['ja', `🔑 ${siteTitle}へのログインリンクです`, 'こんにちは'],
            ['zh', `🔑 为 ${siteTitle} 准备的安全登录链接`, '你好，'],
            ['en', `🔑 Secure sign in link for ${siteTitle}`, 'Hey there,']
        ]) {
            mailReceiver = mockManager.mockMail();
            await sendMagicLink({locale});
            const mail = mailReceiver.getSentEmail(0);
            assert.equal(mail.subject, subject, locale);
            assert.ok(mail.html.includes(greeting), `${locale}: html`);
            assert.ok(mail.text.includes(greeting), `${locale}: text`);
            mockManager.restore();
        }
    });

    it('the 6-digit code part is in the screen\'s language too', async function () {
        await sendMagicLink({locale: 'zh', includeOTC: true});
        const mail = mailReceiver.getSentEmail(0);
        assert.match(mail.subject, new RegExp(`^\\d{6} 是 ${siteTitle} 的登录验证码$`));
        assert.match(mail.text, /^验证码：\d{6}/);
        assert.ok(mail.html.includes('data-otc'), 'code block');
    });

    it('without a locale, with another language, or with something that is not a language: the site\'s language (en)', async function () {
        for (const locale of [undefined, 'fr', '<b>ja</b>', 123]) {
            mailReceiver = mockManager.mockMail();
            await sendMagicLink(locale === undefined ? {} : {locale});
            assert.equal(mailReceiver.getSentEmail(0).subject, `🔑 Secure sign in link for ${siteTitle}`, String(locale));
            mockManager.restore();
        }
    });

    it('the email change confirmation is in the screen\'s language', async function () {
        const member = await membersService.api.members.create({email: 'i18n-change@example.com', name: 'Member Test'});
        // 新しい会員のスタッフへのお知らせは後から送られる。待ってから進める（後の試験に混ざらないように）
        await DomainEvents.allSettled();
        const identity = await membersService.api.getMemberIdentityToken(member.get('transient_id'));
        await membersAgent.post('/api/member/email/')
            .body({email: 'i18n-changed@example.com', identity, locale: 'ja'})
            .expectStatus(201);
        // 会員を作ると、スタッフへのお知らせ（新しい会員）も送られる。宛先で確認のメールを選ぶ
        const mails = [];
        while (mailReceiver.getSentEmail(mails.length)) {
            mails.push(mailReceiver.getSentEmail(mails.length));
        }
        const mail = mails.find(m => m.to === 'i18n-changed@example.com');
        assert.ok(mail, 'the confirmation mail was sent');
        assert.equal(mail.subject, '📫 メールを更新して確認してください。');
        assert.ok(mail.html.includes('こんにちは'));
    });
});
