const should = require('should');
const sinon = require('sinon');
const models = require('../../../../core/server/models');
const ghostBookshelf = require('../../../../core/server/models/base');

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
});
