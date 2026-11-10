const should = require('should');
const sinon = require('sinon');
const models = require('../../../../core/server/models');
const ghostBookshelf = require('../../../../core/server/models/base');
const knex = require('../../../../core/server/data/db').knex;

// Post.edit reads the row again after saving, with the request's filter. When the save moved the post to
// another group (group → public, public → a private group), that filter no longer matches and edit used to
// return undefined after the save was committed — the API then answered 500 for a change that was saved.
describe('Unit: models/post edit after a group change', function () {
    before(function () {
        models.init();
    });

    afterEach(function () {
        sinon.restore();
    });

    const saved = attrs => ({
        get: key => attrs[key],
        _previousAttributes: {},
        _changed: {},
        relations: {}
    });

    it('reads the saved row again with its new group when the request filter misses (group → public)', async function () {
        sinon.stub(ghostBookshelf.Model, 'edit').resolves(saved({type: 'post', status: 'published', group_id: null}));
        const found = {_previousAttributes: {}, _changed: {}, relations: {}};
        const findOne = sinon.stub(models.Post, 'findOne');
        findOne.onFirstCall().resolves(null);
        findOne.onSecondCall().resolves(found);

        const result = await models.Post.edit({status: 'published', group_id: null}, {
            id: 'p1',
            transacting: {},
            filter: '(group_id:\'g-old\')+type:post+status:[draft,published,scheduled,sent]',
            context: {user: 'u1'}
        });

        should(result).equal(found);
        findOne.callCount.should.equal(2);
        findOne.firstCall.args[1].filter.should.match(/g-old/);
        findOne.secondCall.args[0].should.eql({status: 'all', id: 'p1'});
        findOne.secondCall.args[1].filter.should.equal('type:post+status:published+group_id:null');
        findOne.secondCall.args[1].context.should.eql({user: 'u1'});
        // the second read stays in the same transaction (the saved row is read before the commit)
        findOne.secondCall.args[1].transacting.should.equal(findOne.firstCall.args[1].transacting);
    });

    it('public → a private group: finds it with the new group (the default public_post filter would miss it)', async function () {
        sinon.stub(ghostBookshelf.Model, 'edit').resolves(saved({type: 'post', status: 'draft', group_id: 'abc123'}));
        const findOne = sinon.stub(models.Post, 'findOne');
        findOne.onFirstCall().resolves(null);
        findOne.onSecondCall().resolves({_previousAttributes: {}, _changed: {}, relations: {}});

        await models.Post.edit({group_id: 'abc123'}, {id: 'p1', transacting: {}, filter: 'type:post+status:[draft,published,scheduled,sent]'});

        findOne.secondCall.args[1].filter.should.equal('type:post+status:draft+group_id:\'abc123\'');
    });

    it('when the request filter still finds the row, it is read only once (nothing changes)', async function () {
        sinon.stub(ghostBookshelf.Model, 'edit').resolves(saved({type: 'post', status: 'draft', group_id: null}));
        const found = {_previousAttributes: {}, _changed: {}, relations: {}};
        const findOne = sinon.stub(models.Post, 'findOne').resolves(found);

        const result = await models.Post.edit({title: 'x'}, {id: 'p1', transacting: {}, filter: 'type:post'});

        should(result).equal(found);
        findOne.callCount.should.equal(1);
    });

    describe('the saved-row filter as SQL', function () {
        const mockDb = require('mock-knex');
        let tracker;

        before(function () {
            mockDb.mock(knex);
            tracker = mockDb.getTracker();
        });

        after(function () {
            mockDb.unmock(knex);
        });

        const sqlOf = async (filter) => {
            const queries = [];
            tracker.install();
            tracker.on('query', (query) => {
                queries.push(query);
                query.response([]);
            });
            await models.Post.findOne({status: 'all', id: 'p1'}, {filter, context: {user: 'u1'}});
            tracker.uninstall();
            return queries[0];
        };

        it('no group: finds a public draft (type/status replace the defaults; public_post is not added)', async function () {
            const query = await sqlOf('type:post+status:draft+group_id:null');
            // (the first binding is the comment count's status in the select list)
            query.sql.should.match(/where \(`posts`.`type` = \? and `posts`.`status` = \? and `posts`.`group_id` is null\) and `posts`.`id` = \?/);
            query.sql.should.not.match(/public_post/);
            query.bindings.slice(-4).should.eql(['post', 'draft', 'p1', 1]);
        });

        it('a private group: matches that group, and public_post is not added', async function () {
            const query = await sqlOf('type:page+status:published+group_id:\'abc123\'');
            query.sql.should.match(/where \(`posts`.`type` = \? and `posts`.`status` = \? and `posts`.`group_id` = \?\) and `posts`.`id` = \?/);
            query.sql.should.not.match(/public_post/);
            query.bindings.slice(-5).should.eql(['page', 'published', 'abc123', 'p1', 1]);
        });
    });
});

