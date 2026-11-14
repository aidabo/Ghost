# スタッフのパスワードを、メールの 6 桁のコードで決め直す（password_reset_code）

**状態:** aidabo/Ghost #62（口）と、その直し（6 桁を「送る」を頼んだときにだけ作る）。画面（front）は aidabo/jibunsee-react の
`LoginAndInvitesDialog`（計画 `docs/planning/staff-password-reset-code.md` §3・§4、PR C）。会員の 6 桁は [members-signin-code.md](./members-signin-code.md)。

## 口

| 口 | 本文 | 応答 |
|---|---|---|
| `POST /ghost/api/admin/authentication/password_reset_code/` | `{ "password_reset_code": [{ "email": "...", "locale": "ja" }] }` | `200 { "password_reset_code": [{ "message": "...", "ref": "<32 文字>" }] }`。登録の無いメールでも同じ形の `ref` を返す（メールも行も作らない） |
| `PUT /ghost/api/admin/authentication/password_reset_code/` | `{ "password_reset_code": [{ "email", "ref", "code", "newPassword", "ne2Password" }] }` | 合えば `200` でパスワードが変わる（`status` は `active` に）。合わなければ `400`（どこが違うかは言わない）、回数を超えると `429` |

- **6 桁は「送る」を頼んだときにだけ作る**（`crypto.randomInt`）。頼んでいないのに当てに行くことはできない（前の形は計算で決まる totp で、黙って推測を続けられた）。
- **6 桁そのものは保存しない。** 今の `tokens` の表（会員のマジックリンクと同じ表。表は増やさない）に、`token` = `ref`、`data` = `{ type: 'staff_reset_code', user_id, code_hash }` の行を作る。
  `code_hash` = `HMAC-SHA256(admin_session_secret, "<ref>:<6 桁>")`。古い行は Ghost の `clean-tokens` の job が 24 時間で消す。
- 使えるのは**作ってから 10 分**、間違えは**5 回まで**（行の `used_count` で数える）。合ったら**行を消す**（同じ 6 桁はもう使えない）。メールの人と行の人が違えば断る。
- メールには 6 桁（件名の頭）と今の再設定リンク（24 時間）の両方。どちらかでパスワードを変えると、もう片方も使えない（リンクはパスワードの hash から作るため、6 桁は行を消すため）。
- 会員のマジックリンクの確かめ（`SingleUseTokenProvider.validate`）は、`type: 'staff_reset_code'` の行を断る。
- 送る口の応答は、ユーザーを引く・行を作る・送るを全部待たずに返す（登録の有無で応答の時間が変わらない）。

## 回数の制限（`web/shared/middleware/brute.js`）

| 何を | 鍵 |
|---|---|
| 送る | IP ごと（`globalReset`）、メールごと（IP によらない `resetCodeSendPerEmail`） |
| 確かめる | IP ごと（`resetCodeVerifyPerIp`）、メールごと（IP によらない `resetCodeVerifyPerEmail`） |

## 本番のイメージ

`.docker/prd.Dockerfile` に `services/auth`・`services/members`・`web/shared/middleware/brute.js` の COPY がある（書いたファイルだけが上書きされる）。

## 試験

```
cd ghost/core
NODE_ENV=testing-mysql database__connection__password=ghost database__connection__database=ghost_testing_otc \
  yarn test:base --timeout=900000 test/e2e-api/admin/password-reset-code.test.js
```
