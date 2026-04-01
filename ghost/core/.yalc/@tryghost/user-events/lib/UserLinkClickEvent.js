/**
 * @typedef {object} UserLinkClickEventData
 * @prop {string} userId
 * @prop {string} userLastSeenAt
 * @prop {string} linkId
 */

/**
 * Server-side event firing on page views (page, post, tags...)
 */
module.exports = class UserLinkClickEvent {
    /**
     * @param {UserLinkClickEventData} data
     * @param {Date} timestamp
     */
    constructor(data, timestamp) {
        this.data = data;
        this.timestamp = timestamp;
    }

    /**
     * @param {UserLinkClickEventData} data
     * @param {Date} [timestamp]
     */
    static create(data, timestamp) {
        return new UserLinkClickEvent(data, timestamp || new Date);
    }
};
