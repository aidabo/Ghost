const tpl = require('@tryghost/tpl');
const errors = require('@tryghost/errors');
const {UserCommentEvent} = require('@tryghost/user-events');
const DomainEvents = require('@tryghost/domain-events');

const messages = {
    commentNotFound: 'Comment could not be found',
    userNotFound: 'Unable to find user',
    likeNotFound: 'Unable to find like',
    alreadyLiked: 'This comment was liked already',
    replyToReply: 'Can not reply to a reply',
    commentsNotEnabled: 'Comments are not enabled for this site.',
    cannotCommentOnPost: 'You do not have permission to comment on this post.',
    cannotEditComment: 'You do not have permission to edit comments'
};

class CommentsService {
    constructor({config, logging, models, mailer, settingsCache, settingsHelpers, urlService, urlUtils, contentGating}) {
        /** @private */
        this.models = models;

        /** @private */
        this.settingsCache = settingsCache;

        /** @private */
        this.contentGating = contentGating;

        const Emails = require('./CommentsServiceEmails');
        /** @private */
        this.emails = new Emails({
            config,
            logging,
            models,
            mailer,
            settingsCache,
            settingsHelpers,
            urlService,
            urlUtils
        });
    }

    /**
     * @returns {'off'|'all'|'paid'}
     */
    get enabled() {
        const setting = this.settingsCache.get('comments_enabled');
        if (setting === 'off' || setting === 'all' || setting === 'paid') {
            return setting;
        }
        return 'off';
    }

    /** @private */
    checkEnabled() {
        if (this.enabled === 'off') {
            throw new errors.MethodNotAllowedError({
                message: tpl(messages.commentsNotEnabled)
            });
        }
    }

    /** @private */
    checkCommentAccess(userModel) {
        if (this.enabled === 'paid' && userModel.get('status') === 'free') {
            throw new errors.NoPermissionError({
                message: tpl(messages.cannotCommentOnPost)
            });
        }
    }

    /** @private */
    checkPostAccess(postModel, userModel) {
        const access = this.contentGating.checkPostAccess(postModel.toJSON(), userModel.toJSON());
        if (access === this.contentGating.BLOCK_ACCESS) {
            throw new errors.NoPermissionError({
                message: tpl(messages.cannotCommentOnPost)
            });
        }
    }

    /** @private */
    async sendNewCommentNotifications(comment) {
        await this.emails.notifyPostAuthors(comment);

        if (comment.get('parent_id')) {
            await this.emails.notifyParentCommentAuthor(comment, {type: 'parent'});
        }
        if (comment.get('in_reply_to_id')) {
            await this.emails.notifyParentCommentAuthor(comment, {type: 'in_reply_to'});
        }
    }

    async likeComment(commentId, user, options = {}) {
        this.checkEnabled();

        const userModel = await this.models.User.findOne({
            id: user
        }, {
            require: true,
            ...options//,
            //withRelated: ['products']
        });

        this.checkCommentAccess(userModel);

        const data = {
            user_id: userModel.get('id'),
            comment_id: commentId
        };

        const existing = await this.models.SocialPostCommentLike.findOne(data, options);

        if (existing) {
            throw new errors.BadRequestError({
                message: tpl(messages.alreadyLiked)
            });
        }

        return await this.models.SocialPostCommentLike.add(data, options);
    }

    async unlikeComment(commentId, user, options = {}) {
        this.checkEnabled();

        try {
            await this.models.SocialPostCommentLike.destroy({
                ...options,
                destroyBy: {
                    user_id: user,
                    comment_id: commentId
                },
                require: true
            });
        } catch (err) {
            if (err instanceof this.models.SocialPostCommentLike.NotFoundError) {
                return Promise.reject(new errors.NotFoundError({
                    message: tpl(messages.likeNotFound)
                }));
            }

            throw err;
        }
    }

    async reportComment(commentId, reporter) {
        this.checkEnabled();
        const comment = await this.models.SocialPostComment.findOne({id: commentId}, {require: true});

        // Check if this reporter already reported this comment (then don't send an email)?
        const existing = await this.models.SocialPostCommentReport.findOne({
            comment_id: commentId,
            user_id: reporter
        });

        if (existing) {
            // Ignore silently for now
            return;
        }

        // Save report model
        await this.models.SocialPostCommentReport.add({
            comment_id: commentId,
            user_id: reporter
        });

        await this.emails.notifiyReport(comment, reporter);
    }

    /**
     * @param {any} options
     */
    async getComments(options) {
        this.checkEnabled();
        const page = await this.models.SocialPostComment.findPage({...options, parentId: null});

        return page;
    }

    async getAdminComments(options) {
        this.checkEnabled();
        const page = await this.models.SocialPostComment.findPage({...options, parentId: null});

        return page;
    }

    /**
     * @param {string} id - The ID of the Comment to get replies from
     * @param {any} options
     */
    async getReplies(id, options) {
        this.checkEnabled();
        const page = await this.models.SocialPostComment.findPage({...options, parentId: id});

        return page;
    }

    /**
     * @param {string} id - The ID of the Comment to get
     * @param {any} options
     */
    async getCommentByID(id, options) {
        this.checkEnabled();
        const model = await this.models.SocialPostComment.findOne({id}, options);

        if (!model) {
            throw new errors.NotFoundError({
                message: tpl(messages.userNotFound)
            });
        }

        return model;
    }

    /**
     * @param {string} post - The ID of the Post to comment on
     * @param {string} user - The ID of the User to comment as
     * @param {string} comment - The HTML content of the Comment
     * @param {any} options
     */
    async commentOnPost(post, user, comment, options) {
        this.checkEnabled();
        const userModel = await this.models.User.findOne({
            id: user
        }, {
            require: true,
            ...options//,
            //withRelated: ['products']
        });

        this.checkCommentAccess(userModel);

        const postModel = await this.models.Post.findOne({
            id: post
        }, {
            require: true,
            ...options//,
            //withRelated: ['tiers']
        });

        this.checkPostAccess(postModel, userModel);

        const model = await this.models.SocialPostComment.add({
            post_id: post,
            user_id: user,
            parent_id: null,
            html: comment,
            status: 'published'
        }, options);

        if (!options.context.internal) {
            await this.sendNewCommentNotifications(model);
        }

        DomainEvents.dispatch(UserCommentEvent.create({
            userId: user,
            postId: post,
            commentId: model.id
        }));

        // Instead of returning the model, fetch it again, so we have all the relations properly fetched
        return await this.models.SocialPostComment.findOne({id: model.id}, {...options, require: true});
    }

    /**
     * @param {string} parent - The ID of the Comment to reply to
     * @param {string} inReplyTo - The ID of the Reply to reply to
     * @param {string} user - The ID of the User to comment as
     * @param {string} comment - The HTML content of the Comment
     * @param {any} options
     */
    async replyToComment(parent, inReplyTo, user, comment, options) {
        this.checkEnabled();
        const userModel = await this.models.User.findOne({
            id: user
        }, {
            require: true,
            ...options//,
            //withRelated: ['products']
        });

        this.checkCommentAccess(userModel);

        const parentComment = await this.getCommentByID(parent, options);
        if (!parentComment) {
            throw new errors.BadRequestError({
                message: tpl(messages.commentNotFound)
            });
        }

        if (parentComment.get('parent_id') !== null) {
            throw new errors.BadRequestError({
                message: tpl(messages.replyToReply)
            });
        }

        const postModel = await this.models.Post.findOne({
            id: parentComment.get('post_id')
        }, {
            require: true,
            ...options,
            withRelated: ['tiers']
        });

        this.checkPostAccess(postModel, userModel);

        let inReplyToComment;
        if (parent && inReplyTo) {
            inReplyToComment = await this.getCommentByID(inReplyTo, options);

            // we only allow references to published comments to avoid leaking
            // hidden data via the snippet included in API responses
            if (inReplyToComment && inReplyToComment.get('status') !== 'published') {
                inReplyToComment = null;
            }

            // we don't allow in_reply_to references across different parents
            if (inReplyToComment && inReplyToComment.get('parent_id') !== parent) {
                inReplyToComment = null;
            }
        }

        const model = await this.models.SocialPostComment.add({
            post_id: parentComment.get('post_id'),
            user_id: user,
            parent_id: parentComment.id,
            in_reply_to_id: inReplyToComment && inReplyToComment.get('id'),
            html: comment,
            status: 'published'
        }, options);

        if (!options.context.internal) {
            await this.sendNewCommentNotifications(model);
        }

        DomainEvents.dispatch(UserCommentEvent.create({
            userId: user,
            postId: parentComment.get('post_id'),
            commentId: model.id
        }));

        // Instead of returning the model, fetch it again, so we have all the relations properly fetched
        return await this.models.SocialPostComment.findOne({id: model.id}, {...options, require: true});
    }

    /**
     * @param {string} id - The ID of the Comment to delete
     * @param {string} user - The ID of the User to delete as
     * @param {any} options
     */
    async deleteComment(id, user, options) {
        this.checkEnabled();
        const existingComment = await this.getCommentByID(id, options);

        if (existingComment.get('user_id') !== user) {
            throw new errors.NoPermissionError({
                // todo fix message
                message: tpl(messages.userNotFound)
            });
        }

        const model = await this.models.SocialPostComment.edit({
            status: 'deleted'
        }, {
            id,
            require: true,
            ...options
        });

        return model;
    }

    /**
     * @param {string} id - The ID of the Comment to edit
     * @param {string} user - The ID of the User to edit as
     * @param {string} comment - The new HTML content of the Comment
     * @param {any} options
     */
    async editCommentContent(id, user, comment, options) {
        this.checkEnabled();
        const existingComment = await this.getCommentByID(id, options);

        if (!comment) {
            return existingComment;
        }

        if (existingComment.get('created_by') !== user) {
            throw new errors.NoPermissionError({
                message: tpl(messages.cannotEditComment)
            });
        }

        const model = await this.models.SocialPostComment.edit({
            html: comment,
            edited_at: new Date()
        }, {
            id,
            require: true,
            ...options
        });

        return model;
    }

    async getMemberIdByUUID(uuid, options) {
        const user = await this.models.User.findOne({uuid}, options);

        if (!user) {
            throw new errors.NotFoundError({
                message: tpl(messages.userNotFound)
            });
        }

        return user.id;
    }
}

module.exports = CommentsService;
