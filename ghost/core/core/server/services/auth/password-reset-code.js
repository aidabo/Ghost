// スタッフがパスワードを忘れたとき、メールの 6 桁のコードで決め直す
// （jibunsee-react docs/planning/staff-password-reset-code.md §3）。
//
// - コードは保存しない。otplib の totp で、秘密は `${admin_session_secret}:${user.id}:${パスワードの hash}`。
//   パスワードが変わると秘密も変わるので、一度使ったコード（と同じ時に送ったリンク）はもう使えない。
// - 時間の幅は step 300 秒・window [1, 0]: 送ってから 5〜10 分使える。同じ時に通るのは 2 個だけ。
//   今のサインインの確認コード（step 60・window [10, 10]、約 21 分・21 個）より狭くする。
// - 登録の無いメールでも、送る口は同じ応答を返す（呼ぶ側。endpoints/authentication.js）。
const {totp: baseTotp} = require('otplib');
const errors = require('@tryghost/errors');
const tpl = require('@tryghost/tpl');
const models = require('../../models');
const settingsCache = require('../../../shared/settings-cache');
const urlUtils = require('../../../shared/url-utils');
const security = require('@tryghost/security');
const logging = require('@tryghost/logging');
const passwordreset = require('./passwordreset');

const totp = baseTotp.clone({digits: 6, step: 300, window: [1, 0]});

/** メールに書く「この時間のうちに入れてください」の分。必ず使える時間（step の長さ）に合わせる */
const CODE_MINUTES = 5;

const messages = {
    invalidCode: 'The code is wrong or has expired. Please request a new one.'
};

/** メールの言葉（ja / en / zh）。件名の頭に 6 桁（携帯の通知だけで読めるように） */
const MAIL_TEXT = {
    ja: {
        subject: code => `${code} はパスワードを決め直すためのコードです`,
        lead: `開いているログインの画面に、${CODE_MINUTES} 分以内にこの 6 桁を入れてください。`,
        link: '画面を閉じてしまったときは、こちらのリンクからも決め直せます（24 時間）:',
        ignore: '心当たりが無ければ、このメールは捨ててください。'
    },
    en: {
        subject: code => `${code} is your code to reset your password`,
        lead: `Enter these 6 digits in the sign-in screen you have open, within ${CODE_MINUTES} minutes.`,
        link: 'If you closed the screen, you can also reset your password with this link (valid for 24 hours):',
        ignore: 'If you did not ask for this, you can ignore this email.'
    },
    zh: {
        subject: code => `${code} 是重新设置密码的验证码`,
        lead: `请在 ${CODE_MINUTES} 分钟内，将这 6 位数字输入到已打开的登录画面中。`,
        link: '如果已经关闭了画面，也可以通过此链接重新设置（24 小时内有效）：',
        ignore: '如果不是您本人操作，请忽略此邮件。'
    }
};

function mailLocale(locale) {
    const lang = String(locale || settingsCache.get('locale') || 'en').toLowerCase().split(/[-_]/)[0];
    return MAIL_TEXT[lang] ? lang : 'en';
}

function codeSecret(user) {
    return `${settingsCache.get('admin_session_secret')}:${user.id}:${user.get('password')}`;
}

function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, ch => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;'}[ch]));
}

/**
 * そのメールのスタッフがいれば、6 桁と（決めたこと 2 のとおり）今のリンクの両方を作る。いなければ null。
 * @returns {Promise<null | {email: string, code: string, resetUrl: string}>}
 */
async function generateCode(email, settingsAPI, options = {}) {
    const user = await models.User.getByEmail(email, options);
    if (!user) {
        return null;
    }
    const code = totp.generate(codeSecret(user));
    const {resetToken} = await passwordreset.generateToken(email, settingsAPI, options.transacting);
    const adminUrl = urlUtils.urlFor('admin', true);
    const resetUrl = urlUtils.urlJoin(adminUrl, 'reset', security.url.encodeBase64(resetToken), '/');
    return {email, code, resetUrl};
}

function buildMail({code, resetUrl}, locale) {
    const text = MAIL_TEXT[mailLocale(locale)];
    return {
        subject: text.subject(code),
        text: [text.lead, '', code, '', text.link, resetUrl, '', text.ignore].join('\n'),
        html: [
            `<p>${escapeHtml(text.lead)}</p>`,
            `<p style="font-size:32px;font-weight:700;letter-spacing:6px;margin:16px 0">${escapeHtml(code)}</p>`,
            `<p>${escapeHtml(text.link)}<br><a href="${escapeHtml(resetUrl)}">${escapeHtml(resetUrl)}</a></p>`,
            `<p style="color:#6b7280">${escapeHtml(text.ignore)}</p>`
        ].join('\n')
    };
}

async function sendCode(data, mailAPI, locale) {
    const {subject, text, html} = buildMail(data, locale);
    return mailAPI.send({
        mail: [{message: {to: data.email, subject, html, text}, options: {}}]
    }, {context: {internal: true}});
}

/**
 * コードを送る。登録の無いメールでも同じに終わる（応答の差で登録の有無を推測させない）。
 * ユーザーを引く・コードとリンクを作る・メールを送るのは、全部待たずに後ろで行う
 * （登録があるときだけ余分な DB の処理を待つと、応答の時間の差で登録の有無が分かってしまうため）。
 */
function requestCode({email, locale}, settingsAPI, mailAPI, options = {}) {
    generateCode(email, settingsAPI, options)
        .then(data => (data ? sendCode(data, mailAPI, locale) : null))
        .catch((err) => {
            logging.error(err);
        });
}

/**
 * 6 桁が合えばパスワードを変える（今のリンクでの再設定 doReset と同じく、status も active に戻す）。
 * 合わない・登録が無いときは、どちらか言わない同じ失敗。
 */
async function resetWithCode({email, code, newPassword}, options = {}) {
    const user = await models.User.getByEmail(email, options);
    const ok = Boolean(user) && typeof code === 'string' && totp.check(code.trim(), codeSecret(user));
    if (!ok) {
        throw new errors.BadRequestError({message: tpl(messages.invalidCode)});
    }
    const updatedUser = await models.User.changePassword({newPassword, user_id: user.id}, options);
    updatedUser.set('status', 'active');
    return updatedUser.save(options);
}

module.exports = {
    requestCode,
    resetWithCode,
    // 試験用
    _totp: totp,
    _codeSecret: codeSecret,
    _buildMail: buildMail,
    CODE_MINUTES
};
