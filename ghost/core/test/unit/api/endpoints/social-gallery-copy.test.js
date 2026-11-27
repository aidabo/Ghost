// 自分のギャラリーのファイルを project・chart job に写す（POST /social/gallery/copy-to-project・copy-to-job）。
// 写せるのは自分のファイルだけ、写し先は自分の project・job か、書けるグループの project・job だけ
// （content-bundle の link-assets と同じ規則）。前はグループの project・job ならメンバーでなくても写せた。
const assert = require('assert/strict');
const sinon = require('sinon');
const knex = require('knex');
const models = require('../../../../core/server/models');
const storage = require('../../../../core/server/adapters/storage');

const galleryPath = require.resolve('../../../../core/server/api/endpoints/social-gallery');

const HOST = 'https://cdn.example.com';
const ME = '00000000000000000000aa01';
const OTHER = '00000000000000000000aa02';
const MY_GROUP = '00000000000000000000bb01';
const OTHERS_GROUP = '00000000000000000000bb02';
const ASSET = '00000000000000000000a001';
const MY_PROJECT = '00000000000000000000dd01';
const MY_GROUP_PROJECT = '00000000000000000000dd02';
const OTHERS_GROUP_PROJECT = '00000000000000000000dd03';
const OTHERS_PROJECT = '00000000000000000000dd04';
const MY_JOB = '00000000000000000000ee01';
const MY_GROUP_JOB = '00000000000000000000ee02';
const OTHERS_GROUP_JOB = '00000000000000000000ee03';
const MY_JOB_IN_OTHERS_GROUP_PROJECT = '00000000000000000000ee04';

describe('Social gallery: copy-to-project / copy-to-job only into what the caller may write', function () {
    let db;
    let endpoint;
    let originalKnex;

    before(async function () {
        models.init();
        delete require.cache[galleryPath];
        endpoint = require(galleryPath);
        db = knex({client: 'sqlite3', connection: {filename: ':memory:'}, useNullAsDefault: true});
        await db.schema.createTable('social_media_assets', (t) => {
            t.string('id').primary();
            ['storage_key', 'storage_key_hash', 'storage_url', 'thumbnail_url', 'thumbnail_storage_key',
                'original_filename', 'asset_type', 'owner_scope', 'user_id', 'member_id', 'group_id',
                'job_id', 'dzi_job_id', 'social_chart_id', 'chart_job_id', 'content_bundle_job_id',
                'news_job_id', 'project_id', 'property_id', 'tag_id', 'tag_slug'].forEach(c => t.string(c));
            t.dateTime('created_at');
            t.dateTime('updated_at');
        });
        for (const name of ['social_ai_projects', 'social_ai_chart_jobs']) {
            await db.schema.createTable(name, (t) => {
                ['id', 'user_id', 'group_id', 'project_id'].forEach(c => t.string(c));
            });
        }
        originalKnex = models.Base.knex;
        models.Base.knex = db;
    });

    after(async function () {
        models.Base.knex = originalKnex;
        await db.destroy();
    });

    beforeEach(async function () {
        sinon.stub(storage, 'getStorage').returns({
            host: HOST,
            pathPrefix: 'content/media',
            getTargetDir: base => `${base}/2026/11`,
            urlToPath: value => value.replace(`${HOST}/`, ''),
            copy: async (from, to) => `${HOST}/${to}`
        });
        sinon.stub(models.SocialGroup, 'findOne').callsFake(async ({id}) => ([MY_GROUP, OTHERS_GROUP].includes(id) ? {id} : null));
        sinon.stub(models.SocialGroup, 'canAccessGroup').callsFake(async (group, userId) => group.id === MY_GROUP && userId === ME);
        for (const name of ['social_media_assets', 'social_ai_projects', 'social_ai_chart_jobs']) {
            await db(name).del();
        }
        await db('social_media_assets').insert({id: ASSET, user_id: ME, storage_key: 'content/media/gallery/users/me/photo.png', storage_url: `${HOST}/content/media/gallery/users/me/photo.png`, asset_type: 'image', original_filename: 'photo.png', owner_scope: 'user'});
        await db('social_ai_projects').insert([
            {id: MY_PROJECT, user_id: ME, group_id: null},
            {id: MY_GROUP_PROJECT, user_id: OTHER, group_id: MY_GROUP},
            {id: OTHERS_GROUP_PROJECT, user_id: OTHER, group_id: OTHERS_GROUP},
            {id: OTHERS_PROJECT, user_id: OTHER, group_id: null}
        ]);
        await db('social_ai_chart_jobs').insert([
            {id: MY_JOB, user_id: ME, group_id: null, project_id: MY_PROJECT},
            {id: MY_GROUP_JOB, user_id: OTHER, group_id: MY_GROUP, project_id: MY_GROUP_PROJECT},
            {id: OTHERS_GROUP_JOB, user_id: OTHER, group_id: OTHERS_GROUP, project_id: null},
            {id: MY_JOB_IN_OTHERS_GROUP_PROJECT, user_id: ME, group_id: null, project_id: OTHERS_GROUP_PROJECT}
        ]);
    });

    afterEach(function () {
        sinon.restore();
    });

    const toProject = (user, projectId) => endpoint.copyToProject.query({options: {context: {user}}, data: {id: ASSET, project_id: projectId}});
    const toJob = (user, jobId) => endpoint.copyToJob.query({options: {context: {user}}, data: {id: ASSET, job_id: jobId}});
    const copies = () => db('social_media_assets').whereNot({id: ASSET});

    it('into my own project and into a project of a group I may write', async function () {
        await toProject(ME, MY_PROJECT);
        await toProject(ME, MY_GROUP_PROJECT);
        assert.deepEqual((await copies()).map(row => row.project_id).sort(), [MY_PROJECT, MY_GROUP_PROJECT].sort());
    });

    it('a project of a group I am not in, or someone else\'s own project, is refused and nothing is copied', async function () {
        await assert.rejects(toProject(ME, OTHERS_GROUP_PROJECT), {errorType: 'NoPermissionError'});
        await assert.rejects(toProject(ME, OTHERS_PROJECT), {errorType: 'NoPermissionError'});
        assert.equal((await copies()).length, 0);
    });

    it('into my own job and into a job of a group I may write', async function () {
        await toJob(ME, MY_JOB);
        await toJob(ME, MY_GROUP_JOB);
        assert.deepEqual((await copies()).map(row => row.chart_job_id).sort(), [MY_JOB, MY_GROUP_JOB].sort());
    });

    it('a job of a group I am not in, or my job whose project is another group\'s, is refused and nothing is copied', async function () {
        await assert.rejects(toJob(ME, OTHERS_GROUP_JOB), {errorType: 'NoPermissionError'});
        await assert.rejects(toJob(ME, MY_JOB_IN_OTHERS_GROUP_PROJECT), {errorType: 'NoPermissionError'});
        assert.equal((await copies()).length, 0);
    });

    it('someone else\'s file is still refused', async function () {
        await assert.rejects(toProject(OTHER, MY_GROUP_PROJECT), {errorType: 'NoPermissionError'});
    });
});
