// メールを、送ったときの画面の言葉（ja・en・zh）で作るための t（jibunsee-react docs/planning/mail-i18n.md）。
//
// サーバーの t（services/i18n.js）はサイトの言葉 1 つだけで、changeLanguage はサイト全体を替えてしまう
// （同時に来た別の人のメールの言葉まで変わる）。ここでは言葉ごとに別の i18next を作って覚えておき、
// 要求ごとに使い分ける（D4）。言葉の表は Ghost の ghost.json（@tryghost/i18n の名前 'ghost'）。
//
// ja・en・zh 以外・無しはサイトの言葉（settings.locale）、それも無ければ en（D2）。
// メールを送れなくしない: 何が失敗しても例外を投げず、英語の文（キーそのもの）に値を差し込んで返す。

/** 画面から選べる言葉 */
const SCREEN_LOCALES = ['ja', 'en', 'zh'];

/** @type {Map<string, Function>} 言葉ごとの t */
const cache = new Map();

function siteLocale() {
    try {
        return String(require('../../../shared/settings-cache').get('locale') || '').trim();
    } catch (e) {
        return '';
    }
}

/**
 * メールの言葉。画面の言葉（ja・en・zh。zh-CN などは zh）、それ以外・無しはサイトの言葉、それも無ければ en。
 * @param {string} [locale] 画面の言葉
 * @param {string} [site] サイトの言葉（省略すると settings.locale）
 * @returns {string}
 */
function mailLanguage(locale, site = siteLocale()) {
    const lang = String(locale || '').trim().toLowerCase().split(/[-_]/)[0];
    if (SCREEN_LOCALES.includes(lang)) {
        return lang;
    }
    return String(site || '').trim() || 'en';
}

const escapeHtml = value => String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/** 言葉の表が使えないときの t: キー（英語の文）に値を差し込む。i18next と同じく、既定では値を HTML のエスケープをする */
function fallbackT(key, vars = {}) {
    const escape = !(vars.interpolation && vars.interpolation.escapeValue === false);
    return String(key).replace(/{{\s*(\w+)\s*}}/g, (match, name) => {
        if (!Object.prototype.hasOwnProperty.call(vars, name)) {
            return match;
        }
        return escape ? escapeHtml(vars[name]) : String(vars[name]);
    });
}

/**
 * その言葉の t（i18next の t と同じ使い方。差し込む値は既定で HTML のエスケープをする）。
 * @param {string} [locale] 画面の言葉
 * @param {string} [site] サイトの言葉（試験用。省略すると settings.locale）
 * @returns {(key: string, vars?: object) => string}
 */
function mailT(locale, site) {
    const lang = mailLanguage(locale, site);
    if (!cache.has(lang)) {
        try {
            const i18n = require('@tryghost/i18n')(lang, 'ghost');
            cache.set(lang, i18n.t.bind(i18n));
        } catch (e) {
            return fallbackT;
        }
    }
    const t = cache.get(lang);
    return (key, vars) => {
        try {
            return t(key, vars);
        } catch (e) {
            return fallbackT(key, vars);
        }
    };
}

module.exports = {mailT, mailLanguage, escapeHtml, SCREEN_LOCALES};
