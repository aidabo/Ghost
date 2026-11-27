// 図のジョブを作る（add）とき、source_path・preview_url と URL が一致するギャラリーの行に chart_job_id を書く。
// 書くのはジョブの持ち主が書ける行だけ（上げた本人・chart job の持ち主・グループに書けるメンバー・管理者。
// sync-tags・tag と同じ canRetagAsset）。他人の行はそのまま。持ち主の無い鍵（integration）だけのジョブは、
// dzi と同じく持ち主の無い行だけ。
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

const MINE = `${HOST}/content/media/gallery/users/me/mine.png`;
const OTHERS = `${HOST}/content/media/gallery/users/other/others.png`;
const GROUP_ROW = `${HOST}/content/media/gallery/groups/g/group.png`;
const ORPHAN = `${HOST}/content/media/gallery/chart_jobs/x/orphan.png`;

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
            ['storage_url', 'user_id', 'group_id', 'chart_job_id'].forEach(c => t.string(c));
        });
        await db.schema.createTable('social_ai_chart_jobs', (t) => {
            t.string('id').primary();
            t.string('user_id');
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
            {id: 'a4', storage_url: ORPHAN, user_id: null}
        ]);
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

    it('a member who may write the group links the group\'s row; someone who may not, does not', async function () {
        await add({user: ME}, {source_path: GROUP_ROW});
        assert.equal(await jobOf('a3'), NEW_JOB);
        await db('social_media_assets').where({id: 'a3'}).update({chart_job_id: null});
        sinon.restore();
        sinon.stub(models.SocialAiChartJob, 'add').callsFake(async () => ({id: NEW_JOB}));
        sinon.stub(models.SocialGroup, 'findOne').callsFake(async ({id}) => (id === GROUP ? {id} : null));
        sinon.stub(models.SocialGroup, 'canAccessGroup').resolves(false);
        sinon.stub(staffScope, 'getStaffScope').resolves({isSystemAdmin: false});
        await add({user: '00000000000000000000aa09'}, {source_path: GROUP_ROW});
        assert.equal(await jobOf('a3'), null);
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
});
