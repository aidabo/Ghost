const errors = require('@tryghost/errors');
const tpl = require('@tryghost/tpl');
const models = require('../../models');
const security = require('@tryghost/security');
const {joinInvitedGroup} = require('./group-invite');

const messages = {
    inviteNotFound: 'Invite not found.',
    inviteExpired: 'Invite is expired.',
    inviteEmailAlreadyExist: {
        message: 'Could not create an account, email is already in use.',
        context: 'Attempting to create an account with existing email address.',
        help: 'Use different email address to register your account.'
    }
};

async function accept(invitation) {
    const data = invitation.invitation[0];
    const inviteToken = security.url.decodeBase64(data.token);
    const options = {context: {internal: true}};

    let invite = await models.Invite.findOne({token: inviteToken, status: 'sent'}, options);

    if (!invite) {
        throw new errors.NotFoundError({message: tpl(messages.inviteNotFound)});
    }

    if (invite.get('expires') < Date.now()) {
        throw new errors.NotFoundError({message: tpl(messages.inviteExpired)});
    }

    let user = await models.User.findOne({email: data.email});
    if (user) {
        throw new errors.ValidationError({
            message: tpl(messages.inviteEmailAlreadyExist.message),
            context: tpl(messages.inviteEmailAlreadyExist.context),
            help: tpl(messages.inviteEmailAlreadyExist.help)
        });
    }

    const newUser = await models.User.add({
        email: data.email,
        name: data.name,
        password: data.password,
        roles: [invite.toJSON().role_id]
    }, options);

    // 家族・グループの招待なら、そのグループの一員にする（jibunsee-react docs/planning/invite-links.md の D4）
    await joinInvitedGroup(invite, newUser, options);

    return invite.destroy(options);
}

module.exports = accept;
