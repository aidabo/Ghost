const assert = require('assert/strict');
const Module = require('module');
const sinon = require('sinon');
const knexFactory = require('knex');

const endpointPath = require.resolve('../../../../core/server/api/endpoints/social-ai-content-bundle-jobs');
const {getIntegrationId, isIntegrationRequest} = require('../../../../core/server/api/endpoints/utils/integration-context');

const TABLE = 'social_ai_content_bundle_jobs';
const OWNER = 'owner-user';
const OTHER = 'other-user';
const JOB = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const OTHER_JOB = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const MISSING_JOB = '000000000000000000000000';
const OWN_ASSET = 'cccccccccccccccccccccccc';
const OTHER_ASSET = 'dddddddddddddddddddddddd';
const OWN_POST = 'eeeeeeeeeeeeeeeeeeeeeeee';
const OTHER_POST = 'ffffffffffffffffffffffff';

// A Staff Access Token: the api-framework sets `integration: {id: null}`.
const staffFrame = (user, options = {}, data = {}) => ({
    options: {...options, context: {user, api_key: {id: 'staff-key', type: 'admin'}, integration: {id: null}}},
    data
});
const sessionFrame = (user, options = {}, data = {}) => ({options: {...options, context: {user}}, data});
const workerFrame = (options = {}, data = {}) => ({
    options: {...options, context: {api_key: {id: 'worker-key', type: 'admin'}, integration: {id: 'integration-1'}}},
    data
});
const forbidden = {errorType: 'NoPermissionError'};

describe('Content bundle jobs: worker integration and owner checks', function () {
    let database;
    let endpoint;
    // user id -> post ids that user may edit
    const editablePosts = {[OWNER]: [OWN_POST], [OTHER]: [OTHER_POST]};

    before(async function () {
        database = knexFactory({client: 'sqlite3', connection: {filename: ':memory:'}, useNullAsDefault: true});
        await database.schema.createTable(TABLE, (table) => {
            ['id', 'type', 'status', 'current_step_id', 'status_message', 'error_code', 'error_message', 'project_id', 'user_id',
                'group_id', 'scope_type', 'claim_worker_id', 'claim_expires_at', 'created_at', 'created_by', 'updated_at', 'updated_by',
                'started_at', 'completed_at'].forEach(column => table.string(column));
            table.integer('progress');
            ['steps', 'manifest', 'result', 'artifacts'].forEach(column => table.text(column));
        });
        await database.schema.createTable('social_media_assets', (table) => {
            ['id', 'storage_key', 'storage_key_hash', 'storage_url', 'thumbnail_url', 'thumbnail_storage_key', 'original_filename',
                'asset_type', 'owner_scope', 'user_id', 'member_id', 'group_id', 'job_id', 'dzi_job_id', 'social_chart_id',
                'chart_job_id', 'content_bundle_job_id', 'news_job_id', 'project_id', 'tag_id', 'tag_slug', 'created_at',
                'updated_at'].forEach(column => table.string(column));
        });
        await database.schema.createTable('post_media', (table) => {
            ['id', 'post_id', 'media_id', 'media_type', 'source_url', 'source_url_hash', 'thumbnail_url', 'caption', 'alt', 'role',
                'lexical_node_key', 'created_at', 'updated_at'].forEach(column => table.string(column));
            table.integer('sort_order');
        });
        await database.schema.createTable('posts', table => table.string('id').primary());
        await database.schema.createTable('social_ai_projects', (table) => {
            ['id', 'user_id', 'group_id'].forEach(column => table.string(column));
        });

        const models = {
            Base: {knex: database},
            SocialGroup: {findOne: async () => null, canAccessGroup: async () => false},
            SocialAiContentBundleJob: {findOne: async ({id}) => database(TABLE).where({id}).first()}
        };
        const staffScope = {
            getStaffScope: async () => ({isSystemAdmin: false, isNoGroupReader: false, publicGroupIds: []}),
            canManageJobAsNewsroomEditor: async () => false
        };
        const permissions = {
            canThis: context => ({
                edit: {
                    post: async (postId) => {
                        if (!(editablePosts[context.user] || []).includes(postId)) {
                            throw new Error('not allowed');
                        }
                    }
                }
            })
        };
        const storage = {getStorage: () => ({urlToPath: url => new URL(url).pathname.replace(/^\/+/, '')})};

        const originalLoad = Module._load;
        const stub = sinon.stub(Module, '_load').callsFake(function (request, parent, isMain) {
            if (parent && parent.filename === endpointPath) {
                if (request === '../../models') {
                    return models;
                }
                if (request === './utils/staff-scope') {
                    return staffScope;
                }
                if (request === '../../services/permissions') {
                    return permissions;
                }
                if (request === '../../adapters/storage') {
                    return storage;
                }
            }
            return originalLoad.call(this, request, parent, isMain);
        });
        try {
            delete require.cache[endpointPath];
            endpoint = require(endpointPath);
        } finally {
            stub.restore();
            delete require.cache[endpointPath];
        }
    });

    beforeEach(async function () {
        for (const table of [TABLE, 'social_media_assets', 'post_media', 'posts', 'social_ai_projects']) {
            await database(table).del();
        }
        const steps = JSON.stringify([{id: 'asset-stage', status: 'running', progress: 0}]);
        await database(TABLE).insert([
            {id: JOB, type: 'content-bundle', status: 'queued', progress: 0, steps, manifest: '{}', user_id: OWNER, updated_at: 'x'},
            {id: OTHER_JOB, type: 'content-bundle', status: 'queued', progress: 0, steps, manifest: '{}', user_id: OTHER, updated_at: 'x'}
        ]);
        await database('social_media_assets').insert([
            {id: OWN_ASSET, storage_key: 'own/a.png', storage_url: 'https://cdn.example/own/a.png', user_id: OWNER, asset_type: 'image'},
            {id: OTHER_ASSET, storage_key: 'other/b.png', storage_url: 'https://cdn.example/other/b.png', user_id: OTHER, asset_type: 'image'}
        ]);
        await database('posts').insert([{id: OWN_POST}, {id: OTHER_POST}]);
    });

    after(async function () {
        await database.destroy();
    });

    describe('integration-context helper', function () {
        it('treats only a context with an integration id as an integration', function () {
            assert.equal(isIntegrationRequest(staffFrame(OWNER)), false);
            assert.equal(getIntegrationId(staffFrame(OWNER)), null);
            assert.equal(isIntegrationRequest(sessionFrame(OWNER)), false);
            assert.equal(isIntegrationRequest({options: {context: {integration: {}}}}), false);
            assert.equal(isIntegrationRequest({}), false);
            assert.equal(isIntegrationRequest(workerFrame()), true);
            assert.equal(getIntegrationId(workerFrame()), 'integration-1');
        });
    });

    describe('worker actions', function () {
        it('refuse a staff token (integration id null) even for its own job', async function () {
            await assert.rejects(endpoint.claim.query(staffFrame(OWNER)), forbidden);
            await assert.rejects(endpoint.progress.query(staffFrame(OWNER, {id: JOB}, {progress: 50})), forbidden);
            await assert.rejects(endpoint.complete.query(staffFrame(OWNER, {id: JOB}, {})), forbidden);
            await assert.rejects(endpoint.fail.query(staffFrame(OWNER, {id: JOB}, {})), forbidden);
            const row = await database(TABLE).where({id: JOB}).first();
            assert.equal(row.status, 'queued');
        });

        it('allow a real worker integration', async function () {
            const claimed = await endpoint.claim.query(workerFrame({}, {worker_id: 'w1'}));
            assert.equal(claimed.status, 'running');
            const done = await endpoint.complete.query(workerFrame({id: claimed.id}, {step_id: 'asset-stage'}));
            assert.equal(done.status, 'completed');
        });

        it('declare the :id option so the URL id is enough', function () {
            for (const name of ['progress', 'complete', 'fail', 'linkAssets', 'cancel']) {
                assert.deepEqual(endpoint[name].options, ['id'], name);
            }
        });
    });

    describe('read / cancel', function () {
        it('refuse a staff token on another user\'s job', async function () {
            await assert.rejects(endpoint.read.query(staffFrame(OWNER, {id: OTHER_JOB})), forbidden);
            await assert.rejects(endpoint.cancel.query(staffFrame(OWNER, {id: OTHER_JOB})), forbidden);
            assert.equal((await database(TABLE).where({id: OTHER_JOB}).first()).status, 'queued');
        });

        it('allow the owner', async function () {
            const canceled = await endpoint.cancel.query(staffFrame(OWNER, {id: JOB}));
            assert.equal(canceled.status, 'canceled');
        });

        it('browse lists only the staff token user\'s jobs', async function () {
            const rows = await endpoint.browse.query(staffFrame(OWNER));
            assert.deepEqual(rows.map(row => row.id), [JOB]);
        });
    });

    describe('link-assets owner path', function () {
        const link = (frame, assets) => endpoint.linkAssets.query({...frame, data: {assets}});

        it('allows the job owner to link their own asset into a post they can edit', async function () {
            const result = await link(staffFrame(OWNER, {id: JOB}), [{
                asset_id: OWN_ASSET, storage_url: 'https://cdn.example/own/a.png', post_id: OWN_POST, media_type: 'image'
            }]);
            assert.deepEqual(result.media_ids, [OWN_ASSET]);
            assert.equal((await database('social_media_assets').where({id: OWN_ASSET}).first()).content_bundle_job_id, JOB);
            assert.equal((await database('post_media').where({post_id: OWN_POST})).length, 1);
        });

        it('allows a browser session owner too', async function () {
            const result = await link(sessionFrame(OWNER, {id: JOB}), [{asset_id: OWN_ASSET}]);
            assert.deepEqual(result.media_ids, [OWN_ASSET]);
        });

        it('refuses another user\'s job', async function () {
            await assert.rejects(link(staffFrame(OWNER, {id: OTHER_JOB}), [{asset_id: OWN_ASSET}]), forbidden);
            assert.equal((await database('social_media_assets').where({id: OWN_ASSET}).first()).content_bundle_job_id, null);
        });

        it('refuses a missing job with 403, not 404', async function () {
            await assert.rejects(link(staffFrame(OWNER, {id: MISSING_JOB}), [{asset_id: OWN_ASSET}]), forbidden);
        });

        it('refuses another user\'s asset, by id or by storage URL', async function () {
            await assert.rejects(link(staffFrame(OWNER, {id: JOB}), [{asset_id: OTHER_ASSET}]), forbidden);
            await assert.rejects(link(staffFrame(OWNER, {id: JOB}), [{storage_url: 'https://cdn.example/other/b.png'}]), forbidden);
            const other = await database('social_media_assets').where({id: OTHER_ASSET}).first();
            assert.equal(other.content_bundle_job_id, null);
            assert.equal(other.user_id, OTHER);
        });

        it('refuses a post the caller cannot edit, before writing anything', async function () {
            await assert.rejects(link(staffFrame(OWNER, {id: JOB}), [
                {asset_id: OWN_ASSET, storage_url: 'https://cdn.example/own/a.png', post_id: OTHER_POST, media_type: 'image'}
            ]), forbidden);
            assert.equal((await database('post_media')).length, 0);
            assert.equal((await database('social_media_assets').where({id: OWN_ASSET}).first()).content_bundle_job_id, null);
        });

        it('refuses a job whose project the caller does not own', async function () {
            await database('social_ai_projects').insert({id: 'p-other', user_id: OTHER});
            await database(TABLE).where({id: JOB}).update({project_id: 'p-other'});
            await assert.rejects(link(staffFrame(OWNER, {id: JOB}), [{asset_id: OWN_ASSET}]), forbidden);
        });

        it('still lets a worker integration link any job\'s assets', async function () {
            const result = await link(workerFrame({id: OTHER_JOB}), [{asset_id: OTHER_ASSET}]);
            assert.deepEqual(result.media_ids, [OTHER_ASSET]);
        });
    });
});
