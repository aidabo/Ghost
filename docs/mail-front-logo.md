# メールのロゴを front のロゴに

Ghost が送るメールに入っている **Ghost の元のロゴ**（`static.ghost.org` の orb）を、**front（01-ghost-front）のロゴ**に替える。

## ロゴの URL

`services/lib/front-logo.js` の `getFrontLogoUrl()`:

- front の URL は、**メールのリンクと同じ `FRONT_END_URL` を先に**見る（同じメールのリンクとロゴの行き先がそろう）。無ければ `GHOST_FRONT_END_URL`、
  `MEMBERS_FRONTEND_URL`・`FRONTEND_URL`・`NEXT_PUBLIC_FRONT_URL`（`services/members/frontend-url.js` と同じ並び）の順。
- **本番で設定するもの**: ホストの `env-prd.sh` の `GHOST_FRONT_END_URL`（front の `scripts/tenant/deploy-app.mjs` がサイトの URL を入れる）。
  `tenants/<テナント>/deploy/backend/docker-compose.yml` が `FRONT_END_URL=${GHOST_FRONT_END_URL}` でコンテナに渡す。
- ロゴは、環境変数 **`TENANT`** で決まる front の画像を**直接**書く（転送を挟まない。転送をたどらないメールソフトや検査装置でも出る）。
  画像は front の `public/brand/<組>/` の 180x180 の正方形（front の `src/lib/siteIcons.ts` の apple と同じファイル）。

  | `TENANT` | ロゴの URL |
  |---|---|
  | `60-think` | `<front>/brand/60-think/apple-touch-icon-180.png` |
  | `thinkestate`（`think-estate` でも） | `<front>/brand/think-estate/apple-touch-icon.png` |
  | `janabiz`（`mars-times` でも） | `<front>/brand/mars-times/apple-touch-icon.png` |
  | 無い・上に無い名前 | `<front>/apple-touch-icon.png`（front が自分の組 `GHOST_FRONT_ICON_SET` へ転送する） |

  front でロゴの画像を足したり名前を変えたりしたら、`front-logo.js` の `TENANT_LOGO_PATHS` も直す。
- **本番**: Ghost のコンテナに `TENANT` を渡す（`tenants/<テナント>/deploy/backend/docker-compose.yml`）。渡していないと、上の表の最後の行（転送）になる。
- どれも無い（`http(s)://` で始まらない）ときは `null`。メールは**今までの Ghost のロゴのまま**（試験のとき・設定し忘れのときに壊れない）。

例（`FRONT_END_URL=https://janabiz.example.com`・`TENANT=janabiz` のとき、招待メール）:

```html
<!-- 前 --> <img src="https://static.ghost.org/v4.0.0/images/ghost-orb-1.png" width="60" height="60" ... />
<!-- 後 --> <img src="https://janabiz.example.com/brand/mars-times/apple-touch-icon.png" width="60" height="60" ... />
```

配布の後に、テナントごとにロゴの URL が画像を返すかを確かめる（URL の打ち間違いや front の 404 は、全部のメールで画像が切れる。
コードの予備は「設定が無い」ときだけ）:

```bash
# 転送なしで画像が返ること（-L を付けない。3xx も curl -f では成功になるので、status が 200 かを見る）
for p in /brand/60-think/apple-touch-icon-180.png /brand/think-estate/apple-touch-icon.png /brand/mars-times/apple-touch-icon.png; do
  printf '%s ' "$p"
  curl -sS -I -o /dev/null -w '%{http_code} %{content_type}\n' "$FRONT_END_URL$p"   # 200 image/png であること
done
```

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
