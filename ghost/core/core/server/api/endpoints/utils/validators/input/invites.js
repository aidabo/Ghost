const tpl = require('@tryghost/tpl');
const errors = require('@tryghost/errors');
const models = require('../../../../../models');
const {assertCanInviteToGroup, inviterOf} = require('../../../../../services/invitations/group-invite');

const messages = {
    userAlreadyRegistered: 'User is already registered.'
};

module.exports = {
    add(apiConfig, frame) {
        const invite = frame.data.invites[0];
        return models.User.findOne({email: invite.email}, frame.options)
            .then((user) => {
                if (user) {
                    return Promise.reject(new errors.ValidationError({
                        message: tpl(messages.userAlreadyRegistered)
                    }));
                }
                // 家族・グループの招待: 招く人がそのグループの持ち主・管理者であること（D3）
                if (invite.group_id) {
                    return assertCanInviteToGroup(invite.group_id, inviterOf(frame, invite));
                }
            });
    }
};
