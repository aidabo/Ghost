// メールのロゴを、Ghost の元のロゴ（static.ghost.org の orb）から front（01-ghost-front）のロゴに替える。
//
// front の /apple-touch-icon.png は、そのテナントのロゴの組（GHOST_FRONT_ICON_SET: 60-think・mars-times・think-estate）の
// 180x180 の正方形の画像へ転送する（front の app/apple-touch-icon.png/route.ts）。メールにはその URL を書くだけで、
// テナントごとに正しいロゴが出る。
// front の URL は、メールのリンクと同じ FRONT_END_URL を先に見る（同じメールのリンクとロゴの行き先をそろえる）。
// 本番はホストの GHOST_FRONT_END_URL が compose でコンテナの FRONT_END_URL に入る（tenants/*/deploy/backend/docker-compose.yml）。
// 無ければ GHOST_FRONT_END_URL、会員の front の URL（services/members/frontend-url.js と同じ並び）の順。
// どれも無い（http(s) でない）ときは null を返し、呼ぶ側は今までの Ghost のロゴのままにする。

/** front のロゴの道（テナントのロゴへ転送される） */
const FRONT_LOGO_PATH = '/apple-touch-icon.png';

/** front の URL を見る順 */
const FRONT_URL_ENV_NAMES = ['FRONT_END_URL', 'GHOST_FRONT_END_URL', 'MEMBERS_FRONTEND_URL', 'FRONTEND_URL', 'NEXT_PUBLIC_FRONT_URL'];

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string|null}
 */
function getFrontLogoUrl(env = process.env) {
    const name = FRONT_URL_ENV_NAMES.find(key => String(env[key] || '').trim());
    const base = String(name ? env[name] : '').trim().replace(/\/+$/, '');
    if (!/^https?:\/\/[^\s"'<>]+$/i.test(base)) {
        return null;
    }
    return `${base}${FRONT_LOGO_PATH}`;
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
    FRONT_LOGO_PATH,
    FRONT_URL_ENV_NAMES
};
