// メールのロゴを、Ghost の元のロゴ（static.ghost.org の orb）から front（01-ghost-front）のロゴに替える。
// どれも転送を挟まない URL を書く（転送をたどらないメールソフトや検査装置でもロゴが出る）。選ぶ順:
//
// 1. front の /settings（アプリバー）で選んだロゴの画像。無ければ同じ画面の favicon の画像。
//    どちらも Ghost の設定 my_config（JSON）の logo.imageUrl・favicon.imageUrl に入る、S3（CloudFront）の絶対 URL。
//    .ico・.svg はメールソフトで出ないことがあるので使わない。
// 2. <front>/brand/<TENANT>/apple-touch-icon.png（front の public/brand/<テナント名>/ の 180x180 の正方形）。
//    front はその組のフォルダが無いとき、同じ URL で public 直下の共通の画像を返す（front の app/brand/[set]/apple-touch-icon.png）。
// 3. TENANT が無いとき: <front>/apple-touch-icon-180.png（public 直下の共通の画像）。
//
// front の URL は、メールのリンクと同じ FRONT_END_URL を先に見る（同じメールのリンクとロゴの行き先をそろえる）。
// 本番はホストの GHOST_FRONT_END_URL が compose でコンテナの FRONT_END_URL に入る（tenants/*/deploy/backend/docker-compose.yml）。
// 無ければ GHOST_FRONT_END_URL、会員の front の URL（services/members/frontend-url.js と同じ並び）の順。
// 1 が無く、front の URL も無い（http(s) でない）ときは null を返し、呼ぶ側は今までの Ghost のロゴのままにする。

/** TENANT ごとのロゴ（front の public/brand/<TENANT>/） */
const TENANT_LOGO_FILE = 'apple-touch-icon.png';

/** TENANT が無いときのロゴ（front の public 直下の共通） */
const COMMON_LOGO_PATH = '/apple-touch-icon-180.png';

/** front の URL を見る順 */
const FRONT_URL_ENV_NAMES = ['FRONT_END_URL', 'GHOST_FRONT_END_URL', 'MEMBERS_FRONTEND_URL', 'FRONTEND_URL', 'NEXT_PUBLIC_FRONT_URL'];

const ABSOLUTE_URL = /^https?:\/\/[^\s"'<>]+$/i;

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string} front の上のロゴの道
 */
function frontLogoPath(env = process.env) {
    const tenant = String(env.TENANT || '').trim();
    // テナント名は tenants/<名前> と同じ（英数字と - だけ）。それ以外は URL に入れず共通の画像にする
    return /^[a-z0-9][a-z0-9-]*$/i.test(tenant) ? `/brand/${tenant}/${TENANT_LOGO_FILE}` : COMMON_LOGO_PATH;
}

/**
 * front の /settings で選んだロゴ（無ければ favicon）の画像の URL。メールで使えないものは null。
 * @param {string|object|null|undefined} myConfig Ghost の設定 my_config（JSON の文字列）
 * @returns {string|null}
 */
function chosenLogoUrl(myConfig) {
    let config;
    try {
        config = typeof myConfig === 'string' ? JSON.parse(myConfig) : myConfig;
    } catch (e) {
        return null;
    }
    if (!config || typeof config !== 'object') {
        return null;
    }
    const candidates = [
        config.logo && config.logo.mode === 'image' ? config.logo.imageUrl : null,
        config.favicon ? config.favicon.imageUrl : null
    ];
    for (const candidate of candidates) {
        const url = String(candidate || '').trim();
        if (ABSOLUTE_URL.test(url) && !/\.(ico|svg)$/i.test(url.split(/[?#]/)[0])) {
            return url;
        }
    }
    return null;
}

function readMyConfig() {
    try {
        return require('../../../shared/settings-cache').get('my_config');
    } catch (e) {
        return null;
    }
}

/**
 * front の URL（末尾の / なし）。FRONT_END_URL を先に、無ければ GHOST_FRONT_END_URL などの順で、最初に値のある名前だけを使う。
 * http(s) でなければ null。メールのロゴとリンクの両方が使う（同じメールのロゴとリンクの行き先をそろえる）。
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string|null}
 */
function getFrontBaseUrl(env = process.env) {
    try {
        const name = FRONT_URL_ENV_NAMES.find(key => String((env || {})[key] || '').trim());
        const base = String(name ? env[name] : '').trim().replace(/\/+$/, '');
        return ABSOLUTE_URL.test(base) ? base : null;
    } catch (e) {
        return null;
    }
}

/**
 * Ghost の URL（サイトの URL や管理の /ghost/… のリンク）を front の URL にする。front の URL が無ければそのまま返す。
 * - 道が /ghost を含む（招待・パスワード再設定のリンク）: 道の「…/ghost」までを front の URL に替える
 *   （今までの雛形の .replace(/.*ghost/, …) と同じ結果。ただしホスト名の ghost には反応しない）
 * - 含まない（サイトの URL）: 頭の「http(s)://ホスト」を front の URL に替える（道はそのまま）
 * 例外を投げない（メールを送れなくしない）。
 * @param {string} url
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string}
 */
function toFrontUrl(url, env = process.env) {
    const value = String(url || '');
    const base = getFrontBaseUrl(env);
    if (!base || !value) {
        return value;
    }
    // 管理画面の道（…/ghost/…）は、道の「/ghost」までを front の URL に替える。ホスト名の ghost（ghost.example.com など）は見ない
    const admin = value.match(/^https?:\/\/[^/]+(?:\/.*?)?\/ghost(\/.*)?$/i);
    if (admin) {
        return `${base}${admin[1] || '/'}`;
    }
    // 置き換える文字列の $& などを置換の記号として読ませないよう、関数で返す
    return value.replace(/^https?:\/\/[^/]+/i, () => base);
}

function resolveFrontLogoUrl(env, myConfig) {
    const chosen = chosenLogoUrl(myConfig);
    if (chosen) {
        return chosen;
    }
    // 最初に値のある名前だけを使う（その値が http(s) でなくても次の名前には進まない）。
    // FRONT_END_URL が壊れていればメールのリンクも同じ値で壊れているので、ロゴだけ別のホストにしない
    const base = getFrontBaseUrl(env);
    if (!base) {
        return null;
    }
    return `${base}${frontLogoPath(env)}`;
}

/**
 * メールのロゴの URL。無いときは null（呼ぶ側は今までの Ghost のロゴにする）。
 * ロゴのためにメールが送れなくならないよう、ここでは決して例外を投げない（設定が壊れていても、何かが失敗しても null）。
 * @param {NodeJS.ProcessEnv} [env]
 * @param {string|object|null} [myConfig] Ghost の設定 my_config（省略すると設定のキャッシュから読む）
 * @returns {string|null}
 */
function getFrontLogoUrl(env = process.env, myConfig) {
    try {
        return resolveFrontLogoUrl(env || {}, myConfig === undefined ? readMyConfig() : myConfig);
    } catch (e) {
        return null;
    }
}

/**
 * メールのロゴ: サイトのアイコン、無ければ front のロゴ、それも無ければ ghostLogo（今までの Ghost のロゴ。null ならロゴを出さない）。
 * @param {string|null|undefined} siteIconUrl
 * @param {string|null} [ghostLogo]
 * @returns {string|null}
 */
function siteIconOrFrontLogo(siteIconUrl, ghostLogo = null) {
    return siteIconUrl || getFrontLogoUrl() || ghostLogo;
}

module.exports = {
    getFrontLogoUrl,
    getFrontBaseUrl,
    toFrontUrl,
    siteIconOrFrontLogo,
    chosenLogoUrl,
    frontLogoPath,
    COMMON_LOGO_PATH,
    FRONT_URL_ENV_NAMES
};
