// 図のジョブを作る（add）とき、source_path・preview_url と URL が一致するギャラリーの行に chart_job_id を書く。
// 書くのはジョブの持ち主がじかに消せる行だけ（上げた本人・その行を作った chart job の持ち主＝destroyAsset と同じ
// canRenameAsset、それと管理者）。グループに書けるだけのメンバーの他人の行・他人の行はそのまま。
// 持ち主の無い鍵（integration）だけのジョブは、dzi と同じく持ち主の無い行だけ。
// destroy は preview_url のファイルを、持ち主が上げた行があるときだけ消し（dzi と同じ）、
// chart_job_id でつながった行も持ち主のもの（と持ち主の無い行）だけ消す。ほかはつながりを外すだけ。
const assert = require('assert/strict');
const sinon = require('sinon');
const knex = require('knex');
const models = require('../../../../core/server/models');

const chartJobsPath = require.resolve('../../../../core/server/api/endpoints/social-ai-chart-jobs');
const staffScopePath = require.resolve('../../../../core/server/api/endpoints/utils/staff-scope');
const assetWriteAccessPath = require.resolve('../../../../core/server/api/endpoints/utils/asset-write-access');

const HOST = 'https://cdn.example.com';
const ME = '00000000000000000000aa01';
const OTHER = '00000000000000000000aa02';
const ADMIN = '00000000000000000000aa04';
const GROUP = '00000000000000000000bb01';
const NEW_JOB = '00000000000000000000ee02';
const OTHER_JOB = '00000000000000000000ee03';

const MINE = `${HOST}/content/media/gallery/users/me/mine.png`;
const OTHERS = `${HOST}/content/media/gallery/users/other/others.png`;
const GROUP_ROW = `${HOST}/content/media/gallery/groups/g/group.png`;
const ORPHAN = `${HOST}/content/media/gallery/chart_jobs/x/orphan.png`;
const WORKER_OF_OTHER = `${HOST}/content/media/gallery/chart_jobs/y/worker.png`;

describe('Social AI chart jobs: add only links the job owner\'s own rows', function () {
    let db;
    let endpoint;
    let originalKnex;
    let staffScope;

    before(async function () {
        models.init();
        delete require.cache[chartJobsPath];
        delete require.cache[staffScopePath];
        delete require.cache[assetWriteAccessPath];
        staffScope = require(staffScopePath);
        endpoint = require(chartJobsPath);
        db = knex({client: 'sqlite3', connection: {filename: ':memory:'}, useNullAsDefault: true});
        await db.schema.createTable('social_media_assets', (t) => {
            t.string('id').primary();
            ['storage_url', 'storage_key', 'user_id', 'group_id', 'chart_job_id'].forEach(c => t.string(c));
        });
        await db.schema.createTable('social_ai_chart_jobs', (t) => {
            t.string('id').primary();
            ['user_id', 'group_id', 'project_id', 'status', 'type', 'preview_url', 'source_path'].forEach(c => t.string(c));
        });
        originalKnex = models.Base.knex;
        models.Base.knex = db;
    });

    after(async function () {
        models.Base.knex = originalKnex;
        await db.destroy();
    });

    beforeEach(async function () {
        sinon.stub(models.SocialAiChartJob, 'add').callsFake(async () => ({id: NEW_JOB}));
        sinon.stub(models.SocialGroup, 'findOne').callsFake(async ({id}) => (id === GROUP ? {id} : null));
        // ME may write GROUP; OTHER may not
        sinon.stub(models.SocialGroup, 'canAccessGroup').callsFake(async (group, userId) => userId === ME);
        sinon.stub(staffScope, 'getStaffScope').callsFake(async userId => ({isSystemAdmin: userId === ADMIN}));
        await db('social_media_assets').del();
        await db('social_media_assets').insert([
            {id: 'a1', storage_url: MINE, user_id: ME},
            {id: 'a2', storage_url: OTHERS, user_id: OTHER},
            {id: 'a3', storage_url: GROUP_ROW, user_id: OTHER, group_id: GROUP},
            {id: 'a4', storage_url: ORPHAN, user_id: null},
            {id: 'a5', storage_url: WORKER_OF_OTHER, user_id: null, chart_job_id: OTHER_JOB}
        ]);
        await db('social_ai_chart_jobs').del();
        await db('social_ai_chart_jobs').insert({id: OTHER_JOB, user_id: OTHER, status: 'completed'});
    });

    afterEach(function () {
        sinon.restore();
    });

    const add = (context, job, options = {}) => endpoint.add.query({
        options: {context, ...options},
        data: {socialaichartjobs: [{type: 'image-fetch', ...job}]}
    });
    const jobOf = async id => (await db('social_media_assets').where({id}).first()).chart_job_id || null;

    it('the screen / MCP (a signed-in user): own row is linked, someone else\'s row with the same URL is not', async function () {
        const added = await add({user: ME}, {source_path: MINE, preview_url: OTHERS});
        assert.equal(added.id, NEW_JOB);
        assert.equal(await jobOf('a1'), NEW_JOB);
        assert.equal(await jobOf('a2'), null);
    });

    it('a member who may only write the group does not link someone else\'s group row (destroy could not delete it either)', async function () {
        await add({user: ME}, {source_path: GROUP_ROW});
        assert.equal(await jobOf('a3'), null);
    });

    it('a row with no owner made by someone else\'s chart job is not linked', async function () {
        await add({user: ME}, {source_path: WORKER_OF_OTHER});
        assert.equal(await jobOf('a5'), OTHER_JOB);
    });

    it('the uploader of a row, and the owner of the chart job that made it, link it', async function () {
        await add({user: OTHER}, {source_path: GROUP_ROW, preview_url: WORKER_OF_OTHER});
        assert.equal(await jobOf('a3'), NEW_JOB);
        assert.equal(await jobOf('a5'), NEW_JOB);
    });

    it('a system admin links any row', async function () {
        await add({user: ADMIN}, {source_path: OTHERS});
        assert.equal(await jobOf('a2'), NEW_JOB);
    });

    it('the worker / host key on behalf of a user (user_id): that user\'s rows only', async function () {
        await add({integration: {id: 'int1'}}, {source_path: MINE, preview_url: OTHERS}, {user_id: ME});
        assert.equal(await jobOf('a1'), NEW_JOB);
        assert.equal(await jobOf('a2'), null);
    });

    it('a key with no user: only rows with no owner (as dzi)', async function () {
        await add({integration: {id: 'int1'}}, {source_path: ORPHAN, preview_url: MINE});
        assert.equal(await jobOf('a4'), NEW_JOB);
        assert.equal(await jobOf('a1'), null);
    });

    describe('destroy', function () {
        const storage = require('../../../../core/server/adapters/storage');
        let deleted;

        beforeEach(function () {
            deleted = [];
            sinon.stub(storage, 'getStorage').returns({
                delete: async (name, dir) => {
                    deleted.push(`${dir}/${name}`);
                },
                urlToPath: url => url.replace(`${HOST}/`, '')
            });
        });

        const destroy = (context, id) => endpoint.destroy.query({options: {context, id}});
        const rowOf = id => db('social_media_assets').where({id}).first();

        it('a job whose preview_url is someone else\'s file: the file and the row stay', async function () {
            await db('social_ai_chart_jobs').insert({id: NEW_JOB, user_id: ME, status: 'cancelled', preview_url: OTHERS});
            await destroy({user: ME}, NEW_JOB);
            assert.deepEqual(deleted, []);
            assert.ok(await rowOf('a2'));
        });

        it('a job whose preview_url is the owner\'s own file: the file is deleted', async function () {
            await db('social_ai_chart_jobs').insert({id: NEW_JOB, user_id: ME, status: 'cancelled', preview_url: MINE});
            await destroy({user: ME}, NEW_JOB);
            assert.deepEqual(deleted, ['content/media/gallery/users/me/mine.png']);
        });

        it('a group row of someone else linked to the job (old link): the row stays, only the link is removed', async function () {
            await db('social_ai_chart_jobs').insert({id: NEW_JOB, user_id: ME, status: 'cancelled'});
            await db('social_media_assets').whereIn('id', ['a1', 'a3', 'a4']).update({chart_job_id: NEW_JOB});
            await destroy({user: ME}, NEW_JOB);
            const kept = await rowOf('a3');
            assert.ok(kept);
            assert.equal(kept.chart_job_id, null);
            assert.equal(await rowOf('a1'), undefined);
            assert.equal(await rowOf('a4'), undefined);
        });
    });
});
