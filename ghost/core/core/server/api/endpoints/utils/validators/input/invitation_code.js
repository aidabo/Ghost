/* eslint-disable ghost/filenames/match-regex */
const validator = require('@tryghost/validator');
const debug = require('@tryghost/debug')('api:endpoints:utils:validators:input:invitation_code');
const tpl = require('@tryghost/tpl');
const errors = require('@tryghost/errors');

// 「アカウント作成」の招待の 6 桁の認証コードを確かめる口の入力（services/auth/invitation-code.js）。
// 本文は { invitation_code: [{ email, ref, code }] }。形が違うときは 400（500 にしない）
const messages = {
    invalidEmailReceived: 'The server did not receive a valid email',
    invalidCode: 'The code must be 6 digits',
    noData: 'No invitation_code data received',
    refRequired: 'The code reference (ref) from the request is required'
};

module.exports = {
    verifyInvitationCode(apiConfig, frame) {
        debug('verifyInvitationCode');
        const data = frame.data?.invitation_code?.[0];
        if (!data || typeof data !== 'object') {
            throw new errors.BadRequestError({message: tpl(messages.noData)});
        }
        if (typeof data.email !== 'string' || !validator.isEmail(data.email)) {
            throw new errors.BadRequestError({message: tpl(messages.invalidEmailReceived)});
        }
        if (typeof data.ref !== 'string' || !data.ref) {
            throw new errors.BadRequestError({message: tpl(messages.refRequired)});
        }
        if (typeof data.code !== 'string' || !/^\d{6}$/.test(data.code.trim())) {
            throw new errors.BadRequestError({message: tpl(messages.invalidCode)});
        }
    }
};
