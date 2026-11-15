// スタッフの招待・パスワード再設定のメールに、Ghost の名前（「is using Ghost」「No idea what Ghost is?」・ghost.org・
// 「Welcome to Ghost」）を出さない（利用者に Ghost を見せない。jibunsee-react docs/planning/mail-i18n.md の D6）。
// ロゴの最後の予備（static.ghost.org の画像の URL）は文ではないので残る。
const assert = require('assert/strict');
const path = require('path');
const EmailContentGenerator = require('../../../../../core/server/services/lib/EmailContentGenerator');
const {FRONT_URL_ENV_NAMES} = require('../../../../../core/server/services/lib/front-logo');
const {inviteMailCopy} = require('../../../../../core/server/services/invites/invite-mail-copy');

const generator = new EmailContentGenerator({
    getSiteTitle: () => 'Mars Times',
    getSiteUrl: () => 'http://ghost.test/',
    templatesDir: path.resolve(__dirname, '../../../../../core/server/services/mail/templates')
});

// ロゴは front の画像にする（下で FRONT_END_URL を固定）。ロゴの最後の予備（static.ghost.org の画像）が出ないので、
// リンク（href と text 版の [URL]）に ghost.org が戻ったら検出できる。html の src（画像）だけは文ではないので除く
const withoutImageSrc = body => body.replace(/src="[^"]*"/g, '');
const FRONT = 'https://front.test';

// 手元の env に左右されないよう、front の URL の env を全部外してから FRONT_END_URL だけ固定する
const FRONT_URL_ENV = [...FRONT_URL_ENV_NAMES, 'TENANT'];

describe('Staff mails do not mention Ghost', function () {
    let saved;

    beforeEach(function () {
        saved = {};
        for (const key of FRONT_URL_ENV) {
            saved[key] = process.env[key];
            delete process.env[key];
        }
        process.env.FRONT_END_URL = FRONT;
    });

    afterEach(function () {
        for (const [key, value] of Object.entries(saved)) {
            if (value === undefined) {
                delete process.env[key];
            } else {
                process.env[key] = value;
            }
        }
    });

    for (const [template, data, expected] of [
        ['invite-user', {blogName: 'Mars Times', invitedByName: 'Aki', invitedByEmail: 'aki@example.com', recipientEmail: 'b@example.com', resetLink: 'http://ghost.test/ghost/signup/x/', copy: inviteMailCopy({locale: 'en', blogName: 'Mars Times', invitedByName: 'Aki', invitedByEmail: 'aki@example.com'})}, ['Aki has invited you to join Mars Times.', 'This email was sent from ']],
        ['invite-user-by-api-key', {blogName: 'Mars Times', recipientEmail: 'b@example.com', resetLink: 'http://ghost.test/ghost/signup/x/', copy: inviteMailCopy({locale: 'en', blogName: 'Mars Times'})}, ['You\'ve been invited to join Mars Times as a staff user.', 'This email was sent from ']],
        ['reset-password', {recipientEmail: 'b@example.com', resetUrl: 'http://ghost.test/ghost/reset/x/'}, ['<title>Mars Times</title>']]
    ]) {
        it(`${template}.html`, async function () {
            const {html, text} = await generator.getContent({template, data});
            for (const body of [withoutImageSrc(html), text]) {
                assert.doesNotMatch(body, /Ghost|ghost\.org/, `${template}: no Ghost in the mail`);
            }
            for (const part of expected) {
                assert.ok(html.includes(part), `${template}: ${part}`);
            }
            assert.ok(!html.includes('..'), `${template}: no doubled period`);
            assert.ok(html.includes(`${FRONT}/apple-touch-icon-180.png`), `${template}: the front logo, not Ghost's`);
        });
    }
});
