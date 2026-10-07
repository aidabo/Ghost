const assert = require('assert/strict');
const Module = require('module');
const sinon = require('sinon');
const knex = require('knex');
const {createHash, randomUUID} = require('crypto');

const TABLE = 'social_ai_news_jobs';
const endpointPath = require.resolve('../../../../core/server/api/endpoints/social-ai-news-jobs');
const workerFrame = data => ({data, options: {context: {integration: {id: 'integration-1'}}}});

describe('News job lease generation fencing', function () {
    let database;
    let models;
    let endpoint;

    before(async function () {
        database = knex({client: 'sqlite3', connection: {filename: ':memory:'}, useNullAsDefault: true});
        await database.schema.createTable('users', table => table.string('id').primary());
        await database('users').insert({id: 'user-1'});
        await database.schema.createTable(TABLE, (table) => {
            table.string('id').primary();
            table.integer('progress');
            table.integer('claim_generation').notNullable().defaultTo(0);
            table.string('claim_token');
            [
                'type', 'status', 'current_step_id', 'status_message', 'steps', 'items', 'payload',
                'result', 'artifacts', 'project_id', 'user_id', 'group_id', 'scope_type',
                'created_at', 'created_by', 'updated_at', 'updated_by', 'started_at', 'completed_at',
                'claim_worker_id', 'claim_expires_at', 'error_code', 'error_message'
            ].forEach(column => table.string(column));
        });
        await database.schema.createTable('social_media_assets', (table) => {
            table.string('id').primary();
            table.string('storage_key_hash').unique();
            ['storage_key', 'storage_url', 'thumbnail_url', 'original_filename', 'asset_type',
                'news_job_id', 'project_id', 'user_id', 'group_id', 'owner_scope', 'created_at', 'updated_at'
            ].forEach(column => table.string(column));
        });
        await database.schema.createTable('social_ai_news_job_media', (table) => {
            table.string('id').primary();
            ['news_job_id', 'media_id', 'role', 'source_kind', 'step_id', 'item_key', 'post_id',
                'person_name', 'caption', 'created_at'].forEach(column => table.string(column));
            table.integer('sort_order');
        });
        models = {Base: {knex: database}};
        // Only stub the endpoint's boundary dependencies. Knex executes real SQL;
        // Ghost models/storage are never initialized and no config is loaded.
        const originalLoad = Module._load;
        const dependencyStub = sinon.stub(Module, '_load').callsFake(function (request, parent, isMain) {
            if (parent && parent.filename === endpointPath) {
                if (request === '../../models') {
                    return models;
                }
                if (request === './utils/social-media-assets') {
                    return {buildStorageKeyHash: key => createHash('sha256').update(key).digest('hex')};
                }
                if (['../../adapters/storage', '@tryghost/logging'].includes(request)) {
                    return {};
                }
            }
            return originalLoad.call(this, request, parent, isMain);
        });
        try {
            delete require.cache[endpointPath];
            endpoint = require(endpointPath);
        } finally {
            dependencyStub.restore();
            delete require.cache[endpointPath];
        }
    });

    beforeEach(async function () {
        models.Base.knex = database;
        await database.raw('DROP TRIGGER IF EXISTS reject_junction');
        await database('social_ai_news_job_media').del();
        await database('social_media_assets').del();
        await database(TABLE).del();
    });

    after(async function () {
        await database.destroy();
    });

    const seed = (id, type = 'news-read', fields = {}) => database(TABLE).insert({
        id,
        type,
        status: 'queued',
        user_id: 'user-1',
        updated_by: 'user-1',
        updated_at: '2000-01-01 00:00:00',
        ...fields
    });

    const credentials = claim => ({
        claim_worker_id: claim.claim_worker_id,
        claim_token: claim.claim_token,
        claim_generation: claim.claim_generation
    });
    const actionFrame = (claim, fields = {}) => ({
        ...workerFrame({...credentials(claim), ...fields}),
        options: {id: claim.id, context: {integration: {id: 'integration-1'}}}
    });
    const modernClaim = worker_id => endpoint.claim.query(workerFrame({claim_protocol: 2, worker_id}));
    const rowFor = id => database(TABLE).where({id}).first();
    const expire = id => database(TABLE).where({id}).update({claim_expires_at: '2000-01-01 00:00:00'});
    const leaseLost = {errorType: 'ValidationError', code: 'NEWS_JOB_LEASE_LOST'};
    const asset = {storage_key: 'gallery/news_jobs/job/voice.mp3', storage_url: 'https://example.test/voice.mp3'};

    it('adds the nullable token and generation-zero default to existing rows idempotently', async function () {
        const migrationPath = require.resolve('../../../../core/server/data/migrations/versions/5.116/2026-10-07-00-00-00-add-news-job-lease-generation');
        const migrationUtils = require('../../../../core/server/data/migrations/utils/migrations');
        const originalLoad = Module._load;
        const loader = sinon.stub(Module, '_load').callsFake(function (request, parent, isMain) {
            if (parent && parent.filename === migrationPath && request === '../../utils') {
                return migrationUtils;
            }
            return originalLoad.call(this, request, parent, isMain);
        });
        let migration;
        try {
            delete require.cache[migrationPath];
            migration = require(migrationPath);
        } finally {
            loader.restore();
            delete require.cache[migrationPath];
        }
        const migrationDatabase = knex({client: 'sqlite3', connection: {filename: ':memory:'}, useNullAsDefault: true});
        try {
            await migrationDatabase.schema.createTable(TABLE, table => table.string('id').primary());
            await migrationDatabase(TABLE).insert({id: 'existing'});
            await migration.up({connection: migrationDatabase});
            await migration.up({connection: migrationDatabase});
            const row = await migrationDatabase(TABLE).first();
            assert.equal(row.claim_generation, 0);
            assert.equal(row.claim_token, null);
            const schema = require('../../../../core/server/data/schema/schema');
            assert.equal(schema[TABLE].claim_generation.defaultTo, 0);
            assert.equal(schema[TABLE].claim_token.nullable, true);
            await migration.down({connection: migrationDatabase});
            await migration.down({connection: migrationDatabase});
            assert.equal(await migrationDatabase.schema.hasColumn(TABLE, 'claim_generation'), false);
            assert.equal(await migrationDatabase.schema.hasColumn(TABLE, 'claim_token'), false);
            assert.equal((await migrationDatabase(TABLE).first()).id, 'existing');
        } finally {
            await migrationDatabase.destroy();
        }
    });

    it('issues a UUID lease and exposes its token only in the claim response', async function () {
        await seed('job');
        const claim = await modernClaim('worker-a');
        assert.equal(claim.claim_worker_id, 'worker-a');
        assert.equal(claim.claim_generation, 1);
        assert.match(claim.claim_token, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
        const read = await endpoint.read.query(actionFrame(claim));
        const browse = await endpoint.browse.query(workerFrame({}));
        assert.equal(read.claim_generation, 1);
        assert.equal(Object.hasOwn(read, 'claim_token'), false);
        assert.equal(Object.hasOwn(browse.data[0], 'claim_token'), false);
        const progress = await endpoint.progress.query(actionFrame(claim, {progress: 20}));
        assert.equal(Object.hasOwn(progress, 'claim_token'), false);
        assert.equal((await rowFor('job')).claim_token, claim.claim_token);
    });

    it('increments generation and replaces the token on same-owner reclaim', async function () {
        await seed('job');
        const first = await modernClaim('worker-a');
        await expire('job');
        const second = await modernClaim('worker-a');
        assert.equal(second.claim_generation, 2);
        assert.notEqual(second.claim_token, first.claim_token);
        assert.equal(second.started_at, first.started_at);
        await assert.rejects(endpoint.progress.query(actionFrame(first, {progress: 90})), leaseLost);
        assert.equal((await rowFor('job')).progress, null);
        await endpoint.progress.query(actionFrame(second, {progress: 30}));
        assert.equal((await rowFor('job')).progress, 30);
    });

    it('keeps legacy claims and mutations compatible at generation zero', async function () {
        await seed('job');
        const claim = await endpoint.claim.query(workerFrame({worker_id: 'legacy'}));
        assert.equal(claim.claim_generation, 0);
        assert.equal(Object.hasOwn(claim, 'claim_token'), false);
        await endpoint.progress.query({options: {id: 'job', context: {integration: {}}}, data: {progress: 12}});
        assert.equal((await rowFor('job')).progress, 12);
        await endpoint.linkAssets.query({options: {id: 'job', context: {integration: {}}}, data: {assets: [asset]}});
        assert.equal((await database('social_media_assets')).length, 1);
    });

    it('never allows legacy claims to downgrade an expired modern job', async function () {
        await seed('modern');
        const claim = await modernClaim('worker-a');
        await expire('modern');
        assert.deepEqual(await endpoint.claim.query(workerFrame({worker_id: 'legacy'})), []);
        await seed('legacy');
        assert.equal((await endpoint.claim.query(workerFrame({}))).id, 'legacy');
        const row = await rowFor('modern');
        assert.equal(row.claim_generation, 1);
        assert.equal(row.claim_token, claim.claim_token);
    });

    [null, 1, '2', 3].forEach((claim_protocol) => {
        it(`rejects unsupported claim protocol ${JSON.stringify(claim_protocol)}`, async function () {
            await seed('job');
            await assert.rejects(endpoint.claim.query(workerFrame({claim_protocol})), {errorType: 'ValidationError'});
            assert.equal((await rowFor('job')).status, 'queued');
        });
    });

    ['progress', 'complete', 'fail', 'linkAssets'].forEach((action) => {
        it(`rejects missing, incorrect, expired, and stale credentials for ${action}`, async function () {
            await seed('job', 'news-read', {steps: JSON.stringify([{id: 'step-1', type: 'news-read', status: 'pending'}])});
            const claim = await modernClaim('worker-a');
            await assert.rejects(endpoint[action].query(actionFrame(claim, {claim_worker_id: undefined})), leaseLost);
            await assert.rejects(endpoint[action].query(actionFrame(claim, {claim_token: undefined})), leaseLost);
            await assert.rejects(endpoint[action].query(actionFrame(claim, {claim_generation: undefined})), leaseLost);
            await assert.rejects(endpoint[action].query(actionFrame(claim, {claim_generation: '1'})), leaseLost);
            await assert.rejects(endpoint[action].query(actionFrame(claim, {claim_worker_id: 'worker-b'})), leaseLost);
            await assert.rejects(endpoint[action].query(actionFrame(claim, {claim_token: randomUUID()})), leaseLost);
            await expire('job');
            await assert.rejects(endpoint[action].query(actionFrame(claim)), leaseLost);
            const successor = await modernClaim('worker-b');
            await assert.rejects(endpoint[action].query(actionFrame(claim, {progress: 100, assets: [asset]})), leaseLost);
            assert.equal((await rowFor('job')).claim_token, successor.claim_token);
            assert.equal((await database('social_media_assets')).length, 0);
        });
    });

    // Execute a real SQL reclaim immediately before the delayed conditional
    // UPDATE. The request already passed its initial row/lease validation.
    const replaceBeforeWrite = (mutation = {}) => {
        let intercepted = false;
        const replacementToken = randomUUID();
        models.Base.knex = function (table) {
            const query = database(table);
            if (table === TABLE) {
                const originalUpdate = query.update;
                query.update = async function (...args) {
                    if (!intercepted) {
                        intercepted = true;
                        await database(TABLE).where({id: 'job'}).update({claim_generation: 2, claim_token: replacementToken, claim_worker_id: 'worker-b', ...mutation});
                    }
                    return originalUpdate.apply(this, args);
                };
            }
            return query;
        };
        return replacementToken;
    };

    ['progress', 'complete', 'fail'].forEach((action) => {
        it(`fences a late ${action} SQL write after reclaim`, async function () {
            await seed('job', 'news-read', {steps: JSON.stringify([{id: 'step-1', type: 'news-read', status: 'pending'}]), items: JSON.stringify([{key: 'article', status: 'pending'}])});
            const claim = await modernClaim('worker-a');
            const replacementToken = replaceBeforeWrite();
            await assert.rejects(endpoint[action].query(actionFrame(claim, {step_id: 'step-1', progress: 99, error: 'late'})), leaseLost);
            const row = await rowFor('job');
            assert.equal(row.claim_generation, 2);
            assert.equal(row.claim_token, replacementToken);
            assert.equal(row.status, 'running');
            assert.equal(row.progress, null);
            assert.equal(JSON.parse(row.steps)[0].status, 'pending');
            assert.equal(row.error_message, null);
        });
    });

    ['complete', 'fail'].forEach((action) => {
        it(`also fences the nonterminal item ${action} branch`, async function () {
            await seed('job', 'news-read', {steps: JSON.stringify([{id: 'step-1', type: 'news-read', status: 'pending'}]), items: JSON.stringify([{key: 'article', status: 'pending'}])});
            const claim = await modernClaim('worker-a');
            replaceBeforeWrite();
            await assert.rejects(endpoint[action].query(actionFrame(claim, {item_key: 'article'})), leaseLost);
            assert.equal(JSON.parse((await rowFor('job')).items)[0].status, 'pending');
        });
    });

    it('fences a legacy request that was read before promotion to protocol v2', async function () {
        await seed('job');
        await endpoint.claim.query(workerFrame({worker_id: 'legacy'}));
        replaceBeforeWrite();
        await assert.rejects(endpoint.progress.query({options: {id: 'job', context: {integration: {}}}, data: {progress: 100}}), leaseLost);
        assert.equal((await rowFor('job')).progress, null);
    });

    it('refuses caller-directed status changes on modern progress', async function () {
        await seed('job');
        const claim = await modernClaim('worker-a');
        await assert.rejects(endpoint.progress.query(actionFrame(claim, {status: 'queued'})), {errorType: 'ValidationError'});
        assert.equal((await rowFor('job')).status, 'running');
    });

    ['complete', 'fail', 'cancel'].forEach((action) => {
        it(`clears lease credentials but retains generation on ${action}`, async function () {
            await seed('job', 'news-read', {steps: JSON.stringify([{id: 'step-1', type: 'news-read', status: 'pending'}])});
            const claim = await modernClaim('worker-a');
            const result = await endpoint[action].query(actionFrame(claim, {step_id: 'step-1'}));
            assert.equal(Object.hasOwn(result, 'claim_token'), false);
            const row = await rowFor('job');
            assert.equal(row.claim_generation, 1);
            assert.equal(row.claim_token, null);
            assert.equal(row.claim_worker_id, null);
            assert.equal(row.claim_expires_at, null);
            await assert.rejects(endpoint.progress.query(actionFrame(claim)), leaseLost);
        });
    });

    it('does not cancel a job completed after its initial status read', async function () {
        await seed('job');
        const claim = await modernClaim('worker-a');
        replaceBeforeWrite({status: 'completed', claim_generation: 1, claim_token: null, claim_worker_id: null, claim_expires_at: null});
        await assert.rejects(endpoint.cancel.query(actionFrame(claim)), {errorType: 'ValidationError', message: 'The requested job transition is not allowed.'});
        const row = await rowFor('job');
        assert.equal(row.status, 'completed');
        assert.equal(row.claim_generation, 1);
        assert.equal(row.claim_token, null);
    });

    it('fences modern asset changes when a reclaim races the transaction start', async function () {
        await seed('job');
        const claim = await modernClaim('worker-a');
        const wrapper = table => database(table);
        wrapper.transaction = async (callback) => {
            await database(TABLE).where({id: 'job'}).update({claim_generation: 2, claim_worker_id: 'worker-b', claim_token: randomUUID()});
            return database.transaction(callback);
        };
        models.Base.knex = wrapper;
        await assert.rejects(endpoint.linkAssets.query(actionFrame(claim, {assets: [asset]})), leaseLost);
        assert.equal((await database('social_media_assets')).length, 0);
        assert.equal((await database('social_ai_news_job_media')).length, 0);
        assert.equal((await rowFor('job')).artifacts, null);
    });

    it('fences a legacy asset registration whose read raced a modern reclaim', async function () {
        await seed('job');
        const legacyClaim = await endpoint.claim.query(workerFrame({worker_id: 'legacy'}));
        await expire('job');
        const wrapper = table => database(table);
        wrapper.transaction = async (callback) => {
            await modernClaim('worker-b');
            return database.transaction(callback);
        };
        models.Base.knex = wrapper;
        await assert.rejects(endpoint.linkAssets.query(actionFrame(legacyClaim, {assets: [asset]})), leaseLost);
        assert.equal((await database('social_media_assets')).length, 0);
        assert.equal((await database('social_ai_news_job_media')).length, 0);
        const row = await rowFor('job');
        assert.equal(row.artifacts, null);
        assert.equal(row.claim_generation, 1);
        assert.equal(row.claim_worker_id, 'worker-b');
    });

    it('rolls back media, junction, artifacts, and lease renewal on a transactional asset failure', async function () {
        await seed('job');
        const claim = await modernClaim('worker-a');
        await database(TABLE).where({id: 'job'}).update({claim_expires_at: '2099-01-01 00:00:00'});
        await database.raw('CREATE TRIGGER reject_junction BEFORE INSERT ON social_ai_news_job_media BEGIN SELECT RAISE(ABORT, \'junction rejected\'); END');
        await assert.rejects(endpoint.linkAssets.query(actionFrame(claim, {assets: [asset]})), /junction rejected/);
        assert.equal((await database('social_media_assets')).length, 0);
        assert.equal((await database('social_ai_news_job_media')).length, 0);
        const row = await rowFor('job');
        assert.equal(row.artifacts, null);
        assert.equal(row.claim_expires_at, '2099-01-01 00:00:00');
        assert.equal(row.claim_token, claim.claim_token);
    });

    it('atomically links assets for a live modern lease and hides its token', async function () {
        await seed('job');
        const claim = await modernClaim('worker-a');
        const result = await endpoint.linkAssets.query(actionFrame(claim, {assets: [asset]}));
        assert.equal(result.count, 1);
        assert.equal(Object.hasOwn(result, 'claim_token'), false);
        const media = await database('social_media_assets').first();
        const junction = await database('social_ai_news_job_media').first();
        assert.equal(junction.media_id, media.id);
        assert.equal(media.news_job_id, 'job');
        assert.equal(JSON.parse((await rowFor('job')).artifacts)[0].storage_key, asset.storage_key);
    });
});
