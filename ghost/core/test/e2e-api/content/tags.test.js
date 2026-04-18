const assert = require('assert/strict');
const should = require('should');
const supertest = require('supertest');
const _ = require('lodash');
const ObjectId = require('bson-objectid').default;
const url = require('url');
const configUtils = require('../../utils/configUtils');
const config = require('../../../core/shared/config');
const testUtils = require('../../utils');
const dbUtils = require('../../utils/db-utils');
const localUtils = require('./utils');

describe('Tags Content API', function () {
    let request;

    before(async function () {
        await localUtils.startGhost();
        request = supertest.agent(config.get('url'));
        await testUtils.initFixtures('users', 'user:inactive', 'posts', 'tags:extra', 'api_keys');
    });

    afterEach(async function () {
        await configUtils.restore();
    });

    const validKey = localUtils.getValidKey();

    it('Can request tags', async function () {
        const res = await request.get(localUtils.API.getApiQuery(`tags/?key=${validKey}`))
            .set('Origin', testUtils.API.getURL())
            .expect('Content-Type', /json/)
            .expect('Cache-Control', testUtils.cacheRules.public)
            .expect(200);

        should.not.exist(res.headers['x-cache-invalidate']);
        const jsonResponse = res.body;
        should.exist(jsonResponse.tags);
        localUtils.API.checkResponse(jsonResponse, 'tags');
        jsonResponse.tags.should.have.length(4);
        localUtils.API.checkResponse(jsonResponse.tags[0], 'tag', ['url']);
        localUtils.API.checkResponse(jsonResponse.meta.pagination, 'pagination');

        // Default order 'name asc' check
        // the ordering difference is described in https://github.com/TryGhost/Ghost/issues/6104
        // this condition should be removed once issue mentioned above ^ is resolved
        if (dbUtils.isMySQL()) {
            jsonResponse.tags[0].name.should.eql('bacon');
            jsonResponse.tags[3].name.should.eql('kitchen sink');
        } else {
            jsonResponse.tags[0].name.should.eql('Getting Started');
            jsonResponse.tags[3].name.should.eql('kitchen sink');
        }

        should.exist(res.body.tags[0].url);
        should.exist(url.parse(res.body.tags[0].url).protocol);
        should.exist(url.parse(res.body.tags[0].url).host);
    });

    it('Can request tags with limit=all', async function () {
        const res = await request.get(localUtils.API.getApiQuery(`tags/?limit=all&key=${validKey}`))
            .set('Origin', testUtils.API.getURL())
            .expect('Content-Type', /json/)
            .expect('Cache-Control', testUtils.cacheRules.public)
            .expect(200);

        should.not.exist(res.headers['x-cache-invalidate']);
        const jsonResponse = res.body;
        should.exist(jsonResponse.tags);
        localUtils.API.checkResponse(jsonResponse, 'tags');
        jsonResponse.tags.should.have.length(4);
        localUtils.API.checkResponse(jsonResponse.tags[0], 'tag', ['url']);
        localUtils.API.checkResponse(jsonResponse.meta.pagination, 'pagination');
    });

    it('Can limit tags to receive', async function () {
        const res = await request.get(localUtils.API.getApiQuery(`tags/?limit=3&key=${validKey}`))
            .set('Origin', testUtils.API.getURL())
            .expect('Content-Type', /json/)
            .expect('Cache-Control', testUtils.cacheRules.public)
            .expect(200);

        should.not.exist(res.headers['x-cache-invalidate']);
        const jsonResponse = res.body;
        should.exist(jsonResponse.tags);
        localUtils.API.checkResponse(jsonResponse, 'tags');
        jsonResponse.tags.should.have.length(3);
        localUtils.API.checkResponse(jsonResponse.tags[0], 'tag', ['url']);
        localUtils.API.checkResponse(jsonResponse.meta.pagination, 'pagination');
    });

    it('Can include post count', async function () {
        const res = await request.get(localUtils.API.getApiQuery(`tags/?key=${validKey}&include=count.posts`))
            .set('Origin', testUtils.API.getURL())
            .expect('Content-Type', /json/)
            .expect('Cache-Control', testUtils.cacheRules.public)
            .expect(200);

        const jsonResponse = res.body;

        should.exist(jsonResponse.tags);
        jsonResponse.tags.should.be.an.Array().with.lengthOf(4);

        // Each tag should have the correct count
        _.find(jsonResponse.tags, {name: 'Getting Started'}).count.posts.should.eql(7);
        _.find(jsonResponse.tags, {name: 'kitchen sink'}).count.posts.should.eql(2);
        _.find(jsonResponse.tags, {name: 'bacon'}).count.posts.should.eql(2);
        _.find(jsonResponse.tags, {name: 'chorizo'}).count.posts.should.eql(1);
    });

    it('Can include post count scoped to a public group without member auth', async function () {
        const ownerId = testUtils.DataGenerator.Content.users[0].id;
        const groupId = ObjectId().toHexString();
        const tagId = testUtils.DataGenerator.Content.tags[0].id;
        const now = new Date();
        let postId;

        try {
            const relation = await testUtils.knex('posts_tags')
                .where('tag_id', tagId)
                .first('post_id');
            postId = relation.post_id;

            await testUtils.knex('social_groups').insert({
                id: groupId,
                creator_id: ownerId,
                group_name: `Public Tag Group ${groupId}`,
                type: 'public',
                status: 'active',
                created_at: now,
                updated_at: now,
                created_by: ownerId,
                updated_by: ownerId
            });

            await testUtils.knex('posts')
                .where('id', postId)
                .update({group_id: groupId});

            const res = await request.get(localUtils.API.getApiQuery(`tags/?key=${validKey}&include=count.posts&group_id=${groupId}`))
                .set('Origin', testUtils.API.getURL())
                .expect('Content-Type', /json/)
                .expect('Cache-Control', testUtils.cacheRules.public)
                .expect(200);

            const scopedTag = _.find(res.body.tags, {id: tagId});
            should.exist(scopedTag);
            scopedTag.count.posts.should.eql(1);
        } finally {
            if (postId) {
                await testUtils.knex('posts')
                    .where('id', postId)
                    .update({group_id: null});
            }

            await testUtils.knex('social_groups')
                .where('id', groupId)
                .del();
        }
    });

    it('Rejects tags scoped to a private group without member auth', async function () {
        const ownerId = testUtils.DataGenerator.Content.users[0].id;
        const groupId = ObjectId().toHexString();
        const now = new Date();

        try {
            await testUtils.knex('social_groups').insert({
                id: groupId,
                creator_id: ownerId,
                group_name: `Private Tag Group ${groupId}`,
                type: 'private',
                status: 'active',
                created_at: now,
                updated_at: now,
                created_by: ownerId,
                updated_by: ownerId
            });

            await request.get(localUtils.API.getApiQuery(`tags/?key=${validKey}&include=count.posts&group_id=${groupId}`))
                .set('Origin', testUtils.API.getURL())
                .expect(403);
        } finally {
            await testUtils.knex('social_groups')
                .where('id', groupId)
                .del();
        }
    });

    it('Rejects tags scoped to a non-active public group without member auth', async function () {
        const ownerId = testUtils.DataGenerator.Content.users[0].id;
        const groupId = ObjectId().toHexString();
        const now = new Date();

        try {
            await testUtils.knex('social_groups').insert({
                id: groupId,
                creator_id: ownerId,
                group_name: `Archived Public Tag Group ${groupId}`,
                type: 'public',
                status: 'archived',
                created_at: now,
                updated_at: now,
                created_by: ownerId,
                updated_by: ownerId
            });

            await request.get(localUtils.API.getApiQuery(`tags/?key=${validKey}&include=count.posts&group_id=${groupId}`))
                .set('Origin', testUtils.API.getURL())
                .expect(403);
        } finally {
            await testUtils.knex('social_groups')
                .where('id', groupId)
                .del();
        }
    });

    it('Can use multiple fields and have valid url fields', async function () {
        const res = await request.get(localUtils.API.getApiQuery(`tags/?key=${validKey}&fields=url,name`))
            .set('Origin', testUtils.API.getURL())
            .expect('Content-Type', /json/)
            .expect('Cache-Control', testUtils.cacheRules.public)
            .expect(200);

        const jsonResponse = res.body;

        assert(jsonResponse.tags);

        const getTag = name => jsonResponse.tags.find(tag => tag.name === name);

        assert(getTag('Getting Started').url.endsWith('/tag/getting-started/'));
        assert(getTag('kitchen sink').url.endsWith('/tag/kitchen-sink/'));
        assert(getTag('bacon').url.endsWith('/tag/bacon/'));
        assert(getTag('chorizo').url.endsWith('/tag/chorizo/'));
    });

    it('Can use single url field and have valid url fields', async function () {
        const res = await request.get(localUtils.API.getApiQuery(`tags/?key=${validKey}&fields=url`))
            .set('Origin', testUtils.API.getURL())
            .expect('Content-Type', /json/)
            .expect('Cache-Control', testUtils.cacheRules.public)
            .expect(200);

        const jsonResponse = res.body;

        assert(jsonResponse.tags);

        const getTag = path => jsonResponse.tags.find(tag => tag.url.endsWith(path));

        assert(getTag('/tag/getting-started/'));
        assert(getTag('/tag/kitchen-sink/'));
        assert(getTag('/tag/bacon/'));
        assert(getTag('/tag/chorizo/'));
    });
});
