// ギャラリーのファイルに表示の名前（別名）を付ける: PUT /social/gallery/assets/:id/name
// 変えるのは social_media_assets.display_name だけ（S3 のファイル・storage_key・original_filename はそのまま）。
// 変えられるのは削除（destroyAsset）と同じ人: 上げた本人、または行を作った chart job の持ち主。
// （jibunsee-react の /family「作ったもの」パネルで、覚えやすい名前にするため）
const assert = require('assert/strict');
const knex = require('knex');
const models = require('../../../../core/server/models');

const ASSET = '0000000000000000000000a1';
const JOB_ASSET = '0000000000000000000000a2';
const JOB = '0000000000000000000000c1';

describe('Social gallery: give a file a display name (renameAsset)', function () {
    let db;
    let endpoint;
    let originalKnex;

    before(async function () {
        models.init();
        endpoint = require('../../../../core/server/api/endpoints/social-gallery');
        db = knex({client: 'sqlite3', connection: {filename: ':memory:'}, useNullAsDefault: true});
        await db.schema.createTable('social_media_assets', (t) => {
            t.string('id').primary();
            t.string('user_id');
            t.string('chart_job_id');
            t.string('storage_key');
            t.string('original_filename');
            t.string('display_name');
            t.dateTime('updated_at');
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
        await db('social_media_assets').del();
        await db('social_ai_chart_jobs').del();
        await db('social_media_assets').insert([
            {id: ASSET, user_id: 'uploader', storage_key: 'gallery/projects/p/voice-2026-11-17.webm', original_filename: 'voice-2026-11-17.webm'},
            {id: JOB_ASSET, user_id: null, chart_job_id: JOB, storage_key: 'gallery/chart_jobs/c1/out.png', original_filename: 'out.png'}
        ]);
        await db('social_ai_chart_jobs').insert({id: JOB, user_id: 'job-owner'});
    });

    const rename = (user, id, displayName) => endpoint.renameAsset.query({
        options: {id, context: user ? {user} : {}},
        data: {display_name: displayName}
    });
    const rowOf = id => db('social_media_assets').where({id}).first();

    it('the uploader can set a name; only display_name changes (S3 key and original file name stay)', async function () {
        const result = await rename('uploader', ASSET, '  母の話  （1）  ');
        assert.deepEqual(result.socialgallery[0], {
            id: ASSET,
            display_name: '母の話 （1）',
            original_filename: 'voice-2026-11-17.webm',
            name: '母の話 （1）'
        });
        const row = await rowOf(ASSET);
        assert.equal(row.display_name, '母の話 （1）');
        assert.equal(row.original_filename, 'voice-2026-11-17.webm');
        assert.equal(row.storage_key, 'gallery/projects/p/voice-2026-11-17.webm');
    });

    it('an empty name clears it (lists go back to the uploaded file name)', async function () {
        await rename('uploader', ASSET, '母の話');
        const result = await rename('uploader', ASSET, '   ');
        assert.equal(result.socialgallery[0].display_name, null);
        assert.equal(result.socialgallery[0].name, 'voice-2026-11-17.webm');
        assert.equal((await rowOf(ASSET)).display_name, null);
    });

    it('control characters become spaces', async function () {
        await rename('uploader', ASSET, '運動会\n2026\t秋');
        assert.equal((await rowOf(ASSET)).display_name, '運動会 2026 秋');
    });

    it('the owner of the chart job that made the row can rename it (same as delete)', async function () {
        await rename('job-owner', JOB_ASSET, '家系図の絵');
        assert.equal((await rowOf(JOB_ASSET)).display_name, '家系図の絵');
    });

    it('anyone else is refused and nothing changes', async function () {
        await assert.rejects(rename('family-member', ASSET, 'ほかの名前'), {errorType: 'NoPermissionError'});
        await assert.rejects(rename('uploader', JOB_ASSET, 'ほかの名前'), {errorType: 'NoPermissionError'});
        assert.equal((await rowOf(ASSET)).display_name, null);
        assert.equal((await rowOf(JOB_ASSET)).display_name, null);
    });

    it('no signed-in user, no id, an unknown id or a name over 200 characters are refused', async function () {
        await assert.rejects(rename(null, ASSET, 'x'), {errorType: 'NoPermissionError'});
        await assert.rejects(rename('uploader', '', 'x'), {errorType: 'ValidationError'});
        await assert.rejects(rename('uploader', '0000000000000000000000ff', 'x'), {errorType: 'NotFoundError'});
        await assert.rejects(rename('uploader', ASSET, 'あ'.repeat(201)), {errorType: 'ValidationError'});
        assert.equal((await rowOf(ASSET)).display_name, null);
        await rename('uploader', ASSET, 'あ'.repeat(200));
        assert.equal((await rowOf(ASSET)).display_name.length, 200);
    });
});
