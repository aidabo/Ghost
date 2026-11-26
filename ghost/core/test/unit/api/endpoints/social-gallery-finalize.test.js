// ギャラリーの finalize（POST /social/gallery/finalize）が受ける key の範囲。
// finalize はブラウザ・worker が送った storage_key / storage_url で
// social_media_assets の行を作る（同じ key の行があれば上書きする）。
// 受けるのは、同じ scope の値で presign したときに渡す範囲
// （<root>/gallery/<scope の folder>/<id>/…）の key だけ。範囲外・URL との食い違い・
// ほかの人の行の上書きは断る。
const assert = require('assert/strict');
const sinon = require('sinon');
const knex = require('knex');
const models = require('../../../../core/server/models');
const storage = require('../../../../core/server/adapters/storage');

const galleryPath = require.resolve('../../../../core/server/api/endpoints/social-gallery');
const staffScopePath = require.resolve('../../../../core/server/api/endpoints/utils/staff-scope');

const HOST = 'https://cdn.example.com';
const ROOT = 'content/media';
const YM = '2026/11';

const ME = '00000000000000000000aa01';
const OTHER = '00000000000000000000aa02';
const GROUP = '00000000000000000000bb01';
const PROPERTY = '00000000000000000000cc01';
const PROJECT = '00000000000000000000dd01';
const CHART_JOB = '00000000000000000000ee01';
const NEWS_JOB = '00000000000000000000ee02';
const DZI_JOB = '00000000000000000000ee03';

const ALIASES = {[ME]: 'me-alias', [OTHER]: 'other-alias'};

const makeStore = () => ({
    pathPrefix: ROOT,
    getTargetDir: base => `${base}/${YM}`,
    urlToPath: (url) => {
        let objectPath = url;
        if (objectPath.startsWith(HOST)) {
            objectPath = objectPath.replace(HOST, '');
        }
        return objectPath.startsWith('/') ? objectPath.substring(1) : objectPath;
    },
    getPresignedPutUrl: async ({key}) => ({uploadUrl: `https://bucket.example.com/${key}?sig`, key, url: `${HOST}/${key}`, headers: {}})
});

describe('Social gallery: finalize only takes keys of the caller\'s own upload area', function () {
    let db;
    let endpoint;
    let originalKnex;
    let store;
    let staffScope;

    before(async function () {
        models.init();
        // Fresh copies: other suites (staff-scope.test.js) reload these modules.
        delete require.cache[galleryPath];
        delete require.cache[staffScopePath];
        staffScope = require(staffScopePath);
        endpoint = require(galleryPath);
        db = knex({client: 'sqlite3', connection: {filename: ':memory:'}, useNullAsDefault: true});
        await db.schema.createTable('social_media_assets', (t) => {
            t.string('id').primary();
            ['storage_key', 'storage_key_hash', 'storage_url', 'thumbnail_url', 'thumbnail_storage_key',
                'original_filename', 'asset_type', 'owner_scope', 'user_id', 'member_id', 'group_id',
                'job_id', 'dzi_job_id', 'social_chart_id', 'chart_job_id', 'content_bundle_job_id',
                'news_job_id', 'project_id', 'property_id', 'tag_id', 'tag_slug'].forEach(c => t.string(c));
            t.dateTime('created_at');
            t.dateTime('updated_at');
        });
        await db.schema.createTable('social_ai_projects', (t) => {
            t.string('id').primary();
            t.string('user_id');
            t.string('group_id');
        });
        for (const name of ['social_ai_chart_jobs', 'social_ai_news_jobs']) {
            await db.schema.createTable(name, (t) => {
                ['id', 'user_id', 'project_id', 'group_id'].forEach(c => t.string(c));
            });
        }
        await db.schema.createTable('estate_property_media', (t) => {
            t.string('id').primary();
            ['property_id', 'media_id', 'media_type'].forEach(c => t.string(c));
            t.boolean('is_primary');
            t.integer('sort_order');
            t.dateTime('created_at');
            t.dateTime('updated_at');
        });
        originalKnex = models.Base.knex;
        models.Base.knex = db;
    });

    after(async function () {
        models.Base.knex = originalKnex;
        await db.destroy();
    });

    beforeEach(async function () {
        store = makeStore();
        sinon.stub(storage, 'getStorage').returns(store);
        sinon.stub(models.User, 'ensureMediaFolderAlias').callsFake(async id => ALIASES[id] || null);
        sinon.stub(models.SocialGroup, 'findOne').callsFake(async ({id}) => (id === GROUP ? {id} : null));
        sinon.stub(models.SocialGroup, 'canAccessGroup').resolves(true);
        sinon.stub(models.SocialGroup, 'ensureMediaFolderAlias').resolves('group-alias');
        sinon.stub(models.EstateProperty, 'findOne').callsFake(async ({id}) => (id === PROPERTY ? {id} : null));
        sinon.stub(models.EstatePropertyMedium, 'findOne').resolves(null);
        sinon.stub(staffScope, 'getStaffScope').resolves({isSystemAdmin: false});
        await db('social_media_assets').del();
        await db('social_ai_projects').del();
        await db('estate_property_media').del();
        await db('social_ai_projects').insert({id: PROJECT, user_id: ME, group_id: null});
        for (const name of ['social_ai_chart_jobs', 'social_ai_news_jobs']) {
            await db(name).del();
        }
        await db('social_ai_chart_jobs').insert({id: CHART_JOB, user_id: ME, project_id: null});
    });

    afterEach(function () {
        sinon.restore();
    });

    const finalize = (user, data) => endpoint.finalize.query({
        options: {context: user ? {user} : {}},
        data
    });
    const presign = (user, data) => endpoint.presign.query({
        options: {context: user ? {user} : {}},
        data: {content_type: 'image/png', filename: 'photo.png', ...data}
    });
    const keyed = key => ({storage_key: key, storage_url: `${HOST}/${key}`});
    const rowOf = key => db('social_media_assets').where({storage_key: key}).first();

    describe('the hole: someone else\'s key', function () {
        const OTHERS_KEY = `${ROOT}/gallery/users/other-alias/${YM}/family-photo-1234abcd.png`;
        const NEWS_KEY = `${ROOT}/gallery/news_jobs/${NEWS_JOB}/voice-0000aaaa.mp3`;

        it('a key in another user\'s area is refused (no presign needed to try), and the row keeps its owner', async function () {
            await finalize(OTHER, {...keyed(OTHERS_KEY), original_filename: 'family-photo.png'});
            assert.equal((await rowOf(OTHERS_KEY)).user_id, OTHER);

            await assert.rejects(finalize(ME, {...keyed(OTHERS_KEY), original_filename: 'mine.png'}), {errorType: 'ValidationError'});
            const row = await rowOf(OTHERS_KEY);
            assert.equal(row.user_id, OTHER);
            assert.equal(row.owner_scope, 'user');
            assert.equal(row.original_filename, 'family-photo.png');
        });

        it('a news job\'s worker output is not taken over, even through the news job\'s own folder', async function () {
            await db('social_media_assets').insert({
                id: '0000000000000000000000f1', storage_key: NEWS_KEY, storage_url: `${HOST}/${NEWS_KEY}`,
                owner_scope: 'news_jobs', user_id: null, news_job_id: NEWS_JOB
            });
            // From the user's own area: out of scope.
            await assert.rejects(finalize(ME, keyed(NEWS_KEY)), {errorType: 'ValidationError'});
            // Naming the news job so the key is "in scope": the row is someone else's.
            await assert.rejects(finalize(ME, {...keyed(NEWS_KEY), target: 'news_jobs', job_id: NEWS_JOB}), {errorType: 'ConflictError'});
            const row = await rowOf(NEWS_KEY);
            assert.equal(row.user_id, null);
            assert.equal(row.owner_scope, 'news_jobs');
        });

        it('two finalizes of the same key at once: one wins, the other gets 409, one row with the winner as owner', async function () {
            // A group's area is shared, so two members can name the same key.
            const key = `${ROOT}/gallery/groups/group-alias/${YM}/race-1234abcd.png`;
            const results = await Promise.allSettled([
                finalize(OTHER, {...keyed(key), group_id: GROUP, original_filename: 'theirs.png'}),
                finalize(ME, {...keyed(key), group_id: GROUP, original_filename: 'mine.png'})
            ]);
            const won = results.filter(r => r.status === 'fulfilled');
            const lost = results.filter(r => r.status === 'rejected');
            assert.equal(won.length, 1);
            assert.equal(lost.length, 1);
            assert.equal(lost[0].reason.errorType, 'ConflictError');
            const rows = await db('social_media_assets').where({storage_key: key});
            assert.equal(rows.length, 1);
            assert.equal(rows[0].user_id, won[0].value.data[0].user_id);
            assert.equal(rows[0].original_filename, won[0].value.data[0].user_id === OTHER ? 'theirs.png' : 'mine.png');
        });

        it('a member upload row is never taken over by staff', async function () {
            const key = `${ROOT}/gallery/users/me-alias/${YM}/member-1234abcd.png`;
            await db('social_media_assets').insert({id: '0000000000000000000000f5', storage_key: key, storage_url: `${HOST}/${key}`, owner_scope: 'user', user_id: ME, member_id: 'member-1'});
            await assert.rejects(finalize(ME, keyed(key)), {errorType: 'ConflictError'});
            assert.equal((await rowOf(key)).member_id, 'member-1');
        });

        it('a row in my area that another user owns (a different scope) is not overwritten', async function () {
            const key = `${ROOT}/gallery/users/me-alias/${YM}/a-1234abcd.png`;
            await db('social_media_assets').insert({id: '0000000000000000000000f2', storage_key: key, storage_url: `${HOST}/${key}`, owner_scope: 'group', user_id: OTHER, group_id: GROUP});
            await assert.rejects(finalize(ME, keyed(key)), {errorType: 'ConflictError'});
            const row = await rowOf(key);
            assert.equal(row.user_id, OTHER);
            assert.equal(row.group_id, GROUP);
        });
    });

    describe('refused shapes', function () {
        const MINE = `${ROOT}/gallery/users/me-alias/${YM}/a-1234abcd.png`;

        it('storage_key and storage_url that point at different files', async function () {
            await assert.rejects(finalize(ME, {storage_key: MINE, storage_url: `${HOST}/${ROOT}/gallery/users/other-alias/${YM}/x.png`}), {errorType: 'ValidationError'});
            await assert.rejects(finalize(ME, {storage_key: `${ROOT}/gallery/users/other-alias/${YM}/x.png`, storage_url: `${HOST}/${MINE}`}), {errorType: 'ValidationError'});
            // A URL on another host is not a file of this store.
            await assert.rejects(finalize(ME, {storage_key: MINE, storage_url: `https://evil.example.com/${MINE}`}), {errorType: 'ValidationError'});
            assert.equal(await rowOf(MINE), undefined);
        });

        it('`..`, `.`, empty segments, backslashes, a bare folder and a nested gallery/ path', async function () {
            const bad = [
                `${ROOT}/gallery/users/me-alias/../other-alias/${YM}/x.png`,
                `${ROOT}/gallery/users/me-alias/./x.png`,
                `${ROOT}/gallery/users/me-alias//x.png`,
                `${ROOT}/gallery/users/me-alias/${YM}\\x.png`,
                `${ROOT}/gallery/users/me-alias/`,
                `${ROOT}/gallery/users/me-alias`,
                `${ROOT}/gallery/users/me-alias/gallery/news_jobs/${NEWS_JOB}/x.png`,
                `${ROOT}/gallery/users/me-alias/jobs/${NEWS_JOB}/x.png`,
                `${ROOT}/gallery/users/me-alias-2/x.png`,
                `gallery/users/me-alias/${YM}/x.png`, // without the store root
                `other-root/gallery/users/me-alias/${YM}/x.png`
            ];
            for (const key of bad) {
                await assert.rejects(finalize(ME, keyed(key)), {errorType: 'ValidationError'}, key);
            }
            assert.equal(await db('social_media_assets').count({n: '*'}).first().then(r => Number(r.n)), 0);
        });

        it('a thumbnail outside the area (destroyAsset deletes the thumbnail file too)', async function () {
            await assert.rejects(finalize(ME, {
                ...keyed(MINE),
                thumbnail_storage_key: `${ROOT}/gallery/users/other-alias/${YM}/their.png`,
                thumbnail_storage_url: `${HOST}/${ROOT}/gallery/users/other-alias/${YM}/their.png`
            }), {errorType: 'ValidationError'});
            await assert.rejects(finalize(ME, {
                ...keyed(MINE),
                thumbnail_storage_key: `${ROOT}/gallery/users/me-alias/${YM}/a.png`,
                thumbnail_storage_url: `${HOST}/${ROOT}/gallery/users/me-alias/${YM}/b.png`
            }), {errorType: 'ValidationError'});
            assert.equal(await rowOf(MINE), undefined);
        });

        it('person / chart / deepzoom ids that would move the folder (`../users/...`)', async function () {
            await assert.rejects(presign(ME, {person_id: '../users/other-alias'}), {errorType: 'BadRequestError'});
            await assert.rejects(finalize(ME, {...keyed(`${ROOT}/gallery/users/other-alias/${YM}/x.png`), person_id: '../users/other-alias'}), {errorType: 'BadRequestError'});
            await assert.rejects(finalize(ME, {...keyed(`${ROOT}/gallery/users/other-alias/${YM}/x.png`), social_chart_id: '../users/other-alias'}), {errorType: 'BadRequestError'});
            await assert.rejects(finalize(ME, {...keyed(`${ROOT}/gallery/users/other-alias/${YM}/x.png`), target: 'deepzoom', dzi_job_id: '../users/other-alias'}), {errorType: 'BadRequestError'});
        });

        it('a signed-out caller', async function () {
            await assert.rejects(finalize(null, keyed(MINE)), {errorType: 'NoPermissionError'});
        });
    });

    describe('a job link (chart_job_id / news_job_id) names an existing job of the row\'s project', function () {
        // The project gallery shows a job's results, also after the job is deleted
        // (H3), to everyone who can read the project. So an upload may not name a
        // job that does not exist, a job of another project, or a job of a project
        // the caller cannot read.
        const OTHERS_PROJECT = '00000000000000000000dd02';
        const PROJECT_JOB = '00000000000000000000ee11';
        const OTHERS_JOB = '00000000000000000000ee12';
        const projectUpload = async (user, extra) => {
            const signed = (await presign(user, {target: 'project', project_id: PROJECT, subfolder: 'artifacts'})).data[0];
            return finalize(user, {...keyed(signed.storage_key), target: 'project', project_id: PROJECT, ...extra});
        };

        beforeEach(async function () {
            await db('social_ai_projects').insert({id: OTHERS_PROJECT, user_id: OTHER, group_id: null});
            await db('social_ai_chart_jobs').insert([
                {id: PROJECT_JOB, user_id: OTHER, project_id: PROJECT},
                {id: OTHERS_JOB, user_id: OTHER, project_id: OTHERS_PROJECT}
            ]);
            await db('social_ai_news_jobs').insert({id: OTHERS_JOB, user_id: OTHER, project_id: OTHERS_PROJECT});
        });

        it('a job of this project is linked (the chart job page\'s upload)', async function () {
            const result = (await projectUpload(ME, {chart_job_id: PROJECT_JOB})).data[0];
            assert.equal((await db('social_media_assets').where({id: result.id}).first()).chart_job_id, PROJECT_JOB);
        });

        it('a job that does not exist is refused', async function () {
            await assert.rejects(projectUpload(ME, {chart_job_id: '00000000000000000000ee99'}), {errorType: 'ValidationError'});
        });

        it('a job of another project is refused', async function () {
            await assert.rejects(projectUpload(ME, {chart_job_id: OTHERS_JOB}), {errorType: 'ValidationError'});
        });

        it('a job of a project the caller cannot read is refused, even with that project_id', async function () {
            const signed = (await presign(ME, {})).data[0];
            await assert.rejects(finalize(ME, {...keyed(signed.storage_key), project_id: OTHERS_PROJECT, chart_job_id: OTHERS_JOB}), {errorType: 'NoPermissionError'});
            await assert.rejects(finalize(ME, {...keyed(signed.storage_key), project_id: OTHERS_PROJECT, news_job_id: OTHERS_JOB}), {errorType: 'NoPermissionError'});
        });

        it('a news job that does not exist is refused too', async function () {
            const signed = (await presign(ME, {})).data[0];
            await assert.rejects(finalize(ME, {...keyed(signed.storage_key), news_job_id: '00000000000000000000ee99'}), {errorType: 'ValidationError'});
        });

        describe('without project_id (target chart_jobs / news_jobs): the job\'s project is used', function () {
            const NEWS_PROJECT_JOB = '00000000000000000000ee13';
            const jobUpload = async (user, target, jobId, link) => {
                const signed = (await presign(user, {target, job_id: jobId})).data[0];
                await finalize(user, {...keyed(signed.storage_key), target, job_id: jobId, ...link});
                return {signed, row: await rowOf(signed.storage_key)};
            };

            beforeEach(async function () {
                await db('social_ai_news_jobs').insert({id: NEWS_PROJECT_JOB, user_id: OTHER, project_id: PROJECT});
            });

            it('a chart job of a project the caller can read: the row gets that project, the key stays in the job folder', async function () {
                const {signed, row} = await jobUpload(ME, 'chart_jobs', PROJECT_JOB, {chart_job_id: PROJECT_JOB});
                assert.ok(signed.storage_key.startsWith(`${ROOT}/gallery/chart_jobs/${PROJECT_JOB}/`));
                assert.equal(row.chart_job_id, PROJECT_JOB);
                assert.equal(row.project_id, PROJECT);
            });

            it('a news job of a project the caller can read: the same', async function () {
                const {signed, row} = await jobUpload(ME, 'news_jobs', NEWS_PROJECT_JOB, {news_job_id: NEWS_PROJECT_JOB});
                assert.ok(signed.storage_key.startsWith(`${ROOT}/gallery/news_jobs/${NEWS_PROJECT_JOB}/`));
                assert.equal(row.news_job_id, NEWS_PROJECT_JOB);
                assert.equal(row.project_id, PROJECT);
            });

            it('a job of a project the caller cannot read is refused', async function () {
                await assert.rejects(jobUpload(ME, 'chart_jobs', OTHERS_JOB, {chart_job_id: OTHERS_JOB}), {errorType: 'NoPermissionError'});
                await assert.rejects(jobUpload(ME, 'news_jobs', OTHERS_JOB, {news_job_id: OTHERS_JOB}), {errorType: 'NoPermissionError'});
            });
        });

        it('the worker (integration) links its own results without these checks', async function () {
            const key = `${ROOT}/gallery/projects/${PROJECT}/artifacts/chart-0000aaaa.png`;
            await endpoint.finalize.query({
                options: {context: {integration: {id: 'worker-1'}}},
                data: {...keyed(key), target: 'project', project_id: PROJECT, chart_job_id: '00000000000000000000ee99'}
            });
            assert.equal((await rowOf(key)).chart_job_id, '00000000000000000000ee99');
        });
    });

    describe('normal uploads keep working (presign -> finalize with the same scope values)', function () {
        const roundTrip = async (user, scope, extraFinalize = {}) => {
            const signed = (await presign(user, scope)).data[0];
            const result = (await finalize(user, {
                storage_key: signed.storage_key,
                storage_url: signed.storage_url,
                original_filename: 'photo.png',
                asset_type: 'image',
                ...scope,
                ...extraFinalize
            })).data[0];
            return {signed, result, row: await rowOf(signed.storage_key)};
        };

        it('user (my gallery), and a retry of the same finalize updates the same row', async function () {
            const {signed, result, row} = await roundTrip(ME, {});
            assert.match(signed.storage_key, new RegExp(`^${ROOT}/gallery/users/me-alias/${YM}/photo-[a-f0-9]{8}\\.png$`));
            assert.equal(row.owner_scope, 'user');
            assert.equal(row.user_id, ME);
            const again = (await finalize(ME, {storage_key: signed.storage_key, storage_url: signed.storage_url, original_filename: 'renamed.png'})).data[0];
            assert.equal(again.id, result.id);
            assert.equal((await rowOf(signed.storage_key)).original_filename, 'renamed.png');
            assert.equal(await db('social_media_assets').count({n: '*'}).first().then(r => Number(r.n)), 1);
        });

        it('a key presigned last month still finalizes (the YYYY/MM folder is not pinned)', async function () {
            const key = `${ROOT}/gallery/users/me-alias/2026/10/late-1234abcd.png`;
            await finalize(ME, keyed(key));
            assert.equal((await rowOf(key)).user_id, ME);
        });

        it('a video with its thumbnail', async function () {
            const signed = (await presign(ME, {filename: 'clip.mp4', content_type: 'video/mp4'})).data[0];
            assert.ok(signed.thumbnail_storage_key);
            await finalize(ME, {
                storage_key: signed.storage_key,
                storage_url: signed.storage_url,
                thumbnail_storage_key: signed.thumbnail_storage_key,
                thumbnail_storage_url: signed.thumbnail_storage_url,
                asset_type: 'video'
            });
            const row = await rowOf(signed.storage_key);
            assert.equal(row.thumbnail_storage_key, signed.thumbnail_storage_key);
            assert.equal(row.asset_type, 'video');
        });

        it('group', async function () {
            const {signed, row} = await roundTrip(ME, {group_id: GROUP});
            assert.ok(signed.storage_key.startsWith(`${ROOT}/gallery/groups/group-alias/${YM}/`));
            assert.equal(row.owner_scope, 'group');
            assert.equal(row.group_id, GROUP);
        });

        it('property (and its estate_property_media link)', async function () {
            const {signed, row, result} = await roundTrip(ME, {target: 'property', property_id: PROPERTY});
            assert.ok(signed.storage_key.startsWith(`${ROOT}/gallery/properties/${PROPERTY}/${YM}/`));
            assert.equal(row.owner_scope, 'property');
            assert.ok(result.property_media_id);
            const again = (await finalize(ME, {...keyed(signed.storage_key), target: 'property', property_id: PROPERTY})).data[0];
            assert.equal(again.id, result.id);
            // The same key named under another user's area is refused.
            await assert.rejects(finalize(OTHER, keyed(signed.storage_key)), {errorType: 'ValidationError'});
        });

        it('chart_jobs and news_jobs', async function () {
            const chart = await roundTrip(ME, {target: 'chart_jobs', job_id: CHART_JOB}, {chart_job_id: CHART_JOB});
            assert.ok(chart.signed.storage_key.startsWith(`${ROOT}/gallery/chart_jobs/${CHART_JOB}/${YM}/`));
            assert.equal(chart.row.owner_scope, 'chart_jobs');
            assert.equal(chart.row.chart_job_id, CHART_JOB);

            const news = await roundTrip(ME, {target: 'news_jobs', job_id: NEWS_JOB});
            assert.ok(news.signed.storage_key.startsWith(`${ROOT}/gallery/news_jobs/${NEWS_JOB}/${YM}/`));
            assert.equal(news.row.owner_scope, 'news_jobs');
        });

        it('a chart (social_chart_id) and a person', async function () {
            const chart = await roundTrip(ME, {social_chart_id: 'chart-1'});
            assert.ok(chart.signed.storage_key.startsWith(`${ROOT}/gallery/charts/chart-1/${YM}/`));
            assert.equal(chart.row.owner_scope, 'chart');
            const person = await roundTrip(ME, {person_id: 'person-1'});
            assert.ok(person.signed.storage_key.startsWith(`${ROOT}/gallery/persons/person-1/${YM}/`));
            assert.equal(person.row.owner_scope, 'person');
        });

        it('project: with a subfolder at presign (finalize has no subfolder) and the legacy chart_projects folder', async function () {
            const sub = await roundTrip(ME, {target: 'project', project_id: PROJECT, subfolder: 'media'});
            assert.ok(sub.signed.storage_key.startsWith(`${ROOT}/gallery/projects/${PROJECT}/media/`));
            assert.equal(sub.row.project_id, PROJECT);
            assert.equal(sub.row.owner_scope, 'chart_jobs');

            const legacy = await roundTrip(ME, {target: 'project', project_id: PROJECT});
            assert.ok(legacy.signed.storage_key.startsWith(`${ROOT}/gallery/chart_projects/${PROJECT}/`));
            assert.equal(legacy.row.project_id, PROJECT);
            const again = (await finalize(ME, {...keyed(sub.signed.storage_key), target: 'project', project_id: PROJECT})).data[0];
            assert.equal(again.id, sub.result.id);
            // Another project's folder is not this project's area.
            await assert.rejects(finalize(ME, {...keyed(`${ROOT}/gallery/projects/00000000000000000000dd02/media/x.png`), target: 'project', project_id: PROJECT}), {errorType: 'ValidationError'});
        });

        it('a worker (integration key, no user) finalizing into a project, and its retry', async function () {
            const worker = data => endpoint.finalize.query({options: {context: {integration: {id: 'worker-1'}}}, data});
            const key = `${ROOT}/gallery/projects/${PROJECT}/posts/cover-1234abcd.png`;
            const first = (await worker({...keyed(key), target: 'project', project_id: PROJECT})).data[0];
            const again = (await worker({...keyed(key), target: 'project', project_id: PROJECT})).data[0];
            assert.equal(again.id, first.id);
            assert.equal((await rowOf(key)).user_id, null);
            // A signed-in user cannot take the worker's row over.
            await assert.rejects(finalize(ME, {...keyed(key), target: 'project', project_id: PROJECT}), {errorType: 'ConflictError'});
        });

        it('deepzoom: presign makes the job id, finalize sends it back as dzi_job_id', async function () {
            const signed = (await presign(ME, {target: 'deepzoom', filename: 'map.pdf', content_type: 'application/pdf'})).data[0];
            assert.match(signed.job_id, /^[a-f0-9]{24}$/);
            await finalize(ME, {storage_key: signed.storage_key, storage_url: signed.storage_url, target: 'deepzoom', dzi_job_id: signed.job_id});
            assert.equal((await rowOf(signed.storage_key)).dzi_job_id, signed.job_id);

            const fixed = (await presign(ME, {target: 'deepzoom', job_id: DZI_JOB, filename: 'map.pdf', content_type: 'application/pdf'})).data[0];
            assert.ok(fixed.storage_key.startsWith(`${ROOT}/gallery/deepzoom/${DZI_JOB}/`));
            await finalize(ME, {storage_key: fixed.storage_key, storage_url: fixed.storage_url, target: 'deepzoom', job_id: DZI_JOB});
            assert.equal((await rowOf(fixed.storage_key)).dzi_job_id, DZI_JOB);
            // job_id (the media-jobs FK) sent along with dzi_job_id: the folder is the dzi job's.
            const both = (await presign(ME, {target: 'deepzoom', filename: 'map2.pdf', content_type: 'application/pdf'})).data[0];
            await finalize(ME, {storage_key: both.storage_key, storage_url: both.storage_url, target: 'deepzoom', dzi_job_id: both.job_id, job_id: '00000000000000000000ee09'});
            assert.equal((await rowOf(both.storage_key)).dzi_job_id, both.job_id);
            // Another deepzoom job's folder is out of scope.
            await assert.rejects(finalize(ME, {storage_key: fixed.storage_key, storage_url: fixed.storage_url, target: 'deepzoom', dzi_job_id: signed.job_id}), {errorType: 'ValidationError'});
        });

        it('/editor (Koenig): a large video / file goes presign -> finalize in the post\'s group', async function () {
            const video = (await presign(ME, {group_id: GROUP, filename: 'talk.mp4', content_type: 'video/mp4'})).data[0];
            await finalize(ME, {storage_key: video.storage_key, storage_url: video.storage_url, thumbnail_storage_key: video.thumbnail_storage_key, thumbnail_storage_url: video.thumbnail_storage_url, asset_type: 'video', group_id: GROUP});
            assert.equal((await rowOf(video.storage_key)).group_id, GROUP);
            const file = (await presign(ME, {group_id: GROUP, filename: 'minutes.pdf', content_type: 'application/pdf'})).data[0];
            await finalize(ME, {storage_key: file.storage_key, storage_url: file.storage_url, asset_type: 'file', group_id: GROUP});
            const row = await rowOf(file.storage_key);
            assert.equal(row.asset_type, 'file');
            assert.equal(row.owner_scope, 'group');
        });

        it('rows made by /images, /media, /files upload (editor\'s small files, no finalize): the uploader may finalize the same key again, others may not take it', async function () {
            // Same shape images.js / media.js / files.js write through upsertAsset:
            // <root>/gallery/users|groups/<alias>/YYYY/MM/<name>, owner_scope from group_id.
            const mine = `${ROOT}/gallery/users/me-alias/${YM}/photo.jpg`;
            const groupFile = `${ROOT}/gallery/groups/group-alias/${YM}/minutes.pdf`;
            await db('social_media_assets').insert([
                {id: '0000000000000000000000f3', storage_key: mine, storage_url: `${HOST}/${mine}`, owner_scope: 'user', user_id: ME, asset_type: 'image'},
                {id: '0000000000000000000000f4', storage_key: groupFile, storage_url: `${HOST}/${groupFile}`, owner_scope: 'group', user_id: OTHER, group_id: GROUP, asset_type: 'file'}
            ]);
            const again = (await finalize(ME, {...keyed(mine), asset_type: 'image'})).data[0];
            assert.equal(again.id, '0000000000000000000000f3');
            await assert.rejects(finalize(OTHER, keyed(mine)), {errorType: 'ValidationError'});
            assert.equal((await rowOf(mine)).user_id, ME);

            // A group member is not the uploader of the group file: 409, row unchanged.
            await assert.rejects(finalize(ME, {...keyed(groupFile), group_id: GROUP}), {errorType: 'ConflictError'});
            assert.equal((await rowOf(groupFile)).user_id, OTHER);
            const own = (await finalize(OTHER, {...keyed(groupFile), group_id: GROUP, asset_type: 'file'})).data[0];
            assert.equal(own.id, '0000000000000000000000f4');
        });

        it('a store without pathPrefix (root \'\') and a key sent with a leading slash', async function () {
            delete store.pathPrefix;
            const signed = (await presign(ME, {})).data[0];
            assert.ok(signed.storage_key.startsWith(`gallery/users/me-alias/${YM}/`));
            await finalize(ME, {storage_key: `/${signed.storage_key}`, storage_url: signed.storage_url});
            assert.equal((await rowOf(signed.storage_key)).user_id, ME);
        });

        it('a file name with Japanese letters, sent back percent-encoded in the URL', async function () {
            const key = `${ROOT}/gallery/users/me-alias/${YM}/家族-1234abcd.png`;
            await finalize(ME, {storage_key: key, storage_url: `${HOST}/${ROOT}/gallery/users/me-alias/${YM}/${encodeURIComponent('家族-1234abcd.png')}`});
            assert.ok(await db('social_media_assets').where('storage_key', 'like', '%1234abcd.png').first());
        });
    });
});
