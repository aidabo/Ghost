// tokens の表の、スタッフの 6 桁の認証コードの行の種類。
// - staff_reset_code: パスワードを忘れたとき（services/auth/password-reset-code.js）
// - staff_invite_code: 自分で登録する「アカウント作成」の招待（services/auth/invitation-code.js）
// 会員のマジックリンクの確かめ（services/members/SingleUseTokenProvider.js）もこの値で断るので、1 か所に置く。
const STAFF_RESET_CODE_TYPE = 'staff_reset_code';
const STAFF_INVITE_CODE_TYPE = 'staff_invite_code';

module.exports = {
    STAFF_RESET_CODE_TYPE,
    STAFF_INVITE_CODE_TYPE,
    /** スタッフの認証コードの行の種類（会員のマジックリンクとしては使わせない） */
    STAFF_CODE_TYPES: [STAFF_RESET_CODE_TYPE, STAFF_INVITE_CODE_TYPE]
};
