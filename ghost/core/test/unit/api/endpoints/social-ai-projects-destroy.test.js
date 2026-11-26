const assert = require('assert/strict');
const Module = require('module');
const sinon = require('sinon');
const knex = require('knex');
const commands = require('../../../../core/server/data/schema/commands');
const schema = require('../../../../core/server/data/schema/schema');

const projectsPath = require.resolve('../../../../core/server/api/endpoints/social-ai-projects');

// Project destroy removes gallery-bucket objects (child job prefixes and the
// project's own prefixes) best-effort. Those objects must only go once the DB
// cascade has committed: when destroy refuses (active child job, asset chosen
// for a virtual broadcast) the rows stay, so the files must stay too.
describe('social-ai-projects destroy: S3 cleanup only after commit', function () {
    let database;
    let projects;
    let listed;
    let deleted;

    const JOB_TABLES = [
        'social_ai_chart_jobs', 'social_ai_media_jobs', 'social_ai_content_bundle_jobs',
        'social_ai_news_jobs', 'social_ai_video_jobs'
    ];

    // Media store stand-in: every prefix holds one object; list/delete are
    // recorded.
    const mediaStore = {
        pathPrefix: '',
        list: async ({prefix}) => {
            listed.push(prefix);
            return {items: [{key: `${prefix}/file.bin`}], nextCursor: null};
        },
        delete: async (name, dir) => {
            deleted.push(`${dir}/${name}`);
        }
    };

    const load = () => {
        const models = {Base: {knex: database}};
        const stubs = {
            '../../models': models,
            '../../adapters/storage': {getStorage: () => mediaStore},
            '@tryghost/logging': {warn: () => {}, error: () => {}, info: () => {}}
        };
        const originalLoad = Module._load;
        const stub = sinon.stub(Module, '_load').callsFake(function (request, parent, isMain) {
            if (parent && parent.filename === projectsPath && Object.prototype.hasOwnProperty.call(stubs, request)) {
                return stubs[request];
            }
            return originalLoad.call(this, request, parent, isMain);
        });
        try {
            delete require.cache[projectsPath];
            return require(projectsPath);
        } finally {
            stub.restore();
            delete require.cache[projectsPath];
        }
    };

    // Integration context: bypasses the staff permission checks.
    const destroy = id => projects.destroy.query({options: {id, context: {integration: {id: 'integration-1'}}}, data: {}});

    beforeEach(async function () {
        listed = [];
        deleted = [];
        database = knex({client: 'sqlite3', connection: {filename: ':memory:'}, useNullAsDefault: true});
        await database.schema.createTable('social_ai_projects', (table) => {
            table.string('id').primary();
            ['user_id', 'group_id', 'name', 'status', 'description', 'tags', 'updated_at', 'updated_by']
                .forEach(column => table.string(column));
        });
        for (const name of JOB_TABLES) {
            await database.schema.createTable(name, (table) => {
                table.string('id').primary();
                ['project_id', 'status', 'user_id', 'group_id'].forEach(column => table.string(column));
                if (name === 'social_ai_video_jobs') {
                    table.string('cost_month');
                    ['cost_estimate_micros', 'cost_reserved_micros'].forEach(column => table.integer(column).defaultTo(0));
                    table.integer('cost_actual_micros');
                }
            });
        }
        await commands.createTable('social_ai_video_cost_months', database, schema.social_ai_video_cost_months);
        await database.schema.createTable('social_media_assets', (table) => {
            table.string('id').primary();
            ['storage_key', 'project_id', 'job_id', 'chart_job_id', 'news_job_id', 'video_job_id']
                .forEach(column => table.string(column));
        });
        await database.schema.createTable('social_ai_chart_job_media', (table) => {
            ['chart_job_id', 'media_id'].forEach(column => table.string(column));
        });
        await database.schema.createTable('social_ai_news_job_media', (table) => {
            ['news_job_id', 'media_id'].forEach(column => table.string(column));
        });
        await database.schema.createTable('social_ai_video_job_media', (table) => {
            ['video_job_id', 'media_id'].forEach(column => table.string(column));
        });
        await database.schema.createTable('social_ai_project_links', (table) => {
            ['id', 'project_id'].forEach(column => table.string(column));
        });
        await database.schema.createTable('social_ai_avatar_broadcast_selections', (table) => {
            ['post_id', 'media_id'].forEach(column => table.string(column));
        });

        await database('social_ai_projects').insert({id: 'p1', user_id: 'editor', group_id: null});
        projects = load();
    });

    afterEach(async function () {
        await database.destroy();
    });

    it('(a) refused for a queued / running child job: no S3 object is deleted and rows stay', async function () {
        // The chart family is checked first and has a finished child (pushed to
        // the cleanup list before the media family's active job refuses).
        await database('social_ai_chart_jobs').insert({id: 'cj-done', project_id: 'p1', status: 'completed'});
        await database('social_ai_media_jobs').insert({id: 'mj-run', project_id: 'p1', status: 'running'});
        await database('social_media_assets').insert({id: 'a1', storage_key: 'gallery/projects/p1/up.jpg', project_id: 'p1'});

        await assert.rejects(destroy('p1'), {errorType: 'ValidationError'});

        assert.deepEqual(deleted, []);
        assert.ok(await database('social_ai_projects').where({id: 'p1'}).first());
        assert.ok(await database('social_ai_chart_jobs').where({id: 'cj-done'}).first());
        assert.ok(await database('social_media_assets').where({id: 'a1'}).first());
    });

    it('(a) refused for a queued child job in the first family: no S3 object is deleted', async function () {
        await database('social_ai_chart_jobs').insert({id: 'cj-q', project_id: 'p1', status: 'queued'});

        await assert.rejects(destroy('p1'), {errorType: 'ValidationError'});

        assert.deepEqual(deleted, []);
        assert.ok(await database('social_ai_projects').where({id: 'p1'}).first());
    });

    it('(b) refused because an asset is selected for a virtual broadcast: no S3 object is deleted', async function () {
        await database('social_ai_chart_jobs').insert({id: 'cj-done', project_id: 'p1', status: 'completed'});
        await database('social_media_assets').insert({id: 'a1', storage_key: 'gallery/projects/p1/up.jpg', project_id: 'p1'});
        await database('social_ai_avatar_broadcast_selections').insert({post_id: 'post-1', media_id: 'a1'});

        await assert.rejects(destroy('p1'), {errorType: 'ValidationError'});

        assert.deepEqual(deleted, []);
        assert.ok(await database('social_ai_projects').where({id: 'p1'}).first());
        assert.ok(await database('social_media_assets').where({id: 'a1'}).first());
    });

    it('(c) a normal destroy still removes the child jobs\' and the project\'s gallery prefixes', async function () {
        await database('social_ai_chart_jobs').insert({id: 'cj-done', project_id: 'p1', status: 'completed'});
        await database('social_ai_news_jobs').insert({id: 'nj-done', project_id: 'p1', status: 'failed'});
        await database('social_media_assets').insert([
            {id: 'a1', storage_key: 'gallery/projects/p1/up.jpg', project_id: 'p1'},
            {id: 'a2', storage_key: 'gallery/chart_jobs/cj-done/out.png', chart_job_id: 'cj-done'}
        ]);

        const result = await destroy('p1');

        assert.equal(result.deleted_jobs, 2);
        assert.equal(await database('social_ai_projects').where({id: 'p1'}).first(), undefined);
        assert.deepEqual(listed, [
            'gallery/chart_jobs/cj-done',
            'gallery/news_jobs/nj-done',
            'gallery/chart_projects/p1',
            'gallery/projects/p1'
        ]);
        assert.deepEqual(deleted, [
            'gallery/chart_jobs/cj-done/file.bin',
            'gallery/news_jobs/nj-done/file.bin',
            'gallery/chart_projects/p1/file.bin',
            'gallery/projects/p1/file.bin'
        ]);
    });

    it('(e) keeps the month\'s video cost and count of the jobs it deletes (the budget is not given back)', async function () {
        await database('social_ai_video_jobs').insert([
            {id: 'vj-paid', project_id: 'p1', status: 'completed', cost_month: '2026-11', cost_reserved_micros: 1000000, cost_actual_micros: 400000},
            {id: 'vj-free', project_id: 'p1', status: 'failed', cost_month: '2026-11', cost_reserved_micros: 1000000, cost_actual_micros: 0}
        ]);
        await destroy('p1');
        assert.equal((await database('social_ai_video_jobs')).length, 0);
        const month = await database('social_ai_video_cost_months').where({month: '2026-11'}).first();
        assert.equal(Number(month.removed_cost_micros), 400000);
        // A failed job that cost nothing is not one of the month's videos.
        assert.equal(Number(month.removed_jobs), 1);
    });

    it('(d) removes the video results in gallery/projects/{pid}/artifacts/video/ (rows and S3), also those of a job deleted before', async function () {
        await database('social_ai_video_jobs').insert({id: 'vj-done', project_id: 'p1', status: 'completed'});
        await database('social_media_assets').insert([
            {id: 'v1', storage_key: 'gallery/projects/p1/artifacts/video/vj-done-intro.mp4', project_id: 'p1', video_job_id: 'vj-done'},
            // A result kept by H3 when its job was deleted earlier.
            {id: 'v2', storage_key: 'gallery/projects/p1/artifacts/video/vj-gone-intro.mp4', project_id: 'p1', video_job_id: 'vj-gone'},
            {id: 'v3', storage_key: 'gallery/video_jobs/vj-done/preview.jpg', project_id: 'p1', video_job_id: 'vj-done'},
            {id: 'keep', storage_key: 'gallery/projects/p2/artifacts/video/other.mp4', project_id: 'p2'}
        ]);
        await database('social_ai_video_job_media').insert({video_job_id: 'vj-done', media_id: 'v1'});

        const result = await destroy('p1');

        assert.equal(result.deleted_jobs, 1);
        assert.deepEqual((await database('social_media_assets').select('id')).map(row => row.id), ['keep']);
        assert.equal((await database('social_ai_video_job_media')).length, 0);
        // The project prefix covers artifacts/video/ (best-effort, after commit).
        assert.deepEqual(listed, ['gallery/video_jobs/vj-done', 'gallery/chart_projects/p1', 'gallery/projects/p1']);
    });
});
