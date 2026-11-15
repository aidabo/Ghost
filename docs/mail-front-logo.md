# メールのロゴを front のロゴに

Ghost が送るメールに入っている **Ghost の元のロゴ**（`static.ghost.org` の orb）を、**front（01-ghost-front）のロゴ**に替える。

## ロゴの URL

`services/lib/front-logo.js` の `getFrontLogoUrl()`。どれも**転送を挟まない** URL を書く（転送をたどらないメールソフトや検査装置でも出る）。上から順に選ぶ:

| 順 | ロゴ | いつ |
|---|---|---|
| 1 | front の `/settings`（アプリバー）で選んだ**ロゴの画像**。無ければ同じ画面の **favicon の画像** | Ghost の設定 `my_config`（JSON）の `logo.imageUrl`（`logo.mode` が `image` のとき）・`favicon.imageUrl` が `http(s)://` の絶対 URL。上げた画像は S3（CloudFront）にあり、front の `/public` には置かれない。`.ico`・`.svg` はメールソフトで出ないことがあるので使わない |
| 2 | `<front>/brand/<TENANT>/apple-touch-icon.png` | 環境変数 `TENANT` がある（英数字と `-` だけ）。front の `public/brand/<テナント名>/` の 180x180 の正方形。front はその組のフォルダが無いとき、同じ URL で共通の画像を 200 で返す（front の `app/brand/[set]/apple-touch-icon.png`、jibunsee-react #686） |
| 3 | `<front>/apple-touch-icon-180.png` | `TENANT` が無い。front の `public` 直下の共通の画像 |
| 4 | 今までの Ghost のロゴ | 1 が無く、front の URL も無い（試験のとき・設定し忘れのときに壊れない） |

- **ロゴのためにメールが送れなくなることは無い**: `getFrontLogoUrl()` は例外を投げない（設定 `my_config` が壊れている・読めない、env が無い・おかしい、どれも 4 か次の順になるだけ）。`TENANT` が無くてもエラーにならない。
- front の URL は、**メールのリンクと同じ `FRONT_END_URL` を先に**見る（同じメールのリンクとロゴの行き先がそろう）。無ければ `GHOST_FRONT_END_URL`、
  `MEMBERS_FRONTEND_URL`・`FRONTEND_URL`・`NEXT_PUBLIC_FRONT_URL`（`services/members/frontend-url.js` と同じ並び）の順。最初に値のある名前だけを使う。
- **本番で設定するもの**: `GHOST_FRONT_END_URL`（コンテナの `FRONT_END_URL`、サイトの URL）と `TENANT`（テナント名）。
  - janabiz: front の `scripts/tenant/deploy-app.mjs` がホストの `env-prd.sh` に書き、`tenants/janabiz/deploy/backend/docker-compose.yml` がコンテナに渡す（jibunsee-react #686）。
  - 60-think・thinkestate（このリポジトリの `yarn deploy` → `deploy-on-ec2.sh`）: `deploy-on-ec2.sh` が compose に `${TENANT}` を渡す。値は**配布のテナント**（`yarn deploy --tenant …` → SSM の `TENANT`）だけを使う（`env-prd.sh` に `TENANT` を書いても使われない）。
    **ホストの compose の ghost の `environment:` に `- TENANT=${TENANT}` を一度だけ足す**（compose はホストにあり、このリポジトリには無い）。
    足していないと、配布の最後に `[WARN] ghost has no TENANT` と出る（配布は止まらない。ロゴが共通の画像になるだけ）。
    compose に別の値が書いてあると `[WARN] ghost has TENANT=…, not this deploy's …` と出る。手で確かめるとき: `docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' ghost | grep '^TENANT='`
    compose が `env_file: .env.production` を読む作りなら、`.env.production` に `TENANT=…` を書くのでもよい。
- front の `brand` の組の名前はテナント名と同じ（`60-think`・`janabiz`・`thinkestate`）。テナントを足したら、front の `public/brand/<テナント名>/apple-touch-icon.png` を置く（置くまでは共通の画像）。
- スタッフへのお知らせと 2FA のメールは、Ghost のサイトのアイコン（Ghost の設定の icon）があればそれを先に使う（今までどおり）。

例（`FRONT_END_URL=https://janabiz.example.com`・`TENANT=janabiz`、`/settings` でロゴを選んでいないとき、招待メール）:

```html
<!-- 前 --> <img src="https://static.ghost.org/v4.0.0/images/ghost-orb-1.png" width="60" height="60" ... />
<!-- 後 --> <img src="https://janabiz.example.com/brand/janabiz/apple-touch-icon.png" width="60" height="60" ... />
```

配布の後に、ロゴの URL が転送なしで画像を返すかを確かめる（URL の打ち間違いや front の 404 は、全部のメールで画像が切れる）:

```bash
# -L を付けない。3xx も curl -f では成功になるので、status が 200 かを見る
for p in "/brand/$TENANT/apple-touch-icon.png" /apple-touch-icon-180.png; do
  printf '%s ' "$p"
  curl -sS -I -o /dev/null -w '%{http_code} %{content_type}\n' "$FRONT_END_URL$p"   # 200 image/png であること
done
```

`/settings` でロゴを選んでいるときは、その画像の URL（CloudFront）も同じように 200 を確かめる。

## 替えたメール

| メール | ファイル | 今までのロゴ |
|---|---|---|
| スタッフの招待（アカウント作成も） | `services/mail/templates/invite-user.html` | ghost-orb-1 |
| API キーで作った招待 | `services/mail/templates/invite-user-by-api-key.html` | ghost-orb-1 |
| パスワードの再設定（リンク） | `services/mail/templates/reset-password.html` | ghost-orb-2 |
| サイトを作ったときの歓迎 | `services/mail/templates/welcome.html` | ghost-orb-3 |
| 連携の API の版違い | `services/api-version-compatibility/templates/generic-mismatch.html`・`zapier-mismatch.html` | ghost-orb-1 |
| 記事・会員の取り込みの終わり | `data/importer/email-template.js`・`services/members/importer/email-template.js` | ghost-orb-4 |
| 節目（会員 100 人など） | `services/staff/email-templates/new-milestone-received.hbs` | orb-email-head → **サイトのアイコン → front のロゴ → orb**（ほかのスタッフへの知らせとそろえる） |
| 2FA の確認 | `services/auth/session/index.js` | サイトのアイコン → ghost-orb-1 だったものを、**サイトのアイコン → front のロゴ → ghost-orb-1** |
| スタッフへの知らせ（無料・有料の登録、解約、寄付、推薦） | `services/staff/StaffServiceEmails.js`（`getSiteIconUrl`） | サイトのアイコン → ロゴ無し だったものを、**サイトのアイコン → front のロゴ → ロゴ無し** |

「サイトのアイコン → front のロゴ → 予備」は `siteIconOrFrontLogo()`（`services/lib/front-logo.js`）1 か所で決める。

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

front の URL を環境に**置かずに**回す（置いたままだと `test/regression/api/admin/__snapshots__/authentication.test.js.snap` の歓迎メールなどが変わる）:

```bash
cd ghost/core && env -u FRONT_END_URL -u GHOST_FRONT_END_URL -u TENANT yarn test:base --timeout=60000 \
  test/unit/server/services/lib/front-logo.test.js \
  test/unit/server/services/lib/email-content-generator.test.js \
  test/unit/server/services/api-version-compatibility
```

`front-logo.test.js` は、雛形 6 つと取り込みの 2 つを組み立て、スタッフへの知らせ（無料の登録・節目）は本物の `notify…` を呼んで送るメールを見る。
