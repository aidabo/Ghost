// スタッフの招待・パスワード再設定のメールに、Ghost の名前（「is using Ghost」「No idea what Ghost is?」・ghost.org・
// 「Welcome to Ghost」）を出さない（利用者に Ghost を見せない。jibunsee-react docs/planning/mail-i18n.md の D6）。
// ロゴの最後の予備（static.ghost.org の画像の URL）は文ではないので残る。
const assert = require('assert/strict');
const path = require('path');
const EmailContentGenerator = require('../../../../../core/server/services/lib/EmailContentGenerator');

const generator = new EmailContentGenerator({
    getSiteTitle: () => 'Mars Times',
    getSiteUrl: () => 'http://ghost.test/',
    templatesDir: path.resolve(__dirname, '../../../../../core/server/services/mail/templates')
});

// ロゴの URL（src="…"）・リンクの href・text 版に入る画像やリンクの URL（[https://…]）を除いた文だけを見る
const visibleText = body => body.replace(/(src|href)="[^"]*"/g, '').replace(/https?:\/\/[^\s\]]+/g, '');

// front の URL があると、ロゴは front の画像になり ghost.org の URL が出ない。どちらでも同じ結果になるよう、ここでは外す
const FRONT_URL_ENV = ['FRONT_END_URL', 'GHOST_FRONT_END_URL', 'MEMBERS_FRONTEND_URL', 'FRONTEND_URL', 'NEXT_PUBLIC_FRONT_URL', 'TENANT'];

describe('Staff mails do not mention Ghost', function () {
    let saved;

    beforeEach(function () {
        saved = {};
        for (const key of FRONT_URL_ENV) {
            saved[key] = process.env[key];
            delete process.env[key];
        }
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
        ['invite-user', {blogName: 'Mars Times', invitedByName: 'Aki', invitedByEmail: 'aki@example.com', recipientEmail: 'b@example.com', resetLink: 'http://ghost.test/ghost/signup/x/'}, ['Aki has invited you to join', 'Mars Times']],
        ['invite-user-by-api-key', {blogName: 'Mars Times', recipientEmail: 'b@example.com', resetLink: 'http://ghost.test/ghost/signup/x/'}, ['You\'ve been invited to join', 'as a staff user.']],
        ['reset-password', {recipientEmail: 'b@example.com', resetUrl: 'http://ghost.test/ghost/reset/x/'}, ['<title>Mars Times</title>']]
    ]) {
        it(`${template}.html`, async function () {
            const {html, text} = await generator.getContent({template, data});
            for (const body of [visibleText(html), visibleText(text)]) {
                assert.doesNotMatch(body, /Ghost|ghost\.org/, `${template}: no Ghost in the mail`);
            }
            for (const part of expected) {
                assert.ok(html.includes(part), `${template}: ${part}`);
            }
            assert.ok(!html.includes('..'), `${template}: no doubled period`);
        });
    }
});
