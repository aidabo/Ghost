const security = require('@tryghost/security');
const tpl = require('@tryghost/tpl');
const logging = require('@tryghost/logging');

const messages = {
    invitedByName: '{invitedByName} has invited you to join {blogName}',
    invitedByNoName: 'You have been invited to join {blogName}',
    errorSendingEmail: {
        error: 'Error sending email: {message}',
        help: 'Please check your email settings and resend the invitation.'
    }
};

class Invites {
    constructor({settingsCache, settingsHelpers, mailService, urlUtils, invitationCode}) {
        this.settingsCache = settingsCache;
        this.settingsHelpers = settingsHelpers;
        this.mailService = mailService;
        this.urlUtils = urlUtils;
        // 6 桁の認証コード（services/auth/invitation-code.js）。無ければ code を頼まれても付けない
        this.invitationCode = invitationCode;
    }

    /**
     * @param {object} params
     * @param {{include?: boolean, locale?: string}} [params.code] - 自分で登録する「アカウント作成」のときだけ include
     *   （jibunsee-react docs/planning/staff-signup-code.md）。招待を作った後・メールを送る前に 6 桁を作り、件名の頭と本文に入れる。
     *   戻りの招待に codeRef を付ける（6 桁と組で送り返す目印。招待の token とは別の値）
     */
    add({api, InviteModel, invites, options, user, code = {}}) {
        let invite;
        let emailData;
        // 6 桁を付けるとき: { ref, code }
        let inviteCode = null;
        const withCode = Boolean(code.include && this.invitationCode);

        return InviteModel.findOne({email: invites[0].email}, options)
            .then((existingInvite) => {
                if (!existingInvite) {
                    return;
                }

                return existingInvite.destroy(options);
            })
            .then(() => {
                return InviteModel.add(invites[0], options);
            })
            .then((createdInvite) => {
                invite = createdInvite;
                if (!withCode) {
                    return;
                }
                return this.invitationCode.createCode(invite, options).then((created) => {
                    inviteCode = created;
                });
            })
            .then(() => {
                const adminUrl = this.urlUtils.urlFor('admin', true);

                if (user.name || user.email) {
                    emailData = {
                        blogName: this.settingsCache.get('title'),
                        invitedByName: user.name,
                        invitedByEmail: user.email,
                        resetLink: this.urlUtils.urlJoin(adminUrl, 'signup', security.url.encodeBase64(invite.get('token')), '/'),
                        recipientEmail: invite.get('email')
                    };

                    return this.mailService.utils.generateContent({data: emailData, template: 'invite-user'});
                } else {
                    emailData = {
                        blogName: this.settingsCache.get('title'),
                        invitedByEmail: this.settingsHelpers.getDefaultEmail() || `ghost@${this.settingsHelpers.getDefaultEmailDomain()}`,
                        resetLink: this.urlUtils.urlJoin(adminUrl, 'signup', security.url.encodeBase64(invite.get('token')), '/'),
                        recipientEmail: invite.get('email')
                    };

                    return this.mailService.utils.generateContent({data: emailData, template: 'invite-user-by-api-key'});
                }
            })
            .then((emailContent) => {
                let mail = {
                    subject: emailData.invitedByName ? tpl(messages.invitedByName, {
                        invitedByName: emailData.invitedByName,
                        blogName: emailData.blogName
                    }) : tpl(messages.invitedByNoName, {
                        blogName: emailData.blogName
                    }),
                    html: emailContent.html,
                    text: emailContent.text
                };
                if (inviteCode) {
                    mail = this.invitationCode.addCodeToMail(mail, {
                        code: inviteCode.code,
                        locale: code.locale,
                        siteTitle: emailData.blogName
                    });
                }
                const payload = {
                    mail: [{
                        message: {
                            to: invite.get('email'),
                            replyTo: emailData.invitedByEmail,
                            subject: mail.subject,
                            html: mail.html,
                            text: mail.text
                        },
                        options: {}
                    }]
                };

                return api.mail.send(payload, {context: {internal: true}});
            })
            .then(() => {
                return InviteModel.edit({
                    status: 'sent'
                }, Object.assign({id: invite.id}, options));
            })
            .then((editedInvite) => {
                if (inviteCode) {
                    editedInvite.codeRef = inviteCode.ref;
                }
                return editedInvite;
            })
            .catch(async (err) => {
                // 6 桁の行だけが残らないように（メールを送れなかったなど）。招待そのものの扱いは今までどおり
                if (inviteCode) {
                    await this.invitationCode.removeCode(inviteCode.ref).catch((removeErr) => {
                        logging.error(removeErr);
                    });
                }
                if (err && err.errorType === 'EmailError') {
                    const errorMessage = tpl(messages.errorSendingEmail.error, {
                        message: err.message
                    });
                    const helpText = tpl(messages.errorSendingEmail.help);
                    err.message = `${errorMessage} ${helpText}`;
                    logging.warn(err.message);
                }

                return Promise.reject(err);
            });
    }
}

module.exports = Invites;
