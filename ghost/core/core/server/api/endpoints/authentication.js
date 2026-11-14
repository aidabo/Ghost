const api = require('./index');
const config = require('../../../shared/config');
const tpl = require('@tryghost/tpl');
const errors = require('@tryghost/errors');
const logging = require('@tryghost/logging');
const web = require('../../web');
const models = require('../../models');
const auth = require('../../services/auth');
const invitations = require('../../services/invitations');
const dbBackup = require('../../data/db/backup');
const apiMail = require('./index').mail;
const apiSettings = require('./index').settings;
const UsersService = require('../../services/Users');
const userService = new UsersService({dbBackup, models, auth, apiMail, apiSettings});
const {deleteAllSessions} = require('../../services/auth/session');

const messages = {
    notTheBlogOwner: 'You are not the site owner.'
};

/** @type {import('@tryghost/api-framework').Controller} */
const controller = {
    docName: 'authentication',

    setup: {
        statusCode: 201,
        permissions: false,
        headers: {
            cacheInvalidate: true
        },
        validation: {
            docName: 'setup'
        },
        query(frame) {
            return Promise.resolve()
                .then(() => {
                    return auth.setup.assertSetupCompleted(false)();
                })
                .then(() => {
                    const setupDetails = {
                        name: frame.data.setup[0].name,
                        email: frame.data.setup[0].email,
                        password: frame.data.setup[0].password,
                        blogTitle: frame.data.setup[0].blogTitle,
                        theme: frame.data.setup[0].theme,
                        accentColor: frame.data.setup[0].accentColor,
                        description: frame.data.setup[0].description,
                        status: 'active'
                    };

                    return auth.setup.setupUser(setupDetails);
                })
                .then((data) => {
                    try {
                        return auth.setup.doFixtures(data);
                    } catch (e) {
                        return data;
                    }
                })
                .then((data) => {
                    try {
                        return auth.setup.doProductAndNewsletter(data, api);
                    } catch (e) {
                        return data;
                    }
                })
                .then((data) => {
                    return auth.setup.installTheme(data, api);
                })
                .then((data) => {
                    return auth.setup.doSettings(data, api.settings);
                })
                .then((user) => {
                    auth.setup.sendWelcomeEmail(user.get('email'), api.mail)
                        .catch((err) => {
                            logging.error(err);
                        });
                    return user;
                });
        }
    },

    updateSetup: {
        headers: {
            cacheInvalidate: true
        },
        permissions: (frame) => {
            return models.User.findOne({role: 'Owner', status: 'all'})
                .then((owner) => {
                    if (owner.id !== frame.options.context.user) {
                        throw new errors.NoPermissionError({message: tpl(messages.notTheBlogOwner)});
                    }
                });
        },
        validation: {
            docName: 'setup'
        },
        query(frame) {
            return Promise.resolve()
                .then(() => {
                    return auth.setup.assertSetupCompleted(true)();
                })
                .then(() => {
                    const setupDetails = {
                        name: frame.data.setup[0].name,
                        email: frame.data.setup[0].email,
                        password: frame.data.setup[0].password,
                        blogTitle: frame.data.setup[0].blogTitle,
                        status: 'active'
                    };

                    return auth.setup.setupUser(setupDetails);
                })
                .then((data) => {
                    return auth.setup.doSettings(data, api.settings);
                });
        }
    },

    isSetup: {
        headers: {
            cacheInvalidate: false
        },
        permissions: false,
        async query() {
            const isSetup = await auth.setup.checkIsSetup();

            return {
                status: isSetup,
                title: config.title,
                name: config.user_name,
                email: config.user_email
            };
        }
    },

    generateResetToken: {
        headers: {
            cacheInvalidate: false
        },
        validation: {
            docName: 'password_reset'
        },
        permissions: true,
        options: [
            'email'
        ],
        query(frame) {
            return Promise.resolve()
                .then(() => {
                    return auth.setup.assertSetupCompleted(true)();
                })
                .then(() => {
                    return auth.passwordreset.generateToken(frame.data.password_reset[0].email, api.settings);
                })
                .then((token) => {
                    return auth.passwordreset.sendResetNotification(token, api.mail);
                });
        }
    },

    resetPassword: {
        headers: {
            cacheInvalidate: false
        },
        validation: {
            docName: 'password_reset',
            data: {
                newPassword: {required: true},
                ne2Password: {required: true}
            }
        },
        permissions: false,
        options: [
            'ip'
        ],
        query(frame) {
            return Promise.resolve()
                .then(() => {
                    return auth.setup.assertSetupCompleted(true)();
                })
                .then(() => {
                    return auth.passwordreset.extractTokenParts(frame);
                })
                .then((params) => {
                    return auth.passwordreset.protectBruteForce(params);
                })
                .then(({options, tokenParts}) => {
                    options = Object.assign(options, {context: {internal: true}});
                    return auth.passwordreset.doReset(options, tokenParts, api.settings)
                        .then((params) => {
                            web.shared.middleware.api.spamPrevention.userLogin().reset(frame.options.ip, `${tokenParts.email}login`);
                            return params;
                        });
                });
        }
    },

    // スタッフがパスワードを忘れたとき、メールの 6 桁のコードで決め直す（services/auth/password-reset-code.js）。
    // 登録の無いメールでも同じ応答（どちらも 200）。permissions は今の resetPassword と同じく false（ログイン前の口）
    generateResetCode: {
        headers: {
            cacheInvalidate: false
        },
        validation: {
            docName: 'password_reset_code'
        },
        permissions: false,
        query(frame) {
            const {email, locale} = frame.data.password_reset_code[0];
            return Promise.resolve()
                .then(() => auth.setup.assertSetupCompleted(true)())
                // 送ったときの目印（ref）を返す。登録の無いメールでも同じ形で返る
                .then(() => auth.passwordResetCode.requestCode({email, locale}, api.settings, api.mail, {context: {internal: true}}));
        }
    },

    resetPasswordWithCode: {
        headers: {
            cacheInvalidate: false
        },
        validation: {
            docName: 'password_reset_code',
            data: {
                email: {required: true},
                ref: {required: true},
                code: {required: true},
                newPassword: {required: true},
                ne2Password: {required: true}
            }
        },
        permissions: false,
        query(frame) {
            const data = frame.data.password_reset_code[0];
            return Promise.resolve()
                .then(() => auth.setup.assertSetupCompleted(true)())
                .then(() => auth.passwordResetCode.resetWithCode(data, {context: {internal: true}}));
        }
    },

    // 「アカウント作成」の招待の 6 桁の認証コード（services/auth/invitation-code.js）。
    // 合えば招待の token（メールのリンクの /signup/ の後ろと同じ値）を返す。登録は今の acceptInvitation。
    verifyInvitationCode: {
        headers: {
            cacheInvalidate: false
        },
        validation: {
            docName: 'invitation_code'
        },
        permissions: false,
        query(frame) {
            const data = frame.data.invitation_code[0];
            return Promise.resolve()
                .then(() => auth.setup.assertSetupCompleted(true)())
                .then(() => auth.invitationCode.verifyCode(data, {context: {internal: true}}));
        }
    },

    acceptInvitation: {
        headers: {
            cacheInvalidate: false
        },
        validation: {
            docName: 'invitations'
        },
        permissions: false,
        query(frame) {
            return Promise.resolve()
                .then(() => {
                    return auth.setup.assertSetupCompleted(true)();
                })
                .then(() => {
                    return invitations.accept(frame.data);
                });
        }
    },

    isInvitation: {
        headers: {
            cacheInvalidate: false
        },
        data: [
            'email'
        ],
        validation: {
            docName: 'invitations'
        },
        permissions: false,
        query(frame) {
            return Promise.resolve()
                .then(() => {
                    return auth.setup.assertSetupCompleted(true)();
                })
                .then(() => {
                    const email = frame.data.email;

                    return models.Invite.findOne({email: email, status: 'sent'}, frame.options);
                });
        }
    },

    resetAllPasswords: {
        statusCode: 204,
        headers: {
            cacheInvalidate: false
        },
        permissions: true,
        async query(frame) {
            await userService.resetAllPasswords(frame.options);
            await deleteAllSessions();
        }
    }
};

module.exports = controller;
