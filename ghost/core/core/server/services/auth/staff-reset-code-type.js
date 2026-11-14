// tokens の表の、スタッフのパスワードの 6 桁の行の種類（services/auth/password-reset-code.js）。
// 会員のマジックリンクの確かめ（services/members/SingleUseTokenProvider.js）もこの値で断るので、1 か所に置く。
module.exports = {
    STAFF_RESET_CODE_TYPE: 'staff_reset_code'
};
