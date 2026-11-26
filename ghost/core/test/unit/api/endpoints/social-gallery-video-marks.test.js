// プロジェクトのギャラリーの一覧（GET /social/gallery/project）の行に、
// 写真で動画のジョブ（video job）の印を付ける: video_job_id と role（social_ai_video_job_media の role）。
// front の「できたもの」は、この印（video_job_id があり role=output）だけで動画の結果を分ける。
// video job は作った本人とサイトの管理者しか読めないので、家族のほかの人が作った動画も
// ジョブを読まずに分けられるように、一覧の行に印を返す。見える範囲の決まりは変えない。
const assert = require('assert/strict');
const sinon = require('sinon');
const knex = require('knex');
const models = require('../../../../core/server/models');
const staffScope = require('../../../../core/server/api/endpoints/utils/staff-scope');
const {tables: schema} = require('../../../../core/server/data/schema');

const PROJECT = '0000000000000000000000p1';
const OTHER_PROJECT = '0000000000000000000000p2';
const JOB_BY_OTHER = '0000000000000000000000v1';
const JOB_BY_ME = '0000000000000000000000v2';
const GROUP_PROJECT = '0000000000000000000000p3';
const GROUP = '0000000000000000000000g1';
const JOB_IN_GROUP = '0000000000000000000000v3';
const NOW = new Date('2026-11-25T00:00:00Z');

// Only the columns (no foreign keys / indexes): enough for the listing queries.
const createTable = (db, name) => db.schema.createTable(name, (t) => {
    Object.entries(schema[name]).forEach(([column, spec]) => {
        if (column.startsWith('@@')) {
            return;
        }
        if (spec.type === 'dateTime') {
            t.dateTime(column);
        } else if (spec.type === 'integer' || spec.type === 'bigInteger') {
            t.integer(column);
        } else if (spec.type === 'boolean') {
            t.boolean(column);
        } else {
            t.text(column);
        }
    });
});

describe('Social gallery: project listing marks video job rows (video_job_id, role)', function () {
    let db;
    let endpoint;
    let originalKnex;

    before(async function () {
        models.init();
        endpoint = require('../../../../core/server/api/endpoints/social-gallery');
        db = knex({client: 'sqlite3', connection: {filename: ':memory:'}, useNullAsDefault: true});
        for (const name of Object.keys(schema)) {
            await createTable(db, name);
        }
        originalKnex = models.Base.knex;
        models.Base.knex = db;
    });

    after(async function () {
        models.Base.knex = originalKnex;
        await db.destroy();
    });

    beforeEach(async function () {
        // A plain staff user (not admin, not Super Editor): no user / role rows needed.
        const plain = {isSystemAdmin: false, isNoGroupReader: false, publicGroupIds: []};
        sinon.stub(staffScope, 'getStaffScope').resolves(plain);
        sinon.stub(staffScope, 'getNewsroomReadScope').resolves(plain);

        await db('social_ai_projects').insert([
            // A published project with no group: every staff user of the site reads it (the family's project).
            {id: PROJECT, name: 'family', user_id: 'owner', group_id: null, status: 'published'},
            {id: OTHER_PROJECT, name: 'mine', user_id: 'me', group_id: null, status: 'draft'}
        ]);
        await db('social_ai_video_jobs').insert([
            {id: JOB_BY_OTHER, user_id: 'other', project_id: PROJECT, payload: '{"secret":"x"}', status: 'completed', created_at: NOW, updated_at: NOW, created_by: 'other', updated_by: 'other'},
            {id: JOB_BY_ME, user_id: 'me', project_id: OTHER_PROJECT, payload: '{}', status: 'completed', created_at: NOW, updated_at: NOW, created_by: 'me', updated_by: 'me'}
        ]);
        const asset = (id, fields) => ({
            id,
            storage_key: `gallery/projects/${fields.project_id}/artifacts/${id}`,
            storage_url: `https://cdn.example/${id}`,
            asset_type: 'video',
            created_at: NOW,
            ...fields
        });
        await db('social_media_assets').insert([
            // Another family member's video job: the result (output) and a part (intermediate).
            asset('a1', {owner_scope: 'video_jobs', user_id: 'other', project_id: PROJECT, video_job_id: JOB_BY_OTHER, original_filename: `${JOB_BY_OTHER}-memories.mp4`}),
            asset('a2', {owner_scope: 'video_jobs', user_id: 'other', project_id: PROJECT, video_job_id: JOB_BY_OTHER, asset_type: 'audio', original_filename: 'line-1.wav'}),
            // A direct upload into the project: no marks.
            asset('a3', {owner_scope: 'chart_jobs', user_id: 'owner', project_id: PROJECT, original_filename: 'kiji-1.mp4'}),
            // My own video job's result in my own (draft) project.
            asset('a4', {owner_scope: 'video_jobs', user_id: 'me', project_id: OTHER_PROJECT, video_job_id: JOB_BY_ME, original_filename: `${JOB_BY_ME}-memories.mp4`})
        ]);
        await db('social_ai_video_job_media').insert([
            {id: 'm1', video_job_id: JOB_BY_OTHER, media_id: 'a1', role: 'output', item_key: 'final', created_at: NOW},
            {id: 'm2', video_job_id: JOB_BY_OTHER, media_id: 'a2', role: 'intermediate', item_key: 'line-1', created_at: NOW},
            {id: 'm4', video_job_id: JOB_BY_ME, media_id: 'a4', role: 'output', created_at: NOW}
        ]);
    });

    afterEach(async function () {
        sinon.restore();
        for (const name of ['social_ai_projects', 'social_ai_video_jobs', 'social_media_assets', 'social_ai_video_job_media']) {
            await db(name).del();
        }
    });

    const listProject = (user, projectId) => endpoint.project.query({
        options: {project_id: projectId, type: 'all', context: {user}},
        data: {}
    });
    const byId = result => Object.fromEntries(result.data.map(row => [row.id, row]));

    it('a family member sees another member\'s video result marked video_job_id + role=output', async function () {
        const rows = byId(await listProject('me', PROJECT));
        assert.deepEqual(Object.keys(rows).sort(), ['a1', 'a2', 'a3']);
        assert.equal(rows.a1.video_job_id, JOB_BY_OTHER);
        assert.equal(rows.a1.role, 'output');
        assert.equal(rows.a2.video_job_id, JOB_BY_OTHER);
        assert.equal(rows.a2.role, 'intermediate');
        // Not a video job row: both null.
        assert.equal(rows.a3.video_job_id, null);
        assert.equal(rows.a3.role, null);
    });

    it('returns only the marks, never the job itself (payload etc.)', async function () {
        const rows = byId(await listProject('me', PROJECT));
        const text = JSON.stringify(rows.a1);
        assert.ok(!text.includes('secret'));
        assert.equal(rows.a1.payload, undefined);
        assert.equal(rows.a1.status, undefined);
    });

    it('the creator\'s own project listing marks their result too', async function () {
        const rows = byId(await listProject('me', OTHER_PROJECT));
        assert.deepEqual(Object.keys(rows), ['a4']);
        assert.equal(rows.a4.video_job_id, JOB_BY_ME);
        assert.equal(rows.a4.role, 'output');
    });

    it('a result kept after its job was deleted (H3: no junction row) is still role=output', async function () {
        // What video-jobs destroy leaves: the junction rows and the job are gone, the
        // result under gallery/projects/<pid>/artifacts/video/ stays with video_job_id.
        await db('social_media_assets').insert({
            id: 'a5', owner_scope: 'video_jobs', user_id: 'other', project_id: PROJECT, video_job_id: 'vj-gone',
            storage_key: `gallery/projects/${PROJECT}/artifacts/video/vj-gone-memories.mp4`, asset_type: 'video', created_at: NOW
        });
        const rows = byId(await listProject('me', PROJECT));
        assert.equal(rows.a5.video_job_id, 'vj-gone');
        assert.equal(rows.a5.role, 'output');
    });

    it('outside the project video area a row without a junction row gets no role', async function () {
        await db('social_media_assets').insert({
            id: 'a6', owner_scope: 'video_jobs', user_id: 'other', project_id: PROJECT, video_job_id: 'vj-gone',
            storage_key: 'gallery/video_jobs/vj-gone/line-1.wav', asset_type: 'audio', created_at: NOW
        });
        const rows = byId(await listProject('me', PROJECT));
        assert.equal(rows.a6.role, null);
    });

    it('a news worker mp4 in the same artifacts/video/ area (no video_job_id) gets no marks', async function () {
        await db('social_media_assets').insert({
            id: 'a7', owner_scope: 'news_jobs', user_id: 'other', project_id: PROJECT, news_job_id: 'nj1',
            storage_key: `gallery/projects/${PROJECT}/artifacts/video/nj1-article.mp4`, asset_type: 'video', created_at: NOW
        });
        const rows = byId(await listProject('me', PROJECT));
        assert.equal(rows.a7.video_job_id, null);
        assert.equal(rows.a7.role, null);
    });

    it('a file linked twice to its job: output wins', async function () {
        await db('social_ai_video_job_media').insert({id: 'm1b', video_job_id: JOB_BY_OTHER, media_id: 'a1', role: 'preview', created_at: NOW});
        const rows = byId(await listProject('me', PROJECT));
        assert.equal(rows.a1.role, 'output');
    });

    it('the visibility rules stay: a draft project of someone else is still refused', async function () {
        await assert.rejects(() => listProject('other', OTHER_PROJECT));
    });

    describe('a group project (the family\'s default project: group_id + draft)', function () {
        beforeEach(async function () {
            // Group members: me and other. stranger is not a member.
            sinon.stub(models.SocialGroup, 'findOne').callsFake(async ({id}) => (id === GROUP ? {id: GROUP} : null));
            sinon.stub(models.SocialGroup, 'canAccessGroup').callsFake(async (group, userId) => ['me', 'other'].includes(userId));

            await db('social_ai_projects').insert({id: GROUP_PROJECT, name: 'family', user_id: 'owner', group_id: GROUP, status: 'draft'});
            await db('social_ai_video_jobs').insert({id: JOB_IN_GROUP, user_id: 'other', group_id: GROUP, project_id: GROUP_PROJECT, payload: '{}', status: 'completed', created_at: NOW, updated_at: NOW, created_by: 'other', updated_by: 'other'});
            const asset = (id, fields) => ({
                id,
                storage_key: `gallery/projects/${GROUP_PROJECT}/artifacts/video/${id}`,
                storage_url: `https://cdn.example/${id}`,
                asset_type: 'video',
                created_at: NOW,
                project_id: GROUP_PROJECT,
                group_id: GROUP,
                user_id: 'other',
                ...fields
            });
            await db('social_media_assets').insert([
                asset('g1', {owner_scope: 'video_jobs', video_job_id: JOB_IN_GROUP}),
                asset('g2', {owner_scope: 'video_jobs', video_job_id: JOB_IN_GROUP, asset_type: 'audio', storage_key: `gallery/video_jobs/${JOB_IN_GROUP}/line-1.wav`}),
                // Another member's direct upload: not a video job row, the rule for it is unchanged.
                asset('g3', {owner_scope: 'chart_jobs', original_filename: 'upload.mp4'}),
                // A row claiming this project but made by a video job of another project: not shown.
                asset('g4', {owner_scope: 'video_jobs', video_job_id: JOB_BY_OTHER})
            ]);
            await db('social_ai_video_job_media').insert([
                {id: 'mg1', video_job_id: JOB_IN_GROUP, media_id: 'g1', role: 'output', created_at: NOW},
                {id: 'mg2', video_job_id: JOB_IN_GROUP, media_id: 'g2', role: 'intermediate', created_at: NOW}
            ]);
        });

        it('a member sees another member\'s video job rows with their marks', async function () {
            const rows = byId(await listProject('me', GROUP_PROJECT));
            assert.deepEqual(Object.keys(rows).sort(), ['g1', 'g2']);
            assert.equal(rows.g1.video_job_id, JOB_IN_GROUP);
            assert.equal(rows.g1.role, 'output');
            assert.equal(rows.g2.role, 'intermediate');
        });

        it('the creator sees them too', async function () {
            const rows = byId(await listProject('other', GROUP_PROJECT));
            assert.ok(rows.g1 && rows.g2);
        });

        it('someone who cannot read the project gets nothing', async function () {
            await assert.rejects(() => listProject('stranger', GROUP_PROJECT));
        });
    });
});
