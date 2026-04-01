/**
 * @typedef {object} UserCommentEventData
 * @prop {string} userId
 * @prop {string} commentId
 * @prop {string} postId
 */

/**
 * Server-side event firing on page views (page, post, tags...)
 */
module.exports = class UserCommentEvent {
    /**
     * @param {UserCommentEventData} data
     * @param {Date} timestamp
     */
    constructor(data, timestamp) {
        this.data = data;
        this.timestamp = timestamp;
    }

    /**
     * @param {UserCommentEventData} data
     * @param {Date} [timestamp]
     */
    static create(data, timestamp) {
        return new UserCommentEvent(data, timestamp || new Date);
    }
};
