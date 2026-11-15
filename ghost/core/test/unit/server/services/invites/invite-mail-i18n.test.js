// 招待のメールを、招く人の画面の言葉（ja・en・zh）で（jibunsee-react docs/planning/mail-i18n.md の S2・S3）。
// 無い・ja/en/zh 以外はサイトの言葉。差し込む名前は HTML のエスケープをする。何が失敗してもメールは作る。
const assert = require('assert/strict');
const path = require('path');
const sinon = require('sinon');

const settingsCache = require('../../../../../core/shared/settings-cache');
const {mailT, mailLanguage} = require('../../../../../core/server/services/lib/mail-i18n');
const {FRONT_URL_ENV_NAMES} = require('../../../../../core/server/services/lib/front-logo');
const EmailContentGenerator = require('../../../../../core/server/services/lib/EmailContentGenerator');
const Invites = require('../../../../../core/server/services/invites/Invites');

const SITE = 'Mars <Times> & "Co"';

/** 本物の雛形で招待のメールを作り、送るはずだった中身を返す */
async function sendInvite({locale, user = {name: 'Aki <b>', email: 'aki@example.com'}}) {
    const generator = new EmailContentGenerator({
        getSiteTitle: () => SITE,
        getSiteUrl: () => 'http://ghost.test/',
        templatesDir: path.resolve(__dirname, '../../../../../core/server/services/mail/templates')
    });
    const sent = [];
    const invite = {id: 'i1', get: key => ({token: 'tok', email: 'new@example.com'}[key])};
    const invites = new Invites({
        settingsCache: {get: key => ({title: SITE}[key])},
        settingsHelpers: {getDefaultEmail: () => 'noreply@ghost.test', getDefaultEmailDomain: () => 'ghost.test'},
        mailService: {utils: {generateContent: options => generator.getContent(options)}},
        urlUtils: {urlFor: () => 'http://ghost.test/ghost/', urlJoin: (...parts) => parts.join('/')}
    });
    await invites.add({
        api: {mail: {send: async (payload) => {
            sent.push(payload.mail[0].message);
        }}},
        InviteModel: {
            findOne: async () => null,
            add: async () => invite,
            edit: async () => invite
        },
        invites: [{email: 'new@example.com', role_id: 'r1'}],
        options: {},
        user,
        code: {locale}
    });
    return sent[0];
}

describe('Invite mails in the screen\'s language', function () {
    let saved;

    beforeEach(function () {
        saved = {};
        for (const key of [...FRONT_URL_ENV_NAMES, 'TENANT']) {
            saved[key] = process.env[key];
            delete process.env[key];
        }
        process.env.FRONT_END_URL = 'https://front.test';
        // サイトの言葉は ja（60-think と同じ）
        const realGet = settingsCache.get.bind(settingsCache);
        sinon.stub(settingsCache, 'get').callsFake((key, options) => (key === 'locale' ? 'ja' : realGet(key, options)));
    });

    afterEach(function () {
        sinon.restore();
        for (const [key, value] of Object.entries(saved)) {
            if (value === undefined) {
                delete process.env[key];
            } else {
                process.env[key] = value;
            }
        }
    });

    describe('mailLanguage / mailT', function () {
        it('uses ja / en / zh from the screen, else the site\'s language, else en', function () {
            assert.equal(mailLanguage('ja', 'en'), 'ja');
            assert.equal(mailLanguage('EN', 'ja'), 'en');
            assert.equal(mailLanguage('zh-CN', 'ja'), 'zh');
            assert.equal(mailLanguage('fr', 'ja'), 'ja');
            assert.equal(mailLanguage(undefined, 'de'), 'de');
            assert.equal(mailLanguage('', ''), 'en');
        });

        it('keeps each language separate (one request does not change another\'s language)', function () {
            const ja = mailT('ja');
            const zh = mailT('zh');
            const en = mailT('en');
            assert.equal(ja('Have fun, and good luck!'), 'どうぞお楽しみください。');
            assert.equal(zh('Have fun, and good luck!'), '祝您使用愉快！');
            assert.equal(en('Have fun, and good luck!'), 'Have fun, and good luck!');
            assert.equal(ja('Have fun, and good luck!'), 'どうぞお楽しみください。');
        });

        it('escapes inserted values unless asked not to', function () {
            const t = mailT('en');
            assert.equal(t('You have been invited to join {{blogName}}', {blogName: '<b>'}), 'You have been invited to join &lt;b&gt;');
            assert.equal(t('You have been invited to join {{blogName}}', {blogName: '<b>', interpolation: {escapeValue: false}}), 'You have been invited to join <b>');
        });
    });

    for (const [locale, subject, lead, button, help] of [
        ['ja', 'Aki <b> さんから Mars <Times> & "Co" への招待が届きました', 'Aki &lt;b&gt; さんが、あなたを Mars &lt;Times&gt; &amp; &quot;Co&quot; に招待しました。', 'アカウントを有効にする', 'にお問い合わせください。'],
        ['en', 'Aki <b> has invited you to join Mars <Times> & "Co"', 'Aki &lt;b&gt; has invited you to join Mars &lt;Times&gt; &amp; &quot;Co&quot;.', 'Click here to activate your account', 'for assistance.'],
        ['zh', 'Aki <b> 邀请您加入 Mars <Times> & "Co"', 'Aki &lt;b&gt; 邀请您加入 Mars &lt;Times&gt; &amp; &quot;Co&quot;。', '激活账户', '请联系']
    ]) {
        it(`a staff invite from a ${locale} screen is in ${locale} (subject, body, button, help with the email link)`, async function () {
            const mail = await sendInvite({locale});
            assert.equal(mail.subject, subject);
            assert.ok(mail.html.includes(lead), 'lead');
            assert.ok(mail.html.includes(`>${button}</a>`), 'button');
            assert.ok(mail.html.includes(help), 'help');
            assert.ok(mail.html.includes('<a href="mailto:aki@example.com" style="color: #15212A;">aki@example.com</a>'), 'email link');
            assert.ok(!mail.html.includes('<b>'), 'the name is escaped in the html');
            assert.ok(mail.text.includes(button), 'text version');
            // 見出しと、サイトと宛先のリンクを持つ一番下の文も訳す
            const footer = {ja: 'このメールは ', en: 'This email was sent from ', zh: '此邮件由 '}[locale];
            assert.ok(mail.html.includes(footer), 'footer');
            assert.ok(mail.html.includes('<a href="mailto:new@example.com" style="color: #738A94;">new@example.com</a>'), 'footer email link');
            if (locale !== 'en') {
                for (const english of ['has invited you', 'Click here', 'Have fun', 'If you have trouble', 'This email was sent', '>Welcome<']) {
                    assert.ok(!mail.html.includes(english), `no English left: ${english}`);
                }
            }
        });
    }

    it('without a locale (or fr), the mail is in the site\'s language (ja)', async function () {
        for (const locale of [undefined, 'fr']) {
            const mail = await sendInvite({locale});
            assert.ok(mail.subject.endsWith('への招待が届きました'), String(locale));
        }
    });

    it('an invite made with an API key (no person) is translated too', async function () {
        const mail = await sendInvite({locale: 'zh', user: {}});
        assert.equal(mail.subject, '您受邀加入 Mars <Times> & "Co"');
        assert.ok(mail.html.includes('您受邀以工作人员身份加入 Mars &lt;Times&gt; &amp; &quot;Co&quot;。'));
        assert.ok(!mail.html.includes('请联系'), 'no help line without a person');
        assert.ok(mail.html.includes('此邮件由 '), 'footer');
    });

    it('the mail is still made (in English) if the language table cannot be used', async function () {
        const i18n = require('@tryghost/i18n');
        const cacheKey = require.resolve('@tryghost/i18n');
        const real = require.cache[cacheKey].exports;
        require.cache[cacheKey].exports = () => {
            throw new Error('broken');
        };
        try {
            // 新しい言葉（まだ覚えていない）で、表が使えないとき
            const t = mailT('xx-broken', 'xx-broken');
            assert.equal(t('You have been invited to join {{blogName}}', {blogName: '<b>'}), 'You have been invited to join &lt;b&gt;');
        } finally {
            require.cache[cacheKey].exports = real;
        }
        assert.equal(typeof i18n, 'function');
    });
});
