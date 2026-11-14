// スタッフがパスワードを忘れたとき、メールの 6 桁のコードで決め直す
// （jibunsee-react docs/planning/staff-password-reset-code.md §3）。
//
// - 6 桁は「送る」を頼んだときにだけ作る（でたらめな数）。前は計算で決まる totp で、頼まなくても
//   いつでも当てに行けた（本人にメールが届かないまま、黙って推測を続けられた）。
// - 6 桁そのものは保存しない。今の tokens の表（会員のマジックリンクと同じ表。表は増やさない）に、
//   token = ref（送る口が返す目印）、data = { type: 'staff_reset_code', user_id, code_hash } の行を作る。
//   code_hash = HMAC-SHA256(admin_session_secret, `${ref}:${パスワードの hash}:${6 桁}`)。パスワードの hash を入れるので、
//   一緒に送ったリンクで先にパスワードを変えると、6 桁はもう合わない。古い行は Ghost の clean-tokens の job が消す。
// - 使えるのは作ってから 10 分・間違えは 5 回まで（used_count で数える）。合ったら行を消す（1 回きり）。
// - 登録の無いメールでも、送る口は同じ形の ref を同じ時間で返す（行もメールも作らないだけ）。
const crypto = require('crypto');
const errors = require('@tryghost/errors');
const tpl = require('@tryghost/tpl');
const models = require('../../models');
const settingsCache = require('../../../shared/settings-cache');
const urlUtils = require('../../../shared/url-utils');
const security = require('@tryghost/security');
const logging = require('@tryghost/logging');
const passwordreset = require('./passwordreset');

/** tokens の表の行の種類（会員のマジックリンクの行と分ける。SingleUseTokenProvider.validate はこの行を断る） */
const {STAFF_RESET_CODE_TYPE: TOKEN_TYPE} = require('./staff-reset-code-type');
/** 使えるのは作ってから 10 分 */
const CODE_VALIDITY = 10 * 60 * 1000;
/** 間違えは 5 回まで */
const MAX_FAILURES = 5;
/** メールに書く「この時間のうちに入れてください」の分（有効時間から決める。片方だけ変えてずれないように） */
const CODE_MINUTES = CODE_VALIDITY / 60000;

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

function codeHash(ref, passwordHash, code) {
    return crypto.createHmac('sha256', settingsCache.get('admin_session_secret')).update(`${ref}:${passwordHash}:${code}`).digest('hex');
}

function newRef() {
    return crypto.randomBytes(24).toString('base64').replace(/\+/g, '-').replace(/\//g, '_');
}

function newCode() {
    return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

const invalid = () => new errors.BadRequestError({message: tpl(messages.invalidCode)});

function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, ch => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;'}[ch]));
}

/**
 * そのメールのスタッフがいれば、6 桁を作って tokens の表に（6 桁は hash で）残し、今のリンクも作る。いなければ null。
 * @returns {Promise<null | {email: string, code: string, resetUrl: string}>}
 */
async function generateCode(email, ref, settingsAPI, options = {}) {
    const user = await models.User.getByEmail(email, options);
    if (!user) {
        return null;
    }
    const code = newCode();
    await models.SingleUseToken.add({
        token: ref,
        data: JSON.stringify({type: TOKEN_TYPE, user_id: user.id, code_hash: codeHash(ref, user.get('password'), code)})
    }, options);
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
 * コードを送り、ref を返す。登録の無いメールでも同じ形の ref を同じに返す（応答の差で登録の有無を推測させない）。
 * ユーザーを引く・行を作る・リンクを作る・メールを送るのは、全部待たずに後ろで行う
 * （登録があるときだけ余分な DB の処理を待つと、応答の時間の差で登録の有無が分かってしまうため）。
 * @returns {{ref: string}}
 */
function requestCode({email, locale}, settingsAPI, mailAPI, options = {}) {
    const ref = newRef();
    generateCode(email, ref, settingsAPI, options)
        .then(data => (data ? sendCode(data, mailAPI, locale) : null))
        .catch((err) => {
            logging.error(err);
        });
    return {ref};
}

/**
 * ref の行の 6 桁が合えばパスワードを変える（今のリンクでの再設定 doReset と同じく、status も active に戻す）。
 * 行が無い・種類が違う・10 分を過ぎた・5 回間違えた・メールの人が違う・6 桁が違うは、どれか言わない同じ失敗。
 * 6 桁が違ったら間違えの数を 1 つ増やし、合ったら行を消す（同じ 6 桁はもう使えない）。
 */
async function resetWithCode({email, ref, code, newPassword}, options = {}) {
    if (typeof ref !== 'string' || !ref || typeof code !== 'string') {
        throw invalid();
    }
    const row = await models.SingleUseToken.findOne({token: ref}, options);
    if (!row) {
        throw invalid();
    }
    let data = {};
    try {
        data = JSON.parse(row.get('data') || '{}');
    } catch (err) {
        data = {};
    }
    const fresh = Date.now() - row.get('created_at').getTime() <= CODE_VALIDITY;
    if (data.type !== TOKEN_TYPE || !fresh || row.get('used_count') >= MAX_FAILURES) {
        throw invalid();
    }
    const user = await models.User.getByEmail(email, options);
    const expected = Buffer.from(String(data.code_hash || ''));
    // 今のパスワードの hash で作る（リンクで先に変えていれば合わない）
    const given = Buffer.from(codeHash(ref, user ? user.get('password') : '', code.trim()));
    const match = Boolean(user) && user.id === data.user_id
        && expected.length === given.length && crypto.timingSafeEqual(expected, given);
    if (!match) {
        // 間違えを数える（同時に来ても数え落とさないよう、表の上で 1 つ増やす）
        await models.SingleUseToken.forge().query()
            .where({id: row.id})
            .increment('used_count', 1);
        throw invalid();
    }
    // 合った: 行を消してから変える（同時に来た 2 つめは消せずに失敗する）
    const removed = await models.SingleUseToken.forge().query()
        .where({id: row.id})
        .delete();
    if (!removed) {
        throw invalid();
    }
    const updatedUser = await models.User.changePassword({newPassword, user_id: user.id}, options);
    updatedUser.set('status', 'active');
    return updatedUser.save(options);
}

module.exports = {
    requestCode,
    resetWithCode,
    TOKEN_TYPE,
    CODE_VALIDITY,
    MAX_FAILURES,
    CODE_MINUTES,
    // 試験用
    _codeHash: codeHash,
    _buildMail: buildMail
};
