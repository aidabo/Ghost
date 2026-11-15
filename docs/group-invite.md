# 家族・グループの招待（招待にグループ、履歴、登録したら招いた人が 1 回押して足す）

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

## 登録したら（`services/invitations/accept.js`）

- 招待は**消さずに `status: 'accepted'`（登録済み）として残す**（`schema.js` の `invites.status` に `accepted` を足した）。
  招いた人の招待の画面（front の `/dashboard?tab=invite`）の履歴に「登録済み」と出し、家族・グループの招待なら「グループに追加」を
  1 回押して足す（一員の API `POST /social/members/`。足せるのはグループの持ち主・管理者）。自動ではグループに入れない（ユーザーの決定 2026-11-15）。
- 受ける口・読む口・6 桁の口は `status: 'sent'` だけを見るので、登録済みの招待の token はもう使えない。
- 同じメールアドレスに招待し直すと、前の招待の行は消えて新しく作られる（今までどおり）。

## 招待を受けるページが token で 1 件読む口

- `GET /ghost/api/admin/authentication/invitation_info/?token=<メールのリンクの token>`（ログイン不要）
- 返すもの: `{"invitation_info": [{"kind": "user" | "family" | "group", "group_name": …, "invited_by": …}]}` だけ。メールアドレス・id は返さない。
  グループが active でなければ `kind: "user"`・`group_name: null`（そのグループには足せないので）。
- 無い・期限切れ・使い済みの token は同じ 404。token が無いと 422。
- 回数: IP ごとに 1 時間 100 回（`inviteInfoPerIp`、`spam.global_block`）。開くたびに数えるので多めにしてある。

## 本番イメージ

`services/invitations` を丸ごと COPY（`.docker/prd.Dockerfile`）。組み立ての最後に `group-invite.js`・migration・accept の `status: 'accepted'`・`inviteInfoPerIp`・schema の欄を確かめる。

## 試験

```bash
cd ghost/core && yarn test:base --timeout=60000 test/unit/server/services/invitations/group-invite.test.js
cd ghost/core && NODE_ENV=testing-mysql … yarn test:base --timeout=900000 test/e2e-api/admin/invitation-info.test.js
```
