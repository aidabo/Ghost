/**
 * @typedef {object} UserPageViewEventData
 * @prop {string} userId
 * @prop {string} userLastSeenAt
 * @prop {string} url
 */

/**
 * Server-side event firing on page views (page, post, tags...)
 */
module.exports = class UserPageViewEvent {
    /**
     * @param {UserPageViewEventData} data
     * @param {Date} timestamp
     */
    constructor(data, timestamp) {
        this.data = data;
        this.timestamp = timestamp;
    }

    /**
     * @param {UserPageViewEventData} data
     * @param {Date} [timestamp]
     */
    static create(data, timestamp) {
        return new UserPageViewEvent(data, timestamp || new Date);
    }
};
