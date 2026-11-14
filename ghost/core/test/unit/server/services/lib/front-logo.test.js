// メールのロゴを、Ghost の元のロゴ（static.ghost.org の orb）から front のロゴ（<front>/apple-touch-icon.png）に替える。
// front の URL（GHOST_FRONT_END_URL、無ければ FRONT_END_URL）が無いときは、今までの Ghost のロゴのまま。
const assert = require('assert/strict');
const path = require('path');
const Handlebars = require('handlebars');
const fs = require('fs');

const {getFrontLogoUrl} = require('../../../../../core/server/services/lib/front-logo');
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
        saved = {GHOST_FRONT_END_URL: process.env.GHOST_FRONT_END_URL, FRONT_END_URL: process.env.FRONT_END_URL};
        delete process.env.GHOST_FRONT_END_URL;
        delete process.env.FRONT_END_URL;
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
        it('uses GHOST_FRONT_END_URL first, then FRONT_END_URL, without a trailing slash', function () {
            assert.equal(getFrontLogoUrl({GHOST_FRONT_END_URL: 'https://a.example.com/', FRONT_END_URL: 'https://b.example.com'}), 'https://a.example.com/apple-touch-icon.png');
            assert.equal(getFrontLogoUrl({FRONT_END_URL: 'https://b.example.com//'}), 'https://b.example.com/apple-touch-icon.png');
        });

        it('is null without a usable http(s) URL (the caller keeps the Ghost logo)', function () {
            assert.equal(getFrontLogoUrl({}), null);
            assert.equal(getFrontLogoUrl({FRONT_END_URL: '  '}), null);
            assert.equal(getFrontLogoUrl({FRONT_END_URL: 'front.example.com'}), null);
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

        it('the new free signup mail shows the front logo', async function () {
            process.env.FRONT_END_URL = FRONT;
            const service = emails(null);
            const {html} = await service.renderEmailTemplate('new-free-signup', {siteTitle: 'Blog', siteUrl: 'http://ghost.test/', siteIconUrl: service.getSiteIconUrl(), memberData: {name: 'M', email: 'm@example.com'}, toEmail: 'b@example.com', staffUrl: 'http://ghost.test/ghost/#/x'});
            assert.ok(html.includes(`src="${FRONT_LOGO}"`));
        });
    });

    it('the milestone mail uses the front logo, or the Ghost logo without it', function () {
        const source = fs.readFileSync(path.join(SERVER, 'services/staff/email-templates/new-milestone-received.hbs'), 'utf8');
        const hbs = Handlebars.create();
        hbs.registerHelper('date', () => '');
        // 部分の雛形（styles など）は空に（ここで見るのはロゴだけ）
        for (const [, name] of source.matchAll(/{{>\s*"?([\w/.-]+)"?/g)) {
            hbs.registerPartial(name, '');
        }
        hbs.registerPartial('milestones/100', '');
        const template = hbs.compile(source);
        const base = {siteTitle: 'Blog', siteUrl: 'http://ghost.test/', partial: 'milestones/100', toEmail: 'b@example.com', staffUrl: 'http://ghost.test/ghost/#/x'};

        const withFront = template({...base, frontLogoUrl: FRONT_LOGO});
        assert.ok(withFront.includes(`background="${FRONT_LOGO}"`));
        assert.ok(withFront.includes(`src="${FRONT_LOGO}"`));
        assert.doesNotMatch(withFront, ORB);

        assert.match(template({...base, frontLogoUrl: null}), ORB);
    });
});
