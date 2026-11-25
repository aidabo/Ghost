# Ghost Custom Docs Index

Use this directory as the entry point for Ghost custom backend notes.

## Standard upstream docs

These remain at repo root:

- [README.md](../README.md) — this fork's own README (Japanese), not the upstream one
- [SECURITY.md](../SECURITY.md)
- [PRIVACY.md](../PRIVACY.md)

## Custom social API docs

- [operations-docker-admin-build.md](./operations-docker-admin-build.md) — 本番DockerでのAdmin bundle反映方法と継続課題
- [staff-password-reset-code.md](./staff-password-reset-code.md) — スタッフのパスワードをメールの 6 桁のコードで決め直す（`password_reset_code`、ref と組、tokens の表、回数の制限）
- [members-signin-code.md](./members-signin-code.md) — 会員のログイン・登録をメールの 6 桁のコードで（`includeOTC`・`/members/api/verify-otc`、回数の制限、本番イメージの COPY）
- [staff-signup-code.md](./staff-signup-code.md) — スタッフの「アカウント作成」の招待に 6 桁の認証コード（`include_code`・`/authentication/invitation_code`、合えば招待の token、回数の制限）
- [mail-front-logo.md](./mail-front-logo.md) — メールの Ghost のロゴを front のロゴに（転送なし: front の /settings で選んだロゴ → `<front>/brand/<TENANT>/apple-touch-icon.png` → 共通の画像）。本番の `TENANT` の渡し方、替えたメールの一覧、本番イメージの COPY
- [mail-i18n.md](./mail-i18n.md) — メールを画面の言葉（ja・en・zh）で。`mailT(locale)`（言葉ごとの i18next、失敗しても英語で作る）、招待のメールの `copy` の約束、本番イメージの COPY
- [group-invite.md](./group-invite.md) — 家族・グループの招待: `invites.group_id`、招けるのは持ち主・管理者（サーバーの鍵は確かめた人を `invited_by` で名指し）、登録したらそのグループへ、token で 1 件読む `invitation_info`
- [video-job-budget.md](./video-job-budget.md) — 動画の job の費用の上限を Ghost で数える（月はサイトの時間帯・既定 30 USD・`reserve-cost`・顔は秒ごとの見込み）

- [social-api/README.md](./social-api/README.md)
- [CUSTOM.md](./social-api/CUSTOM.md)
- [summary-2026-02-18.md](./social-api/summary-2026-02-18.md)

Use these for:

- Ghost custom admin/content API notes
- social API design and migration notes
- backend functional reports for custom work
