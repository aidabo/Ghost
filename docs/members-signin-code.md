# 会員のログイン・登録を、メールの 6 桁のコードで（verify-otc）

**状態:** aidabo/Ghost #63。画面（front）は aidabo/jibunsee-react の `MemberAuthPanel`（計画 `docs/planning/staff-password-reset-code.md` §8、PR E）。
スタッフのパスワードの 6 桁は別の口（#62、`POST/PUT /ghost/api/admin/authentication/password_reset_code`）。

会員はパスワードが無く、メールのリンク（マジックリンク）で入る。携帯でメールを開くとリンクが携帯のブラウザで開き、
パソコンの画面では入れない人がいるので、**メールを開かずに、携帯の通知（件名）の 6 桁を今の画面に入れれば入れる**ようにした。
名前は upstream の Ghost（6 系、2025-10 の「one-time codes for sign in」）に合わせた。

## 口

| 口 | 本文 | 応答 |
|---|---|---|
| `POST /members/api/send-magic-link/`（今の口） | 今の本文 + `includeOTC: true` | `201 {"otc_ref": "<24 文字の小文字の 16 進>"}`。`includeOTC` が無ければ今までどおり `201 Created.` |
| `POST /members/api/verify-otc` | `{ "otcRef": "...", "otc": "123456" }`（`integrityToken` は send と同じ扱い） | 合えば `200 {"success": true}` と会員の cookie（`ghost-members-ssr`）。合わなければ `400`（どこが違うかは言わない）、回数を超えると `429` |

- **6 桁:** 使い捨て token（`tokens` の表の行）から `HMAC-SHA256(members_email_auth_secret, "<行の id>:<token>")` を 10 進の 6 桁に。**保存しない**（表は増やさない）。
  `members_email_auth_secret` を回すと、出ている 6 桁は全部使えなくなる。
- **メール:** 件名の頭に 6 桁（`{{code}} is your sign-in code for {{siteTitle}}`、登録は sign-up。i18n の ja・zh に訳あり）、本文に 6 桁と「10 分以内に」。リンクも今どおり入る。
- **token はブラウザに返さない。** upstream は `redirectUrl`（token 入り）を返すが、ここでは Ghost の中で token をセッションに替えて cookie を付ける（履歴やログに token を残さない）。登録なら、今のリンクと同じく会員を作る。
- **6 桁で入れる条件:** token を作ってから **10 分以内**（リンクは 24 時間）、かつ **まだ一度も使われていない**（`used_count` が 0）。合ったときに `used_count` を 0 → 1 に一度で替える（同じ 6 桁を同時に送っても通るのは 1 つ）。
  - **注意:** メールのリンクを自動で開く仕組み（会社のメールの安全確認など）が先にリンクを開くと、その token は「使われた」になり、6 桁は通らない。そのときはリンクで入る。
- **送り直し:** 送るたびに新しい token と `otc_ref`。前の 6 桁は 10 分で切れるまで残す（届くのは同じメールボックスだけ）。
- **`otc_ref`:** 正しい形（24 文字の小文字の 16 進）以外は引く前に断る（MySQL は大文字・小文字や後ろの空白を同じ行として引くため）。

## 回数の制限（`web/shared/middleware/brute.js`）

| 何を | 鍵 | 上限 |
|---|---|---|
| 6 桁つきで送る | メールごと（IP によらない）`memberOtcSendPerEmail` | `spam.user_reset`（`freeRetries` 4、超えると 1 時間待ち） |
| 確かめる | IP ごと `memberOtcVerifyPerIp` | `spam.user_verification`（`freeRetries` 4、超えると 1 時間待ち） |
| 確かめる | `otc_ref` ごと（IP によらない。形の違う ref は 1 つの鍵）`memberOtcVerifyPerRef` | 同上 |

今の `membersAuth`・`membersAuthEnumeration`（送る口）もそのまま。

6 桁の送る・確かめるの制限は `api/spam-prevention.js` の `codeAttempts('send' | 'verify')`（スタッフの 6 桁も同じもの）。
数は今の設定（送る = `spam.user_reset`、確かめる = `spam.user_verification`）を使い、新しい設定は足さない。

- **設定は共有**: `spam.user_reset` は今のリンクでのパスワード再設定の制限と、`spam.user_verification` はスタッフの新しい端末の確認（メールの確認コード）の制限と同じ値を使う。さらにスタッフの 6 桁と会員の 6 桁の両方がこれを使う。どちらかの値を変えると、これら全部の回数が変わる。
- **設定を変えたら再起動**: `spamPrevention.reset()` は設定を読み直して作り直すが、呼ぶのは試験だけ。本番で `spam.*` を変えたときは Ghost を再起動して効かせる。
- `codeAttempts` に `'send'`・`'verify'` 以外を渡すと例外（書き間違えを別の上限で黙って数えない）。
上限を超えたときの 429 の文:

| | 文 |
|---|---|
| 送る | `Too many codes requested for this email. Please wait a while and try again.` |
| 確かめる | `Too many tries with the code. Please wait a while and try again.` |

## 本番のイメージ

`.docker/prd.Dockerfile` は書いたファイルだけを上書きする。この機能のために `services/members`・`web/shared/middleware/brute.js`・`web/shared/middleware/api/spam-prevention.js` と、
node_modules の `@tryghost/members-api/lib/members-api.js`・`@tryghost/magic-link/lib/MagicLink.js`・`@tryghost/i18n/locales` を COPY している。
配布の前に `yarn docker:next:build` で起動まで確かめる。

## 試験

`ghost/core/test/e2e-api/members/verify-otc.test.js`（MySQL で。SQLite は fork の init フックで落ちる）:
```
cd ghost/core
NODE_ENV=testing-mysql database__connection__password=ghost database__connection__database=ghost_testing_otc \
  yarn test:base --timeout=900000 test/e2e-api/members/verify-otc.test.js test/e2e-api/admin/password-reset-code.test.js
```
（2 つ目はスタッフの 6 桁。[staff-password-reset-code.md](./staff-password-reset-code.md)）
