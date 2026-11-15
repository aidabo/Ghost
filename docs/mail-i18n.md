# メールを画面の言葉（日本語・英語・中国語）で

計画は jibunsee-react の `docs/planning/mail-i18n.md`。ここは Ghost 側の作りの約束。

## 言葉の決め方（`services/lib/mail-i18n.js`）

- `mailLanguage(locale)`: 画面の言葉が `ja`・`en`・`zh`（`zh-CN` などは `zh`）ならそれ。それ以外・無しは**サイトの言葉**（`settings.locale`）、それも無ければ `en`。
- 画面の言葉の一覧は `SCREEN_LOCALES` の 1 か所。招待の API の `?locale=` の検査もここを使う。6 桁の認証コードのメール（`services/auth/invitation-code.js`・`password-reset-code.js` の `MAIL_TEXT`）も同じ 3 つを持つ（`invite-mail-i18n.test.js` が、どちらの `_MAIL_TEXT` の言葉も `SCREEN_LOCALES` と過不足なく同じことを見る）。
- `mailT(locale)`: その言葉の `t`。言葉ごとに別の i18next を作って覚える。サイト全体の `t`（`services/i18n.js`）と `changeLanguage` は使わない（同時に来た別の人のメールの言葉が混ざらない）。
- **例外を投げない**: 言葉の表が使えないなど何が失敗しても、英語の文（キー）に値を差し込んで返す。メールは必ず作る。
- 言葉の表は `ghost/i18n/locales/<言語>/ghost.json`。キーは英語の文。ja・zh は訳を入れる。ほかの言語は `yarn translate`（`ghost/i18n`）が空で足す＝英語のまま出る（`zh-Hant` も今は英語）。

## 招待のメール（`services/invites/invite-mail-copy.js`）

- `Invites.add` が招待の API の `locale` で `inviteMailCopy()` を呼び、雛形（`services/mail/templates/invite-user.html`・`invite-user-by-api-key.html`）に `copy` として渡す。
- 雛形の中では訳さない（lodash の `{{ }}` と i18next の `{{ }}` がぶつかる）。雛形は `{{copy.lead}}` のように差し込むだけ。
- `copy` の約束: `subject` は**文**（エスケープしない。メールの件名）、`title`・`heading`・`lead`・`action`・`button`・`help`・`closing` は **HTML に入れる文**（差し込んだ名前・サイト名はエスケープ済み、メールのアドレスはリンク）、`footer(siteUrl, recipientEmail)` は雛形が呼ぶ関数。
- `EmailContentGenerator` は `copy` が無いとき空にする（ほかの雛形で落ちないように）。

## 会員のメール（ログイン・登録のリンク＋6 桁、メールアドレスの変更の確認）

- front が `POST /members/api/send-magic-link/`（M1）と `POST /members/api/member/email/`（M2）の body に `locale` を足す。
- `members-api` の `RouterController`・`MemberController` が `screenLocale(req.body.locale)`（`lib/screen-locale.js`。言葉の形でなければ無し）を
  `sendEmailWithMagicLink` → `MagicLink.sendMagicLink` に渡す。`MagicLink` は言葉があるときだけ `getSubject(type, otc, locale)`・
  `getText(…, otc, locale)`・`getHTML(…, otc, locale)` と後ろに足す（言葉が無いときの引数は今までと同じ）。
- `services/members/api.js` の `getSubject`・`getText`・`getHTML` が `tFor(locale)` で `t` を選ぶ: 言葉があれば `mailT(locale)`、無ければ**今までのサイトの `t`**。
  6 桁の欄（`otcSubject`・`otcText`・`addOtcToHtml`）も同じ `t`。
- 有料の登録の確認（`signup-paid`）は Stripe の webhook から（`members-api` の `StripeService`）`locale` 無しで送るので、**サイトの言葉のまま**。

## 本番イメージ（`.docker/prd.Dockerfile`）

- `services/lib/mail-i18n.js`・`node_modules/@tryghost/members-api/lib/screen-locale.js` を COPY（`members-api` のコントローラー・`members-api.js`・`MagicLink.js`・`services/members` は前から COPY）。`services/invites`・`services/mail`・`ghost/i18n/locales` は丸ごと COPY 済み。
- 組み立ての最後に、`mail-i18n.js` があること、`Invites.js` が `inviteMailCopy` を使うこと、雛形が `copy.lead` を使うこと、ja の `ghost.json` に招待のキーがあることを確かめる。

## 試験

```bash
cd ghost/core && env -u FRONT_END_URL -u GHOST_FRONT_END_URL -u MEMBERS_FRONTEND_URL -u TENANT yarn test:base --timeout=60000 \
  test/unit/server/services/invites/invite-mail-i18n.test.js test/unit/server/services/mail/templates-no-ghost.test.js
# 会員のメール（MySQL）
cd ghost/core && NODE_ENV=testing-mysql … yarn test:base --timeout=900000 test/e2e-api/members/member-mail-i18n.test.js
cd ghost/i18n && yarn translate   # 新しいキーを足したら。差分が出なければ CI（failOnUpdate）でも通る
```
