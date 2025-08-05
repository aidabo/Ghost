// @ts-nocheck
const ghostBookshelf = require('./base');

const SocialPostCommentReport = ghostBookshelf.Model.extend({
    tableName: 'social_post_comment_reports',

    defaults: function defaults() {
        return {};
    },

    comment() {
        return this.belongsTo('SocialPostComment', 'comment_id');
    },

    user() {
        return this.belongsTo('User', 'user_id');
    },

    emitChange: function emitChange(event, options) {
        const eventToTrigger = 'social_post_comment_reports' + '.' + event;
        ghostBookshelf.Model.prototype.emitChange.bind(this)(this, eventToTrigger, options);
    },

    onCreated: function onCreated(model, options) {
        ghostBookshelf.Model.prototype.onCreated.apply(this, arguments);

        model.emitChange('added', options);
    }
}, {

});

module.exports = {
    SocialPostCommentReport: ghostBookshelf.model('SocialPostCommentReport', SocialPostCommentReport)
};
