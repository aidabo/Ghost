/* eslint-disable ghost/filenames/match-regex */
const validator = require('@tryghost/validator');
const debug = require('@tryghost/debug')('api:endpoints:utils:validators:input:password_reset_code');
const tpl = require('@tryghost/tpl');
const errors = require('@tryghost/errors');

// 6 桁のコードでパスワードを決め直す口の入力（services/auth/password-reset-code.js）。
// 本文は今の password_reset と同じく、口の名前で包んだ配列（{ password_reset_code: [{ ... }] }）。
const messages = {
    newPasswordsDoNotMatch: 'Your new passwords do not match',
    invalidEmailReceived: 'The server did not receive a valid email',
    invalidCode: 'The code must be 6 digits',
    noData: 'No password_reset_code data received',
    newPasswordRequired: 'A new password is required'
};

/** 本文の password_reset_code[0]。無い・形が違うときは 400（500 にしない） */
function firstItem(frame) {
    const item = frame.data?.password_reset_code?.[0];
    if (!item || typeof item !== 'object') {
        throw new errors.BadRequestError({
            message: tpl(messages.noData)
        });
    }
    return item;
}

function assertEmail(email) {
    if (typeof email !== 'string' || !validator.isEmail(email)) {
        throw new errors.BadRequestError({
            message: tpl(messages.invalidEmailReceived)
        });
    }
}

module.exports = {
    generateResetCode(apiConfig, frame) {
        debug('generateResetCode');
        assertEmail(firstItem(frame).email);
    },

    resetPasswordWithCode(apiConfig, frame) {
        debug('resetPasswordWithCode');
        const data = firstItem(frame);
        assertEmail(data.email);

        if (typeof data.code !== 'string' || !/^\d{6}$/.test(data.code.trim())) {
            throw new errors.BadRequestError({
                message: tpl(messages.invalidCode)
            });
        }

        // validation.data の required はこのメソッド名では効かないので、ここで確かめる
        if (typeof data.newPassword !== 'string' || !data.newPassword || typeof data.ne2Password !== 'string') {
            throw new errors.BadRequestError({
                message: tpl(messages.newPasswordRequired)
            });
        }

        if (data.newPassword !== data.ne2Password) {
            return Promise.reject(new errors.ValidationError({
                message: tpl(messages.newPasswordsDoNotMatch)
            }));
        }
    }
};
