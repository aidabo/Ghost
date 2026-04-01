/**
 * @typedef {object} UserSignupEventData
 * @prop {string} userId
 * @prop {string} entryId
 * @prop {string} sourceUrl
 */

module.exports = class UserSignupEvent {
    /**
     * @param {UserSignupEventData} data
     * @param {Date} timestamp
     */
    constructor(data, timestamp) {
        this.data = data;
        this.timestamp = timestamp;
    }

    /**
     * @param {UserSignupEventData} data
     * @param {Date} [timestamp]
     */
    static create(data, timestamp) {
        return new UserSignupEvent(data, timestamp || new Date);
    }
};

