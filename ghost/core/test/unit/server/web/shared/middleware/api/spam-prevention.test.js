const should = require('should');
const spamPrevention = require('../../../../../../../core/server/web/shared/middleware/api/spam-prevention');

describe('Spam Prevention', function () {
    it('exports a contentApiKey method', function () {
        should.equal(typeof spamPrevention.contentApiKey, 'function');
    });

    describe('contentApiKey method', function () {
        it('returns an instance of express-brute', function () {
            const ExpressBrute = require('express-brute');
            const result = spamPrevention.contentApiKey();

            should.equal(result instanceof ExpressBrute, true);
        });
    });

    describe('codeAttempts method (6-digit codes)', function () {
        it('returns one express-brute per kind', function () {
            const ExpressBrute = require('express-brute');
            const send = spamPrevention.codeAttempts('send');
            const verify = spamPrevention.codeAttempts('verify');

            should.equal(send instanceof ExpressBrute, true);
            should.equal(verify instanceof ExpressBrute, true);
            should.notEqual(send, verify);
            should.equal(spamPrevention.codeAttempts('send'), send);
        });

        it('throws for an unknown kind instead of counting it as verify', function () {
            should.throws(() => spamPrevention.codeAttempts('verfy'), /unknown kind "verfy"/);
            should.throws(() => spamPrevention.codeAttempts(), /unknown kind/);
        });
    });
});
