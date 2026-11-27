// chart job の worker が成果物の行を登録する道（POST /social/ai/chart/jobs/:id/link-assets）。
// - worker の正しい使い方: 自分のジョブの成果物の行を作って結びつける・同じジョブ／同じ持ち主のジョブの再公開は同じ行を使う。
// - すでにある行を変えられるのは、ジョブの持ち主がその行を直接消せるとき（上げた本人・行を作った chart job の持ち主）か、
//   ジョブの持ち主が管理者のときだけ。持ち主の無いジョブは持ち主の無い行だけ。
//   ほかの人の行には chart_job_id を付けず、名前・URL も変えない（skipped_count に数える）。removed_keys も同じ規則で消す。
// - 使い直せるのは chart 用の行と直接アップロードの行だけ。ほかのジョブ（news・video・dzi・content bundle など）の行は
//   持ち主が誰でも使い直さない（同じ行に chart_job_id と news_job_id が付かない）。
// - removed_count は実際に消した行の数、消さなかった数は removed_skipped_count。
const assert = require('assert/strict');
const sinon = require('sinon');
const knex = require('knex');
const models = require('../../../../core/server/models');

const endpointPath = require.resolve('../../../../core/server/api/endpoints/social-ai-chart-jobs');
const staffScopePath = require.resolve('../../../../core/server/api/endpoints/utils/staff-scope');
const socialMediaAssets = require('../../../../core/server/api/endpoints/utils/social-media-assets');

const OWNER = '00000000000000000000aa01';
const OTHER = '00000000000000000000aa02';
const ADMIN = '00000000000000000000aa04';
const PROJECT = '00000000000000000000bb01';
const JOB = '00000000000000000000ee01';
const OLD_JOB = '00000000000000000000ee02';
const OTHERS_JOB = '00000000000000000000ee03';
const ADMIN_JOB = '00000000000000000000ee04';
const WORKER_JOB = '00000000000000000000ee05';

const ART = name => `content/media/gallery/projects/${PROJECT}/artifacts/images/${name}`;
const HOST = 'https://cdn.example.com';
const asset = (key, extra = {}) => ({storage_key: key, storage_url: `${HOST}/${key}`, asset_type: 'image', original_filename: 'new.png', ...extra});

const workerFrame = (id, data) => ({
    options: {id, context: {api_key: {id: 'worker-key', type: 'admin'}, integration: {id: 'integration-1'}}},
    data
});

describe('Chart jobs link-assets: the worker links its own job\'s rows, never someone else\'s', function () {
    let db;
    let endpoint;
    let originalKnex;
    let staffScope;

    before(async function () {
        models.init();
        delete require.cache[endpointPath];
        delete require.cache[staffScopePath];
        staffScope = require(staffScopePath);
        endpoint = require(endpointPath);
        db = knex({client: 'sqlite3', connection: {filename: ':memory:'}, useNullAsDefault: true});
        await db.schema.createTable('social_ai_chart_jobs', (t) => {
            ['id', 'user_id', 'group_id', 'project_id', 'status'].forEach(c => t.string(c));
        });
        await db.schema.createTable('social_media_assets', (t) => {
            ['id', 'storage_key', 'storage_key_hash', 'storage_url', 'thumbnail_url', 'original_filename', 'asset_type',
                'owner_scope', 'user_id', 'group_id', 'chart_job_id', 'news_job_id', 'video_job_id', 'dzi_job_id',
                'content_bundle_job_id', 'project_id', 'created_at', 'updated_at'].forEach(c => t.string(c));
        });
        await db.schema.createTable('social_ai_chart_job_media', (t) => {
            ['id', 'chart_job_id', 'media_id', 'role', 'source_kind', 'step_id', 'person_name', 'caption', 'created_at'].forEach(c => t.string(c));
            t.integer('sort_order');
        });
        originalKnex = models.Base.knex;
        models.Base.knex = db;
    });

    after(async function () {
        models.Base.knex = originalKnex;
        await db.destroy();
    });

    const row = (id, key, extra = {}) => ({
        id, storage_key: key, storage_key_hash: socialMediaAssets.buildStorageKeyHash(key), storage_url: `${HOST}/${key}`,
        original_filename: 'old.png', asset_type: 'image', owner_scope: 'chart_jobs', ...extra
    });

    beforeEach(async function () {
        sinon.stub(staffScope, 'getStaffScope').callsFake(async userId => ({isSystemAdmin: userId === ADMIN}));
        for (const table of ['social_ai_chart_jobs', 'social_media_assets', 'social_ai_chart_job_media']) {
            await db(table).del();
        }
        await db('social_ai_chart_jobs').insert([
            {id: JOB, user_id: OWNER, project_id: PROJECT, status: 'running'},
            {id: OLD_JOB, user_id: OWNER, project_id: PROJECT, status: 'completed'},
            {id: OTHERS_JOB, user_id: OTHER, project_id: PROJECT, status: 'completed'},
            {id: ADMIN_JOB, user_id: ADMIN, project_id: PROJECT, status: 'running'},
            {id: WORKER_JOB, user_id: null, project_id: PROJECT, status: 'running'}
        ]);
        await db('social_media_assets').insert([
            // made by an earlier job of the same owner
            row('m1', ART('own-old.png'), {user_id: OWNER, chart_job_id: OLD_JOB, project_id: PROJECT}),
            // made by another member's job
            row('m2', ART('others.png'), {user_id: OTHER, chart_job_id: OTHERS_JOB, project_id: PROJECT}),
            // someone's own upload (not a chart job row)
            row('m3', 'content/media/gallery/users/other/2026/11/photo.png', {user_id: OTHER, owner_scope: 'user'}),
            // an owner-less news worker row
            row('m4', 'content/media/gallery/news_jobs/n1/voice.mp3', {user_id: null, owner_scope: 'news_jobs', news_job_id: 'n1'}),
            // a news worker row of the job owner
            row('m5', 'content/media/gallery/news_jobs/n2/voice.mp3', {user_id: OWNER, owner_scope: 'news_jobs', news_job_id: 'n2'}),
            // an owner-less chart row (an owner-less job's earlier artifact)
            row('m6', ART('worker-old.png'), {user_id: null, chart_job_id: null, project_id: PROJECT}),
            // a row an admin re-linked to the owner's job: uploaded by someone else, made by a job of the owner
            row('m7', ART('relinked.png'), {user_id: OTHER, chart_job_id: OLD_JOB, project_id: PROJECT}),
            // the owner's video job row (owner_scope chart_jobs is not enough when another job id is set)
            row('m8', ART('video.mp4'), {user_id: OWNER, video_job_id: 'v1', project_id: PROJECT})
        ]);
    });

    afterEach(function () {
        sinon.restore();
    });

    const link = (id, assets, removedKeys = []) => endpoint.linkAssets.query(workerFrame(id, {assets, removed_keys: removedKeys}));
    const rowOf = id => db('social_media_assets').where({id}).first();
    const junctionsOf = jobId => db('social_ai_chart_job_media').where({chart_job_id: jobId});

    it('a new artifact becomes a row of the job (owner, project, chart_job_id) with its junction', async function () {
        const result = await link(JOB, [asset(ART('new.png'))]);
        assert.equal(result.count, 1);
        const created = await db('social_media_assets').where({storage_key: ART('new.png')}).first();
        assert.equal(created.user_id, OWNER);
        assert.equal(created.chart_job_id, JOB);
        assert.equal(created.project_id, PROJECT);
        assert.equal((await junctionsOf(JOB)).length, 1);
    });

    it('a re-publish of the owner\'s earlier artifact reuses the row and re-points it to this job', async function () {
        const result = await link(JOB, [asset(ART('own-old.png'))]);
        assert.deepEqual(result.media_ids, ['m1']);
        const reused = await rowOf('m1');
        assert.equal(reused.chart_job_id, JOB);
        assert.equal(reused.original_filename, 'new.png');
        assert.equal(reused.user_id, OWNER);
    });

    it('a rerun of the same job re-links its own row', async function () {
        await link(JOB, [asset(ART('new.png'))]);
        const again = await link(JOB, [asset(ART('new.png'), {original_filename: 'again.png'})]);
        assert.equal(again.count, 1);
        assert.equal((await db('social_media_assets').where({storage_key: ART('new.png')})).length, 1);
    });

    it('someone else\'s row (another member\'s chart job row, a user upload, an owner-less news row) is not touched and not linked', async function () {
        const result = await link(JOB, [
            asset(ART('others.png')),
            asset('content/media/gallery/users/other/2026/11/photo.png'),
            asset('content/media/gallery/news_jobs/n1/voice.mp3')
        ]);
        assert.equal(result.count, 0);
        assert.equal(result.skipped_count, 3);
        const m2 = await rowOf('m2');
        assert.equal(m2.chart_job_id, OTHERS_JOB);
        assert.equal(m2.original_filename, 'old.png');
        assert.equal((await rowOf('m3')).chart_job_id, null);
        assert.equal((await rowOf('m4')).chart_job_id, null);
        assert.equal((await junctionsOf(JOB)).length, 0);
    });

    it('a job of an admin may re-link someone else\'s row', async function () {
        const result = await link(ADMIN_JOB, [asset(ART('others.png'))]);
        assert.deepEqual(result.media_ids, ['m2']);
        const m2 = await rowOf('m2');
        assert.equal(m2.chart_job_id, ADMIN_JOB);
        assert.equal(m2.user_id, OTHER);
    });

    it('an owner-less job links owner-less chart rows only (not an owner-less news row)', async function () {
        const result = await link(WORKER_JOB, [
            asset(ART('worker-old.png')),
            asset('content/media/gallery/news_jobs/n1/voice.mp3'),
            asset(ART('others.png'))
        ]);
        assert.deepEqual(result.media_ids, ['m6']);
        assert.equal(result.skipped_count, 2);
        const m4 = await rowOf('m4');
        assert.equal(m4.chart_job_id, null);
        assert.equal(m4.news_job_id, 'n1');
        assert.equal((await rowOf('m2')).chart_job_id, OTHERS_JOB);
    });

    it('a row of another job family (news, video) is skipped even when the job owner owns it', async function () {
        const result = await link(JOB, [asset('content/media/gallery/news_jobs/n2/voice.mp3'), asset(ART('video.mp4'))]);
        assert.equal(result.count, 0);
        assert.equal(result.skipped_count, 2);
        const m5 = await rowOf('m5');
        assert.equal(m5.chart_job_id, null);
        assert.equal(m5.news_job_id, 'n2');
        assert.equal(m5.original_filename, 'old.png');
        assert.equal((await rowOf('m8')).chart_job_id, null);
        assert.equal((await junctionsOf(JOB)).length, 0);
    });

    it('an admin job does not re-link a row of another job family either', async function () {
        const result = await link(ADMIN_JOB, [asset('content/media/gallery/news_jobs/n2/voice.mp3')]);
        assert.equal(result.skipped_count, 1);
        assert.equal((await rowOf('m5')).chart_job_id, null);
    });

    it('a row someone else uploaded but a job of the owner made may be re-linked by the owner\'s job', async function () {
        const result = await link(JOB, [asset(ART('relinked.png'))]);
        assert.deepEqual(result.media_ids, ['m7']);
        const m7 = await rowOf('m7');
        assert.equal(m7.chart_job_id, JOB);
        assert.equal(m7.user_id, OTHER);
    });

    it('removed_keys: the owner\'s own artifact row is dropped, someone else\'s is kept; the counts tell which', async function () {
        const result = await link(JOB, [], [ART('own-old.png'), ART('others.png')]);
        assert.equal(await rowOf('m1'), undefined);
        assert.ok(await rowOf('m2'));
        assert.equal(result.removed_count, 1);
        assert.equal(result.removed_skipped_count, 1);
    });

    it('only the worker (integration) may call it', async function () {
        await assert.rejects(endpoint.linkAssets.query({options: {id: JOB, context: {user: OWNER}}, data: {assets: [asset(ART('x.png'))]}}), {errorType: 'NoPermissionError'});
    });
});
