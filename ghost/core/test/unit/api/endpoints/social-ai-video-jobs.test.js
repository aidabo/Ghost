const assert = require('assert/strict');
const Module = require('module');
const sinon = require('sinon');
const knex = require('knex');
const {createHash} = require('crypto');
const commands = require('../../../../core/server/data/schema/commands');
const schema = require('../../../../core/server/data/schema/schema');

const jobsPath = require.resolve('../../../../core/server/api/endpoints/social-ai-video-jobs');
const consentsPath = require.resolve('../../../../core/server/api/endpoints/social-ai-avatar-consents');

const USER = 'aaaaaaaaaaaaaaaaaaaaaaa1';
const OTHER = 'aaaaaaaaaaaaaaaaaaaaaaa2';
const ADMIN = 'aaaaaaaaaaaaaaaaaaaaaaa3';
const GROUP_OK = 'bbbbbbbbbbbbbbbbbbbbbbb1';
const GROUP_NO = 'bbbbbbbbbbbbbbbbbbbbbbb2';
const PROJECT = 'ccccccccccccccccccccccc1';
const OWN_PHOTO = 'ddddddddddddddddddddddd1';
const OTHER_PRIVATE = 'ddddddddddddddddddddddd2';
const OTHER_IN_GROUP = 'ddddddddddddddddddddddd3';
const MISSING_ASSET = 'ddddddddddddddddddddddd9';

const staff = (user, data = {}, options = {}) => ({data, options: {...options, context: {user}}});
const worker = (data = {}, options = {}) => ({data, options: {...options, context: {integration: {id: 'integration-1'}}}});
const addFrame = (user, body) => staff(user, {socialaivideojobs: [body]});

const basePayload = (extra = {}) => ({
    template_id: 'intro',
    template_version: 1,
    aspect: '9:16',
    lang: 'ja',
    scenes: [{key: 's1', image_asset_id: OWN_PHOTO, title: 'マイホーム'}],
    lines: [{key: 'l1', scene_key: 's1', text: 'ログインすると、家族の場所が開きます。'}],
    voice: {provider: 'qwen', voice: 'Ono Anna', tempo: 0.85},
    ...extra
});

const rejects = (promise, expected) => assert.rejects(promise, error => Object.entries(expected)
    .every(([key, value]) => error[key] === value) || assert.fail(`${error.errorType}/${error.code}: ${error.message}`));

describe('Video jobs and avatar consents', function () {
    let database;
    let models;
    let jobs;
    let consents;
    // What storage.getStorage('media') returns (null = no media store, root '').
    let mediaStore = null;
    const savedEnv = {};
    const ENV = ['VIDEO_JOB_FACE_ENABLED', 'VIDEO_JOB_MAX_COST_USD', 'VIDEO_JOB_TEMPLATE_IDS', 'VIDEO_JOB_MAX_LINES'];

    const load = (path) => {
        const originalLoad = Module._load;
        const stub = sinon.stub(Module, '_load').callsFake(function (request, parent, isMain) {
            if (parent && parent.filename === path) {
                if (request === '../../models') {
                    return models;
                }
                if (request === './utils/staff-scope') {
                    return {getStaffScope: async id => ({isSystemAdmin: id === ADMIN})};
                }
                if (request === './utils/social-media-assets') {
                    return {buildStorageKeyHash: key => createHash('sha256').update(key).digest('hex')};
                }
                if (request === '../../adapters/storage') {
                    return {getStorage: () => mediaStore};
                }
                if (request === '@tryghost/logging') {
                    return {warn() {}};
                }
            }
            return originalLoad.call(this, request, parent, isMain);
        });
        try {
            delete require.cache[path];
            return require(path);
        } finally {
            stub.restore();
            delete require.cache[path];
        }
    };

    before(async function () {
        database = knex({client: 'sqlite3', connection: {filename: ':memory:'}, useNullAsDefault: true});
        // The real schema.js definitions, so a column the endpoints write but the
        // schema lacks fails here (and the fresh-DB path is exercised).
        for (const table of ['users', 'social_media_assets', 'social_ai_video_jobs', 'social_ai_video_job_media', 'social_ai_avatar_consents']) {
            await commands.createTable(table, database, schema[table]);
        }
        const user = id => ({
            id, name: id, slug: id, password: 'x', email: `${id}@example.test`, status: 'active', visibility: 'public',
            created_at: '2026-01-01 00:00:00', created_by: id
        });
        await database('users').insert([user(USER), user(OTHER), user(ADMIN)]);
        models = {
            Base: {knex: database},
            SocialGroup: {
                findOne: async ({id}) => ([GROUP_OK, GROUP_NO].includes(id) ? {id} : null),
                canAccessGroup: async (group, actor, mode) => group.id === GROUP_OK && actor === USER && mode === 'write'
            },
            SocialAiProject: {
                findOne: async ({id}) => (id === PROJECT
                    ? {get: key => ({user_id: OTHER, group_id: GROUP_OK})[key]}
                    : null)
            }
        };
        jobs = load(jobsPath);
        consents = load(consentsPath);
    });

    beforeEach(async function () {
        mediaStore = null;
        ENV.forEach((name) => {
            savedEnv[name] = process.env[name];
            delete process.env[name];
        });
        await database('social_ai_video_job_media').del();
        await database('social_ai_video_jobs').del();
        await database('social_ai_avatar_consents').del();
        await database('social_media_assets').del();
        const asset = (id, userId, groupId = null) => ({
            id, user_id: userId, group_id: groupId, owner_scope: 'user', storage_key: `gallery/${id}.jpg`,
            storage_key_hash: id, storage_url: `https://example.test/${id}.jpg`, asset_type: 'image',
            created_at: '2026-01-01 00:00:00'
        });
        await database('social_media_assets').insert([
            asset(OWN_PHOTO, USER), asset(OTHER_PRIVATE, OTHER), asset(OTHER_IN_GROUP, OTHER, GROUP_OK)
        ]);
    });

    afterEach(function () {
        ENV.forEach((name) => {
            if (savedEnv[name] === undefined) {
                delete process.env[name];
            } else {
                process.env[name] = savedEnv[name];
            }
        });
    });

    after(async function () {
        await database.destroy();
    });

    const lease = claim => ({claim_worker_id: claim.claim_worker_id, claim_token: claim.claim_token, claim_generation: claim.claim_generation});

    describe('migrations', function () {
        const MIGRATIONS = [
            '2026-11-25-00-00-01-add-social-ai-video-jobs-table',
            '2026-11-25-00-00-02-add-social-media-assets-video-job-id',
            '2026-11-25-00-00-03-add-social-ai-video-job-media-table',
            '2026-11-25-00-00-04-add-video-job-assets-unique-key',
            '2026-11-25-00-00-05-add-social-ai-avatar-consents-table'
        ].map(name => require(`../../../../core/server/data/migrations/versions/5.116/${name}`));

        it('bring an existing database to the same tables and index names as schema.js, idempotently', async function () {
            const old = knex({client: 'sqlite3', connection: {filename: ':memory:'}, useNullAsDefault: true});
            const indexNames = async db => (await db.raw(
                'select name from sqlite_master where type = \'index\' and name not like \'sqlite_%\' and (tbl_name like \'social_ai_video%\' or tbl_name = \'social_ai_avatar_consents\' or name like \'%video_job%\') order by name'
            )).map(row => row.name);
            try {
                // An existing database: social_media_assets as it was before this change.
                const assets = {...schema.social_media_assets};
                delete assets.video_job_id;
                assets['@@UNIQUE_CONSTRAINTS@@'] = assets['@@UNIQUE_CONSTRAINTS@@'].filter(pair => pair[0] !== 'video_job_id');
                await commands.createTable('users', old, schema.users);
                await commands.createTable('social_media_assets', old, assets);

                for (const migration of MIGRATIONS) {
                    await migration.up({connection: old});
                }
                for (const migration of MIGRATIONS) {
                    await migration.up({connection: old});
                }

                for (const table of ['social_ai_video_jobs', 'social_ai_video_job_media', 'social_ai_avatar_consents', 'social_media_assets']) {
                    const expected = Object.keys(schema[table]).filter(key => !key.startsWith('@@')).sort();
                    assert.deepEqual(Object.keys(await old(table).columnInfo()).sort(), expected, table);
                }
                // The fresh database of this suite was built from schema.js (init).
                assert.deepEqual(await indexNames(old), await indexNames(database));

                for (const migration of [...MIGRATIONS].reverse()) {
                    await migration.down({connection: old});
                }
                assert.equal(await old.schema.hasTable('social_ai_video_jobs'), false);
                assert.equal(await old.schema.hasColumn('social_media_assets', 'video_job_id'), false);
            } finally {
                await old.destroy();
            }
        });
    });

    describe('job lifecycle', function () {
        it('adds, claims, reports progress, links assets, completes, reads and deletes', async function () {
            const job = await jobs.add.query(addFrame(USER, {payload: basePayload()}));
            assert.equal(job.status, 'queued');
            assert.equal(job.type, 'video-render');
            assert.equal(job.scope_type, 'user');
            assert.deepEqual(job.items.map(item => item.key), ['l1']);
            assert.equal(job.estimate.face_lines, 0);

            const claim = await jobs.claim.query(worker({worker_id: 'video-1'}));
            assert.equal(claim.id, job.id);
            assert.equal(claim.status, 'running');
            assert.equal(claim.claim_generation, 1);
            assert.equal(typeof claim.claim_token, 'string');

            const progressed = await jobs.progress.query(worker({...lease(claim), item_key: 'l1', item_status: 'completed', step_progress: 50}, {id: job.id}));
            assert.equal(progressed.items[0].status, 'completed');
            assert.equal(progressed.progress, 100);

            const linked = await jobs.linkAssets.query(worker({
                ...lease(claim),
                assets: [{storage_key: `gallery/video_jobs/${job.id}/out.mp4`, storage_url: 'https://example.test/out.mp4', asset_type: 'video', item_key: 'l1'}]
            }, {id: job.id}));
            assert.equal(linked.count, 1);
            const media = await database('social_media_assets').where({id: linked.media_ids[0]}).first();
            assert.equal(media.video_job_id, job.id);
            assert.equal(media.owner_scope, 'video_jobs');
            assert.equal(media.user_id, USER);
            assert.equal((await database('social_ai_video_job_media').where({video_job_id: job.id})).length, 1);

            const done = await jobs.complete.query(worker({...lease(claim), result: {duration_ms: 1000}}, {id: job.id}));
            assert.equal(done.status, 'completed');
            assert.equal(done.claim_worker_id, null);

            const read = await jobs.read.query(staff(USER, {}, {id: job.id}));
            assert.deepEqual(read.result, {duration_ms: 1000});

            const deleted = await jobs.destroy.query(staff(USER, {}, {id: job.id}));
            assert.equal(deleted.status, 'deleted');
            assert.equal(await database('social_ai_video_jobs').where({id: job.id}).first(), undefined);
            assert.equal(await database('social_media_assets').where({video_job_id: job.id}).first(), undefined);
        });

        it('returns an empty list when nothing is queued, and only to a worker integration', async function () {
            assert.deepEqual(await jobs.claim.query(worker({})), []);
            await rejects(jobs.claim.query(staff(USER, {})), {errorType: 'NoPermissionError'});
            // A staff access token carries integration {id: null}: not a worker.
            await rejects(jobs.claim.query({data: {}, options: {context: {user: USER, integration: {id: null}}}}), {errorType: 'NoPermissionError'});
        });

        it('fences a worker that does not hold the lease, and a canceled job', async function () {
            const job = await jobs.add.query(addFrame(USER, {payload: basePayload()}));
            const claim = await jobs.claim.query(worker({worker_id: 'video-1'}));
            await rejects(jobs.progress.query(worker({...lease(claim), claim_token: 'stale'}, {id: job.id})), {code: 'VIDEO_JOB_LEASE_LOST'});
            await jobs.cancel.query(staff(USER, {}, {id: job.id}));
            await rejects(jobs.complete.query(worker(lease(claim), {id: job.id})), {message: 'The requested job transition is not allowed.'});
        });

        it('lets only the creator or a system admin read, and lists only own jobs', async function () {
            const job = await jobs.add.query(addFrame(USER, {payload: basePayload()}));
            await rejects(jobs.read.query(staff(OTHER, {}, {id: job.id})), {errorType: 'NoPermissionError'});
            assert.equal((await jobs.read.query(staff(ADMIN, {}, {id: job.id}))).id, job.id);
            assert.equal((await jobs.browse.query(staff(OTHER))).data.length, 0);
            assert.equal((await jobs.browse.query(staff(USER))).data.length, 1);
            await rejects(jobs.destroy.query(staff(USER, {}, {id: job.id})), {message: 'A queued or running video job cannot be deleted.'});
        });
    });

    describe('link-assets key scope (no re-pointing of other assets)', function () {
        const out = (key, extra = {}) => ({storage_key: key, storage_url: `https://example.test/${key}`, asset_type: 'video', ...extra});
        const start = async () => {
            const job = await jobs.add.query(addFrame(USER, {payload: basePayload()}));
            const claim = await jobs.claim.query(worker({worker_id: 'video-1'}));
            return {job, claim, link: assets => jobs.linkAssets.query(worker({...lease(claim), assets}, {id: job.id}))};
        };

        it('refuses a key outside gallery/video_jobs/{jobId}/ with a 422 and leaves the other asset alone', async function () {
            const {job, link} = await start();
            // An existing gallery photo of the user (owner_scope 'user').
            await rejects(link([out(`gallery/${OWN_PHOTO}.jpg`)]), {
                errorType: 'ValidationError',
                statusCode: 422,
                message: `storage_key must be under gallery/video_jobs/${job.id}/ (this job's gallery area).`
            });
            for (const key of [
                `gallery/video_jobs/${job.id}`,
                `gallery/video_jobs/${job.id}/`,
                `gallery/video_jobs/${job.id}/sub/`,
                `gallery/video_jobs/${job.id}/../${OWN_PHOTO}.jpg`,
                `gallery/video_jobs/${job.id}/./out.mp4`,
                `gallery/video_jobs/${job.id}//out.mp4`,
                // A leading '/' is another S3 object than the one destroy() lists.
                `/gallery/video_jobs/${job.id}/out.mp4`,
                `gallery/video_jobs/${job.id}/a\\b.mp4`,
                `gallery/video_jobs/${job.id}x/out.mp4`,
                `gallery/news_jobs/${job.id}/out.mp4`,
                `gallery/video_jobs/other/${job.id}/out.mp4`,
                // A prefix that is not the configured root (here: none).
                `tenant-a/gallery/video_jobs/${job.id}/out.mp4`,
                // Another job's area around this one, and this job's area
                // holding another job's: destroy() of the other job would match.
                `gallery/video_jobs/fffffffffffffffffffffff1/gallery/video_jobs/${job.id}/out.mp4`,
                `gallery/video_jobs/${job.id}/gallery/video_jobs/fffffffffffffffffffffff1/out.mp4`
            ]) {
                await rejects(link([out(key)]), {errorType: 'ValidationError', statusCode: 422});
            }
            // One bad key refuses the whole batch: nothing is written.
            await rejects(link([out(`gallery/video_jobs/${job.id}/ok.mp4`), out(`gallery/${OWN_PHOTO}.jpg`)]), {errorType: 'ValidationError'});
            assert.equal(await database('social_media_assets').where({video_job_id: job.id}).first(), undefined);
            const photo = await database('social_media_assets').where({id: OWN_PHOTO}).first();
            assert.equal(photo.owner_scope, 'user');
            assert.equal(photo.video_job_id, null);
        });

        it('uses the S3 pathPrefix as the key prefix, refuses any other, and destroy cleans that same area', async function () {
            const listed = [];
            const deleted = [];
            mediaStore = {
                pathPrefix: 'tenant-a/',
                list: async ({prefix}) => {
                    listed.push(prefix);
                    return {items: [{key: `${prefix}out.mp4`}], nextCursor: null};
                },
                delete: async (name, dir) => {
                    deleted.push(`${dir}/${name}`);
                }
            };
            const {job, claim, link} = await start();
            await rejects(link([out(`gallery/video_jobs/${job.id}/out.mp4`)]), {
                errorType: 'ValidationError',
                message: `storage_key must be under tenant-a/gallery/video_jobs/${job.id}/ (this job's gallery area).`
            });
            for (const key of [
                `tenant-b/gallery/video_jobs/${job.id}/out.mp4`,
                `x/tenant-a/gallery/video_jobs/${job.id}/out.mp4`,
                `/tenant-a/gallery/video_jobs/${job.id}/out.mp4`
            ]) {
                await rejects(link([out(key)]), {errorType: 'ValidationError'});
            }
            const key = `tenant-a/gallery/video_jobs/${job.id}/out.mp4`;
            assert.equal((await link([out(key), out(`tenant-a/gallery/video_jobs/${job.id}/p/1.jpg`)])).count, 2);

            await jobs.complete.query(worker({...lease(claim), result: {}}, {id: job.id}));
            await jobs.destroy.query(staff(USER, {}, {id: job.id}));
            assert.deepEqual(listed, [`tenant-a/gallery/video_jobs/${job.id}/`]);
            assert.deepEqual(deleted, [key]);
            assert.equal(await database('social_media_assets').where({video_job_id: job.id}).first(), undefined);
        });

        it('accepts a plain gallery/video_jobs/{jobId}/ key on local storage (storagePath is not a key prefix)', async function () {
            mediaStore = {storagePath: '/var/lib/ghost/content/media'};
            const {job, link} = await start();
            assert.equal((await link([out(`gallery/video_jobs/${job.id}/out.mp4`)])).count, 1);
            await rejects(link([out(`var/lib/ghost/content/media/gallery/video_jobs/${job.id}/out.mp4`)]), {errorType: 'ValidationError'});
        });

        it('does not re-point a row that belongs to another job or another owner_scope', async function () {
            const {job, link} = await start();
            const key = `gallery/video_jobs/${job.id}/out.mp4`;
            const hash = createHash('sha256').update(key).digest('hex');
            const row = (id, extra) => ({
                id, user_id: OTHER, owner_scope: 'video_jobs', storage_key: key, storage_key_hash: hash,
                storage_url: 'https://example.test/x.mp4', asset_type: 'video', created_at: '2026-01-01 00:00:00', ...extra
            });

            await database('social_media_assets').insert(row('eeeeeeeeeeeeeeeeeeeeeee1', {video_job_id: 'fffffffffffffffffffffff1'}));
            await rejects(link([out(key)]), {errorType: 'ConflictError'});
            assert.equal((await database('social_media_assets').where({id: 'eeeeeeeeeeeeeeeeeeeeeee1'}).first()).video_job_id, 'fffffffffffffffffffffff1');

            await database('social_media_assets').where({id: 'eeeeeeeeeeeeeeeeeeeeeee1'}).del();
            await database('social_media_assets').insert(row('eeeeeeeeeeeeeeeeeeeeeee2', {owner_scope: 'user', video_job_id: null}));
            await rejects(link([out(key)]), {errorType: 'ConflictError'});
            const kept = await database('social_media_assets').where({id: 'eeeeeeeeeeeeeeeeeeeeeee2'}).first();
            assert.equal(kept.owner_scope, 'user');
            assert.equal(kept.video_job_id, null);
            assert.equal((await database('social_ai_video_job_media').where({video_job_id: job.id})).length, 0);
        });

        it('accepts keys in the job area and re-links them idempotently (a video_jobs row with no job is reused)', async function () {
            const {job, link} = await start();
            const keys = [`gallery/video_jobs/${job.id}/out.mp4`, `gallery/video_jobs/${job.id}/preview/p1.jpg`];
            const orphanKey = `gallery/video_jobs/${job.id}/orphan.mp4`;
            await database('social_media_assets').insert({
                id: 'eeeeeeeeeeeeeeeeeeeeeee3', user_id: USER, owner_scope: 'video_jobs', video_job_id: null,
                storage_key: orphanKey, storage_key_hash: createHash('sha256').update(orphanKey).digest('hex'),
                storage_url: 'https://example.test/orphan.mp4', asset_type: 'video', created_at: '2026-01-01 00:00:00'
            });
            const first = await link([...keys, orphanKey].map(key => out(key)));
            assert.equal(first.count, 3);
            assert.equal(first.media_ids[2], 'eeeeeeeeeeeeeeeeeeeeeee3');
            const again = await link([out(keys[0], {role: 'preview'})]);
            assert.deepEqual(again.media_ids, [first.media_ids[0]]);
            const rows = await database('social_media_assets').where({video_job_id: job.id});
            assert.equal(rows.length, 3);
            assert.ok(rows.every(media => media.owner_scope === 'video_jobs' && media.user_id === USER));
        });
    });

    describe('payload limits', function () {
        it('refuses an unknown template, too many lines and a long line', async function () {
            await rejects(jobs.add.query(addFrame(USER, {payload: basePayload({template_id: 'https://evil.test/x'})})), {code: 'VIDEO_JOB_UNKNOWN_TEMPLATE'});
            process.env.VIDEO_JOB_MAX_LINES = '1';
            const lines = [{key: 'l1', scene_key: 's1', text: 'a'}, {key: 'l2', scene_key: 's1', text: 'b'}];
            await rejects(jobs.add.query(addFrame(USER, {payload: basePayload({lines})})), {code: 'VIDEO_JOB_TOO_LARGE'});
            await rejects(jobs.add.query(addFrame(USER, {payload: basePayload({lines: [{key: 'l1', scene_key: 's1', text: 'あ'.repeat(301)}]})})), {code: 'VIDEO_JOB_LINE_TOO_LONG'});
            await rejects(jobs.add.query(addFrame(USER, {payload: basePayload({lines: [{key: 'l1', scene_key: 'nope', text: 'a'}]})})), {errorType: 'ValidationError'});
            assert.equal(await database('social_ai_video_jobs').first(), undefined);
        });

        it('refuses a job whose cost estimate is over the env cap', async function () {
            process.env.VIDEO_JOB_MAX_COST_USD = '0.001';
            await rejects(jobs.add.query(addFrame(USER, {payload: basePayload()})), {code: 'VIDEO_JOB_BUDGET_EXCEEDED'});
        });

        it('treats an empty env variable as unset (the default), not as 0', async function () {
            process.env.VIDEO_JOB_MAX_COST_USD = '';
            process.env.VIDEO_JOB_MAX_LINES = ' ';
            assert.equal((await jobs.add.query(addFrame(USER, {payload: basePayload()}))).status, 'queued');
        });

        it('accepts an avatar-less job and a still avatar without lipsync', async function () {
            assert.equal((await jobs.add.query(addFrame(USER, {payload: basePayload({avatar: null})}))).status, 'queued');
            const still = await jobs.add.query(addFrame(USER, {payload: basePayload({avatar: {photo_asset_id: OWN_PHOTO, lipsync: false, motion: 'nod', placement: 'bottom-left'}})}));
            assert.equal(still.avatar_consent_id, null);
        });
    });

    describe('gallery asset access (no IDOR through the worker)', function () {
        it('refuses another user\'s private scene image and avatar photo, lipsync or not', async function () {
            await rejects(jobs.add.query(addFrame(USER, {payload: basePayload({scenes: [{key: 's1', image_asset_id: OTHER_PRIVATE}]})})), {errorType: 'NoPermissionError'});
            await rejects(jobs.add.query(addFrame(USER, {payload: basePayload({avatar: {photo_asset_id: OTHER_PRIVATE, lipsync: false}})})), {errorType: 'NoPermissionError'});
            await rejects(jobs.add.query(addFrame(USER, {payload: basePayload({scenes: [{key: 's1', image_asset_id: MISSING_ASSET}]})})), {errorType: 'NotFoundError'});
            assert.equal(await database('social_ai_video_jobs').first(), undefined);
        });

        it('allows a group asset the creator can write, and any asset for a system admin', async function () {
            assert.ok(await jobs.add.query(addFrame(USER, {payload: basePayload({scenes: [{key: 's1', image_asset_id: OTHER_IN_GROUP}]})})));
            assert.ok(await jobs.add.query(addFrame(ADMIN, {payload: basePayload({scenes: [{key: 's1', image_asset_id: OTHER_PRIVATE}]})})));
        });
    });

    describe('input-assets (worker reads only the job\'s own assets)', function () {
        const start = async (payload = basePayload()) => {
            const job = await jobs.add.query(addFrame(USER, {payload}));
            const claim = await jobs.claim.query(worker({worker_id: 'video-1'}));
            return {job, claim};
        };

        it('returns only the payload\'s scene images and avatar photo to the lease holder', async function () {
            const {job, claim} = await start(basePayload({
                scenes: [{key: 's1', image_asset_id: OWN_PHOTO}],
                avatar: {photo_asset_id: OTHER_IN_GROUP, lipsync: false}
            }));
            const result = await jobs.inputAssets.query(worker(lease(claim), {id: job.id}));
            assert.equal(result.job_id, job.id);
            assert.deepEqual(result.assets.map(a => a.id).sort(), [OWN_PHOTO, OTHER_IN_GROUP].sort());
            assert.deepEqual(Object.keys(result.assets[0]).sort(), ['asset_type', 'id', 'original_filename', 'storage_key', 'storage_url']);
            assert.equal(result.assets.find(a => a.id === OWN_PHOTO).storage_key, `gallery/${OWN_PHOTO}.jpg`);
        });

        it('refuses a session (not a worker integration)', async function () {
            const {job, claim} = await start();
            await rejects(jobs.inputAssets.query(staff(USER, lease(claim), {id: job.id})), {errorType: 'NoPermissionError'});
        });

        it('refuses a worker that does not hold the lease', async function () {
            const {job, claim} = await start();
            await rejects(jobs.inputAssets.query(worker({...lease(claim), claim_token: 'stale'}, {id: job.id})), {code: 'VIDEO_JOB_LEASE_LOST'});
        });

        it('refuses an asset the creator can no longer use', async function () {
            const {job, claim} = await start(basePayload({scenes: [{key: 's1', image_asset_id: OTHER_IN_GROUP}]}));
            await database('social_media_assets').where({id: OTHER_IN_GROUP}).update({group_id: GROUP_NO});
            await rejects(jobs.inputAssets.query(worker(lease(claim), {id: job.id})), {errorType: 'NoPermissionError'});
        });

        it('returns the very row it checked, even if the asset moves groups right after the check', async function () {
            const {job, claim} = await start(basePayload({scenes: [{key: 's1', image_asset_id: OTHER_IN_GROUP}]}));
            const original = models.SocialGroup.canAccessGroup;
            models.SocialGroup.canAccessGroup = async (...args) => {
                const allowed = await original(...args);
                // the access check has passed; now the asset moves to a group the creator cannot use
                await database('social_media_assets').where({id: OTHER_IN_GROUP}).update({group_id: GROUP_NO, storage_key: 'gallery/moved.jpg'});
                return allowed;
            };
            try {
                const result = await jobs.inputAssets.query(worker(lease(claim), {id: job.id}));
                // the checked row, not a second read that would see the change
                assert.equal(result.assets[0].storage_key, `gallery/${OTHER_IN_GROUP}.jpg`);
            } finally {
                models.SocialGroup.canAccessGroup = original;
            }
            // the next call checks again and refuses
            await rejects(jobs.inputAssets.query(worker(lease(claim), {id: job.id})), {errorType: 'NoPermissionError'});
        });
    });

    describe('group, project and scope_type', function () {
        it('requires write access to the group and a matching scope_type', async function () {
            await rejects(jobs.add.query(addFrame(USER, {payload: basePayload(), group_id: GROUP_NO})), {errorType: 'NoPermissionError'});
            await rejects(jobs.add.query(addFrame(USER, {payload: basePayload(), group_id: GROUP_OK, scope_type: 'user'})), {errorType: 'ValidationError'});
            await rejects(jobs.add.query(addFrame(USER, {payload: basePayload(), scope_type: 'group'})), {errorType: 'ValidationError'});
            const job = await jobs.add.query(addFrame(USER, {payload: basePayload(), group_id: GROUP_OK}));
            assert.equal(job.group_id, GROUP_OK);
            assert.equal(job.scope_type, 'group');
        });

        it('takes the group from the project and refuses a different one', async function () {
            const job = await jobs.add.query(addFrame(USER, {payload: basePayload(), project_id: PROJECT}));
            assert.equal(job.project_id, PROJECT);
            assert.equal(job.group_id, GROUP_OK);
            await rejects(jobs.add.query(addFrame(USER, {payload: basePayload(), project_id: PROJECT, group_id: GROUP_NO})), {errorType: 'ValidationError'});
            await rejects(jobs.add.query(addFrame(OTHER, {payload: basePayload({scenes: [{key: 's1'}]}), project_id: 'ccccccccccccccccccccccc9'})), {errorType: 'NotFoundError'});
        });
    });

    describe('talking face and consent', function () {
        const lipsyncPayload = consentId => basePayload({avatar: {photo_asset_id: OWN_PHOTO, consent_id: consentId, lipsync: true}});
        const addConsent = (uses = ['video_avatar', 'lipsync'], user = USER, photo = OWN_PHOTO) => consents.add.query(staff(user, {
            socialaiavatarconsents: [{photo_asset_id: photo, subject_name: '本人', consented_by_name: '本人', uses}]
        }));

        it('is off unless VIDEO_JOB_FACE_ENABLED is true', async function () {
            const consent = await addConsent();
            await rejects(jobs.add.query(addFrame(USER, {payload: lipsyncPayload(consent.id)})), {code: 'VIDEO_JOB_FACE_DISABLED'});
        });

        it('needs an active consent of the creator for this photo that allows lipsync', async function () {
            process.env.VIDEO_JOB_FACE_ENABLED = 'true';
            await rejects(jobs.add.query(addFrame(USER, {payload: basePayload({avatar: {photo_asset_id: OWN_PHOTO, lipsync: true}})})), {code: 'VIDEO_JOB_CONSENT_REQUIRED'});
            const stillOnly = await addConsent(['video_avatar']);
            await rejects(jobs.add.query(addFrame(USER, {payload: lipsyncPayload(stillOnly.id)})), {code: 'VIDEO_JOB_CONSENT_REQUIRED'});
            const otherPhoto = await addConsent(['lipsync'], USER, OTHER_IN_GROUP);
            await rejects(jobs.add.query(addFrame(USER, {payload: lipsyncPayload(otherPhoto.id)})), {code: 'VIDEO_JOB_CONSENT_REQUIRED'});

            const consent = await addConsent();
            const job = await jobs.add.query(addFrame(USER, {payload: lipsyncPayload(consent.id)}));
            assert.equal(job.avatar_consent_id, consent.id);
            assert.equal(job.estimate.face_lines, 1);
        });

        it('revoking a consent refuses new jobs and cancels open ones (idempotent)', async function () {
            process.env.VIDEO_JOB_FACE_ENABLED = 'true';
            const consent = await addConsent();
            const job = await jobs.add.query(addFrame(USER, {payload: lipsyncPayload(consent.id)}));
            await rejects(consents.revoke.query(staff(OTHER, {}, {id: consent.id})), {errorType: 'NoPermissionError'});

            const revoked = await consents.revoke.query(staff(USER, {reason: '本人の希望'}, {id: consent.id}));
            assert.equal(revoked.active, false);
            assert.equal(revoked.canceled_jobs, 1);
            const canceled = await database('social_ai_video_jobs').where({id: job.id}).first();
            assert.equal(canceled.status, 'canceled');
            assert.equal(canceled.error_code, 'consent_revoked');

            const again = await consents.revoke.query(staff(USER, {}, {id: consent.id}));
            assert.equal(again.revoked_at, revoked.revoked_at);
            await rejects(jobs.add.query(addFrame(USER, {payload: lipsyncPayload(consent.id)})), {code: 'VIDEO_JOB_CONSENT_REQUIRED'});
        });

        it('lets a system admin revoke another user\'s consent', async function () {
            process.env.VIDEO_JOB_FACE_ENABLED = 'true';
            const consent = await addConsent();
            const job = await jobs.add.query(addFrame(USER, {payload: lipsyncPayload(consent.id)}));
            const revoked = await consents.revoke.query(staff(ADMIN, {}, {id: consent.id}));
            assert.equal(revoked.active, false);
            assert.equal(revoked.revoked_by, ADMIN);
            assert.equal(revoked.canceled_jobs, 1);
            assert.equal((await database('social_ai_video_jobs').where({id: job.id}).first()).status, 'canceled');
        });

        it('keeps the consent record when the staff user is deleted (user_id is not a cascading FK)', async function () {
            assert.equal(schema.social_ai_avatar_consents.user_id.references, undefined);
            assert.equal(schema.social_ai_avatar_consents.user_id.cascadeDelete, undefined);
        });

        it('lets only a logged-in staff user record a consent for a photo they can use', async function () {
            await rejects(consents.add.query(worker({photo_asset_id: OWN_PHOTO, subject_name: 'x'})), {errorType: 'NoPermissionError'});
            await rejects(addConsent(['video_avatar'], USER, OTHER_PRIVATE), {errorType: 'NoPermissionError'});
            await rejects(addConsent(['clone_voice']), {errorType: 'ValidationError'});
            await rejects(consents.add.query(staff(USER, {photo_asset_id: OWN_PHOTO})), {errorType: 'ValidationError'});
            const consent = await addConsent();
            assert.deepEqual(consent.uses, ['video_avatar', 'lipsync']);
            assert.equal(consent.active, true);

            assert.equal((await consents.browse.query(staff(USER))).data.length, 1);
            assert.equal((await consents.browse.query(staff(OTHER))).data.length, 0);
            assert.equal((await consents.read.query(worker({}, {id: consent.id}))).id, consent.id);
            await rejects(consents.read.query(staff(OTHER, {}, {id: consent.id})), {errorType: 'NoPermissionError'});
        });
    });
});
