const assert = require('assert/strict');
const Module = require('module');
const sinon = require('sinon');
const knexFactory = require('knex');
const fixtures = require('../../../../core/server/data/schema/fixtures/fixtures.json');

const endpointPath = require.resolve('../../../../core/server/api/endpoints/social-ai-news-broadcast-selections');
const staffScopePath = require.resolve('../../../../core/server/api/endpoints/utils/staff-scope');
const permissionCalls = [];
const endpointFrame = (data, user = 'admin-user') => ({
    data: {socialainewsbroadcastselections: [data]},
    options: {context: {user}}
});
// Role per user id; a user missing here does not exist.
const roles = {};
const staffFrame = (postIds, user, extra = {}) => ({options: {post_ids: postIds.join(','), context: {user, ...extra}}});

const POST = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const DRAFT = '888888888888888888888888';
const GROUP_POST = '777777777777777777777777';
const JOB = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const PROJECT = 'dddddddddddddddddddddddd';
const MEDIA = 'eeeeeeeeeeeeeeeeeeeeeeee';
const PUBLIC_GROUP = '1a1a1a1a1a1a1a1a1a1a1a1a';
const FAMILY_GROUP = '2b2b2b2b2b2b2b2b2b2b2b2b';
const ARCHIVED_PUBLIC_GROUP = '3c3c3c3c3c3c3c3c3c3c3c3c';

describe('News broadcast selections', function () {
    let database;
    let models;
    let endpoint;

    before(async function () {
        database = knexFactory({client: 'sqlite3', connection: {filename: ':memory:'}, useNullAsDefault: true});
        await database.schema.createTable('users', table => table.string('id').primary());
        await database.schema.createTable('posts', (table) => {
            table.string('id').primary();
            table.string('type');
            table.boolean('public_post');
            table.string('status');
            table.string('visibility');
        });
        await database.schema.createTable('social_groups', (table) => {
            table.string('id').primary();
            table.string('type');
            table.string('status');
        });
        await database.schema.createTable('social_ai_projects', (table) => {
            table.string('id').primary();
            table.string('group_id');
        });
        await database.schema.createTable('social_ai_news_jobs', (table) => {
            table.string('id').primary();
            table.string('type');
            table.string('status');
            table.string('project_id');
            table.string('user_id');
            table.string('group_id');
            table.text('items');
        });
        await database.schema.createTable('social_media_assets', (table) => {
            table.string('id').primary();
            table.string('asset_type');
            table.string('owner_scope');
            table.string('project_id');
            table.string('news_job_id');
            table.string('storage_url');
            table.string('storage_key');
            table.string('original_filename');
        });
        await database.schema.createTable('social_ai_news_job_media', (table) => {
            table.string('id').primary();
            table.string('news_job_id');
            table.string('media_id');
            table.string('role');
            table.string('item_key');
            table.string('post_id');
        });
        await database.schema.createTable('social_ai_avatar_broadcast_selections', (table) => {
            table.string('post_id').primary();
            table.string('project_id');
            table.string('media_id').unique();
            table.string('rendition');
            table.integer('revision');
            table.string('created_by');
            table.string('updated_by');
            table.string('created_at');
            table.string('updated_at');
        });

        models = {
            Base: {knex: database},
            User: {findOne: async ({id}) => {
                const role = id === 'admin-user' ? 'Admin' : roles[id];
                return role ? {related: () => ({models: [{get: () => role}]})} : null;
            }}
        };
        const originalLoad = Module._load;
        const dependencyStub = sinon.stub(Module, '_load').callsFake(function (request, parent, isMain) {
            if (parent && parent.filename === endpointPath && request === '../../models') {
                return models;
            }
            if (parent && parent.filename === staffScopePath && request === '../../../models') {
                return models;
            }
            if (parent && parent.filename === endpointPath && request === '../../services/permissions') {
                return {
                    canThis: () => ({
                        add: {socialaiavatarbroadcastselection: (id) => {
                            permissionCalls.push(['add', id]);
                            return Promise.resolve();
                        }},
                        edit: {socialaiavatarbroadcastselection: (id) => {
                            permissionCalls.push(['edit', id]);
                            return Promise.resolve();
                        }}
                    })
                };
            }
            return originalLoad.call(this, request, parent, isMain);
        });
        try {
            delete require.cache[endpointPath];
            delete require.cache[staffScopePath];
            endpoint = require(endpointPath);
        } finally {
            dependencyStub.restore();
            delete require.cache[endpointPath];
            delete require.cache[staffScopePath];
        }
    });

    beforeEach(async function () {
        for (const table of ['social_ai_avatar_broadcast_selections', 'social_ai_news_job_media', 'social_media_assets', 'social_ai_news_jobs', 'social_ai_projects', 'social_groups', 'posts']) {
            await database(table).del();
        }
        await database('posts').insert([
            {id: 'aaaaaaaaaaaaaaaaaaaaaaaa', type: 'post', public_post: true, status: 'published', visibility: 'public'},
            {id: '999999999999999999999999', type: 'post', public_post: true, status: 'published', visibility: 'members'},
            {id: '888888888888888888888888', type: 'post', public_post: true, status: 'draft', visibility: 'public'},
            {id: GROUP_POST, type: 'post', public_post: false, status: 'published', visibility: 'public'}
        ]);
        await database('social_groups').insert([
            {id: PUBLIC_GROUP, type: 'public', status: 'active'},
            {id: FAMILY_GROUP, type: 'family', status: 'active'},
            {id: ARCHIVED_PUBLIC_GROUP, type: 'public', status: 'archived'}
        ]);
        await database('social_ai_projects').insert({id: PROJECT, group_id: null});
        await database('social_ai_news_jobs').insert({
            id: 'bbbbbbbbbbbbbbbbbbbbbbbb', type: 'news-read', status: 'completed',
            project_id: 'dddddddddddddddddddddddd', user_id: 'admin-user',
            items: JSON.stringify([{key: 'story-one', post_id: 'aaaaaaaaaaaaaaaaaaaaaaaa', status: 'completed'}])
        });
        await database('social_ai_news_jobs').insert({
            id: 'cccccccccccccccccccccccc', type: 'news-avatar-lipsync', status: 'completed',
            project_id: 'dddddddddddddddddddddddd', user_id: 'admin-user',
            items: JSON.stringify([{key: 'story-one', post_id: 'aaaaaaaaaaaaaaaaaaaaaaaa', status: 'completed'}])
        });
        await database('social_media_assets').insert([
            {id: 'eeeeeeeeeeeeeeeeeeeeeeee', asset_type: 'video', owner_scope: 'news_jobs', project_id: 'dddddddddddddddddddddddd', news_job_id: 'bbbbbbbbbbbbbbbbbbbbbbbb', storage_url: 'https://cdn.example/story-one-avatar.mp4', storage_key: 'projects/p/video/story-one-avatar.mp4', original_filename: 'story-one-avatar.mp4'},
            {id: 'ffffffffffffffffffffffff', asset_type: 'video', owner_scope: 'news_jobs', project_id: 'dddddddddddddddddddddddd', news_job_id: 'cccccccccccccccccccccccc', storage_url: 'https://cdn.example/story-one-photo-avatar-lipsync-abcdefabcdefabcdefabcdef.mp4', storage_key: 'projects/p/video/story-one-photo-avatar-lipsync-abcdefabcdefabcdefabcdef.mp4', original_filename: 'story-one-photo-avatar-lipsync-abcdefabcdefabcdefabcdef.mp4'}
        ]);
        await database('social_ai_news_job_media').insert([
            {id: '111111111111111111111111', news_job_id: 'bbbbbbbbbbbbbbbbbbbbbbbb', media_id: 'eeeeeeeeeeeeeeeeeeeeeeee', role: 'output', item_key: 'story-one', post_id: 'aaaaaaaaaaaaaaaaaaaaaaaa'},
            {id: '222222222222222222222222', news_job_id: 'cccccccccccccccccccccccc', media_id: 'ffffffffffffffffffffffff', role: 'output', item_key: 'story-one', post_id: 'aaaaaaaaaaaaaaaaaaaaaaaa'}
        ]);
    });

    after(async function () {
        await database.destroy();
    });

    it('stores one selected rendition per post and advances a compare-and-swap revision', async function () {
        const first = await endpoint.select.query(endpointFrame({
            post_id: 'aaaaaaaaaaaaaaaaaaaaaaaa', news_job_id: 'bbbbbbbbbbbbbbbbbbbbbbbb',
            item_key: 'story-one', name: 'story-one-avatar.mp4', expected_revision: 0
        }));
        assert.equal(first.revision, 1);
        assert.equal(first.rendition, 'news-panel-static');

        const next = await endpoint.select.query(endpointFrame({
            post_id: 'aaaaaaaaaaaaaaaaaaaaaaaa', news_job_id: 'cccccccccccccccccccccccc',
            item_key: 'story-one', name: 'story-one-photo-avatar-lipsync-abcdefabcdefabcdefabcdef.mp4', expected_revision: 1
        }));
        assert.equal(next.revision, 2);
        assert.equal(next.rendition, 'photo-slideshow-lipsync');
        assert.equal(next.media_id, 'ffffffffffffffffffffffff');
        assert.equal(await database('social_ai_avatar_broadcast_selections').where({post_id: 'aaaaaaaaaaaaaaaaaaaaaaaa'}).count('* as count').first().then(row => Number(row.count)), 1);
    });

    it('rejects stale revisions and artifacts linked to another post', async function () {
        await assert.rejects(endpoint.select.query(endpointFrame({
            post_id: 'aaaaaaaaaaaaaaaaaaaaaaaa', news_job_id: 'bbbbbbbbbbbbbbbbbbbbbbbb',
            item_key: 'story-one', name: 'story-one-avatar.mp4', expected_revision: 1
        })), /changed/);

        await assert.rejects(endpoint.select.query(endpointFrame({
            post_id: 'aaaaaaaaaaaaaaaaaaaaaaaa', news_job_id: 'bbbbbbbbbbbbbbbbbbbbbbbb',
            item_key: 'wrong-item', name: 'story-one-avatar.mp4', expected_revision: 0
        })), /not found|does not match/i);
    });

    it('browses the selected media for requested posts only', async function () {
        await endpoint.select.query(endpointFrame({
            post_id: 'aaaaaaaaaaaaaaaaaaaaaaaa', news_job_id: 'bbbbbbbbbbbbbbbbbbbbbbbb',
            item_key: 'story-one', name: 'story-one-avatar.mp4', expected_revision: 0
        }));
        const result = await endpoint.browse.query({
            options: {post_ids: 'aaaaaaaaaaaaaaaaaaaaaaaa'}
        });
        assert.equal(result.data.length, 1);
        assert.equal(result.data[0].storage_url, 'https://cdn.example/story-one-avatar.mp4');
    });

    // Selection (made by an admin) on `postId` of the story-one avatar of JOB, written directly.
    const selectOn = async (postId, mediaId = MEDIA) => {
        if (postId !== POST) {
            await database('social_ai_news_job_media').insert({
                id: `${postId.slice(0, 12)}000000000000`, news_job_id: JOB, media_id: mediaId, role: 'output', item_key: 'story-one', post_id: postId
            });
        }
        await database('social_ai_avatar_broadcast_selections').insert({
            post_id: postId, project_id: PROJECT, media_id: mediaId, rendition: 'news-panel-static', revision: 1, updated_by: 'admin-user'
        });
    };
    const publicIds = async postIds => (await endpoint.browse.query({options: {post_ids: postIds.join(',')}})).data.map(row => row.post_id);

    describe('public browse / read scope', function () {
        it('returns only post_id, rendition, name and storage_url', async function () {
            await selectOn(POST);
            const browse = await endpoint.browse.query({options: {post_ids: POST}});
            const read = await endpoint.read.query({options: {id: POST}});
            const expected = [{post_id: POST, rendition: 'news-panel-static', name: 'story-one-avatar.mp4', storage_url: 'https://cdn.example/story-one-avatar.mp4'}];
            assert.deepEqual(browse.data, expected);
            assert.deepEqual(read.data, expected);
        });

        it('does not return a legacy-default tombstone', async function () {
            await database('social_ai_avatar_broadcast_selections').insert({post_id: POST, media_id: null, rendition: 'legacy-default', revision: 2});
            assert.deepEqual(await publicIds([POST]), []);
            await assert.rejects(endpoint.read.query({options: {id: POST}}), /not found/i);
        });

        it('leaves out group posts (public_post = false) and non-post types', async function () {
            await selectOn(GROUP_POST);
            assert.deepEqual(await publicIds([GROUP_POST]), []);
            await database('social_ai_avatar_broadcast_selections').del();
            await database('posts').where({id: POST}).update({type: 'page'});
            await selectOn(POST);
            assert.deepEqual(await publicIds([POST]), []);
        });

        for (const [label, change] of [
            ['the job project moved to a family group', () => database('social_ai_projects').where({id: PROJECT}).update({group_id: FAMILY_GROUP})],
            ['the job project moved to an archived public group', () => database('social_ai_projects').where({id: PROJECT}).update({group_id: ARCHIVED_PUBLIC_GROUP})],
            ['the job itself moved to a family group', () => database('social_ai_news_jobs').where({id: JOB}).update({group_id: FAMILY_GROUP})],
            ['the media lost its job', () => database('social_media_assets').where({id: MEDIA}).update({news_job_id: null})]
        ]) {
            it(`stops serving a selection once ${label}`, async function () {
                await selectOn(POST);
                assert.deepEqual(await publicIds([POST]), [POST]);
                await change();
                assert.deepEqual(await publicIds([POST]), []);
                await assert.rejects(endpoint.read.query({options: {id: POST}}), /not found/i);
            });
        }

        it('keeps serving a job in an active public group, or whose project is gone', async function () {
            await selectOn(POST);
            await database('social_ai_news_jobs').where({id: JOB}).update({group_id: PUBLIC_GROUP});
            await database('social_ai_projects').where({id: PROJECT}).update({group_id: PUBLIC_GROUP});
            assert.deepEqual(await publicIds([POST]), [POST]);
            await database('social_ai_projects').where({id: PROJECT}).del();
            assert.deepEqual(await publicIds([POST]), [POST]);
        });
    });

    describe('staff browse', function () {
        beforeEach(function () {
            Object.assign(roles, {editor: 'Editor', author: 'Author', contributor: 'Contributor', 'super-editor': 'Super Editor'});
        });

        it('gates on post browse and rejects integrations and missing users', async function () {
            assert.deepEqual(endpoint.staffBrowse.permissions, {docName: 'post', method: 'browse'});
            await selectOn(POST);
            await assert.rejects(endpoint.staffBrowse.query(staffFrame([POST], null)), /session is required/);
            await assert.rejects(endpoint.staffBrowse.query(staffFrame([POST], null, {integration: {id: 'i'}})), /session is required/);
            await assert.rejects(endpoint.staffBrowse.query(staffFrame([POST], 'editor', {integration: {id: 'i'}})), /session is required/);
            await assert.rejects(endpoint.staffBrowse.query(staffFrame([POST], 'ghost-user')), /staff user is required/);
        });

        it('returns draft selections with the full row to every staff role', async function () {
            await selectOn(DRAFT);
            for (const user of ['admin-user', 'super-editor', 'editor', 'author', 'contributor']) {
                const {data} = await endpoint.staffBrowse.query(staffFrame([DRAFT], user));
                assert.equal(data.length, 1, user);
                assert.equal(data[0].revision, 1);
                assert.equal(data[0].news_job_id, JOB);
                assert.equal(data[0].item_key, 'story-one');
            }
        });

        it('returns tombstones so NewsAgent keeps their revision', async function () {
            await database('social_ai_avatar_broadcast_selections').insert({post_id: POST, media_id: null, rendition: 'legacy-default', revision: 4});
            const {data} = await endpoint.staffBrowse.query(staffFrame([POST], 'editor'));
            assert.equal(data.length, 1);
            assert.equal(data[0].rendition, 'legacy-default');
            assert.equal(data[0].revision, 4);
        });

        it('shows a private-project job selection to its owner and to system admins only', async function () {
            await database('social_ai_news_jobs').where({id: JOB}).update({user_id: 'author'});
            await database('social_ai_projects').where({id: PROJECT}).update({group_id: FAMILY_GROUP});
            await selectOn(POST);
            const urlSeen = async user => (await endpoint.staffBrowse.query(staffFrame([POST], user))).data[0].storage_url;
            assert.equal(await urlSeen('author'), 'https://cdn.example/story-one-avatar.mp4');
            assert.equal(await urlSeen('admin-user'), 'https://cdn.example/story-one-avatar.mp4');
            assert.equal(await urlSeen('editor'), null);
            assert.equal(await urlSeen('super-editor'), null);
        });

        it('keeps the revision but withholds the media when the viewer may not see it', async function () {
            await database('social_ai_projects').where({id: PROJECT}).update({group_id: FAMILY_GROUP});
            await selectOn(POST);
            const {data} = await endpoint.staffBrowse.query(staffFrame([POST], 'editor'));
            assert.deepEqual(data.map(row => [row.post_id, row.rendition, row.revision]), [[POST, 'news-panel-static', 1]]);
            for (const field of ['project_id', 'news_job_id', 'item_key', 'media_id', 'name', 'storage_url']) {
                assert.equal(data[0][field], null, field);
            }
        });

        it('keeps the row of a selection whose media or job was deleted', async function () {
            await selectOn(POST);
            await database('social_ai_news_jobs').where({id: JOB}).del();
            let {data} = await endpoint.staffBrowse.query(staffFrame([POST], 'editor'));
            assert.deepEqual(data.map(row => [row.revision, row.storage_url]), [[1, null]]);
            await database('social_media_assets').where({id: MEDIA}).del();
            ({data} = await endpoint.staffBrowse.query(staffFrame([POST], 'editor')));
            assert.deepEqual(data.map(row => [row.revision, row.storage_url]), [[1, null]]);
        });

        it('shows an Editor their own private-group job selection', async function () {
            await database('social_ai_news_jobs').where({id: JOB}).update({user_id: 'editor', group_id: FAMILY_GROUP});
            await selectOn(POST);
            const {data} = await endpoint.staffBrowse.query(staffFrame([POST], 'editor'));
            assert.equal(data[0].storage_url, 'https://cdn.example/story-one-avatar.mp4');
        });

        it('shows group posts (public_post = false) to system admins only', async function () {
            await selectOn(GROUP_POST);
            const seen = async user => (await endpoint.staffBrowse.query(staffFrame([GROUP_POST], user))).data.length;
            assert.equal(await seen('admin-user'), 1);
            for (const user of ['super-editor', 'editor', 'author', 'contributor']) {
                assert.equal(await seen(user), 0, user);
            }
        });

        it('validates post ids like the public browse', async function () {
            await assert.rejects(endpoint.staffBrowse.query(staffFrame(['not-an-id'], 'editor')), /valid post IDs/);
            assert.deepEqual((await endpoint.staffBrowse.query(staffFrame([], 'editor'))).data, []);
        });
    });

    it('allows anonymous browse/read only for published public posts', async function () {
        await endpoint.select.query(endpointFrame({
            post_id: 'aaaaaaaaaaaaaaaaaaaaaaaa', news_job_id: 'bbbbbbbbbbbbbbbbbbbbbbbb',
            item_key: 'story-one', name: 'story-one-avatar.mp4', expected_revision: 0
        }));
        await database('social_ai_avatar_broadcast_selections').insert([
            {post_id: '999999999999999999999999', media_id: null, rendition: 'legacy-default', revision: 1},
            {post_id: '888888888888888888888888', media_id: null, rendition: 'legacy-default', revision: 1}
        ]);

        const result = await endpoint.browse.query({options: {post_ids: [
            'aaaaaaaaaaaaaaaaaaaaaaaa', '999999999999999999999999', '888888888888888888888888'
        ].join(',')}});
        assert.deepEqual(result.data.map(row => row.post_id), ['aaaaaaaaaaaaaaaaaaaaaaaa']);

        const read = await endpoint.read.query({options: {id: 'aaaaaaaaaaaaaaaaaaaaaaaa'}});
        assert.equal(read.data[0].post_id, 'aaaaaaaaaaaaaaaaaaaaaaaa');
        await assert.rejects(endpoint.read.query({options: {id: '999999999999999999999999'}}), /not found/i);
    });

    it('does not expose a non-video asset through the public broadcast lookup', async function () {
        await database('social_media_assets').insert({
            id: '111111111111111111111111',
            asset_type: 'image',
            owner_scope: 'news_jobs',
            project_id: 'dddddddddddddddddddddddd',
            news_job_id: 'bbbbbbbbbbbbbbbbbbbbbbbb',
            storage_url: 'https://cdn.example/story-one.png',
            storage_key: 'projects/p/images/story-one.png',
            original_filename: 'story-one.png'
        });
        await database('social_ai_avatar_broadcast_selections').insert({
            post_id: 'aaaaaaaaaaaaaaaaaaaaaaaa',
            media_id: '111111111111111111111111',
            rendition: 'photo-slideshow-static',
            revision: 1
        });

        const result = await endpoint.browse.query({
            options: {post_ids: 'aaaaaaaaaaaaaaaaaaaaaaaa'}
        });
        assert.deepEqual(result.data, []);
    });

    it('uses add permission for first adoption and edit permission for subsequent changes', async function () {
        permissionCalls.length = 0;
        await endpoint.select.permissions(endpointFrame({post_id: 'aaaaaaaaaaaaaaaaaaaaaaaa', expected_revision: 0}));
        await endpoint.select.permissions(endpointFrame({post_id: 'aaaaaaaaaaaaaaaaaaaaaaaa', expected_revision: 1}));
        assert.deepEqual(permissionCalls, [
            ['add', 'aaaaaaaaaaaaaaaaaaaaaaaa'],
            ['edit', 'aaaaaaaaaaaaaaaaaaaaaaaa']
        ]);
    });

    it('restores the legacy default without deleting the revision tombstone', async function () {
        await endpoint.select.query(endpointFrame({
            post_id: 'aaaaaaaaaaaaaaaaaaaaaaaa', news_job_id: 'bbbbbbbbbbbbbbbbbbbbbbbb',
            item_key: 'story-one', name: 'story-one-avatar.mp4', expected_revision: 0
        }));
        const restored = await endpoint.select.query(endpointFrame({
            action: 'clear', post_id: 'aaaaaaaaaaaaaaaaaaaaaaaa', expected_revision: 1
        }));
        assert.equal(restored.rendition, 'legacy-default');
        assert.equal(restored.revision, 2);
        assert.equal(restored.media_id, null);
        assert.equal((await database('social_ai_avatar_broadcast_selections').where({post_id: 'aaaaaaaaaaaaaaaaaaaaaaaa'}).first()).revision, 2);
    });

    it('seeds public read and Author-or-higher write permissions for fresh databases', function () {
        assert.equal(endpoint.browse.permissions, false);
        assert.equal(endpoint.read.permissions, false);
        assert.equal(typeof endpoint.select.permissions, 'function');
        const permissionEntries = fixtures.models.find(model => model.name === 'Permission').entries;
        for (const action of ['browse', 'read', 'add', 'edit', 'destroy']) {
            assert.ok(permissionEntries.some(permission => permission.action_type === action && permission.object_type === 'socialaiavatarbroadcastselection'));
        }

        const rolePermissions = fixtures.relations.find(relation => relation.from.model === 'Role' && relation.to.model === 'Permission').entries;
        const readActions = ['browse', 'read'];
        const writeActions = ['browse', 'read', 'add', 'edit', 'destroy'];
        for (const role of ['Owner', 'Administrator', 'Editor', 'Author', 'Super Editor']) {
            assert.deepEqual(rolePermissions[role].socialaiavatarbroadcastselection, writeActions);
        }
        assert.deepEqual(rolePermissions.Contributor.socialaiavatarbroadcastselection, readActions);
        assert.deepEqual(rolePermissions['Admin Integration'].socialaiavatarbroadcastselection, readActions);
    });
});
