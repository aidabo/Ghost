const assert = require('assert/strict');
const Module = require('module');
const sinon = require('sinon');
const knexFactory = require('knex');
const fixtures = require('../../../../core/server/data/schema/fixtures/fixtures.json');

const endpointPath = require.resolve('../../../../core/server/api/endpoints/social-ai-news-broadcast-selections');
const endpointFrame = (data, user = 'admin-user') => ({
    data: {socialainewsbroadcastselections: [data]},
    options: {context: {user}}
});

describe('News broadcast selections', function () {
    let database;
    let models;
    let endpoint;

    before(async function () {
        database = knexFactory({client: 'sqlite3', connection: {filename: ':memory:'}, useNullAsDefault: true});
        await database.schema.createTable('users', table => table.string('id').primary());
        await database.schema.createTable('posts', table => table.string('id').primary());
        await database.schema.createTable('social_ai_projects', table => table.string('id').primary());
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
            User: {findOne: async () => ({related: () => ({models: [{get: () => 'Admin'}]})})}
        };
        const originalLoad = Module._load;
        const dependencyStub = sinon.stub(Module, '_load').callsFake(function (request, parent, isMain) {
            if (parent && parent.filename === endpointPath && request === '../../models') {
                return models;
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
        for (const table of ['social_ai_avatar_broadcast_selections', 'social_ai_news_job_media', 'social_media_assets', 'social_ai_news_jobs', 'posts']) {
            await database(table).del();
        }
        await database('posts').insert({id: 'aaaaaaaaaaaaaaaaaaaaaaaa'});
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
            options: {post_ids: 'aaaaaaaaaaaaaaaaaaaaaaaa', context: {integration: {id: 'trusted-reader'}}}
        });
        assert.equal(result.data.length, 1);
        assert.equal(result.data[0].storage_url, 'https://cdn.example/story-one-avatar.mp4');
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

    it('seeds permissions for fresh databases with admin-only adoption and integration read', function () {
        assert.deepEqual(endpoint.browse.permissions, {object: 'socialaiavatarbroadcastselection', action: 'browse'});
        assert.deepEqual(endpoint.select.permissions, {object: 'socialaiavatarbroadcastselection', action: 'edit'});
        const permissionEntries = fixtures.models.find(model => model.name === 'Permission').entries;
        assert.ok(permissionEntries.some(permission => permission.action_type === 'browse' && permission.object_type === 'socialaiavatarbroadcastselection'));
        assert.ok(permissionEntries.some(permission => permission.action_type === 'edit' && permission.object_type === 'socialaiavatarbroadcastselection'));

        const rolePermissions = fixtures.relations.find(relation => relation.from.model === 'Role' && relation.to.model === 'Permission').entries;
        assert.deepEqual(rolePermissions.Administrator.socialaiavatarbroadcastselection, ['browse', 'edit']);
        assert.deepEqual(rolePermissions['Admin Integration'].socialaiavatarbroadcastselection, ['browse']);
        assert.equal(rolePermissions.Editor.socialaiavatarbroadcastselection, undefined);
        assert.equal(rolePermissions.Author.socialaiavatarbroadcastselection, undefined);
        assert.equal(rolePermissions['Super Editor'].socialaiavatarbroadcastselection, undefined);
    });
});
