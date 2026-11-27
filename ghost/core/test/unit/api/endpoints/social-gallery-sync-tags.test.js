// ギャラリーの行に Post の主タグを付ける道（sync-tags）と、行のタグを 1 つ変える道（PUT /social/gallery/tag）。
// - sync-tags: Post を直せる人だけ（グループの Post はグループに書ける人、それ以外は Ghost の Post の編集の権限）。
//   body の urls は Post に入っているものだけを使う。すでにある行は、書ける人の行（上げた本人・Post の作者・
//   chart job の持ち主・グループに書けるメンバー・管理者）だけタグを変え、ほかの人の行はそのまま（skipped_count）。
// - tag: 変えられるのは上の「書ける人」だけ。鍵（integration）だけ・ログイン無しは断る。
const assert = require('assert/strict');
const sinon = require('sinon');
const knex = require('knex');
const models = require('../../../../core/server/models');
const storage = require('../../../../core/server/adapters/storage');
const permissionsService = require('../../../../core/server/services/permissions');

const galleryPath = require.resolve('../../../../core/server/api/endpoints/social-gallery');
const staffScopePath = require.resolve('../../../../core/server/api/endpoints/utils/staff-scope');

const HOST = 'https://cdn.example.com';
const ME = '00000000000000000000aa01';
const OTHER = '00000000000000000000aa02';
const EDITOR = '00000000000000000000aa03';
const ADMIN = '00000000000000000000aa04';
const GROUP = '00000000000000000000bb01';
const POST = '00000000000000000000cc01';
const GROUP_POST = '00000000000000000000cc02';
const CHART_JOB = '00000000000000000000ee01';
const TAG = {id: '00000000000000000000dd01', slug: 'travel', name: 'Travel'};

const MINE_KEY = 'content/media/gallery/users/me/2026/11/mine.png';
const OTHERS_KEY = 'content/media/gallery/users/other/2026/11/others.png';
const NEW_KEY = 'content/media/gallery/users/me/2026/11/new.png';
const STRAY_KEY = 'content/media/gallery/users/other/2026/11/stray.png';
const CHART_KEY = 'content/media/gallery/chart_jobs/c1/out.png';
const GROUP_KEY = 'content/media/gallery/groups/g/2026/11/group.png';
const url = key => `${HOST}/${key}`;

const makePost = ({id, createdBy, groupId = null, html}) => ({
    id,
    get: key => ({id, created_by: createdBy, group_id: groupId, html, feature_image: null, lexical: null})[key],
    related: () => ({toJSON: () => [TAG]})
});

describe('Social gallery: sync-tags and tag only touch rows the caller may write', function () {
    let db;
    let endpoint;
    let originalKnex;
    let staffScope;
    let posts;
    let canEditPost;

    before(async function () {
        models.init();
        delete require.cache[galleryPath];
        delete require.cache[staffScopePath];
        staffScope = require(staffScopePath);
        endpoint = require(galleryPath);
        db = knex({client: 'sqlite3', connection: {filename: ':memory:'}, useNullAsDefault: true});
        await db.schema.createTable('social_media_assets', (t) => {
            t.string('id').primary();
            ['storage_key', 'storage_key_hash', 'storage_url', 'asset_type', 'owner_scope', 'user_id', 'group_id',
                'chart_job_id', 'tag_id', 'tag_slug'].forEach(c => t.string(c));
            t.dateTime('created_at');
            t.dateTime('updated_at');
        });
        await db.schema.createTable('social_ai_chart_jobs', (t) => {
            t.string('id').primary();
            t.string('user_id');
        });
        await db.schema.createTable('tags', (t) => {
            t.string('id').primary();
            t.string('slug');
            t.string('name');
        });
        originalKnex = models.Base.knex;
        models.Base.knex = db;
    });

    after(async function () {
        models.Base.knex = originalKnex;
        await db.destroy();
    });

    beforeEach(async function () {
        const store = {
            host: HOST,
            list: async () => [],
            urlToPath: value => value.replace(`${HOST}/`, '')
        };
        sinon.stub(storage, 'getStorage').returns(store);
        posts = {
            // my own post: my image, someone else's image, an image with no row yet
            [POST]: makePost({id: POST, createdBy: ME, html: `<img src="${url(MINE_KEY)}"><img src="${url(OTHERS_KEY)}"><img src="${url(NEW_KEY)}"><img src="${url(CHART_KEY)}">`}),
            [GROUP_POST]: makePost({id: GROUP_POST, createdBy: OTHER, groupId: GROUP, html: `<img src="${url(GROUP_KEY)}"><img src="${url(OTHERS_KEY)}">`})
        };
        sinon.stub(models.Post, 'findOne').callsFake(async ({id}) => posts[id] || null);
        // Ghost's post permission: the author, editors and admins may edit POST
        canEditPost = sinon.stub(permissionsService, 'canThis').callsFake(context => ({
            edit: {
                post: async (id) => {
                    if (id === POST && [ME, EDITOR, ADMIN].includes(context.user)) {
                        return;
                    }
                    throw new Error('no permission');
                }
            }
        }));
        sinon.stub(models.SocialGroup, 'findOne').callsFake(async ({id}) => (id === GROUP ? {id} : null));
        sinon.stub(models.SocialGroup, 'canAccessGroup').callsFake(async (group, userId) => [ME, OTHER].includes(userId));
        sinon.stub(staffScope, 'getStaffScope').callsFake(async userId => ({isSystemAdmin: userId === ADMIN}));
        await db('social_media_assets').del();
        await db('social_ai_chart_jobs').del();
        await db('tags').del();
        await db('tags').insert(TAG);
        await db('social_ai_chart_jobs').insert({id: CHART_JOB, user_id: ME});
        await db('social_media_assets').insert([
            {id: 'a1', storage_key: MINE_KEY, storage_url: url(MINE_KEY), owner_scope: 'user', user_id: ME},
            {id: 'a2', storage_key: OTHERS_KEY, storage_url: url(OTHERS_KEY), owner_scope: 'user', user_id: OTHER, tag_slug: 'family'},
            {id: 'a3', storage_key: STRAY_KEY, storage_url: url(STRAY_KEY), owner_scope: 'user', user_id: OTHER, tag_slug: 'family'},
            {id: 'a4', storage_key: CHART_KEY, storage_url: url(CHART_KEY), owner_scope: 'chart_jobs', user_id: null, chart_job_id: CHART_JOB},
            {id: 'a5', storage_key: GROUP_KEY, storage_url: url(GROUP_KEY), owner_scope: 'group', user_id: OTHER, group_id: GROUP}
        ]);
    });

    afterEach(function () {
        sinon.restore();
    });

    const sync = (user, data) => endpoint.syncTags.query({options: {context: user ? {user} : {}}, data});
    const tagOf = async key => (await db('social_media_assets').where({storage_key: key}).first())?.tag_slug || null;
    const rowOf = key => db('social_media_assets').where({storage_key: key}).first();

    describe('sync-tags', function () {
        it('the author: own rows and rows of own chart jobs get the tag, a new URL becomes the author\'s row, someone else\'s row is left alone', async function () {
            const result = await sync(ME, {post_id: POST, mode: 'primary'});
            assert.equal(await tagOf(MINE_KEY), 'travel');
            assert.equal(await tagOf(CHART_KEY), 'travel');
            assert.equal(await tagOf(OTHERS_KEY), 'family');
            const inserted = await rowOf(NEW_KEY);
            assert.equal(inserted.user_id, ME);
            assert.equal(inserted.tag_slug, 'travel');
            assert.equal(result.data[0].updated_count, 2);
            assert.equal(result.data[0].inserted_count, 1);
            assert.equal(result.data[0].skipped_count, 1);
        });

        it('urls in the body: only those in the post are used (another key is neither tagged nor made a row)', async function () {
            const result = await sync(ME, {post_id: POST, mode: 'primary', urls: [url(MINE_KEY), url(STRAY_KEY), url('content/media/gallery/users/other/2026/11/unseen.png')]});
            assert.equal(await tagOf(MINE_KEY), 'travel');
            assert.equal(await tagOf(STRAY_KEY), 'family');
            assert.equal(await rowOf('content/media/gallery/users/other/2026/11/unseen.png'), undefined);
            assert.equal(result.data[0].synced_count, 1);
        });

        it('an editor syncing someone\'s post retags the author\'s rows (the post author\'s rows count as writable)', async function () {
            posts[POST] = makePost({id: POST, createdBy: OTHER, html: `<img src="${url(OTHERS_KEY)}">`});
            await sync(EDITOR, {post_id: POST, mode: 'primary'});
            assert.equal(await tagOf(OTHERS_KEY), 'travel');
        });

        it('a post outside any group that the caller may not edit is refused, and nothing changes', async function () {
            await assert.rejects(sync(OTHER, {post_id: POST, mode: 'primary'}), {errorType: 'NoPermissionError'});
            assert.equal(await tagOf(MINE_KEY), null);
            assert.equal(await rowOf(NEW_KEY), undefined);
            assert.ok(canEditPost.called);
        });

        it('a group post: a member who may write the group syncs it; group rows and the post author\'s rows get the tag', async function () {
            const result = await sync(ME, {post_id: GROUP_POST, mode: 'primary'});
            assert.equal(await tagOf(GROUP_KEY), 'travel');
            // OTHERS_KEY belongs to OTHER, who is also the post's author: the author's rows count
            assert.equal(await tagOf(OTHERS_KEY), 'travel');
            assert.equal(result.data[0].skipped_count, 0);
        });

        it('a group post: someone who may not write the group is refused', async function () {
            await assert.rejects(sync(EDITOR, {post_id: GROUP_POST, mode: 'primary'}), {errorType: 'NoPermissionError'});
            assert.equal(await tagOf(GROUP_KEY), null);
        });

        it('no signed-in user (a key only) is refused', async function () {
            await assert.rejects(sync(null, {post_id: POST, mode: 'primary'}), {errorType: 'NoPermissionError'});
        });
    });

    describe('tag (PUT /social/gallery/tag)', function () {
        const retag = (user, storageKey, tagSlug) => endpoint.updateTag.query({
            options: {context: user ? {user} : {}},
            data: {storage_key: storageKey, tag_slug: tagSlug}
        });

        it('the uploader, the chart job owner, a group writer and an admin may change the tag', async function () {
            await retag(ME, MINE_KEY, 'travel');
            await retag(ME, CHART_KEY, 'travel');
            await retag(ME, GROUP_KEY, 'travel');
            await retag(ADMIN, OTHERS_KEY, 'travel');
            for (const key of [MINE_KEY, CHART_KEY, GROUP_KEY, OTHERS_KEY]) {
                assert.equal(await tagOf(key), 'travel');
            }
        });

        it('someone else\'s row is refused and keeps its tag', async function () {
            await assert.rejects(retag(ME, OTHERS_KEY, 'travel'), {errorType: 'NoPermissionError'});
            await assert.rejects(retag(EDITOR, GROUP_KEY, null), {errorType: 'NoPermissionError'});
            assert.equal(await tagOf(OTHERS_KEY), 'family');
            assert.equal(await tagOf(GROUP_KEY), null);
        });

        it('no signed-in user (a key only) is refused', async function () {
            await assert.rejects(retag(null, MINE_KEY, 'travel'), {errorType: 'NoPermissionError'});
            assert.equal(await tagOf(MINE_KEY), null);
        });
    });
});
