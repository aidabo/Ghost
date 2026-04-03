# Ghost Social API Reference

Use this file as the main reference for custom social APIs.

## Core files

- endpoints registry:
  - `ghost/core/core/server/api/endpoints/index.js`
- admin routes:
  - `ghost/core/core/server/web/api/endpoints/admin/custom-routes.js`
- schema:
  - `ghost/core/core/server/data/schema/schema.js`

## Shared Ghost rules

### Response shape

- `browse`
  - resource list
  - `meta.pagination` when needed
- `read`
  - same resource shape as one item from `browse`
- avoid custom nested wrappers

### Request shape

- add/edit body should use root-key arrays
- examples:
  - `socialgroups`
  - `socialbookmarks`
  - `socialaimediajobs`

### Route params and body

- `options.id`
  - path parameter for `/:id`
- `data.<docName>[0]`
  - body payload for add/edit
- query string
  - use `frame.options.*`

### Permissions

- prefer `permissions: true` for controller actions
- add role/object permissions through migration files
- keep user/group ownership and access checks in the endpoint flow when needed

## Main custom social API areas

### Groups

- endpoint:
  - `ghost/core/core/server/api/endpoints/social-groups.js`
- model:
  - `ghost/core/core/server/models/social-groups.js`

### Components / page builder

- admin endpoint:
  - `ghost/core/core/server/api/endpoints/social-components.js`
- public endpoint:
  - `ghost/core/core/server/api/endpoints/social-components-public.js`
- model:
  - `ghost/core/core/server/models/social-components.js`

### Gallery

- endpoint:
  - `ghost/core/core/server/api/endpoints/social-gallery.js`
- asset utility:
  - `ghost/core/core/server/api/endpoints/utils/social-media-assets.js`

### Bookmarks

- endpoint:
  - `ghost/core/core/server/api/endpoints/social-bookmarks.js`
- model:
  - `ghost/core/core/server/models/social-bookmarks.js`

### Follows

- endpoint:
  - `ghost/core/core/server/api/endpoints/social-follows.js`

### AI chats

- endpoint:
  - `ghost/core/core/server/api/endpoints/social-ai-chats.js`

### AI usages

- endpoint:
  - `ghost/core/core/server/api/endpoints/social-ai-usages.js`

### AI reminders

- endpoints:
  - `ghost/core/core/server/api/endpoints/social-ai-reminders.js`
  - `ghost/core/core/server/api/endpoints/social-ai-reminder-events.js`
- models:
  - `ghost/core/core/server/models/social-ai-reminders.js`
  - `ghost/core/core/server/models/social-ai-reminder-events.js`

### AI media jobs

- endpoint:
  - `ghost/core/core/server/api/endpoints/social-ai-media-jobs.js`
- model:
  - `ghost/core/core/server/models/social-ai-media-jobs.js`
- migration family:
  - `ghost/core/core/server/data/migrations/versions/5.116/`

## Recommended reading order

1. [README.md](./README.md)
2. [API_REFERENCE.md](./API_REFERENCE.md)
3. [summary-2026-02-18.md](./summary-2026-02-18.md)
4. [CUSTOM.md](./CUSTOM.md)
5. [LEGACY_NOTES.md](./LEGACY_NOTES.md)
