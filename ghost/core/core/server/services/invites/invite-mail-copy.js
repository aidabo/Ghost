// 招待のメール（invite-user.html・invite-user-by-api-key.html）の文を、画面の言葉で作る
// （jibunsee-react docs/planning/mail-i18n.md の S2・S3、D5）。
//
// 雛形（lodash の _.template）の {{ }} は i18next の {{ }} とぶつかるので、雛形の中では訳さない。
// ここで訳した文を copy として雛形に渡し、雛形は {{copy.lead}} のように差し込むだけにする。
// 差し込む値（サイト名・招いた人の名前）は t がエスケープする（i18next の既定）。copy の HTML の文はそのまま雛形に入る。
const {mailT, escapeHtml} = require('../lib/mail-i18n');

/**
 * @param {object} params
 * @param {string} [params.locale] 画面の言葉（ja・en・zh。それ以外・無しはサイトの言葉）
 * @param {string} params.blogName
 * @param {string} [params.invitedByName] 招いた人（API キーで作った招待には無い）
 * @param {string} [params.invitedByEmail]
 * @returns {{subject: string, title: string, heading: string, lead: string, action: string, button: string, help: string, closing: string, footer: (siteUrl: string, recipientEmail: string) => string}}
 *   subject は文（エスケープしない）、ほかは HTML に入れる文（エスケープ済み）。footer は雛形がサイトの URL と宛先を渡して呼ぶ
 */
function inviteMailCopy({locale, blogName, invitedByName, invitedByEmail}) {
    const t = mailT(locale);
    const plain = {interpolation: {escapeValue: false}};
    const byName = Boolean(invitedByName);

    let help = '';
    if (byName && invitedByEmail) {
        // メールのアドレスはリンクにする。値は自分でエスケープしてから、エスケープしない差し込みで入れる
        const email = escapeHtml(invitedByEmail);
        help = t('If you have trouble activating your {{blogName}} account, you can reach out to {{invitedByName}} on {{invitedByEmail}} for assistance.', {
            blogName: escapeHtml(blogName || ''),
            invitedByName: escapeHtml(invitedByName),
            invitedByEmail: `<a href="mailto:${email}" style="color: #15212A;">${email}</a>`,
            ...plain
        });
    }

    return {
        subject: byName
            ? t('{{invitedByName}} has invited you to join {{blogName}}', {invitedByName, blogName, ...plain})
            : t('You have been invited to join {{blogName}}', {blogName, ...plain}),
        title: escapeHtml(blogName || ''),
        heading: t('Welcome'),
        lead: byName
            ? t('{{invitedByName}} has invited you to join {{blogName}}.', {invitedByName, blogName})
            : t('You\'ve been invited to join {{blogName}} as a staff user.', {blogName}),
        action: t('Please click on the link below to activate your account.'),
        button: t('Click here to activate your account'),
        help,
        closing: t('Have fun, and good luck!'),
        footer: (siteUrl, recipientEmail) => {
            const site = escapeHtml(siteUrl || '');
            const email = escapeHtml(recipientEmail || '');
            return t('This email was sent from {{siteUrl}} to {{recipientEmail}}', {
                siteUrl: `<a href="${site}" style="color: #738A94;">${site}</a>`,
                recipientEmail: `<a href="mailto:${email}" style="color: #738A94;">${email}</a>`,
                ...plain
            });
        }
    };
}

module.exports = {inviteMailCopy};
