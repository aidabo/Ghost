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
    invalidCode: 'The code must be 6 digits'
};

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
        assertEmail(frame.data.password_reset_code?.[0]?.email);
    },

    resetPasswordWithCode(apiConfig, frame) {
        debug('resetPasswordWithCode');
        const data = frame.data.password_reset_code[0];
        assertEmail(data.email);

        if (typeof data.code !== 'string' || !/^\d{6}$/.test(data.code.trim())) {
            throw new errors.BadRequestError({
                message: tpl(messages.invalidCode)
            });
        }

        if (data.newPassword !== data.ne2Password) {
            return Promise.reject(new errors.ValidationError({
                message: tpl(messages.newPasswordsDoNotMatch)
            }));
        }
    }
};
