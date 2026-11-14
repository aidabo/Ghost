# メールのロゴを front のロゴに

Ghost が送るメールに入っている **Ghost の元のロゴ**（`static.ghost.org` の orb）を、**front（01-ghost-front）のロゴ**に替える。

## ロゴの URL

`services/lib/front-logo.js` の `getFrontLogoUrl()`:

- front の URL は `GHOST_FRONT_END_URL`、無ければ `FRONT_END_URL`（メールのリンクを front に替えるのと同じ値）。
- ロゴは `<front の URL>/apple-touch-icon.png`。front のこの道は、そのテナントのロゴの組（`GHOST_FRONT_ICON_SET`: `60-think`・`mars-times`・`think-estate`）の
  180x180 の正方形の画像へ転送する（front の `app/apple-touch-icon.png/route.ts`）。テナントごとに Ghost 側の設定は要らない。
- どちらも無い（`http(s)://` で始まらない）ときは `null`。メールは**今までの Ghost のロゴのまま**（試験のとき・設定し忘れのときに壊れない）。

## 替えたメール

| メール | ファイル | 今までのロゴ |
|---|---|---|
| スタッフの招待（アカウント作成も） | `services/mail/templates/invite-user.html` | ghost-orb-1 |
| API キーで作った招待 | `services/mail/templates/invite-user-by-api-key.html` | ghost-orb-1 |
| パスワードの再設定（リンク） | `services/mail/templates/reset-password.html` | ghost-orb-2 |
| サイトを作ったときの歓迎 | `services/mail/templates/welcome.html` | ghost-orb-3 |
| 連携の API の版違い | `services/api-version-compatibility/templates/generic-mismatch.html`・`zapier-mismatch.html` | ghost-orb-1 |
| 記事・会員の取り込みの終わり | `data/importer/email-template.js`・`services/members/importer/email-template.js` | ghost-orb-4 |
| 節目（会員 100 人など） | `services/staff/email-templates/new-milestone-received.hbs` | orb-email-head |
| 2FA の確認 | `services/auth/session/index.js` | サイトのアイコン、無ければ ghost-orb-1 → **無ければ front のロゴ** |
| スタッフへの知らせ（無料・有料の登録、解約、寄付、推薦） | `services/staff/StaffServiceEmails.js`（`getSiteIconUrl`） | サイトのアイコン、無ければロゴ無し → **無ければ front のロゴ** |

html の雛形（mail・api-version-compatibility）は `services/lib/EmailContentGenerator.js` が `frontLogoUrl` を渡し、雛形は `{{frontLogoUrl || '今までの Ghost のロゴ'}}` と書く。

## 替えていないもの

- ニュースレター（`ghost/email-service`）の「Powered by Ghost」: ニュースレターの設定（`show_badge`）で切る。ボタンの小さな絵はロゴではない。
- 会員のメール・コメント・メールアドレスの確認: ロゴの画像が無い。
- 招待メールの「… is using Ghost」などの文: ロゴとは別（必要なら別の PR）。

## 本番イメージ

`.docker/prd.Dockerfile` に `services/lib/front-logo.js`・`EmailContentGenerator.js`・`api-version-compatibility/templates`（元のイメージには無い）・
`data/importer/email-template.js`・`services/staff/StaffServiceEmails.js`・`new-milestone-received.hbs` の COPY と、build のときの確かめを足した
（mail・auth・members は前から COPY している）。

## 試験

`cd ghost/core && yarn test:base --timeout=60000 test/unit/server/services/lib/front-logo.test.js`
