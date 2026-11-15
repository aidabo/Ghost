// メールのロゴを、Ghost の元のロゴ（static.ghost.org の orb）から front のロゴ（<front>/apple-touch-icon.png）に替える。
// front の URL（メールのリンクと同じ FRONT_END_URL を先、無ければ GHOST_FRONT_END_URL など）が無いときは、今までの Ghost のロゴのまま。
const assert = require('assert/strict');
const path = require('path');

const {getFrontLogoUrl, siteIconOrFrontLogo, TENANT_LOGO_PATHS} = require('../../../../../core/server/services/lib/front-logo');
const EmailContentGenerator = require('../../../../../core/server/services/lib/EmailContentGenerator');
const importerTemplate = require('../../../../../core/server/data/importer/email-template');
const membersImporterTemplate = require('../../../../../core/server/services/members/importer/email-template');
const StaffServiceEmails = require('../../../../../core/server/services/staff/StaffServiceEmails');

const SERVER = path.resolve(__dirname, '../../../../../core/server');
const FRONT = 'https://front.example.com';
const FRONT_LOGO = `${FRONT}/apple-touch-icon.png`;
const ORB = /https:\/\/static\.ghost\.org\/v[45]\.0\.0\/images\/(ghost-orb|orb-email-head)/;

// 雛形ごとの中身（雛形の {{ }} が使う値）
const TEMPLATES = [
    {dir: 'services/mail/templates', template: 'invite-user', data: {blogName: 'Blog', invitedByName: 'A', invitedByEmail: 'a@example.com', recipientEmail: 'b@example.com', resetLink: 'http://ghost.test/ghost/signup/x/'}},
    {dir: 'services/mail/templates', template: 'invite-user-by-api-key', data: {blogName: 'Blog', recipientEmail: 'b@example.com', resetLink: 'http://ghost.test/ghost/signup/x/'}},
    {dir: 'services/mail/templates', template: 'reset-password', data: {recipientEmail: 'b@example.com', resetUrl: 'http://ghost.test/ghost/reset/x/'}},
    {dir: 'services/mail/templates', template: 'welcome', data: {ownerEmail: 'b@example.com'}},
    {dir: 'services/api-version-compatibility/templates', template: 'generic-mismatch', data: {acceptVersion: 'v5', contentVersion: 'v6', clientName: 'Zap', recipientEmail: 'b@example.com', requestURL: '/x'}},
    {dir: 'services/api-version-compatibility/templates', template: 'zapier-mismatch', data: {recipientEmail: 'b@example.com'}}
];

describe('Mail: the front logo instead of the Ghost logo', function () {
    let saved;

    beforeEach(function () {
        saved = {};
        for (const key of ['FRONT_END_URL', 'GHOST_FRONT_END_URL', 'MEMBERS_FRONTEND_URL', 'FRONTEND_URL', 'NEXT_PUBLIC_FRONT_URL', 'TENANT']) {
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

    describe('getFrontLogoUrl', function () {
        it('uses FRONT_END_URL first (the same host as the mail links), without a trailing slash', function () {
            assert.equal(getFrontLogoUrl({GHOST_FRONT_END_URL: 'https://a.example.com/', FRONT_END_URL: 'https://b.example.com//'}), 'https://b.example.com/apple-touch-icon.png');
        });

        it('then GHOST_FRONT_END_URL, then the members front URL names (as services/members/frontend-url.js)', function () {
            assert.equal(getFrontLogoUrl({GHOST_FRONT_END_URL: 'https://a.example.com', MEMBERS_FRONTEND_URL: 'https://m.example.com'}), 'https://a.example.com/apple-touch-icon.png');
            assert.equal(getFrontLogoUrl({MEMBERS_FRONTEND_URL: 'https://m.example.com', FRONTEND_URL: 'https://f.example.com'}), 'https://m.example.com/apple-touch-icon.png');
            assert.equal(getFrontLogoUrl({FRONTEND_URL: 'https://f.example.com'}), 'https://f.example.com/apple-touch-icon.png');
            assert.equal(getFrontLogoUrl({NEXT_PUBLIC_FRONT_URL: 'https://n.example.com'}), 'https://n.example.com/apple-touch-icon.png');
            assert.equal(getFrontLogoUrl({FRONT_END_URL: '  ', GHOST_FRONT_END_URL: 'https://a.example.com'}), 'https://a.example.com/apple-touch-icon.png');
        });

        it('siteIconOrFrontLogo: the site icon, else the front logo, else the given Ghost logo (2FA, staff notices)', function () {
            assert.equal(siteIconOrFrontLogo('https://ghost.test/icon.png', 'orb'), 'https://ghost.test/icon.png');
            assert.equal(siteIconOrFrontLogo(null, 'orb'), 'orb');
            assert.equal(siteIconOrFrontLogo(null), null);
            process.env.FRONT_END_URL = FRONT;
            assert.equal(siteIconOrFrontLogo(null, 'orb'), FRONT_LOGO);
            assert.equal(siteIconOrFrontLogo('https://ghost.test/icon.png', 'orb'), 'https://ghost.test/icon.png');
        });

        it('with TENANT, points straight at that tenant\'s image (no redirect), the same files as the front\'s siteIcons.ts', function () {
            const front = {FRONT_END_URL: 'https://front.example.com/'};
            assert.equal(getFrontLogoUrl({...front, TENANT: '60-think'}), 'https://front.example.com/brand/60-think/apple-touch-icon-180.png');
            assert.equal(getFrontLogoUrl({...front, TENANT: 'thinkestate'}), 'https://front.example.com/brand/think-estate/apple-touch-icon.png');
            assert.equal(getFrontLogoUrl({...front, TENANT: 'janabiz'}), 'https://front.example.com/brand/mars-times/apple-touch-icon.png');
            // front の組の名前・前後の空白・大文字でも
            assert.equal(getFrontLogoUrl({...front, TENANT: ' Mars-Times '}), 'https://front.example.com/brand/mars-times/apple-touch-icon.png');
            assert.equal(getFrontLogoUrl({...front, TENANT: 'think-estate'}), 'https://front.example.com/brand/think-estate/apple-touch-icon.png');
        });

        it('without TENANT or with an unknown one, uses the front\'s /apple-touch-icon.png (the front redirects to its own set)', function () {
            const front = {FRONT_END_URL: 'https://front.example.com'};
            assert.equal(getFrontLogoUrl(front), 'https://front.example.com/apple-touch-icon.png');
            assert.equal(getFrontLogoUrl({...front, TENANT: 'other'}), 'https://front.example.com/apple-touch-icon.png');
            assert.equal(getFrontLogoUrl({...front, TENANT: 'constructor'}), 'https://front.example.com/apple-touch-icon.png');
            // TENANT だけでは front の URL にならない
            assert.equal(getFrontLogoUrl({TENANT: 'janabiz'}), null);
        });

        it('the paths match image files in the front (when the front checkout is next to this one)', function () {
            const fs = require('fs');
            const brand = path.resolve(__dirname, '../../../../../../../../01-ghost-front/apps/host/public');
            if (!fs.existsSync(brand)) {
                this.skip();
            }
            for (const logoPath of Object.values(TENANT_LOGO_PATHS)) {
                assert.ok(fs.existsSync(path.join(brand, logoPath)), logoPath);
            }
        });

        it('is null without a usable http(s) URL (the caller keeps the Ghost logo)', function () {
            assert.equal(getFrontLogoUrl({}), null);
            assert.equal(getFrontLogoUrl({FRONT_END_URL: '  '}), null);
            assert.equal(getFrontLogoUrl({FRONT_END_URL: 'front.example.com'}), null);
            // 最初に値のある名前だけを使う（壊れた FRONT_END_URL の後ろの GHOST_FRONT_END_URL には進まない）
            assert.equal(getFrontLogoUrl({FRONT_END_URL: 'front.example.com', GHOST_FRONT_END_URL: 'https://a.example.com'}), null);
            assert.equal(getFrontLogoUrl({FRONT_END_URL: 'javascript:alert(1)'}), null);
            assert.equal(getFrontLogoUrl({FRONT_END_URL: 'https://x.example.com/"><script>'}), null);
        });
    });

    for (const {dir, template, data} of TEMPLATES) {
        describe(`${template}.html`, function () {
            const render = () => new EmailContentGenerator({
                getSiteTitle: () => 'Blog',
                getSiteUrl: () => 'http://ghost.test/',
                templatesDir: path.join(SERVER, dir)
            }).getContent({template, data});

            it('shows the front logo when the front URL is set', async function () {
                process.env.FRONT_END_URL = FRONT;
                const {html} = await render();
                assert.ok(html.includes(`<img src="${FRONT_LOGO}"`), 'front logo');
                assert.doesNotMatch(html, ORB);
            });

            it('keeps the Ghost logo when the front URL is not set', async function () {
                const {html} = await render();
                assert.match(html, ORB);
                assert.ok(!html.includes('apple-touch-icon'));
            });
        });
    }

    for (const [name, render] of [
        ['content import', () => importerTemplate({result: {problems: []}, siteUrl: 'http://ghost.test/', postsUrl: 'http://ghost.test/ghost/#/posts', emailRecipient: 'b@example.com'})],
        ['members import', () => membersImporterTemplate({result: {imported: 1, errors: []}, siteUrl: 'http://ghost.test/', membersUrl: 'http://ghost.test/ghost/#/members', emailRecipient: 'b@example.com'})]
    ]) {
        it(`the ${name} mail uses the front logo, or the Ghost logo without the front URL`, function () {
            process.env.GHOST_FRONT_END_URL = FRONT;
            const withFront = render();
            assert.ok(withFront.includes(`<img src="${FRONT_LOGO}"`));
            assert.doesNotMatch(withFront, ORB);

            delete process.env.GHOST_FRONT_END_URL;
            assert.match(render(), ORB);
        });
    }

    describe('staff mails that show the site icon (free signup, paid started/cancelled, donation, recommendation)', function () {
        const emails = icon => new StaffServiceEmails({blogIcon: {getIconUrl: () => icon}});

        it('keep the site icon when there is one', function () {
            process.env.FRONT_END_URL = FRONT;
            assert.equal(emails('https://ghost.test/content/images/icon.png').getSiteIconUrl(), 'https://ghost.test/content/images/icon.png');
        });

        it('use the front logo when the site has no icon', function () {
            process.env.FRONT_END_URL = FRONT;
            assert.equal(emails(null).getSiteIconUrl(), FRONT_LOGO);
        });

        it('show no logo (as before) when there is neither', function () {
            assert.equal(emails(null).getSiteIconUrl(), null);
        });

        // 本物の notify… を呼び、送るメールの html にロゴが入るかを見る（getSiteIconUrl の受け渡しまで確かめる）
        function wired(icon) {
            const sent = [];
            const service = new StaffServiceEmails({
                logging: {warn() {}},
                models: {User: {getEmailAlertUsers: async () => [{email: 'staff@example.com', slug: 'staff'}]}},
                mailer: {send: async (msg) => {
                    sent.push(msg);
                }},
                settingsHelpers: {getDefaultEmail: () => ({address: 'noreply@ghost.test', name: 'Blog'}), getDefaultEmailDomain: () => 'ghost.test'},
                settingsCache: {get: key => ({title: 'Blog', accent_color: '#000000', timezone: 'Etc/UTC'}[key])},
                blogIcon: {getIconUrl: () => icon},
                urlUtils: {
                    urlFor: () => 'http://ghost.test/ghost/',
                    urlJoin: (...parts) => parts.join('/'),
                    getSiteUrl: () => 'http://ghost.test/'
                },
                labs: {isSet: () => false}
            });
            return {service, sent};
        }

        it('the real free signup mail shows the front logo when the site has no icon', async function () {
            process.env.FRONT_END_URL = FRONT;
            const {service, sent} = wired(null);
            await service.notifyFreeMemberSignup({member: {name: 'M', email: 'm@example.com', created_at: new Date()}, attribution: null}, {});
            assert.equal(sent.length, 1);
            assert.ok(sent[0].html.includes(`src="${FRONT_LOGO}"`), 'front logo in the sent mail');
        });

        it('the real milestone mail: site icon first, then the front logo, then the Ghost logo', async function () {
            const milestone = {type: 'members', value: 100, emailSentAt: new Date()};
            process.env.FRONT_END_URL = FRONT;

            let {service, sent} = wired('https://ghost.test/icon.png');
            await service.notifyMilestoneReceived({milestone});
            assert.ok(sent[0].html.includes('src="https://ghost.test/icon.png"'));
            assert.doesNotMatch(sent[0].html, ORB);

            ({service, sent} = wired(null));
            await service.notifyMilestoneReceived({milestone});
            assert.ok(sent[0].html.includes(`src="${FRONT_LOGO}"`));
            assert.doesNotMatch(sent[0].html, ORB);

            delete process.env.FRONT_END_URL;
            ({service, sent} = wired(null));
            await service.notifyMilestoneReceived({milestone});
            assert.match(sent[0].html, ORB);
        });
    });
});
