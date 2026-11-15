/**
 * front が送った画面の言葉（ja・en・zh など）。言葉の形でなければ無し（メールはサイトの言葉）。
 * どの言葉を使うかは Ghost の services/lib/mail-i18n.js が決める（jibunsee-react docs/planning/mail-i18n.md の D7）
 * @param {unknown} value
 * @returns {string|undefined}
 */
module.exports = function screenLocale(value) {
    return typeof value === 'string' && /^[a-z]{2,3}([-_][a-z0-9]{2,8})?$/i.test(value) ? value : undefined;
};
