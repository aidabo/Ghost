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
// The creator's own projects (no group): where most jobs of this suite live,
// since a video job needs a project.
const OWN_PROJECT = 'ccccccccccccccccccccccc2';
const OWN_PROJECT_2 = 'ccccccccccccccccccccccc3';
const PROJECT_GROUP_NO = 'ccccccccccccccccccccccc4';
const OWN_PHOTO = 'ddddddddddddddddddddddd1';
const OTHER_PRIVATE = 'ddddddddddddddddddddddd2';
const OTHER_IN_GROUP = 'ddddddddddddddddddddddd3';
const MISSING_ASSET = 'ddddddddddddddddddddddd9';

const staff = (user, data = {}, options = {}) => ({data, options: {...options, context: {user}}});
const worker = (data = {}, options = {}) => ({data, options: {...options, context: {integration: {id: 'integration-1'}}}});
// A video job needs a project (plan 10.2): the creator's own one unless the
// test names another (or none).
const addFrame = (user, body) => staff(user, {socialaivideojobs: [{project_id: OWN_PROJECT, ...body}]});

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
    const ENV = ['VIDEO_JOB_FACE_ENABLED', 'VIDEO_JOB_MAX_COST_USD', 'VIDEO_JOB_TEMPLATE_IDS', 'VIDEO_JOB_MAX_LINES',
        'VIDEO_JOB_MONTHLY_MAX_COST_USD', 'VIDEO_JOB_VOICE_LINE_COST_USD', 'VIDEO_JOB_FACE_SECOND_COST_USD',
        'VIDEO_JOB_MAX_SECONDS', 'VIDEO_JOB_MONTHLY_MAX_JOBS'];
    // The site timezone (settings `timezone`) the budget month is counted in.
    let siteTimezone = 'Asia/Tokyo';

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
                if (request === '../../../shared/settings-cache') {
                    return {get: key => (key === 'timezone' ? siteTimezone : undefined)};
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
        for (const table of ['users', 'social_media_assets', 'social_ai_video_jobs', 'social_ai_video_job_media', 'social_ai_avatar_consents', 'social_ai_video_cost_months']) {
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
                findOne: async ({id}) => {
                    const project = {
                        [PROJECT]: {user_id: OTHER, group_id: GROUP_OK},
                        [OWN_PROJECT]: {user_id: USER, group_id: null},
                        [OWN_PROJECT_2]: {user_id: USER, group_id: null},
                        [PROJECT_GROUP_NO]: {user_id: USER, group_id: GROUP_NO}
                    }[id];
                    return project ? {get: key => project[key]} : null;
                }
            }
        };
        jobs = load(jobsPath);
        consents = load(consentsPath);
    });

    beforeEach(async function () {
        mediaStore = null;
        siteTimezone = 'Asia/Tokyo';
        ENV.forEach((name) => {
            savedEnv[name] = process.env[name];
            delete process.env[name];
        });
        await database('social_ai_video_job_media').del();
        await database('social_ai_video_jobs').del();
        await database('social_ai_video_cost_months').del();
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
            '2026-11-25-00-00-05-add-social-ai-avatar-consents-table',
            '2026-11-25-00-00-06-add-video-job-cost-columns'
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

                for (const table of ['social_ai_video_jobs', 'social_ai_video_job_media', 'social_ai_avatar_consents', 'social_media_assets', 'social_ai_video_cost_months']) {
                    const expected = Object.keys(schema[table]).filter(key => !key.startsWith('@@')).sort();
                    assert.deepEqual(Object.keys(await old(table).columnInfo()).sort(), expected, table);
                }
                // The fresh database of this suite was built from schema.js (init).
                assert.deepEqual(await indexNames(old), await indexNames(database));

                for (const migration of [...MIGRATIONS].reverse()) {
                    await migration.down({connection: old});
                }
                assert.equal(await old.schema.hasTable('social_ai_video_jobs'), false);
                assert.equal(await old.schema.hasTable('social_ai_video_cost_months'), false);
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
                message: `storage_key must be under gallery/video_jobs/${job.id}/ or gallery/projects/${OWN_PROJECT}/artifacts/video/ (this job's gallery area or its project's video artifacts).`
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
                message: `storage_key must be under tenant-a/gallery/video_jobs/${job.id}/ or tenant-a/gallery/projects/${OWN_PROJECT}/artifacts/video/ (this job's gallery area or its project's video artifacts).`
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

    describe('results in the project (artifacts/video/) and H3 on destroy', function () {
        const out = (key, extra = {}) => ({storage_key: key, storage_url: `https://example.test/${key}`, asset_type: 'video', ...extra});
        const artifact = (name, projectId = OWN_PROJECT, root = '') => `${root}gallery/projects/${projectId}/artifacts/video/${name}`;
        const start = async (projectId = OWN_PROJECT) => {
            const job = await jobs.add.query(addFrame(USER, {payload: basePayload(), project_id: projectId}));
            const claim = await jobs.claim.query(worker({worker_id: 'video-1'}));
            assert.equal(claim.id, job.id);
            return {
                job,
                claim,
                link: assets => jobs.linkAssets.query(worker({...lease(claim), assets}, {id: job.id})),
                complete: () => jobs.complete.query(worker({...lease(claim), result: {}}, {id: job.id}))
            };
        };

        it('links a result under this job\'s project artifacts/video/ as role=output, owned by the job', async function () {
            const {job, link} = await start();
            const linked = await link([out(artifact(`${'f'.repeat(24)}-intro.mp4`))]);
            assert.equal(linked.count, 1);
            const media = await database('social_media_assets').where({id: linked.media_ids[0]}).first();
            assert.equal(media.video_job_id, job.id);
            assert.equal(media.project_id, OWN_PROJECT);
            assert.equal(media.owner_scope, 'video_jobs');
            assert.equal(media.user_id, USER);
            const junction = await database('social_ai_video_job_media').where({video_job_id: job.id, media_id: media.id}).first();
            assert.equal(junction.role, 'output');
            // An intermediate the gallery may show still goes to the job's area.
            const preview = await link([out(`gallery/video_jobs/${job.id}/preview.jpg`, {role: 'intermediate', asset_type: 'image'})]);
            assert.equal((await database('social_ai_video_job_media').where({media_id: preview.media_ids[0]}).first()).role, 'intermediate');
        });

        it('pairs role and area: output only in the project, other roles only in the job area (422 otherwise)', async function () {
            const {job, link} = await start();
            const jobKey = `gallery/video_jobs/${job.id}/out.mp4`;
            // A result in the job area would be deleted with the job (against H3).
            await rejects(link([out(jobKey, {role: 'output'})]), {errorType: 'ValidationError', statusCode: 422});
            for (const role of ['intermediate', 'preview', 'input', 'source', 'material']) {
                await rejects(link([out(artifact(`${role}.mp4`), {role})]), {errorType: 'ValidationError', statusCode: 422});
            }
            // An unknown role is refused, not taken as output.
            for (const role of ['result', 'OUTPUT', 1]) {
                await rejects(link([out(artifact('x.mp4'), {role})]), {errorType: 'ValidationError', statusCode: 422});
                await rejects(link([out(jobKey, {role})]), {errorType: 'ValidationError', statusCode: 422});
            }
            assert.equal(await database('social_media_assets').where({video_job_id: job.id}).first(), undefined);

            // No role: the area decides (project → output, job area → intermediate).
            const linked = await link([out(artifact('a.mp4')), out(jobKey), out(artifact('b.mp4'), {role: null})]);
            const roles = await Promise.all(linked.media_ids.map(async id => (await database('social_ai_video_job_media').where({media_id: id}).first()).role));
            assert.deepEqual(roles, ['output', 'intermediate', 'output']);
            // Re-linking a job-area row as output is refused too.
            await rejects(link([out(jobKey, {role: 'output'})]), {errorType: 'ValidationError', statusCode: 422});
        });

        it('destroy cannot delete a result: an output sent to the job area is refused before anything is written', async function () {
            const {job, link, complete} = await start();
            await rejects(link([out(artifact('ok.mp4'), {role: 'output'}), out(`gallery/video_jobs/${job.id}/result.mp4`, {role: 'output'})]), {errorType: 'ValidationError', statusCode: 422});
            assert.equal(await database('social_media_assets').where({video_job_id: job.id}).first(), undefined);
            const linked = await link([out(artifact('ok.mp4'), {role: 'output'})]);
            await complete();
            await jobs.destroy.query(staff(USER, {}, {id: job.id}));
            assert.ok(await database('social_media_assets').where({id: linked.media_ids[0]}).first());
        });

        it('refuses another project, another kind and malformed keys under the project with a 422', async function () {
            const {job, link} = await start();
            for (const key of [
                artifact('out.mp4', OWN_PROJECT_2),
                artifact('out.mp4', PROJECT),
                `gallery/projects/${OWN_PROJECT}/artifacts/chart/out.png`,
                `gallery/projects/${OWN_PROJECT}/artifacts/videox/out.mp4`,
                `gallery/projects/${OWN_PROJECT}/artifacts/out.mp4`,
                `gallery/projects/${OWN_PROJECT}/video/out.mp4`,
                `gallery/projects/${OWN_PROJECT}/out.mp4`,
                `gallery/projects/${OWN_PROJECT}x/artifacts/video/out.mp4`,
                `gallery/projects/${OWN_PROJECT}/artifacts/video`,
                artifact(''),
                artifact('sub/'),
                artifact(`../../${OWN_PROJECT_2}/artifacts/video/out.mp4`),
                artifact('./out.mp4'),
                artifact('/out.mp4'),
                `/${artifact('out.mp4')}`,
                artifact('a\\b.mp4'),
                `tenant-a/${artifact('out.mp4')}`,
                // A job or gallery area below it: another job's destroy would match it.
                artifact(`jobs/${job.id}/out.mp4`),
                artifact('gallery/video_jobs/fffffffffffffffffffffff1/out.mp4')
            ]) {
                await rejects(link([out(key)]), {errorType: 'ValidationError', statusCode: 422});
            }
            assert.equal(await database('social_media_assets').where({video_job_id: job.id}).first(), undefined);
        });

        it('uses the S3 pathPrefix for the project area too', async function () {
            mediaStore = {pathPrefix: 'tenant-a/'};
            const {link} = await start();
            await rejects(link([out(artifact('out.mp4'))]), {errorType: 'ValidationError', statusCode: 422});
            await rejects(link([out(artifact('out.mp4', OWN_PROJECT, 'tenant-b/'))]), {errorType: 'ValidationError', statusCode: 422});
            assert.equal((await link([out(artifact('out.mp4', OWN_PROJECT, 'tenant-a/'))])).count, 1);
        });

        it('refuses (409) a result name another job of the same project already linked, even after that job is deleted', async function () {
            const first = await start();
            const key = artifact('intro.mp4');
            const linked = await first.link([out(key)]);
            await first.complete();

            const second = await start();
            await rejects(second.link([out(key)]), {errorType: 'ConflictError', statusCode: 409});
            await jobs.destroy.query(staff(USER, {}, {id: first.job.id}));
            await rejects(second.link([out(key)]), {errorType: 'ConflictError', statusCode: 409});
            const kept = await database('social_media_assets').where({id: linked.media_ids[0]}).first();
            assert.equal(kept.video_job_id, first.job.id);
            assert.equal((await database('social_ai_video_job_media').where({video_job_id: second.job.id})).length, 0);
        });

        it('destroy keeps the project result (row and S3 object) and removes the job area (row and S3 object)', async function () {
            const listed = [];
            const deleted = [];
            mediaStore = {
                pathPrefix: 'tenant-a',
                list: async ({prefix}) => {
                    listed.push(prefix);
                    return {items: prefix.includes('/video_jobs/') ? [{key: `${prefix}preview.jpg`}] : [], nextCursor: null};
                },
                delete: async (name, dir) => {
                    deleted.push(`${dir}/${name}`);
                }
            };
            const {job, link, complete} = await start();
            const resultKey = artifact('intro.mp4', OWN_PROJECT, 'tenant-a/');
            const previewKey = `tenant-a/gallery/video_jobs/${job.id}/preview.jpg`;
            const linked = await link([out(resultKey), out(previewKey, {role: 'intermediate', asset_type: 'image'})]);
            await complete();

            await jobs.destroy.query(staff(USER, {}, {id: job.id}));

            assert.deepEqual(listed, [`tenant-a/gallery/video_jobs/${job.id}/`]);
            assert.deepEqual(deleted, [previewKey]);
            const result = await database('social_media_assets').where({id: linked.media_ids[0]}).first();
            assert.equal(result.storage_key, resultKey);
            assert.equal(result.project_id, OWN_PROJECT);
            // Kept as it is, as chart / news keep chart_job_id / news_job_id.
            assert.equal(result.video_job_id, job.id);
            assert.equal(await database('social_media_assets').where({id: linked.media_ids[1]}).first(), undefined);
            assert.equal((await database('social_ai_video_job_media').where({video_job_id: job.id})).length, 0);
            assert.equal(await database('social_ai_video_jobs').where({id: job.id}).first(), undefined);
        });

        it('a job without a project (made before project_id was required) still loses every row it made on destroy', async function () {
            const {job, link, complete} = await start();
            await database('social_ai_video_jobs').where({id: job.id}).update({project_id: null});
            // Without a project only the job's own area is accepted.
            await rejects(link([out(artifact('out.mp4'))]), {
                errorType: 'ValidationError',
                statusCode: 422,
                message: `storage_key must be under gallery/video_jobs/${job.id}/ (this job's gallery area or its project's video artifacts).`
            });
            const linked = await link([out(`gallery/video_jobs/${job.id}/out.mp4`)]);
            const media = await database('social_media_assets').where({id: linked.media_ids[0]}).first();
            assert.equal(media.project_id, null);
            // A row of this job outside the area (written before #84) goes too.
            await database('social_media_assets').insert({
                id: 'eeeeeeeeeeeeeeeeeeeeeee5', user_id: USER, owner_scope: 'video_jobs', video_job_id: job.id,
                storage_key: 'gallery/legacy/out.mp4', storage_key_hash: 'legacy-hash',
                storage_url: 'https://example.test/legacy.mp4', asset_type: 'video', created_at: '2026-01-01 00:00:00'
            });
            await complete();
            await jobs.destroy.query(staff(USER, {}, {id: job.id}));
            assert.equal(await database('social_media_assets').where({video_job_id: job.id}).first(), undefined);
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
            await rejects(jobs.add.query(addFrame(USER, {payload: basePayload(), project_id: PROJECT_GROUP_NO})), {errorType: 'NoPermissionError'});
            await rejects(jobs.add.query(addFrame(USER, {payload: basePayload(), project_id: PROJECT, scope_type: 'user'})), {errorType: 'ValidationError'});
            await rejects(jobs.add.query(addFrame(USER, {payload: basePayload(), scope_type: 'group'})), {errorType: 'ValidationError'});
            const job = await jobs.add.query(addFrame(USER, {payload: basePayload(), project_id: PROJECT, group_id: GROUP_OK}));
            assert.equal(job.group_id, GROUP_OK);
            assert.equal(job.scope_type, 'group');
        });

        it('refuses a job without a project with a 422 (the API, not only the screen)', async function () {
            for (const projectId of [undefined, null, '', '   ']) {
                await rejects(jobs.add.query(addFrame(USER, {payload: basePayload(), project_id: projectId})), {
                    errorType: 'ValidationError',
                    statusCode: 422,
                    message: 'project_id is required for a video job.'
                });
            }
            // A worker integration naming a user is refused the same way.
            await rejects(jobs.add.query(worker({socialaivideojobs: [{user_id: USER, payload: basePayload()}]})), {errorType: 'ValidationError', statusCode: 422});
            assert.equal(await database('social_ai_video_jobs').first(), undefined);
        });

        it('takes the group from the project and refuses a different one', async function () {
            const job = await jobs.add.query(addFrame(USER, {payload: basePayload(), project_id: PROJECT}));
            assert.equal(job.project_id, PROJECT);
            assert.equal(job.group_id, GROUP_OK);
            await rejects(jobs.add.query(addFrame(USER, {payload: basePayload(), project_id: PROJECT, group_id: GROUP_NO})), {errorType: 'ValidationError'});
            await rejects(jobs.add.query(addFrame(OTHER, {payload: basePayload({scenes: [{key: 's1'}]}), project_id: 'ccccccccccccccccccccccc9'})), {errorType: 'NotFoundError'});
        });
    });

    describe('monthly budget (counted by Ghost)', function () {
        // Each job of basePayload() has one line: with a 1 USD voice line it is
        // a 1 USD job, and a cap of 2 USD fits exactly two.
        const oneDollarJobs = (cap = '2') => {
            process.env.VIDEO_JOB_VOICE_LINE_COST_USD = '1';
            process.env.VIDEO_JOB_MONTHLY_MAX_COST_USD = cap;
        };
        const add = () => jobs.add.query(addFrame(USER, {payload: basePayload()}));
        const reserve = (claim, body) => jobs.reserveCost.query(worker({...lease(claim), ...body}, {id: claim.id}));
        let clock = null;
        const at = (iso) => {
            clock?.restore();
            clock = sinon.useFakeTimers({now: new Date(iso), toFake: ['Date']});
        };
        afterEach(function () {
            clock?.restore();
            clock = null;
        });

        it('defaults to 30 USD a month, and records the estimate as the hold in the site month', async function () {
            at('2026-11-10T00:00:00Z');
            const job = await add();
            assert.equal(job.cost_month, '2026-11');
            assert.equal(job.cost_estimate_usd, 0.002);
            assert.equal(job.cost_reserved_usd, 0.002);
            assert.equal(job.cost_actual_usd, null);
            assert.deepEqual(await jobs.budget.query(staff(USER)), {
                month: '2026-11',
                max_video_seconds: 60,
                monthly_max_jobs: 30,
                month_jobs: 1,
                remaining_jobs: 29,
                monthly_max_usd: 30,
                month_total_usd: 0.002,
                remaining_usd: 29.998
            });
        });

        it('accepts a job that reaches the cap exactly and refuses the one over it, writing nothing', async function () {
            oneDollarJobs();
            await add();
            assert.equal((await add()).status, 'queued');
            await rejects(add(), {errorType: 'ValidationError', statusCode: 422, code: 'VIDEO_JOB_MONTHLY_BUDGET_EXCEEDED'});
            assert.equal((await database('social_ai_video_jobs')).length, 2);
        });

        it('lets requests that arrive at once take no more than the budget (one of three is refused)', async function () {
            oneDollarJobs('3');
            await add();
            const results = await Promise.allSettled([add(), add(), add()]);
            assert.equal(results.filter(r => r.status === 'fulfilled').length, 2);
            const refused = results.filter(r => r.status === 'rejected');
            assert.equal(refused.length, 1);
            assert.equal(refused[0].reason.code, 'VIDEO_JOB_MONTHLY_BUDGET_EXCEEDED');
            assert.equal((await jobs.budget.query(staff(USER))).month_total_usd, 3);
        });

        it('lets the worker reserve before a paid stage: raise within the month, refuse over it, lower always', async function () {
            oneDollarJobs('2.5');
            process.env.VIDEO_JOB_MAX_COST_USD = '3';
            await add();
            await add();
            const first = await jobs.claim.query(worker({worker_id: 'video-1'}));
            const second = await jobs.claim.query(worker({worker_id: 'video-2'}));

            // Cached lines cost nothing: the first job needs only 0.25 USD.
            const lowered = await reserve(first, {total_usd: 0.25});
            assert.equal(lowered.approved, true);
            assert.equal(lowered.month_total_usd, 1.25);
            // The second may now take up to what is left (1.25 + 1 = 2.25 ≤ 2.5).
            const raised = await reserve(second, {total_usd: 2.25});
            assert.equal(raised.month_total_usd, 2.5);
            assert.equal(raised.remaining_usd, 0);
            // Retrying the same total is the same answer.
            assert.equal((await reserve(second, {total_usd: 2.25})).month_total_usd, 2.5);
            await rejects(reserve(first, {total_usd: 0.26}), {code: 'VIDEO_JOB_MONTHLY_BUDGET_EXCEEDED'});
            // Over the per-job cap (VIDEO_JOB_MAX_COST_USD) is a different refusal.
            await rejects(reserve(second, {total_usd: 3.01}), {code: 'VIDEO_JOB_BUDGET_EXCEEDED'});
            await rejects(reserve(second, {total_usd: -1}), {errorType: 'ValidationError'});
            // Only the lease holder.
            await rejects(reserve({...first, claim_token: 'stale'}, {total_usd: 0}), {code: 'VIDEO_JOB_LEASE_LOST'});
            await rejects(jobs.reserveCost.query(staff(USER, {total_usd: 0}, {id: first.id})), {errorType: 'NoPermissionError'});
            const row = await database('social_ai_video_jobs').where({id: first.id}).first();
            assert.equal(row.cost_reserved_micros, 250000);
        });

        it('lets only one of two workers at once take the last of the budget', async function () {
            oneDollarJobs('3');
            await add();
            await add();
            const first = await jobs.claim.query(worker({worker_id: 'video-1'}));
            const second = await jobs.claim.query(worker({worker_id: 'video-2'}));
            // 2 USD held; each asks for 1 more, only one fits.
            const results = await Promise.allSettled([reserve(first, {total_usd: 2}), reserve(second, {total_usd: 2})]);
            assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
            assert.equal(results.find(r => r.status === 'rejected').reason.code, 'VIDEO_JOB_MONTHLY_BUDGET_EXCEEDED');
            assert.equal((await jobs.budget.query(worker())).month_total_usd, 3);
        });

        it('counts what was really spent once a job ends, and frees the hold of a job canceled before any worker took it', async function () {
            oneDollarJobs('2');
            const queued = await add();
            await add();
            const claim = await jobs.claim.query(worker({worker_id: 'video-1'}));
            assert.equal(claim.id, queued.id);
            const done = await jobs.complete.query(worker({...lease(claim), cost_usd: 0.4}, {id: claim.id}));
            assert.equal(done.cost_actual_usd, 0.4);
            assert.equal((await jobs.budget.query(staff(USER))).month_total_usd, 1.4);

            const other = (await database('social_ai_video_jobs').where({status: 'queued'}).first()).id;
            await jobs.cancel.query(staff(USER, {}, {id: other}));
            assert.equal((await jobs.budget.query(staff(USER))).month_total_usd, 0.4);
        });

        it('keeps the hold of a running job that is canceled (a sent call is paid)', async function () {
            oneDollarJobs('2');
            await add();
            const claim = await jobs.claim.query(worker({worker_id: 'video-1'}));
            await jobs.cancel.query(staff(USER, {}, {id: claim.id}));
            assert.equal((await jobs.budget.query(staff(USER))).month_total_usd, 1);
        });

        it('starts a new budget when the month turns in the SITE timezone, and moves a reserving job to it', async function () {
            oneDollarJobs('1');
            // 23:59 on 30 November in Tokyo.
            at('2026-11-30T14:59:00Z');
            const november = await add();
            assert.equal(november.cost_month, '2026-11');
            await rejects(add(), {code: 'VIDEO_JOB_MONTHLY_BUDGET_EXCEEDED'});

            // 00:00 on 1 December in Tokyo (still November in UTC).
            at('2026-11-30T15:00:00Z');
            const december = await add();
            assert.equal(december.cost_month, '2026-12');
            assert.equal((await jobs.budget.query(staff(USER))).month_total_usd, 1);

            // The November job reserves in December: it moves there and is
            // refused, because December is full.
            const claim = await jobs.claim.query(worker({worker_id: 'video-1'}));
            assert.equal(claim.id, november.id);
            await rejects(reserve(claim, {total_usd: 0.5}), {code: 'VIDEO_JOB_MONTHLY_BUDGET_EXCEEDED'});
            assert.equal((await database('social_ai_video_jobs').where({id: november.id}).first()).cost_month, '2026-11');

            // With the site in UTC, the same moment is still November.
            siteTimezone = 'Etc/UTC';
            assert.equal((await jobs.budget.query(staff(USER))).month, '2026-11');
        });

        it('refuses a video longer than VIDEO_JOB_MAX_SECONDS (estimated from the text and the scenes) with its own code', async function () {
            // 70 characters of Japanese at 7 a second, tempo 0.85: 11.8 s + 0.6 s
            // in its scene; two silent scenes of 3 s each: about 19 s.
            const scenes = [{key: 's1'}, {key: 's2'}, {key: 's3'}];
            const payload = basePayload({scenes, lines: [{key: 'l1', scene_key: 's1', text: 'あ'.repeat(70)}]});
            process.env.VIDEO_JOB_MAX_SECONDS = '18';
            await rejects(jobs.add.query(addFrame(USER, {payload})), {statusCode: 422, code: 'VIDEO_JOB_TOO_LONG'});
            process.env.VIDEO_JOB_MAX_SECONDS = '19';
            const job = await jobs.add.query(addFrame(USER, {payload}));
            assert.equal(job.estimate.video_seconds, 19);
        });

        it('counts the videos of the month: exactly at VIDEO_JOB_MONTHLY_MAX_JOBS passes, one more is refused with its own code', async function () {
            process.env.VIDEO_JOB_MONTHLY_MAX_JOBS = '2';
            await add();
            await add();
            await rejects(add(), {statusCode: 422, code: 'VIDEO_JOB_MONTHLY_COUNT_EXCEEDED'});
            const usage = await jobs.budget.query(staff(USER));
            assert.equal(usage.month_jobs, 2);
            assert.equal(usage.remaining_jobs, 0);
        });

        it('does not count a failed or canceled job that cost nothing, but counts completed and running ones', async function () {
            process.env.VIDEO_JOB_MONTHLY_MAX_JOBS = '2';
            // Canceled before any worker took it: costs nothing, frees its place.
            const canceled = await add();
            await jobs.cancel.query(staff(USER, {}, {id: canceled.id}));
            // Failed with nothing spent: frees its place.
            await add();
            const failing = await jobs.claim.query(worker({worker_id: 'video-1'}));
            await jobs.fail.query(worker({...lease(failing), error_code: 'budget_exceeded', cost_usd: 0}, {id: failing.id}));
            assert.equal((await jobs.budget.query(staff(USER))).month_jobs, 0);

            // Completed and running both count.
            await add();
            const done = await jobs.claim.query(worker({worker_id: 'video-1'}));
            await jobs.complete.query(worker({...lease(done), cost_usd: 0}, {id: done.id}));
            await add();
            await jobs.claim.query(worker({worker_id: 'video-2'}));
            assert.equal((await jobs.budget.query(staff(USER))).month_jobs, 2);
            await rejects(add(), {code: 'VIDEO_JOB_MONTHLY_COUNT_EXCEEDED'});
        });

        it('lets requests that arrive at once take no more than the number of videos', async function () {
            process.env.VIDEO_JOB_MONTHLY_MAX_JOBS = '2';
            const results = await Promise.allSettled([add(), add(), add()]);
            assert.equal(results.filter(r => r.status === 'fulfilled').length, 2);
            assert.equal(results.find(r => r.status === 'rejected').reason.code, 'VIDEO_JOB_MONTHLY_COUNT_EXCEEDED');
        });

        it('refuses the budget to a request with neither a staff user nor a worker', async function () {
            await rejects(jobs.budget.query({data: {}, options: {context: {}}}), {errorType: 'NoPermissionError'});
        });
    });

    describe('face cost by the second', function () {
        const {faceSeconds, estimate} = require('../../../../core/server/api/endpoints/utils/video-job-payload');
        const face = (lang, text, tempo) => ({
            lang, voice: tempo === undefined ? undefined : {tempo},
            lines: [{key: 'l1', scene_key: 's1', text}],
            avatar: {photo_asset_id: OWN_PHOTO, lipsync: true}
        });

        it('estimates the seconds of speech from the text, by language and tempo', function () {
            assert.equal(faceSeconds(face('ja', 'あ'.repeat(70))), 10);
            assert.equal(faceSeconds(face('ja-JP', 'あ'.repeat(70), 0.5)), 20);
            assert.equal(faceSeconds(face('zh', '好'.repeat(45))), 10);
            assert.equal(faceSeconds(face('en', 'a'.repeat(140))), 10);
            // Unknown or missing language: the Latin-script rate.
            assert.equal(faceSeconds(face(undefined, 'a'.repeat(141))), 11);
            // No lip-sync, no face seconds.
            assert.equal(faceSeconds({...face('ja', 'あ'.repeat(70)), avatar: {photo_asset_id: OWN_PHOTO, lipsync: false}}), 0);
        });

        it('prices the face per second with VIDEO_JOB_FACE_SECOND_COST_USD', function () {
            process.env.VIDEO_JOB_FACE_SECOND_COST_USD = '0.1';
            process.env.VIDEO_JOB_VOICE_LINE_COST_USD = '0';
            const result = estimate(face('ja', 'あ'.repeat(70)));
            assert.equal(result.face_seconds, 10);
            assert.equal(result.cost_usd, 1);
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
            // 19 characters of Japanese at 7 a second, tempo 0.85: 3.2 → 4 seconds.
            assert.equal(job.estimate.face_seconds, 4);
            assert.equal(job.estimate.cost_usd, 0.002 + (4 * 0.02));
            assert.equal(job.cost_estimate_usd, job.estimate.cost_usd);
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
