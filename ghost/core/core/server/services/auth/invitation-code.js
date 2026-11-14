// スタッフが自分で登録する「アカウント作成」の招待に、6 桁の認証コードを付ける
// （jibunsee-react docs/planning/staff-signup-code.md §3）。作りは password-reset-code.js と同じ。
//
// - 6 桁は招待を作るとき（POST /invites/?include_code=true）にだけ、でたらめに作る。
// - 6 桁そのものは保存しない。tokens の表に、token = ref（招待の token とは別のでたらめな値）、
//   data = { type: 'staff_invite_code', invite_id, code_hash } の行を作る。
//   code_hash = HMAC-SHA256(admin_session_secret, `${ref}:${招待の token}:${6 桁}`)。招待の token を入れるので、
//   送り直して招待が作り直されると（Invites.add は同じメールの前の招待を消す）、前の 6 桁はもう合わない。
// - ref から招待の token は求められない（POST /invites は誰のメールでも招待を作れるので、ref = token にすると
//   他人のメールの登録リンクが手に入ってしまう）。
// - 使えるのは作ってから 10 分・間違えは 5 回まで（used_count で数える）。合ったら行を消し（1 回きり）、
//   メールのリンクと同じ値（encodeBase64(招待の token)）を返す。登録そのものは今の POST /authentication/invitation。
const crypto = require('crypto');
const errors = require('@tryghost/errors');
const tpl = require('@tryghost/tpl');
const security = require('@tryghost/security');
const models = require('../../models');
const settingsCache = require('../../../shared/settings-cache');
const {STAFF_INVITE_CODE_TYPE: TOKEN_TYPE} = require('./staff-reset-code-type');

/** 使えるのは作ってから 10 分 */
const CODE_VALIDITY = 10 * 60 * 1000;
/** 間違えは 5 回まで */
const MAX_FAILURES = 5;
/** メールに書く「この時間のうちに入れてください」の分 */
const CODE_MINUTES = CODE_VALIDITY / 60000;

const messages = {
    invalidCode: 'The code is wrong or has expired. Please request a new one.'
};

/** メールの言葉（ja / en / zh）。件名の頭に 6 桁の認証コード（携帯の通知だけで読めるように） */
const MAIL_TEXT = {
    ja: {
        subject: (code, siteTitle) => `${code} は${siteTitle}のスタッフ登録の認証コードです`,
        lead: `開いている画面に ${CODE_MINUTES} 分以内にこの 6 桁の認証コードを入れるか、下のリンクを押してください。`
    },
    en: {
        subject: (code, siteTitle) => `${code} is your verification code to sign up for ${siteTitle}`,
        lead: `Enter this 6-digit verification code on the screen you have open within ${CODE_MINUTES} minutes, or use the link below.`
    },
    zh: {
        subject: (code, siteTitle) => `${code} 是 ${siteTitle} 的员工注册验证码`,
        lead: `请在 ${CODE_MINUTES} 分钟内将这 6 位验证码输入到已打开的画面中，或点击下面的链接。`
    }
};

function mailLocale(locale) {
    const lang = String(locale || settingsCache.get('locale') || 'en').toLowerCase().split(/[-_]/)[0];
    return MAIL_TEXT[lang] ? lang : 'en';
}

function codeHash(ref, inviteToken, code) {
    return crypto.createHmac('sha256', settingsCache.get('admin_session_secret')).update(`${ref}:${inviteToken}:${code}`).digest('hex');
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
 * 招待に 6 桁を付ける: tokens の表に行を作り、ref と 6 桁を返す（6 桁はメールに入れるだけ。保存はしない）。
 * @returns {Promise<{ref: string, code: string}>}
 */
async function createCode(invite, options = {}) {
    const ref = newRef();
    const code = newCode();
    await models.SingleUseToken.add({
        token: ref,
        data: JSON.stringify({type: TOKEN_TYPE, invite_id: invite.id, code_hash: codeHash(ref, invite.get('token'), code)})
    }, options);
    return {ref, code};
}

/** 作った行を消す（メールを送れなかったときなど。行だけが残らないように） */
async function removeCode(ref) {
    await models.SingleUseToken.forge().query().where({token: ref}).delete();
}

/**
 * 招待メール（今の雛形で作ったもの）に 6 桁を足す。件名は認証コードの件名に替え、本文の頭に 6 桁の欄を入れる。
 * @param {{subject: string, html: string, text: string}} mail
 */
function addCodeToMail(mail, {code, locale, siteTitle}) {
    const text = MAIL_TEXT[mailLocale(locale)];
    const block = `<p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 16px; color: #3A464C; margin: 0 0 8px;">${escapeHtml(text.lead)}</p>`
        + `<p data-invite-code style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 32px; font-weight: 700; letter-spacing: 6px; color: #15212A; margin: 0 0 16px;">${escapeHtml(code)}</p>`;
    const html = String(mail.html || '');
    const bodyAt = html.indexOf('<body');
    const bodyEnd = bodyAt >= 0 ? html.indexOf('>', bodyAt) + 1 : 0;
    return {
        subject: text.subject(code, siteTitle),
        html: bodyEnd > 0 ? html.slice(0, bodyEnd) + block + html.slice(bodyEnd) : block + html,
        text: `${text.lead}\n\n${code}\n\n${mail.text || ''}`
    };
}

/**
 * ref の行の 6 桁が合えば、招待の token（メールのリンクの /signup/ の後ろと同じ値）を返す。
 * 行が無い・種類が違う・10 分を過ぎた・5 回間違えた・招待が無い／切れた・メールが違う・6 桁が違うは、どれか言わない同じ失敗。
 * 6 桁が違ったら間違えの数を 1 つ増やし、合ったら行を消す（同じ 6 桁はもう使えない）。
 * @returns {Promise<{token: string}>}
 */
async function verifyCode({email, ref, code}, options = {}) {
    if (typeof ref !== 'string' || !ref || typeof code !== 'string' || typeof email !== 'string') {
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
    if (data.type !== TOKEN_TYPE || !fresh || row.get('used_count') >= MAX_FAILURES || !data.invite_id) {
        throw invalid();
    }
    const invite = await models.Invite.findOne({id: data.invite_id}, options);
    const inviteOk = Boolean(invite)
        && String(invite.get('email') || '').trim().toLowerCase() === email.trim().toLowerCase()
        && Number(invite.get('expires')) > Date.now();
    const expected = Buffer.from(String(data.code_hash || ''));
    const given = Buffer.from(codeHash(ref, invite ? invite.get('token') : '', code.trim()));
    const match = inviteOk && expected.length === given.length && crypto.timingSafeEqual(expected, given);
    if (!match) {
        // 間違えを数える（同時に来ても数え落とさないよう、表の上で 1 つ増やす）
        await models.SingleUseToken.forge().query()
            .where({id: row.id})
            .increment('used_count', 1);
        throw invalid();
    }
    // 合った: 行を消してから返す（同時に来た 2 つめは消せずに失敗する）
    const removed = await models.SingleUseToken.forge().query()
        .where({id: row.id})
        .delete();
    if (!removed) {
        throw invalid();
    }
    return {token: security.url.encodeBase64(invite.get('token'))};
}

module.exports = {
    createCode,
    removeCode,
    addCodeToMail,
    verifyCode,
    TOKEN_TYPE,
    CODE_VALIDITY,
    MAX_FAILURES,
    CODE_MINUTES,
    // 試験用
    _codeHash: codeHash
};
