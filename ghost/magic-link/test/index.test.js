const assert = require('assert/strict');
const sinon = require('sinon');
const MagicLink = require('../');
const crypto = require('crypto');

const sandbox = sinon.createSandbox();
const secret = crypto.randomBytes(64);

describe('MagicLink', function () {
    it('Exports a function', function () {
        assert.equal(typeof MagicLink, 'function');
    });

    describe('#sendMagicLink', function () {
        it('Throws when passed comma separated emails', async function () {
            const options = {
                tokenProvider: new MagicLink.JWTTokenProvider(secret),
                getSigninURL: sandbox.stub().returns('FAKEURL'),
                getText: sandbox.stub().returns('SOMETEXT'),
                getHTML: sandbox.stub().returns('SOMEHTML'),
                getSubject: sandbox.stub().returns('SOMESUBJECT'),
                transporter: {
                    sendMail: sandbox.stub().resolves()
                },
                config: {
                    get: sandbox.stub().resolves()
                }
            };
            const service = new MagicLink(options);

            const args = {
                email: 'one@email.com,two@email.com',
                tokenData: {
                    id: '420'
                },
                type: 'blazeit',
                referrer: 'https://whatever.com'
            };

            let errored = false;
            try {
                await service.sendMagicLink(args);
            } catch (err) {
                errored = true;
            } finally {
                assert(errored, 'sendMagicLink should error when given comma separated emails');
            }
        });

        it('Sends an email to the user with a link generated from getSigninURL(token, type)', async function () {
            const options = {
                tokenProvider: new MagicLink.JWTTokenProvider(secret),
                getSigninURL: sandbox.stub().returns('FAKEURL'),
                getText: sandbox.stub().returns('SOMETEXT'),
                getHTML: sandbox.stub().returns('SOMEHTML'),
                getSubject: sandbox.stub().returns('SOMESUBJECT'),
                transporter: {
                    sendMail: sandbox.stub().resolves()
                },
                config: {
                    get: sandbox.stub().resolves()
                }
            };
            const service = new MagicLink(options);

            const args = {
                email: 'test@example.com',
                tokenData: {
                    id: '420'
                },
                type: 'blazeit',
                referrer: 'https://whatever.com'
            };
            const {token} = await service.sendMagicLink(args);

            assert(options.getSigninURL.calledOnce);
            assert(options.getSigninURL.firstCall.calledWithExactly(token, 'blazeit', 'https://whatever.com'));

            assert(options.getText.calledOnce);
            assert(options.getText.firstCall.calledWithExactly('FAKEURL', 'blazeit', 'test@example.com'));

            assert(options.getHTML.calledOnce);
            assert(options.getHTML.firstCall.calledWithExactly('FAKEURL', 'blazeit', 'test@example.com'));

            assert(options.getSubject.calledOnce);
            assert(options.getSubject.firstCall.calledWithExactly('blazeit'));

            assert(options.transporter.sendMail.calledOnce);
            assert.equal(options.transporter.sendMail.firstCall.args[0].to, args.email);
            assert.equal(options.transporter.sendMail.firstCall.args[0].subject, options.getSubject.firstCall.returnValue);
            assert.equal(options.transporter.sendMail.firstCall.args[0].text, options.getText.firstCall.returnValue);
            assert.equal(options.transporter.sendMail.firstCall.args[0].html, options.getHTML.firstCall.returnValue);
        });
    });

    describe('#sendMagicLink with includeOTC', function () {
        it('passes the 6-digit code to the subject, text and HTML, and returns otcRef', async function () {
            const tokenProvider = {
                createWithRef: sandbox.stub().resolves({token: 'TOKEN', ref: 'REF'}),
                deriveOTC: sandbox.stub().returns('123456'),
                create: sandbox.stub().rejects(new Error('should not be called'))
            };
            const options = {
                tokenProvider,
                getSigninURL: sandbox.stub().returns('FAKEURL'),
                getText: sandbox.stub().returns('SOMETEXT'),
                getHTML: sandbox.stub().returns('SOMEHTML'),
                getSubject: sandbox.stub().returns('SOMESUBJECT'),
                transporter: {
                    sendMail: sandbox.stub().resolves()
                }
            };
            const service = new MagicLink(options);

            const result = await service.sendMagicLink({email: 'test@example.com', tokenData: {}, type: 'signin', includeOTC: true});

            assert(tokenProvider.deriveOTC.calledOnceWithExactly('REF', 'TOKEN'));
            assert(options.getSubject.firstCall.calledWithExactly('signin', '123456'));
            assert(options.getText.firstCall.calledWithExactly('FAKEURL', 'signin', 'test@example.com', '123456'));
            assert(options.getHTML.firstCall.calledWithExactly('FAKEURL', 'signin', 'test@example.com', '123456'));
            assert.equal(result.otcRef, 'REF');
            assert.equal(result.token, 'TOKEN');
        });

        it('falls back to a plain link when the token provider cannot make a code', async function () {
            const options = {
                tokenProvider: new MagicLink.JWTTokenProvider(secret),
                getSigninURL: sandbox.stub().returns('FAKEURL'),
                getText: sandbox.stub().returns('SOMETEXT'),
                getHTML: sandbox.stub().returns('SOMEHTML'),
                getSubject: sandbox.stub().returns('SOMESUBJECT'),
                transporter: {
                    sendMail: sandbox.stub().resolves()
                }
            };
            const service = new MagicLink(options);

            const result = await service.sendMagicLink({email: 'test@example.com', tokenData: {}, type: 'signin', includeOTC: true});

            assert(options.getSubject.firstCall.calledWithExactly('signin'));
            assert.equal(result.otcRef, undefined);
        });
    });

    describe('#getDataFromToken', function () {
        it('Returns the user data which from the token that was encoded by #sendMagicLink', async function () {
            const options = {
                tokenProvider: new MagicLink.JWTTokenProvider(secret),
                getSigninURL: sandbox.stub().returns('FAKEURL'),
                getText: sandbox.stub().returns('SOMETEXT'),
                getHTML: sandbox.stub().returns('SOMEHTML'),
                transporter: {
                    sendMail: sandbox.stub().resolves()
                },
                config: {
                    get: sandbox.stub().resolves()
                }
            };
            const service = new MagicLink(options);

            const args = {
                email: 'test@example.com',
                tokenData: {
                    id: '420'
                }
            };

            const {token} = await service.sendMagicLink(args);
            const data = await service.getDataFromToken(token);

            assert.deepEqual(data.id, args.tokenData.id);
        });
    });
});
