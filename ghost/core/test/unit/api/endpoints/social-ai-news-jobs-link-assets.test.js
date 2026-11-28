// news job の worker が成果物の行を登録する道（POST /social/ai/news/jobs/:id/link-assets）。chart（#99）と同じ規則。
// - worker の正しい使い方: 自分のジョブの成果物の行を作って結びつける・同じジョブ／同じ持ち主のジョブの再公開は同じ行を使う。
// - すでにある行を変えられるのは、ジョブの持ち主がその行を上げた本人か、行を作った news job の持ち主のときか、
//   ジョブの持ち主が管理者のときだけ。持ち主の無いジョブは持ち主の無い行だけ。
//   ほかの人の行には news_job_id を付けず、名前・URL も変えない（skipped_count に数える）。removed_keys も同じ規則で消す。
// - 使い直せるのは news 用の行（owner_scope news_jobs）だけ。ほかのジョブ（chart・video・dzi・content bundle）の行は使い直さない。
const assert = require('assert/strict');
const sinon = require('sinon');
const knex = require('knex');
const models = require('../../../../core/server/models');

const endpointPath = require.resolve('../../../../core/server/api/endpoints/social-ai-news-jobs');
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

const ART = name => `content/media/gallery/projects/${PROJECT}/artifacts/audio/${name}`;
const HOST = 'https://cdn.example.com';
const asset = (key, extra = {}) => ({storage_key: key, storage_url: `${HOST}/${key}`, asset_type: 'audio', original_filename: 'new.mp3', item_key: 'item-1', ...extra});

const workerFrame = (id, data) => ({
    options: {id, context: {api_key: {id: 'worker-key', type: 'admin'}, integration: {id: 'integration-1'}}},
    data
});

describe('News jobs link-assets: the worker links its own job\'s rows, never someone else\'s', function () {
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
        await db.schema.createTable('social_ai_news_jobs', (t) => {
            ['id', 'type', 'user_id', 'group_id', 'project_id', 'status', 'artifacts', 'claim_worker_id', 'claim_token',
                'claim_expires_at', 'updated_at', 'updated_by'].forEach(c => t.string(c));
            t.integer('claim_generation').notNullable().defaultTo(0);
        });
        await db.schema.createTable('social_media_assets', (t) => {
            ['id', 'storage_key', 'storage_key_hash', 'storage_url', 'thumbnail_url', 'original_filename', 'asset_type',
                'owner_scope', 'user_id', 'group_id', 'chart_job_id', 'news_job_id', 'video_job_id', 'dzi_job_id',
                'content_bundle_job_id', 'project_id', 'created_at', 'updated_at'].forEach(c => t.string(c));
        });
        await db.schema.createTable('social_ai_news_job_media', (t) => {
            ['id', 'news_job_id', 'media_id', 'role', 'source_kind', 'step_id', 'item_key', 'post_id', 'person_name',
                'caption', 'created_at'].forEach(c => t.string(c));
            t.integer('sort_order');
        });
        await db.schema.createTable('social_ai_avatar_broadcast_selections', (t) => {
            ['id', 'post_id', 'media_id'].forEach(c => t.string(c));
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
        original_filename: 'old.mp3', asset_type: 'audio', owner_scope: 'news_jobs', ...extra
    });

    beforeEach(async function () {
        sinon.stub(staffScope, 'getStaffScope').callsFake(async userId => ({isSystemAdmin: userId === ADMIN}));
        for (const table of ['social_ai_news_jobs', 'social_media_assets', 'social_ai_news_job_media', 'social_ai_avatar_broadcast_selections']) {
            await db(table).del();
        }
        const job = (id, userId, status = 'running') => ({id, type: 'news-read', user_id: userId, project_id: PROJECT, status, claim_generation: 0});
        await db('social_ai_news_jobs').insert([
            job(JOB, OWNER),
            job(OLD_JOB, OWNER, 'completed'),
            job(OTHERS_JOB, OTHER, 'completed'),
            job(ADMIN_JOB, ADMIN),
            job(WORKER_JOB, null)
        ]);
        await db('social_media_assets').insert([
            // made by an earlier job of the same owner
            row('m1', ART('own-old.mp3'), {user_id: OWNER, news_job_id: OLD_JOB, project_id: PROJECT}),
            // made by another member's news job
            row('m2', ART('others.mp3'), {user_id: OTHER, news_job_id: OTHERS_JOB, project_id: PROJECT}),
            // someone's own upload (not a news row)
            row('m3', 'content/media/gallery/users/other/2026/11/photo.png', {user_id: OTHER, owner_scope: 'user'}),
            // the owner's chart job row (owner_scope chart_jobs)
            row('m4', 'content/media/gallery/projects/p/artifacts/images/a.png', {user_id: OWNER, owner_scope: 'chart_jobs', chart_job_id: 'c1'}),
            // an owner-less news row (an owner-less job's earlier artifact)
            row('m5', ART('worker-old.mp3'), {user_id: null, news_job_id: null, project_id: PROJECT}),
            // uploaded by someone else, made by a job of the owner
            row('m6', ART('relinked.mp3'), {user_id: OTHER, news_job_id: OLD_JOB, project_id: PROJECT}),
            // owner's news row that also carries a video job id
            row('m7', ART('video.mp4'), {user_id: OWNER, video_job_id: 'v1', project_id: PROJECT})
        ]);
    });

    afterEach(function () {
        sinon.restore();
    });

    const link = (id, assets, removedKeys = []) => endpoint.linkAssets.query(workerFrame(id, {assets, removed_keys: removedKeys}));
    const rowOf = id => db('social_media_assets').where({id}).first();
    const junctionsOf = jobId => db('social_ai_news_job_media').where({news_job_id: jobId});

    it('a new artifact becomes a row of the job (owner, project, news_job_id) with its junction', async function () {
        const result = await link(JOB, [asset(ART('new.mp3'))]);
        assert.equal(result.count, 1);
        assert.equal(result.skipped_count, 0);
        const created = await db('social_media_assets').where({storage_key: ART('new.mp3')}).first();
        assert.equal(created.user_id, OWNER);
        assert.equal(created.news_job_id, JOB);
        assert.equal(created.project_id, PROJECT);
        assert.equal(created.owner_scope, 'news_jobs');
        const junctions = await junctionsOf(JOB);
        assert.equal(junctions.length, 1);
        assert.equal(junctions[0].item_key, 'item-1');
    });

    it('a re-publish of the owner\'s earlier artifact reuses the row and re-points it to this job', async function () {
        const result = await link(JOB, [asset(ART('own-old.mp3'))]);
        assert.deepEqual(result.media_ids, ['m1']);
        const reused = await rowOf('m1');
        assert.equal(reused.news_job_id, JOB);
        assert.equal(reused.original_filename, 'new.mp3');
        assert.equal(reused.user_id, OWNER);
        assert.equal((await junctionsOf(JOB)).length, 1);
    });

    it('a rerun of the same job re-links its own row', async function () {
        await link(JOB, [asset(ART('new.mp3'))]);
        const again = await link(JOB, [asset(ART('new.mp3'), {original_filename: 'again.mp3'})]);
        assert.equal(again.count, 1);
        assert.equal(again.skipped_count, 0);
        assert.equal((await db('social_media_assets').where({storage_key: ART('new.mp3')})).length, 1);
        assert.equal((await junctionsOf(JOB)).length, 1);
    });

    it('someone else\'s row (another member\'s news row, a user upload) is not touched and not linked', async function () {
        const result = await link(JOB, [
            asset(ART('others.mp3')),
            asset('content/media/gallery/users/other/2026/11/photo.png')
        ]);
        assert.equal(result.count, 0);
        assert.equal(result.skipped_count, 2);
        const m2 = await rowOf('m2');
        assert.equal(m2.news_job_id, OTHERS_JOB);
        assert.equal(m2.original_filename, 'old.mp3');
        assert.equal((await rowOf('m3')).news_job_id, null);
        assert.equal((await junctionsOf(JOB)).length, 0);
    });

    it('a row of another job family (chart, video) is skipped even when the job owner owns it', async function () {
        const result = await link(JOB, [asset('content/media/gallery/projects/p/artifacts/images/a.png'), asset(ART('video.mp4'))]);
        assert.equal(result.count, 0);
        assert.equal(result.skipped_count, 2);
        assert.equal((await rowOf('m4')).news_job_id, null);
        assert.equal((await rowOf('m7')).news_job_id, null);
    });

    it('a job of an admin may re-link someone else\'s news row', async function () {
        const result = await link(ADMIN_JOB, [asset(ART('others.mp3'))]);
        assert.deepEqual(result.media_ids, ['m2']);
        const m2 = await rowOf('m2');
        assert.equal(m2.news_job_id, ADMIN_JOB);
        assert.equal(m2.user_id, OTHER);
    });

    it('an owner-less job links owner-less news rows only', async function () {
        const result = await link(WORKER_JOB, [asset(ART('worker-old.mp3')), asset(ART('others.mp3'))]);
        assert.deepEqual(result.media_ids, ['m5']);
        assert.equal(result.skipped_count, 1);
        assert.equal((await rowOf('m2')).news_job_id, OTHERS_JOB);
    });

    it('a row someone else uploaded but a job of the owner made may be re-linked by the owner\'s job', async function () {
        const result = await link(JOB, [asset(ART('relinked.mp3'))]);
        assert.deepEqual(result.media_ids, ['m6']);
        assert.equal((await rowOf('m6')).news_job_id, JOB);
    });

    it('removed_keys: the owner\'s own artifact row is dropped, someone else\'s is kept; the counts tell which', async function () {
        const result = await link(JOB, [], [ART('own-old.mp3'), ART('others.mp3')]);
        assert.equal(await rowOf('m1'), undefined);
        assert.ok(await rowOf('m2'));
        assert.equal(result.removed_count, 1);
        assert.equal(result.removed_skipped_count, 1);
    });

    it('removed_keys: a row selected for a virtual broadcast is still refused (own row)', async function () {
        await db('social_ai_avatar_broadcast_selections').insert({id: 's1', post_id: 'post-1', media_id: 'm1'});
        await assert.rejects(link(JOB, [], [ART('own-old.mp3')]), {errorType: 'ValidationError'});
        assert.ok(await rowOf('m1'));
    });

    it('removed_keys: someone else\'s selected row is kept without failing the job', async function () {
        await db('social_ai_avatar_broadcast_selections').insert({id: 's2', post_id: 'post-2', media_id: 'm2'});
        const result = await link(JOB, [], [ART('others.mp3')]);
        assert.ok(await rowOf('m2'));
        assert.equal(result.removed_skipped_count, 1);
    });

    it('only the worker (integration) may call it', async function () {
        await assert.rejects(endpoint.linkAssets.query({options: {id: JOB, context: {user: OWNER}}, data: {assets: [asset(ART('x.mp3'))]}}), {errorType: 'NoPermissionError'});
    });
});
