# Ghost Social API Reference

Use this file as the main reference for custom social APIs.

Source of truth for admin routes:

- `ghost/core/core/server/web/api/endpoints/admin/custom-routes.js`

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

## Admin route catalog

All routes below are based on `custom-routes.js`.

### Bookmarks

- base:
  - `/ghost/api/admin/social/bookmarks`
- endpoint export:
  - `api.socialBookmarks`
- permission object:
  - `socialbookmark`
- routes:
  - `GET /social/bookmarks`
  - `GET /social/bookmarks/:id`
  - `POST /social/bookmarks`
  - `DELETE /social/bookmarks/:id`
- root key:
  - `socialbookmarks`

### Forwards

- base:
  - `/ghost/api/admin/social/forwards`
- endpoint export:
  - `api.socialForwards`
- permission object:
  - `socialforward`
- routes:
  - `GET /social/forwards`
  - `GET /social/forwards/:id`
  - `POST /social/forwards`
  - `DELETE /social/forwards/:id`
- root key:
  - `socialforwards`

### Follows

- base:
  - `/ghost/api/admin/social/follows`
- endpoint export:
  - `api.socialFollows`
- permission object:
  - `socialfollow`
- routes:
  - `GET /social/follows`
  - `GET /social/follows/:id`
  - `POST /social/follows`
  - `DELETE /social/follows/:id`
- root key:
  - `socialfollows`

### Favors

- base:
  - `/ghost/api/admin/social/favors`
- endpoint export:
  - `api.socialFavors`
- permission object:
  - `socialfavor`
- routes:
  - `GET /social/favors`
  - `GET /social/favors/:id`
  - `POST /social/favors`
  - `DELETE /social/favors/:id`
- root key:
  - `socialfavors`

### Groups

- base:
  - `/ghost/api/admin/social/groups`
- endpoint export:
  - `api.socialGroups`
- permission object:
  - `socialgroup`
- routes:
  - `GET /social/groups`
  - `GET /social/groups/:id`
  - `GET /social/groups_count`
  - `POST /social/groups`
  - `PUT /social/groups/:id`
  - `DELETE /social/groups/:id`
- root key:
  - `socialgroups`

### Members

- base:
  - `/ghost/api/admin/social/members`
- endpoint export:
  - `api.socialGroupMembers`
- permission object:
  - `socialgroupmember`
- routes:
  - `GET /social/members`
  - `GET /social/members/:id`
  - `POST /social/members`
  - `PUT /social/members/:id`
  - `DELETE /social/members/:id`
- root key:
  - `socialgroupmembers`

### Comments

- base:
  - `/ghost/api/admin/social/comments`
- endpoint exports:
  - `api.socialComments`
  - `api.socialCommentReplies`
  - `api.socialCommentReports`
- permission objects:
  - `socialpostcomment`
  - `socialpostcommentlike`
  - `socialpostcommentreport`
- routes:
  - `GET /social/comments/post/:post_id`
  - `GET /social/comments/:id/replies`
  - `POST /social/comments/post`
  - `GET /social/comments/:id`
  - `PUT /social/comments/:id`
  - `POST /social/comments/:id/like`
  - `POST /social/comments/:id/unlike`
  - `POST /social/comments/:id/report`
  - `GET /social/comments/counts/:ids`
  - `GET /social/comments/status/:post_id`
  - `PUT /social/comments/:id/status`
  - `GET /social/comments/:id/new-replies`

### Components / page builder

- base:
  - `/ghost/api/admin/social/components`
- endpoint export:
  - `api.socialComponents`
- permission object:
  - `socialcomponent`
- routes:
  - `GET /social/components`
  - `GET /social/components/:id`
  - `POST /social/components`
  - `PUT /social/components/:id`
  - `DELETE /social/components/:id`
- root key:
  - `socialcomponents`

### Post components

- base:
  - `/ghost/api/admin/social/postcomponents`
- endpoint export:
  - `api.socialPostComponents`
- permission object:
  - `socialpostcomponent`
- routes:
  - `GET /social/postcomponents`
  - `GET /social/postcomponents/:id`
  - `POST /social/postcomponents`
  - `PUT /social/postcomponents/:id`
  - `DELETE /social/postcomponents/:id`
- root key:
  - `socialpostcomponents`

### User logs

- base:
  - `/ghost/api/admin/social/userlogs`
- endpoint export:
  - `api.socialUserLogs`
- permission object:
  - `socialuserlog`
- routes:
  - `GET /social/userlogs`
  - `GET /social/userlogs/:id`
  - `POST /social/userlogs`
  - `PUT /social/userlogs/:id`
  - `DELETE /social/userlogs/:id`
- root key:
  - `socialuserlogs`

### Gallery

- base:
  - `/ghost/api/admin/social/gallery`
- endpoint export:
  - `api.socialGallery`
- routes:
  - `GET /social/gallery/user`
  - `GET /social/gallery/group`
  - `GET /social/gallery/group/:id`
  - `POST /social/gallery/presign`
  - `POST /social/gallery/finalize`
  - `POST /social/gallery/sync-tags`

### AI chats

- base:
  - `/ghost/api/admin/social/ai/chats`
- endpoint export:
  - `api.socialAiChats`
- permission object:
  - `socialaichat`
- routes:
  - `GET /social/ai/chats`
  - `GET /social/ai/chats/:id`
  - `POST /social/ai/chats`
  - `DELETE /social/ai/chats/:id`
- root key:
  - `socialaichats`

### AI devices

- base:
  - `/ghost/api/admin/social/ai/devices`
- endpoint export:
  - `api.socialAiDevices`
- permission object:
  - `socialaidevice`
- routes:
  - `GET /social/ai/devices`
  - `POST /social/ai/devices`
  - `PUT /social/ai/devices/:id`
  - `DELETE /social/ai/devices/:id`

### AI SMS logs

- base:
  - `/ghost/api/admin/social/ai/sms-logs`
- endpoint export:
  - `api.socialAiSmsLogs`
- permission object:
  - `socialaismslog`
- routes:
  - `GET /social/ai/sms-logs`
  - `POST /social/ai/sms-logs`

### AI usages

- base:
  - `/ghost/api/admin/social/ai/usages`
- endpoint export:
  - `api.socialAiUsages`
- routes:
  - `GET /social/ai/usages`
  - `GET /social/ai/usages/:id`
- root key:
  - `socialaiusages`

### AI reminders

- base:
  - `/ghost/api/admin/social/ai/reminders`
- endpoint export:
  - `api.socialAiReminders`
- routes:
  - `GET /social/ai/reminders`
  - `GET /social/ai/reminders/:id`
  - `POST /social/ai/reminders`
  - `PUT /social/ai/reminders/:id`
- root key:
  - `socialaireminders`

### AI reminder events

- base:
  - `/ghost/api/admin/social/ai/reminder-events`
- endpoint export:
  - `api.socialAiReminderEvents`
- routes:
  - `GET /social/ai/reminder-events`
  - `POST /social/ai/reminder-events`
- root key:
  - `socialaireminderevents`

### AI reminder dispatch

- base:
  - `/ghost/api/admin/social/ai/reminders/dispatch`
- endpoint export:
  - `api.socialAiReminderDispatch`
- routes:
  - `GET /social/ai/reminders/dispatch`

### AI user phones

- base:
  - `/ghost/api/admin/social/ai/user-phones`
- endpoint export:
  - `api.socialAiUserPhones`
- permission object:
  - `socialaiuserphone`
- routes:
  - `GET /social/ai/user-phones`
  - `POST /social/ai/user-phones`
  - `PUT /social/ai/user-phones`

### AI agent settings

- base:
  - `/ghost/api/admin/social/ai/agent-settings`
- endpoint export:
  - `api.socialAiAgentSettings`
- permission object:
  - `socialaiagentsetting`
- routes:
  - `GET /social/ai/agent-settings`
  - `GET /social/ai/agent-settings/:id`
  - `POST /social/ai/agent-settings`
  - `PUT /social/ai/agent-settings/:id`
- root key:
  - `socialaiagentsettings`

### AI media jobs

- base:
  - `/ghost/api/admin/social/ai/media/jobs`
- endpoint export:
  - `api.socialAiMediaJobs`
- permission object:
  - `socialaimediajob`
- routes:
  - `GET /social/ai/media/jobs`
  - `GET /social/ai/media/jobs/:id`
  - `POST /social/ai/media/jobs`
  - `PUT /social/ai/media/jobs/:id`
  - `POST /social/ai/media/jobs/:id/cancel`
  - `POST /social/ai/media/jobs/:id/retry`
  - `POST /social/ai/media/jobs/claim`
  - `POST /social/ai/media/jobs/:id/progress`
  - `POST /social/ai/media/jobs/:id/complete`
  - `POST /social/ai/media/jobs/:id/fail`
- root key:
  - `socialaimediajobs`

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

### Forwards

- endpoint:
  - `ghost/core/core/server/api/endpoints/social-forwards.js`

### Favors

- endpoint:
  - `ghost/core/core/server/api/endpoints/social-favors.js`

### Members

- endpoint:
  - `ghost/core/core/server/api/endpoints/social-group-members.js`

### Comments

- endpoints:
  - `ghost/core/core/server/api/endpoints/social-comments.js`
  - `ghost/core/core/server/api/endpoints/social-comment-reports.js`
  - `ghost/core/core/server/api/endpoints/social-comment-replies.js`

### AI chats

- endpoint:
  - `ghost/core/core/server/api/endpoints/social-ai-chats.js`

### AI devices

- endpoint:
  - `ghost/core/core/server/api/endpoints/social-ai-devices.js`

### AI SMS logs

- endpoint:
  - `ghost/core/core/server/api/endpoints/social-ai-sms-logs.js`

### AI usages

- endpoint:
  - `ghost/core/core/server/api/endpoints/social-ai-usages.js`

### AI reminders

- endpoints:
  - `ghost/core/core/server/api/endpoints/social-ai-reminders.js`
  - `ghost/core/core/server/api/endpoints/social-ai-reminder-events.js`
  - `ghost/core/core/server/api/endpoints/social-ai-reminder-dispatch.js`
  - `ghost/core/core/server/api/endpoints/social-ai-user-phones.js`
  - `ghost/core/core/server/api/endpoints/social-ai-agent-settings.js`
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

## Notes

- For permission object names, use the matching permission migration as the source of truth.
- If a permission object is not listed above, treat it as not yet confirmed from migration files.
- Keep this file aligned with:
  - `custom-routes.js`
  - `api/endpoints/index.js`
