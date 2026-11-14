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

- [social-api/README.md](./social-api/README.md)
- [CUSTOM.md](./social-api/CUSTOM.md)
- [summary-2026-02-18.md](./social-api/summary-2026-02-18.md)

Use these for:

- Ghost custom admin/content API notes
- social API design and migration notes
- backend functional reports for custom work
