const assert = require('assert/strict');
const should = require('should');
const supertest = require('supertest');
const ObjectId = require('bson-objectid').default;
const configUtils = require('../../utils/configUtils');
const config = require('../../../core/shared/config');
const testUtils = require('../../utils');
const localUtils = require('./utils');

describe('Social Components Content API', function () {
    let request;

    before(async function () {
        await localUtils.startGhost();
        request = supertest.agent(config.get('url'));
        await testUtils.initFixtures('users', 'user:inactive', 'tags:extra', 'api_keys');
    });

    afterEach(async function () {
        await configUtils.restore();
    });

    const validKey = localUtils.getValidKey();

    const createComponent = async ({title, groupId = null, status = 'published'}) => {
        const ownerId = testUtils.DataGenerator.Content.users[0].id;
        const now = new Date();
        const componentId = ObjectId().toHexString();

        await testUtils.knex('social_components').insert({
            id: componentId,
            type: 'page',
            title,
            tag: null,
            excerpt: null,
            image: null,
            attributes: JSON.stringify({}),
            layout: JSON.stringify({}),
            source: JSON.stringify({lists: [], dataSources: []}),
            group_id: groupId,
            status,
            published_at: status === 'published' ? now : null,
            created_at: now,
            updated_at: now,
            created_by: ownerId,
            updated_by: ownerId
        });

        return componentId;
    };

    it('Can request social components scoped to a public group without member auth', async function () {
        const ownerId = testUtils.DataGenerator.Content.users[0].id;
        const groupId = ObjectId().toHexString();
        const now = new Date();
        let componentId;

        try {
            await testUtils.knex('social_groups').insert({
                id: groupId,
                creator_id: ownerId,
                group_name: `Public Component Group ${groupId}`,
                type: 'public',
                status: 'active',
                created_at: now,
                updated_at: now,
                created_by: ownerId,
                updated_by: ownerId
            });

            componentId = await createComponent({
                title: 'Public Group Page',
                groupId
            });

            const res = await request.get(localUtils.API.getApiQuery(`social/components/?key=${validKey}&group_id=${groupId}`))
                .set('Origin', testUtils.API.getURL())
                .expect('Content-Type', /json/)
                .expect('Cache-Control', testUtils.cacheRules.public)
                .expect(200);

            should.exist(res.body.socialcomponents);
            res.body.socialcomponents.should.have.length(1);
            res.body.socialcomponents[0].id.should.equal(componentId);
        } finally {
            if (componentId) {
                await testUtils.knex('social_components').where('id', componentId).del();
            }

            await testUtils.knex('social_groups').where('id', groupId).del();
        }
    });

    it('Can read a public-group social component without member auth', async function () {
        const ownerId = testUtils.DataGenerator.Content.users[0].id;
        const groupId = ObjectId().toHexString();
        const now = new Date();
        let componentId;

        try {
            await testUtils.knex('social_groups').insert({
                id: groupId,
                creator_id: ownerId,
                group_name: `Public Component Read Group ${groupId}`,
                type: 'public',
                status: 'active',
                created_at: now,
                updated_at: now,
                created_by: ownerId,
                updated_by: ownerId
            });

            componentId = await createComponent({
                title: 'Public Group Read Page',
                groupId
            });

            const res = await request.get(localUtils.API.getApiQuery(`social/components/${componentId}/?key=${validKey}`))
                .set('Origin', testUtils.API.getURL())
                .expect('Content-Type', /json/)
                .expect('Cache-Control', testUtils.cacheRules.public)
                .expect(200);

            should.exist(res.body.socialcomponents);
            res.body.socialcomponents.should.have.length(1);
            res.body.socialcomponents[0].id.should.equal(componentId);
        } finally {
            if (componentId) {
                await testUtils.knex('social_components').where('id', componentId).del();
            }

            await testUtils.knex('social_groups').where('id', groupId).del();
        }
    });

    it('Rejects social components scoped to a private group without member auth', async function () {
        const ownerId = testUtils.DataGenerator.Content.users[0].id;
        const groupId = ObjectId().toHexString();
        const now = new Date();

        try {
            await testUtils.knex('social_groups').insert({
                id: groupId,
                creator_id: ownerId,
                group_name: `Private Component Group ${groupId}`,
                type: 'private',
                status: 'active',
                created_at: now,
                updated_at: now,
                created_by: ownerId,
                updated_by: ownerId
            });

            await request.get(localUtils.API.getApiQuery(`social/components/?key=${validKey}&group_id=${groupId}`))
                .set('Origin', testUtils.API.getURL())
                .expect(403);
        } finally {
            await testUtils.knex('social_groups').where('id', groupId).del();
        }
    });

    it('Rejects social components scoped to a non-active public group without member auth', async function () {
        const ownerId = testUtils.DataGenerator.Content.users[0].id;
        const groupId = ObjectId().toHexString();
        const now = new Date();

        try {
            await testUtils.knex('social_groups').insert({
                id: groupId,
                creator_id: ownerId,
                group_name: `Archived Component Group ${groupId}`,
                type: 'public',
                status: 'archived',
                created_at: now,
                updated_at: now,
                created_by: ownerId,
                updated_by: ownerId
            });

            await request.get(localUtils.API.getApiQuery(`social/components/?key=${validKey}&group_id=${groupId}`))
                .set('Origin', testUtils.API.getURL())
                .expect(403);
        } finally {
            await testUtils.knex('social_groups').where('id', groupId).del();
        }
    });
});
