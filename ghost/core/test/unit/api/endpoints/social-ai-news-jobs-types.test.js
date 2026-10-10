const assert = require('assert/strict');
const Module = require('module');
const sinon = require('sinon');
const knex = require('knex');

const TABLE = 'social_ai_news_jobs';
const endpointPath = require.resolve('../../../../core/server/api/endpoints/social-ai-news-jobs');
const workerFrame = data => ({data, options: {context: {integration: {id: 'integration-1'}}}});
const createFrame = data => ({data: {socialainewsjobs: [data]}, options: {context: {user: 'user-1'}}});

describe('News job type routing', function () {
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
        models = {Base: {knex: database}};
        // Only stub the endpoint's boundary dependencies. Knex executes real SQL;
        // Ghost models/storage are never initialized and no config is loaded.
        const originalLoad = Module._load;
        const dependencyStub = sinon.stub(Module, '_load').callsFake(function (request, parent, isMain) {
            if (parent && parent.filename === endpointPath) {
                if (request === '../../models') {
                    return models;
                }
                if (['../../adapters/storage', './utils/social-media-assets', '@tryghost/logging'].includes(request)) {
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

    it('defaults omitted capabilities to news-read in a mixed queue', async function () {
        await seed('lip', 'news-avatar-lipsync');
        await seed('read', 'news-read', {updated_at: '2001-01-01 00:00:00'});
        const claimed = await endpoint.claim.query(workerFrame({worker_id: 'legacy-worker'}));
        assert.equal(claimed.id, 'read');
        assert.equal(claimed.claim_worker_id, 'legacy-worker');
        assert.equal((await database(TABLE).where({id: 'lip'}).first()).status, 'queued');
        assert.deepEqual(await endpoint.claim.query(workerFrame({})), []);
    });

    it('allows explicit reserved lip-sync capability without claiming news-read', async function () {
        await seed('read');
        await seed('lip', 'news-avatar-lipsync', {updated_at: '2001-01-01 00:00:00'});
        const claimed = await endpoint.claim.query(workerFrame({accepted_types: ['news-avatar-lipsync']}));
        assert.equal(claimed.id, 'lip');
        assert.equal((await database(TABLE).where({id: 'read'}).first()).status, 'queued');
    });

    it('deduplicates capabilities and supports the wrapped worker payload', async function () {
        await seed('read');
        const statements = [];
        const capture = query => statements.push(query);
        database.on('query', capture);
        let claimed;
        try {
            claimed = await endpoint.claim.query(workerFrame({socialainewsjobs: [{accepted_types: ['news-read', 'news-read']}]}));
        } finally {
            database.removeListener('query', capture);
        }
        assert.equal(claimed.id, 'read');
        const candidate = statements.find(query => query.sql.startsWith('select') && query.sql.includes('in ('));
        assert.equal(candidate.bindings.filter(value => value === 'news-read').length, 1);
        const reservation = statements.find(query => query.sql.startsWith('update'));
        assert.match(reservation.sql, /`type` = \?/);
        assert.match(reservation.sql, /`type` in \(\?\)/);
    });

    [null, [], 'news-read', {}, [null], [1], [''], [' news-read '], ['unknown'], ['news-read', 'unknown']].forEach((accepted_types) => {
        it(`rejects malformed or unknown capabilities ${JSON.stringify(accepted_types)}`, async function () {
            await seed('read');
            await assert.rejects(endpoint.claim.query(workerFrame({accepted_types})), {errorType: 'ValidationError'});
            assert.equal((await database(TABLE).where({id: 'read'}).first()).status, 'queued');
        });
    });

    it('rejects sparse capabilities without claiming a row', async function () {
        await seed('read');
        await assert.rejects(endpoint.claim.query(workerFrame({accepted_types: new Array(1)})), {errorType: 'ValidationError'});
        const accepted_types = new Array(2);
        accepted_types[0] = 'news-read';
        await assert.rejects(endpoint.claim.query(workerFrame({accepted_types})), {errorType: 'ValidationError'});
        const row = await database(TABLE).where({id: 'read'}).first();
        assert.equal(row.status, 'queued');
        assert.equal(row.claim_worker_id, null);
    });

    it('requires a trusted integration before accepting worker capabilities', async function () {
        await seed('read');
        await assert.rejects(endpoint.claim.query(createFrame({accepted_types: ['news-read']})), {errorType: 'NoPermissionError'});
        assert.equal((await database(TABLE).where({id: 'read'}).first()).status, 'queued');
    });

    it('reclaims only accepted expired leases and leaves active and terminal rows alone', async function () {
        await seed('lip-expired', 'news-avatar-lipsync', {status: 'running', claim_expires_at: '2000-01-01 00:00:00'});
        await seed('read-active', 'news-read', {status: 'running', claim_expires_at: '2099-01-01 00:00:00'});
        await seed('read-completed', 'news-read', {status: 'completed'});
        await seed('read-expired', 'news-read', {status: 'running', claim_worker_id: 'old-worker', claim_expires_at: '2000-01-01 00:00:00', started_at: '1999-01-01 00:00:00'});
        const claimed = await endpoint.claim.query(workerFrame({worker_id: 'replacement'}));
        assert.equal(claimed.id, 'read-expired');
        assert.equal(claimed.claim_worker_id, 'replacement');
        assert.equal(claimed.started_at, '1999-01-01 00:00:00');
        assert.ok(claimed.claim_expires_at > new Date().toISOString().slice(0, 19).replace('T', ' '));
        assert.deepEqual(await endpoint.claim.query(workerFrame({})), []);
        const lip = await endpoint.claim.query(workerFrame({accepted_types: ['news-avatar-lipsync']}));
        assert.equal(lip.id, 'lip-expired');
    });

    const mutateAfterSelection = (mutation) => {
        let intercepted = false;
        models.Base.knex = function (table) {
            const query = database(table);
            if (table === TABLE && !intercepted) {
                intercepted = true;
                const originalFirst = query.first;
                query.first = async function (...args) {
                    const candidate = await originalFirst.apply(this, args);
                    await database(TABLE).where({id: candidate.id}).update(mutation);
                    return candidate;
                };
            }
            return query;
        };
    };

    it('does not reserve a candidate whose type changes even when both types were accepted', async function () {
        await seed('read');
        mutateAfterSelection({type: 'news-avatar-lipsync'});
        assert.deepEqual(await endpoint.claim.query(workerFrame({accepted_types: ['news-read', 'news-avatar-lipsync']})), []);
        const row = await database(TABLE).where({id: 'read'}).first();
        assert.equal(row.type, 'news-avatar-lipsync');
        assert.equal(row.status, 'queued');
        assert.equal(row.claim_worker_id, null);
    });

    it('does not overwrite a lease reserved between candidate selection and update', async function () {
        await seed('read');
        mutateAfterSelection({status: 'running', claim_worker_id: 'winner', claim_expires_at: '2099-01-01 00:00:00'});
        assert.deepEqual(await endpoint.claim.query(workerFrame({worker_id: 'loser'})), []);
        assert.equal((await database(TABLE).where({id: 'read'}).first()).claim_worker_id, 'winner');
    });

    ['unknown', 'news-avatar-lipsync', '', null, 1].forEach((type) => {
        it(`rejects disabled or malformed create type ${JSON.stringify(type)} before inserting`, async function () {
            await assert.rejects(endpoint.add.query(createFrame({type})), {errorType: 'ValidationError'});
            assert.equal((await database(TABLE)).length, 0);
        });
    });

    [[{type: 'unknown'}], [{type: 'news-avatar-lipsync'}], [{}], [null], 'news-read', {}].forEach((steps) => {
        it(`rejects incompatible or malformed steps ${JSON.stringify(steps)} before inserting`, async function () {
            await assert.rejects(endpoint.add.query(createFrame({steps})), {errorType: 'ValidationError'});
            assert.equal((await database(TABLE)).length, 0);
        });
    });

    it('rejects sparse steps without inserting a job', async function () {
        await assert.rejects(endpoint.add.query(createFrame({steps: new Array(1)})), {errorType: 'ValidationError'});
        const steps = new Array(2);
        steps[0] = {type: 'news-read'};
        await assert.rejects(endpoint.add.query(createFrame({steps})), {errorType: 'ValidationError'});
        assert.equal((await database(TABLE)).length, 0);
    });

    it('preserves missing-user permission errors before validating the job type', async function () {
        const frame = {data: {socialainewsjobs: [{type: 'unknown'}]}, options: {context: {}}};
        await assert.rejects(endpoint.add.query(frame), {errorType: 'NoPermissionError', message: 'A user is required.'});
        assert.equal((await database(TABLE)).length, 0);
    });

    it('creates a normal default news-read job and default pipeline', async function () {
        const created = await endpoint.add.query(createFrame({payload: {article: 'test'}}));
        assert.equal(created.type, 'news-read');
        assert.equal(created.status, 'queued');
        assert.equal(created.steps[0].type, 'news-read');
        assert.deepEqual(created.steps[0].payload, {article: 'test'});
        assert.equal((await database(TABLE)).length, 1);
    });

    it('preserves a supplied compatible pipeline and normalizes the job type', async function () {
        const steps = [{id: 'custom-step', type: 'news-read', status: 'pending'}];
        const created = await endpoint.add.query(createFrame({type: ' news-read ', steps}));
        assert.equal(created.type, 'news-read');
        assert.deepEqual(created.steps, steps);
    });

    it('allows the lipsync job type only when the explicit feature flag is enabled', async function () {
        process.env.NEWS_AVATAR_LIPSYNC_ENABLED = 'true';
        try {
            const created = await endpoint.add.query(createFrame({type: 'news-avatar-lipsync', payload: {avatar_lipsync: {mode: 'image-audio'}}}));
            assert.equal(created.type, 'news-avatar-lipsync');
            assert.equal(created.steps[0].type, 'news-avatar-lipsync');
        } finally {
            delete process.env.NEWS_AVATAR_LIPSYNC_ENABLED;
        }
    });
});
