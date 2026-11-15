// メールのロゴを、Ghost の元のロゴ（static.ghost.org の orb）から front（01-ghost-front）のロゴに替える。
//
// 画像は front の public/brand/<組>/ にある 180x180 の正方形（front の src/lib/siteIcons.ts の apple と同じファイル）。
// どの組かは環境変数 TENANT（60-think・janabiz・thinkestate）で決め、その画像の URL をメールに直接書く
// （転送を挟まない。転送をたどらないメールソフトや検査装置でもロゴが出る）。
// TENANT が無い・知らない名前のときだけ、front の /apple-touch-icon.png（front が自分の組へ転送する）を書く。
// front の URL は、メールのリンクと同じ FRONT_END_URL を先に見る（同じメールのリンクとロゴの行き先をそろえる）。
// 本番はホストの GHOST_FRONT_END_URL が compose でコンテナの FRONT_END_URL に入る（tenants/*/deploy/backend/docker-compose.yml）。
// 無ければ GHOST_FRONT_END_URL、会員の front の URL（services/members/frontend-url.js と同じ並び）の順。
// どれも無い（http(s) でない）ときは null を返し、呼ぶ側は今までの Ghost のロゴのままにする。

/** TENANT が無い・知らないとき: front がテナントのロゴへ転送する道 */
const FRONT_LOGO_PATH = '/apple-touch-icon.png';

/**
 * TENANT ごとのロゴの道（front の src/lib/siteIcons.ts の apple と同じ。画像を足したら両方を直す）。
 * front の組の名前（GHOST_FRONT_ICON_SET）でも引けるようにしておく。
 */
const TENANT_LOGO_PATHS = {
    '60-think': '/brand/60-think/apple-touch-icon-180.png',
    thinkestate: '/brand/think-estate/apple-touch-icon.png',
    'think-estate': '/brand/think-estate/apple-touch-icon.png',
    janabiz: '/brand/mars-times/apple-touch-icon.png',
    'mars-times': '/brand/mars-times/apple-touch-icon.png'
};

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string} front の上のロゴの道
 */
function frontLogoPath(env = process.env) {
    const tenant = String(env.TENANT || '').trim().toLowerCase();
    return Object.prototype.hasOwnProperty.call(TENANT_LOGO_PATHS, tenant) ? TENANT_LOGO_PATHS[tenant] : FRONT_LOGO_PATH;
}

/** front の URL を見る順 */
const FRONT_URL_ENV_NAMES = ['FRONT_END_URL', 'GHOST_FRONT_END_URL', 'MEMBERS_FRONTEND_URL', 'FRONTEND_URL', 'NEXT_PUBLIC_FRONT_URL'];

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string|null}
 */
function getFrontLogoUrl(env = process.env) {
    // 最初に値のある名前だけを使う（その値が http(s) でなくても次の名前には進まない）。
    // FRONT_END_URL が壊れていればメールのリンクも同じ値で壊れているので、ロゴだけ別のホストにしない
    const name = FRONT_URL_ENV_NAMES.find(key => String(env[key] || '').trim());
    const base = String(name ? env[name] : '').trim().replace(/\/+$/, '');
    if (!/^https?:\/\/[^\s"'<>]+$/i.test(base)) {
        return null;
    }
    return `${base}${frontLogoPath(env)}`;
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
    siteIconOrFrontLogo,
    frontLogoPath,
    FRONT_LOGO_PATH,
    TENANT_LOGO_PATHS,
    FRONT_URL_ENV_NAMES
};
