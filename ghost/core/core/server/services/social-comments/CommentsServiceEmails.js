const {promises: fs} = require('fs');
const path = require('path');
const moment = require('moment');
const htmlToPlaintext = require('@tryghost/html-to-plaintext');
const emailService = require('../email-service');

class CommentsServiceEmails {
    constructor({config, logging, models, mailer, settingsCache, settingsHelpers, urlService, urlUtils}) {
        this.config = config;
        this.logging = logging;
        this.models = models;
        this.mailer = mailer;
        this.settingsCache = settingsCache;
        this.settingsHelpers = settingsHelpers;
        this.urlService = urlService;
        this.urlUtils = urlUtils;

        this.Handlebars = require('handlebars').create();
    }

    async notifyPostAuthors(comment) {
        const post = await this.models.Post.findOne({id: comment.get('post_id')}, {withRelated: ['authors']});
        const user = await this.models.User.findOne({id: comment.get('user_id')});

        for (const author of post.related('authors')) {
            if (!author.get('comment_notifications')) {
                continue;
            }

            const to = author.get('email');
            const subject = '💬 New comment on your post: ' + post.get('title');

            const userName = user.get('name') || 'Anonymous';

            const templateData = {
                siteTitle: this.settingsCache.get('title'),
                siteUrl: this.urlUtils.getSiteUrl(),
                siteDomain: this.siteDomain,
                postTitle: post.get('title'),
                postUrl: this.urlService.getUrlByResourceId(post.get('id'), {absolute: true}),
                commentHtml: comment.get('html'),
                commentDate: moment(comment.get('created_at')).tz(this.settingsCache.get('timezone')).format('D MMM YYYY'),
                memberName: userName,
                memberExpertise: user.get('expertise'),
                memberInitials: this.extractInitials(userName),
                accentColor: this.settingsCache.get('accent_color'),
                fromEmail: this.notificationFromAddress,
                toEmail: to,
                staffUrl: this.urlUtils.urlJoin(this.urlUtils.urlFor('admin', true), '#', `/settings/staff/${author.get('slug')}`)
            };

            const {html, text} = await this.renderEmailTemplate('new-comment', templateData);

            await this.sendMail({
                to,
                subject,
                html,
                text
            });
        }
    }

    async notifyParentCommentAuthor(reply, {type = 'parent'} = {}) {
        let parent;
        if (type === 'in_reply_to') {
            parent = await this.models.SocialPostComment.findOne({id: reply.get('in_reply_to_id')});
        } else {
            parent = await this.models.SocialPostComment.findOne({id: reply.get('parent_id')});
        }
        const parentUser = parent.related('user');

        if (parent?.get('status') !== 'published' || !parentUser.get('enable_comment_notifications')) {
            return;
        }

        // Don't send a notification if you reply to your own comment
        if (parentUser.id === reply.get('user_id')) {
            return;
        }

        const to = parentUser.get('email');
        const subject = '↪️ New reply to your comment on ' + this.settingsCache.get('title');

        const post = await this.models.Post.findOne({id: reply.get('post_id')});
        const user = await this.models.User.findOne({id: reply.get('user_id')});

        const userName = user.get('name') || 'Anonymous';

        const templateData = {
            siteTitle: this.settingsCache.get('title'),
            siteUrl: this.urlUtils.getSiteUrl(),
            siteDomain: this.siteDomain,
            postTitle: post.get('title'),
            postUrl: this.urlService.getUrlByResourceId(post.get('id'), {absolute: true}),
            replyHtml: reply.get('html'),
            replyDate: moment(reply.get('created_at')).tz(this.settingsCache.get('timezone')).format('D MMM YYYY'),
            memberName: userName,
            memberExpertise: user.get('expertise'),
            memberInitials: this.extractInitials(userName),
            accentColor: this.settingsCache.get('accent_color'),
            fromEmail: this.notificationFromAddress,
            toEmail: to,
            //TODO:
            profileUrl: emailService.renderer.createUnsubscribeUrl(user.get('uuid'), {comments: true})
        };

        const {html, text} = await this.renderEmailTemplate('new-comment-reply', templateData);

        return this.sendMail({
            to,
            subject,
            html,
            text
        });
    }

    /**
     * Send an email to notify the owner of the site that a comment has been reported by a member
     * @param {*} comment The comment model that has been reported
     * @param {*} reporter The member object who reported this comment
     */
    async notifiyReport(comment, reporter) {
        const post = await this.models.Post.findOne({id: comment.get('post_id')}, {withRelated: ['authors']});
        const user = await this.models.User.findOne({id: comment.get('user_id')});
        const owner = await this.models.User.getOwnerUser();

        // For now we only send the report to the owner
        const to = owner.get('email');
        const subject = '🚩 A comment has been reported on your post';

        const userName = user.get('name') || 'Anonymous';

        const templateData = {
            siteTitle: this.settingsCache.get('title'),
            siteUrl: this.urlUtils.getSiteUrl(),
            siteDomain: this.siteDomain,
            postTitle: post.get('title'),
            postUrl: this.urlService.getUrlByResourceId(post.get('id'), {absolute: true}),
            commentHtml: comment.get('html'),
            commentText: htmlToPlaintext.comment(comment.get('html')),
            commentDate: moment(comment.get('created_at')).tz(this.settingsCache.get('timezone')).format('D MMM YYYY'),

            reporterName: reporter.name,
            reporterEmail: reporter.email,
            reporter: reporter.name ? `${reporter.name} (${reporter.email})` : reporter.email,

            membereName: userName,
            memberEmail: user.get('email'),
            memberExpertise: user.get('expertise'),
            memberInitials: this.extractInitials(userName),
            accentColor: this.settingsCache.get('accent_color'),
            fromEmail: this.notificationFromAddress,
            toEmail: to,
            staffUrl: this.urlUtils.urlJoin(this.urlUtils.urlFor('admin', true), '#', `/settings/staff/${owner.get('slug')}`)
        };

        const {html, text} = await this.renderEmailTemplate('report', templateData);

        await this.sendMail({
            to,
            subject,
            html,
            text
        });
    }

    // Utils

    get siteDomain() {
        const [, siteDomain] = this.urlUtils.getSiteUrl()
            .match(new RegExp('^https?://([^/:?#]+)(?:[/:?#]|$)', 'i'));

        return siteDomain;
    }

    get notificationFromAddress() {
        return this.settingsHelpers.getMembersSupportAddress();
    }

    extractInitials(name = '') {
        const names = name.split(' ');
        const initials = names.length > 1 ? [names[0][0], names[names.length - 1][0]] : [names[0][0]];
        return initials.join('').toUpperCase();
    }

    async sendMail(message) {
        if (process.env.NODE_ENV !== 'production') {
            this.logging.warn(message.text);
        }

        let msg = Object.assign({
            from: this.notificationFromAddress,
            forceTextContent: true
        }, message);

        return this.mailer.send(msg);
    }

    async renderEmailTemplate(templateName, data) {
        const htmlTemplateSource = await fs.readFile(path.join(__dirname, './email-templates/', `${templateName}.hbs`), 'utf8');
        const htmlTemplate = this.Handlebars.compile(Buffer.from(htmlTemplateSource).toString());
        const textTemplate = require(`./email-templates/${templateName}.txt.js`);

        const html = htmlTemplate(data);
        const text = textTemplate(data);

        return {html, text};
    }
}

module.exports = CommentsServiceEmails;
