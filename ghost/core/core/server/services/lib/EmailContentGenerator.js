const _ = require('lodash').runInContext();
const fs = require('fs-extra');
const path = require('path');
const {getFrontLogoUrl, toFrontUrl} = require('./front-logo');

_.templateSettings.interpolate = /{{([\s\S]+?)}}/g;

class EmailContentGenerator {
    /**
     *
     * @param {Object} options
     * @param {function} options.getSiteUrl
     * @param {function} options.getSiteTitle
     * @param {string} options.templatesDir - path to the directory containing email templates
     */
    constructor({getSiteUrl, getSiteTitle, templatesDir}) {
        this.getSiteUrl = getSiteUrl;
        this.getSiteTitle = getSiteTitle;
        this.templatesDir = templatesDir;
    }

    /**
     *
     * @param {Object} options
     * @param {string} options.template - HTML template name to use for generation
     * @param {Object} [options.data] - variable data to use during HTML template compilation
     * @returns {Promise<{html: String, text: String}>} resolves with an object containing html and text properties
     */
    async getContent(options) {
        const defaults = {
            siteUrl: this.getSiteUrl(),
            siteTitle: this.getSiteTitle(),
            // 雛形のロゴ: front のロゴ（無ければ null。雛形は `frontLogoUrl || 今までの Ghost のロゴ` と書く）
            frontLogoUrl: getFrontLogoUrl(),
            // 雛形のリンク: Ghost の URL を front の URL に（FRONT_END_URL、無ければ GHOST_FRONT_END_URL など。無ければそのまま）
            toFront: url => toFrontUrl(url)
        };

        const data = _.defaults(defaults, options.data);
        // 訳した文（招待のメールなどの雛形が {{copy.…}} で使う）。渡されないときも雛形が落ちないように空にする
        if (!data.copy || typeof data.copy !== 'object') {
            data.copy = {};
        }

        // read the proper email body template
        const content = await fs.readFile(path.join(this.templatesDir, options.template + '.html'), 'utf8');

        // insert user-specific data into the email
        const compiled = _.template(content);
        const htmlContent = compiled(data);

        // lazyload the lib, and generate a plain-text version of the same email
        const htmlToText = require('html-to-text');
        const textContent = htmlToText.fromString(htmlContent);

        return {
            html: htmlContent,
            text: textContent
        };
    }
}

module.exports = EmailContentGenerator;
