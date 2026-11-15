// メールのロゴを、Ghost の元のロゴ（static.ghost.org の orb）から front のロゴに替える（転送なし）。
// 順: front の /settings で選んだロゴ（my_config）→ <front>/brand/<TENANT>/apple-touch-icon.png → <front>/apple-touch-icon-180.png。
// front の URL（メールのリンクと同じ FRONT_END_URL を先、無ければ GHOST_FRONT_END_URL など）も選んだロゴも無いときは、今までの Ghost のロゴのまま。
const assert = require('assert/strict');
const path = require('path');
const sinon = require('sinon');
const settingsCache = require('../../../../../core/shared/settings-cache');

const {getFrontLogoUrl, siteIconOrFrontLogo, chosenLogoUrl} = require('../../../../../core/server/services/lib/front-logo');
const EmailContentGenerator = require('../../../../../core/server/services/lib/EmailContentGenerator');
const importerTemplate = require('../../../../../core/server/data/importer/email-template');
const membersImporterTemplate = require('../../../../../core/server/services/members/importer/email-template');
const StaffServiceEmails = require('../../../../../core/server/services/staff/StaffServiceEmails');

const SERVER = path.resolve(__dirname, '../../../../../core/server');
const FRONT = 'https://front.example.com';
const FRONT_LOGO = `${FRONT}/apple-touch-icon-180.png`;
const CHOSEN = 'https://cdn.example.com/60-think/images/logo.png';
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
    let myConfig;

    beforeEach(function () {
        // Ghost の設定 my_config（front の /settings で選んだロゴ）。試験ごとに決める
        myConfig = null;
        const realGet = settingsCache.get.bind(settingsCache);
        sinon.stub(settingsCache, 'get').callsFake((key, options) => (key === 'my_config' ? myConfig : realGet(key, options)));
        saved = {};
        for (const key of ['FRONT_END_URL', 'GHOST_FRONT_END_URL', 'MEMBERS_FRONTEND_URL', 'FRONTEND_URL', 'NEXT_PUBLIC_FRONT_URL', 'TENANT']) {
            saved[key] = process.env[key];
            delete process.env[key];
        }
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

    describe('getFrontLogoUrl', function () {
        it('uses FRONT_END_URL first (the same host as the mail links), without a trailing slash', function () {
            assert.equal(getFrontLogoUrl({GHOST_FRONT_END_URL: 'https://a.example.com/', FRONT_END_URL: 'https://b.example.com//'}), 'https://b.example.com/apple-touch-icon-180.png');
        });

        it('then GHOST_FRONT_END_URL, then the members front URL names (as services/members/frontend-url.js)', function () {
            assert.equal(getFrontLogoUrl({GHOST_FRONT_END_URL: 'https://a.example.com', MEMBERS_FRONTEND_URL: 'https://m.example.com'}), 'https://a.example.com/apple-touch-icon-180.png');
            assert.equal(getFrontLogoUrl({MEMBERS_FRONTEND_URL: 'https://m.example.com', FRONTEND_URL: 'https://f.example.com'}), 'https://m.example.com/apple-touch-icon-180.png');
            assert.equal(getFrontLogoUrl({FRONTEND_URL: 'https://f.example.com'}), 'https://f.example.com/apple-touch-icon-180.png');
            assert.equal(getFrontLogoUrl({NEXT_PUBLIC_FRONT_URL: 'https://n.example.com'}), 'https://n.example.com/apple-touch-icon-180.png');
            assert.equal(getFrontLogoUrl({FRONT_END_URL: '  ', GHOST_FRONT_END_URL: 'https://a.example.com'}), 'https://a.example.com/apple-touch-icon-180.png');
        });

        it('siteIconOrFrontLogo: the site icon, else the front logo, else the given Ghost logo (2FA, staff notices)', function () {
            assert.equal(siteIconOrFrontLogo('https://ghost.test/icon.png', 'orb'), 'https://ghost.test/icon.png');
            assert.equal(siteIconOrFrontLogo(null, 'orb'), 'orb');
            assert.equal(siteIconOrFrontLogo(null), null);
            process.env.FRONT_END_URL = FRONT;
            assert.equal(siteIconOrFrontLogo(null, 'orb'), FRONT_LOGO);
            assert.equal(siteIconOrFrontLogo('https://ghost.test/icon.png', 'orb'), 'https://ghost.test/icon.png');
        });

        it('with TENANT, points straight at <front>/brand/<TENANT>/apple-touch-icon.png (no redirect; the front names its sets after the tenants)', function () {
            const front = {FRONT_END_URL: 'https://front.example.com/'};
            for (const tenant of ['60-think', 'janabiz', 'thinkestate', 'new-tenant']) {
                assert.equal(getFrontLogoUrl({...front, TENANT: ` ${tenant} `}), `https://front.example.com/brand/${tenant}/apple-touch-icon.png`);
            }
        });

        it('without TENANT, or with one that is not a tenant name, uses the common <front>/apple-touch-icon-180.png', function () {
            const front = {FRONT_END_URL: 'https://front.example.com'};
            assert.equal(getFrontLogoUrl(front), 'https://front.example.com/apple-touch-icon-180.png');
            for (const tenant of ['../x', 'a/b', 'a b', '"x', '-x']) {
                assert.equal(getFrontLogoUrl({...front, TENANT: tenant}), 'https://front.example.com/apple-touch-icon-180.png', tenant);
            }
            // TENANT だけでは front の URL にならない
            assert.equal(getFrontLogoUrl({TENANT: 'janabiz'}), null);
        });

        it('the logo chosen in the front\'s /settings comes first (logo image, else favicon image), even without the front URL', function () {
            const env = {FRONT_END_URL: FRONT, TENANT: 'janabiz'};
            assert.equal(getFrontLogoUrl(env, JSON.stringify({logo: {mode: 'image', imageUrl: CHOSEN}, favicon: {imageUrl: 'https://cdn.example.com/f.png'}})), CHOSEN);
            assert.equal(getFrontLogoUrl(env, JSON.stringify({logo: {mode: 'icon', imageUrl: CHOSEN}, favicon: {imageUrl: 'https://cdn.example.com/f.png'}})), 'https://cdn.example.com/f.png');
            assert.equal(getFrontLogoUrl({}, JSON.stringify({logo: {mode: 'image', imageUrl: CHOSEN}})), CHOSEN);
            // 設定のキャッシュから読む（引数を省いたとき）
            myConfig = JSON.stringify({logo: {mode: 'image', imageUrl: CHOSEN}});
            assert.equal(getFrontLogoUrl(env), CHOSEN);
        });

        it('a chosen image that mail cannot show is skipped (not absolute http(s), .ico, .svg, broken JSON)', function () {
            for (const config of [
                null, '', 'not json', '"x"', '{}',
                JSON.stringify({logo: {mode: 'default', imageUrl: CHOSEN}}),
                JSON.stringify({logo: {mode: 'image', imageUrl: '/content/images/logo.png'}}),
                JSON.stringify({logo: {mode: 'image', imageUrl: 'javascript:alert(1)'}}),
                JSON.stringify({logo: {mode: 'image', imageUrl: 'https://cdn.example.com/x.png"><script>'}}),
                JSON.stringify({favicon: {imageUrl: 'https://cdn.example.com/favicon.ico'}}),
                JSON.stringify({logo: {mode: 'image', imageUrl: 'https://cdn.example.com/logo.SVG?v=1'}})
            ]) {
                assert.equal(chosenLogoUrl(config), null, String(config));
            }
            assert.equal(getFrontLogoUrl({FRONT_END_URL: FRONT}, JSON.stringify({favicon: {imageUrl: 'https://cdn.example.com/favicon.ico'}})), FRONT_LOGO);
        });

        it('never throws, so a mail is always sent (a broken setting or env gives null = the Ghost logo)', function () {
            const throwing = new Proxy({}, {get() {
                throw new Error('boom');
            }});
            assert.equal(getFrontLogoUrl(throwing, null), null);
            assert.equal(getFrontLogoUrl(null, null), null);
            assert.equal(getFrontLogoUrl({FRONT_END_URL: FRONT}, {logo: throwing}), null);
            settingsCache.get.callsFake(() => {
                throw new Error('settings not ready');
            });
            assert.equal(getFrontLogoUrl({FRONT_END_URL: FRONT, TENANT: 'janabiz'}), `${FRONT}/brand/janabiz/apple-touch-icon.png`);
            assert.equal(siteIconOrFrontLogo(null, 'orb'), 'orb');
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

            it('with TENANT, shows that tenant\'s image directly (no redirect)', async function () {
                process.env.FRONT_END_URL = FRONT;
                process.env.TENANT = 'janabiz';
                const {html} = await render();
                assert.ok(html.includes(`<img src="${FRONT}/brand/janabiz/apple-touch-icon.png"`), 'tenant logo');
                assert.ok(!html.includes(FRONT_LOGO));
            });

            it('shows the logo chosen in the front\'s /settings first', async function () {
                process.env.FRONT_END_URL = FRONT;
                process.env.TENANT = 'janabiz';
                myConfig = JSON.stringify({logo: {mode: 'image', imageUrl: CHOSEN}});
                const {html} = await render();
                assert.ok(html.includes(`<img src="${CHOSEN}"`), 'chosen logo');
                assert.ok(!html.includes('/brand/'));
                assert.doesNotMatch(html, ORB);
            });

            it('is still made, with the Ghost logo, when reading the logo setting fails', async function () {
                process.env.FRONT_END_URL = FRONT;
                settingsCache.get.callsFake((key) => {
                    if (key === 'my_config') {
                        throw new Error('settings not ready');
                    }
                });
                const {html} = await render();
                assert.ok(html.includes(`<img src="${FRONT_LOGO}"`), 'front logo');
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
