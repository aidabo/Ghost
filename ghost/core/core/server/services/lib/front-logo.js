// メールのロゴを、Ghost の元のロゴ（static.ghost.org の orb）から front（01-ghost-front）のロゴに替える。
//
// front の /apple-touch-icon.png は、そのテナントのロゴの組（GHOST_FRONT_ICON_SET: 60-think・mars-times・think-estate）の
// 180x180 の正方形の画像へ転送する（front の app/apple-touch-icon.png/route.ts）。メールにはその URL を書くだけで、
// テナントごとに正しいロゴが出る。
// front の URL は GHOST_FRONT_END_URL、無ければ FRONT_END_URL（Ghost のメールのリンクと同じ値）。
// どちらも無い（http(s) でない）ときは null を返し、呼ぶ側は今までの Ghost のロゴのままにする。

/** front のロゴの道（テナントのロゴへ転送される） */
const FRONT_LOGO_PATH = '/apple-touch-icon.png';

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string|null}
 */
function getFrontLogoUrl(env = process.env) {
    const base = String(env.GHOST_FRONT_END_URL || env.FRONT_END_URL || '').trim().replace(/\/+$/, '');
    if (!/^https?:\/\/[^\s"'<>]+$/i.test(base)) {
        return null;
    }
    return `${base}${FRONT_LOGO_PATH}`;
}

module.exports = {
    getFrontLogoUrl,
    FRONT_LOGO_PATH
};
