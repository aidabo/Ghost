# 家族・グループの招待（招待にグループ、登録したらそのグループへ）

計画は jibunsee-react の `docs/planning/invite-links.md`（D3・D4・D5・D10）。ここは Ghost 側の約束。

## 招待にグループ（`invites.group_id`）

- `schema.js` の `invites.group_id`（nullable）。今ある DB には migration `5.116/2026-11-15-00-00-00-add-invites-group-id.js`（新しい DB は schema.js から）。
- 無ければ一般ユーザーの招待。あれば家族（グループの `type` が `family`）またはグループの招待。

## 誰がグループの招待を作れるか（`services/invitations/group-invite.js`、入力の検査 `validators/input/invites.js`）

| 要求 | 招く人 | 確かめること |
|---|---|---|
| ブラウザのログイン（`context.user`） | その人 | `canManageGroupMembers`（グループの Owner・Admin、作った人、サイトの管理者） |
| サーバーの鍵（連携、`context.integration`）＋ `invited_by` | 名指しされた人 | **そのグループ自身の**管理者（作った人、またはグループの Owner・Admin の一員）。サイトの Owner などの近道は使わない |
| どちらでもない（招く人が分からない） | — | 断る（403） |

- front は家族の持ち主（ふつう Author、自分ではスタッフの招待を作れない）の代わりに、サーバーの鍵で招待を送る。
  そのとき、ブラウザの Ghost のセッションで確かめた人の id を `invited_by` に入れる（front の `/api/invites/group`）。
- `invited_by` は保存しない。招待の記録の `created_by` と、メールの「… さんから」・Reply-To がその人になる（`resolveInviter`）。
- 鍵を持つサーバーは名指しを信じてもらえる。鍵は front などのサーバーだけが持つ秘密（同梱の連携は、もともとスタッフの招待を作れる）。
- 配布: Ghost と front をそろえて出す。Ghost だけ新しく front が古いと、front はグループを付けないので今までどおり（グループには入らない）。
  front だけ新しく Ghost が古いと、Ghost は `group_id`・`invited_by` を知らずに捨てる（今までどおり）。

## 登録したらそのグループへ（`services/invitations/accept.js`）

- 招待に `group_id` があり、グループが active なら、登録した人をそのグループの一員（Social Group Member）にする。すでに一員なら何もしない。

## 招待を受けるページが token で 1 件読む口

- `GET /ghost/api/admin/authentication/invitation_info/?token=<メールのリンクの token>`（ログイン不要）
- 返すもの: `{"invitation_info": [{"kind": "user" | "family" | "group", "group_name": …, "invited_by": …}]}` だけ。メールアドレス・id は返さない。
  グループが active でなければ `kind: "user"`・`group_name: null`（登録してもそのグループには入らないので）。
- 無い・期限切れ・使い済みの token は同じ 404。token が無いと 422。
- 回数: IP ごとに 1 時間 100 回（`inviteInfoPerIp`、`spam.global_block`）。開くたびに数えるので多めにしてある。

## 本番イメージ

`services/invitations` を丸ごと COPY（`.docker/prd.Dockerfile`）。組み立ての最後に `group-invite.js`・migration・`joinInvitedGroup`・`inviteInfoPerIp`・schema の欄を確かめる。

## 試験

```bash
cd ghost/core && yarn test:base --timeout=60000 test/unit/server/services/invitations/group-invite.test.js
cd ghost/core && NODE_ENV=testing-mysql … yarn test:base --timeout=900000 test/e2e-api/admin/invitation-info.test.js
```
