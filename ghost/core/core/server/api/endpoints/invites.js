const tpl = require('@tryghost/tpl');
const errors = require('@tryghost/errors');
const invites = require('../../services/invites');
const models = require('../../models');
const api = require('./index');
const ALLOWED_INCLUDES = [];
const UNSAFE_ATTRS = ['role_id'];

const messages = {
    inviteNotFound: 'Invite not found.'
};

/** @type {import('@tryghost/api-framework').Controller} */
const controller = {
    docName: 'invites',

    browse: {
        headers: {
            cacheInvalidate: false
        },
        options: [
            'include',
            'page',
            'limit',
            'fields',
            'filter',
            'order',
            'debug'
        ],
        validation: {
            options: {
                include: ALLOWED_INCLUDES
            }
        },
        permissions: true,
        query(frame) {
            return models.Invite.findPage(frame.options);
        }
    },

    read: {
        headers: {
            cacheInvalidate: false
        },
        options: [
            'include'
        ],
        data: [
            'id',
            'email'
        ],
        validation: {
            options: {
                include: ALLOWED_INCLUDES
            }
        },
        permissions: true,
        query(frame) {
            return models.Invite.findOne(frame.data, frame.options)
                .then((model) => {
                    if (!model) {
                        return Promise.reject(new errors.NotFoundError({
                            message: tpl(messages.inviteNotFound)
                        }));
                    }

                    return model;
                });
        }
    },

    destroy: {
        headers: {
            cacheInvalidate: false
        },
        statusCode: 204,
        options: [
            'include',
            'id'
        ],
        validation: {
            options: {
                include: ALLOWED_INCLUDES
            }
        },
        permissions: true,
        query(frame) {
            return models.Invite.destroy({...frame.options, require: true});
        }
    },

    add: {
        statusCode: 201,
        headers: {
            cacheInvalidate: false
        },
        options: [
            'include',
            'email',
            // 自分で登録する「アカウント作成」だけが付ける: 6 桁の認証コードもメールに入れ、応答に code_ref を返す
            // （services/auth/invitation-code.js、jibunsee-react docs/planning/staff-signup-code.md）
            'include_code',
            'locale'
        ],
        validation: {
            options: {
                include: ALLOWED_INCLUDES,
                include_code: {
                    values: ['true', 'false']
                },
                locale: {
                    values: ['ja', 'en', 'zh']
                }
            },
            data: {
                role_id: {
                    required: true
                },
                email: {
                    required: true
                }
            }
        },
        permissions: {
            unsafeAttrs: UNSAFE_ATTRS
        },
        query(frame) {
            const {include_code: includeCode, locale, ...options} = frame.options;
            return invites.add({
                api,
                InviteModel: models.Invite,
                invites: frame.data.invites,
                options,
                user: {
                    name: frame.user?.get('name'),
                    email: frame.user?.get('email')
                },
                code: {
                    include: includeCode === true || includeCode === 'true',
                    locale
                }
            }).then((invite) => {
                if (!invite.codeRef) {
                    return invite;
                }
                // 6 桁と組で送り返す目印（6 桁そのものでも、招待の token でもない）
                return Object.assign(invite.toJSON(options), {code_ref: invite.codeRef});
            });
        }
    }
};

module.exports = controller;
