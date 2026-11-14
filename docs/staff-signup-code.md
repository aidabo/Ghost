# スタッフの「アカウント作成」の招待に 6 桁の認証コード

計画: jibunsee-react `docs/planning/staff-signup-code.md`。作りは [staff-password-reset-code.md](./staff-password-reset-code.md) と同じ（表は増やさない）。

## 口

| 口 | 中身 |
|---|---|
| `POST /ghost/api/admin/invites/?include_code=true&locale=ja` | 印があるときだけ、`Invites.add` が招待を作った後・メールを送る前に 6 桁を作る（`services/auth/invitation-code.js` の `createCode`）。件名の頭に認証コード、本文の頭に認証コード（今のリンクもそのまま）。応答の招待に `code_ref`。`locale` は `ja`・`en`・`zh`（無ければサイトの言語）。印が無ければ今までどおり（家族・管理者の招待） |
| `POST /ghost/api/admin/authentication/invitation_code/` `{invitation_code: [{email, ref, code}]}` | 認証なし。合えば `{invitation_code: [{token}]}`。`token` はメールのリンクの `/signup/` の後ろと同じ値（`encodeBase64(招待の token)`）。登録は今の `POST /authentication/invitation` |

- `tokens` の行: `token` = ref（でたらめ。招待の token とは別）、`data` = `{type: 'staff_invite_code', invite_id, code_hash}`。
  `code_hash` = `HMAC-SHA256(admin_session_secret, "ref:<招待の token>:<6 桁>")`。6 桁そのものは保存しない。
- 使えるのは作ってから 10 分・間違えは 5 回まで（`used_count`）・合ったら行を消す（1 回きり）。招待のメールが違う・招待が切れた・消えた（送り直すと前の招待は消える）も同じ 400。
- `staff_invite_code` の行は、パスワードの再設定（`staff_reset_code` だけを通す）と会員のマジックリンク（`STAFF_CODE_TYPES` を断る）では通らない。
- メールを送れなかったら、作った行も消す（招待そのものの扱いは今までどおり）。

## 回数の制限（`web/shared/middleware/brute.js`、`codeAttempts`）

| | 数え方 |
|---|---|
| 認証コードつきで送る（`include_code=true` のときだけ） | IP ごと `inviteCodeSendPerIp`・メールごと `inviteCodeSendPerEmail`（`spam.user_reset`） |
| 確かめる | IP ごと `inviteCodeVerifyPerIp`・メールごと `inviteCodeVerifyPerEmail`（`spam.user_verification`） |

IP は `req.ip`（`trust proxy`）。front の `/api/invites` は Next のサーバーから呼ぶので、利用者の IP を `X-Forwarded-For` に **1 つだけ**（ALB が足した最後の値）入れて渡す。

## 本番のイメージ

`.docker/prd.Dockerfile` に `services/invites` の COPY を足した（`services/auth`・`brute.js`・`api/endpoints`・admin の routes は前から）。ビルドの時に `invitation-code.js`・`Invites.js` の `invitationCode`・`brute.js` の `inviteCodeVerifyPerEmail` を確かめる。

## 試験

`ghost/core/test/e2e-api/admin/invitation-code.test.js`（MySQL）:

```sh
cd ghost/core
NODE_ENV=testing-mysql database__connection__password=ghost database__connection__database=ghost_testing_otc \
  yarn test:base --timeout=900000 test/e2e-api/admin/invitation-code.test.js
```
