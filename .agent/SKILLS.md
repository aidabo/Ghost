# SKILLS Change Log

Date: 2026-03-08
Scope: AI reminder persistence and realtime tool execution path

## Change Log (Codex changes)
- Added AI reminder persistence support in Ghost backend:
  - Added reminders table migration: `ghost/core/core/server/data/migrations/versions/5.116/2026-03-08-00-00-04-add-social-ai-reminders-table.js`
  - Added reminders recurrence migration: `ghost/core/core/server/data/migrations/versions/5.116/2026-03-08-00-00-05-add-social-ai-reminders-recurrence-columns.js`
  - Added reminder-events table migration: `ghost/core/core/server/data/migrations/versions/5.116/2026-03-08-00-00-06-add-social-ai-reminder-events-table.js`
  - Added/updated models for reminder/event persistence:
    - `ghost/core/core/server/models/social-ai-reminders.js`
    - `ghost/core/core/server/models/social-ai-reminder-events.js`
- Added/updated Ghost admin endpoints for reminders and events:
  - `ghost/core/core/server/api/endpoints/social-ai-reminders.js`
  - `ghost/core/core/server/api/endpoints/social-ai-reminder-events.js`
- Registered reminder routes in custom admin API router:
  - `GET /ghost/api/admin/social/ai/reminders`
  - `GET /ghost/api/admin/social/ai/reminders/:id`
  - `POST /ghost/api/admin/social/ai/reminders`
  - `PUT /ghost/api/admin/social/ai/reminders/:id`
  - `GET /ghost/api/admin/social/ai/reminder-events`
  - `POST /ghost/api/admin/social/ai/reminder-events`
  - Updated in `ghost/core/core/server/web/api/endpoints/admin/custom-routes.js`
- Updated host-side realtime reminder tool execution to always call persisted API endpoints:
  - `01-jibunsee-react/apps/host/src/hooks/ai/useRealtimeVoice.ts` now supports `today_reminders` and `acknowledge_reminder` tool calls and routes all tool calls through `/api/ai/reminders`.

Date: 2026-03-04
Scope: social-ai chats/usages backend API normalization and usage authorization

## Change Log (Codex changes)
- Added backend usage endpoint controller:
- `ghost/core/core/server/api/endpoints/social-ai-usages.js`
- Registered endpoint in:
- `ghost/core/core/server/api/endpoints/index.js`
- `ghost/core/core/server/web/api/endpoints/admin/custom-routes.js`
- Exposed routes:
- `GET /ghost/api/admin/social/ai/usages`
- `GET /ghost/api/admin/social/ai/usages/:id`

- Normalized Ghost API output format for AI endpoints:
- Chat browse now returns Ghost-style:
- `{ socialaichats: [...], meta: { pagination: ... } }`
- Usage browse now returns Ghost-style:
- `{ socialaiusages: [...], meta: { pagination: ... } }`
- Removed previous double-nested response wrappers causing:
- `socialaichats[].socialaichats[]`
- `socialaiusages[].socialaiusages[]`

- Added role-aware user filter behavior for usage browse:
- Default (no `group_id`): filter by current authenticated user from `context.user`.
- Group mode (`group_id` present): filter by group with group access checks.
- Optional `user_id` query override allowed only when:
- same user as requester, or
- requester has admin role (`Owner` / `Administrator` / `Admin`), or
- request runs in integration context.

- Added usage browse pagination support:
- accepts `page` and `limit`
- returns `meta.pagination` with `page`, `limit`, `pages`, `total`, `next`, `prev`

- Added usage row detail mapping fields:
- `prompt_tokens`, `completion_tokens`, `total_tokens`
- `cost_usd_micros`, `amount_usd`, `currency`, `created_at`
- plus grouped total summary (`group_totals`) for token/amount aggregation.

Date: 2026-02-16
Scope: social-components content API public scope fix

## Change Log (Codex changes)
- Fixed content endpoint `social-components-public` access scope:
- Removed `context.user` requirement from content API group reads.
- Enforced public-only group access for `group_id` requests (`social_groups.type=public`).
- Kept published-only constraint for content browse/read.
- Kept default no-group browse behavior when `group_id` is not provided.
- Updated default browse scope (no `group_id`):
- Now returns published pages with `group_id:null` and published pages in public groups.
- Implemented with filter scope: `(group_id:null,group_id:[<public_group_ids>])`.
- Enabled additional public social-components includes for content API:
- `user`, `group` (along with `tag`) to support public pages list metadata rendering.
- Updated `social_components` model publish lifecycle:
- auto-set `published_at` when status is `published` and value is missing.
- clear `published_at` when status changes back to `draft`.

Date: 2026-02-12
Scope: Ghost 5.116.2 custom SNS/page-builder group-aware behavior

## Change Log (Codex changes)
- Added `group_id` option handling to authenticated posts endpoint browse flow.
- Added explicit group access checks for posts queries using `group_id`.
- Updated post model group validation to support single and array group filters.
- Added authenticated group-aware read/write checks to `social-components` endpoint.
- Added support for `group_id` in `social-components` add/edit payload.
- Added `group_id` to `social_components` schema.
- Added migration to create `social_components.group_id`.
- Added migration to backfill `social_components.group_id` from linked post groups.
- Added `tag` field (category) to `social_components` schema/model/API.
- Added migration to create `social_components.tag`.
- Added `users.media_folder_alias` for stable user gallery folders (non-user-id naming).
- Added migration to create `users.media_folder_alias` (unique).
- Added upload routing for images/media to `gallery/<media_folder_alias>/YYYY/MM` when `context.user` exists.
- Added upload routing for files to `gallery/<media_folder_alias>/YYYY/MM` when `context.user` exists.
- Added `social_groups.media_folder_alias` for stable group gallery folders (non-group-id naming).
- Added migration to create `social_groups.media_folder_alias` (unique).
- Added upload support with optional `group_id` for images/media/files.
- Added upload write-permission check for `group_id` using authenticated Ghost `user` + `SocialGroup.canAccessGroup(..., 'write')`.
- Updated upload folder layout to separate users/groups:
- `gallery/users/<user_alias>/YYYY/MM/...`
- `gallery/groups/<group_alias>/YYYY/MM/...`
- Added no-daemon development support for Nx:
- `package.json` script `dev:no-daemon`
- `.github/scripts/dev.js` now switches from `nx watch` to `nx run-many --watch` and skips daemon start/reset when `NX_DAEMON=false`.
- Fixed authenticated user group includes (`users/me?include=group_members.group`) by allowing authenticated context to bypass the `status:active` default filter in `SocialGroup.defaultFilters`.
- Fixed social group creation crash (`Cannot read properties of null (reading 'get')`) in `SocialGroup.onCreated`:
- Added required `creator_id` validation in `onCreated`.
- Added role lookup fallback (`Social Group Owner` -> `Administrator`) and explicit not-found error when role data is missing.
- Fixed Lexical image card HTML rendering regression:
- Root cause: duplicated `@tryghost/kg-default-nodes` instances caused `instanceof` mismatch in `kg-lexical-html-renderer`, so decorator cards (like image) were skipped.
- Updated `ghost/core/core/server/lib/lexical.js` to resolve `@tryghost/kg-default-nodes` from the same dependency tree as `@tryghost/kg-lexical-html-renderer`.
- Added `social_components.group_id` validation and relation in model.
- Updated authenticated `tags` endpoint to accept `group_id` and check group access.
- Updated tag `count.posts` relation to support `group_id` scoping.
- Updated Docker production build file to copy newly added migration files.
- Added S3 adapter `list()` support to return gallery files by prefix with pagination cursor.
- Added admin API endpoints for gallery list:
- `GET /ghost/api/admin/social/gallery/user`
- `GET /ghost/api/admin/social/gallery/group/:id`
- Added group-read permission enforcement for group gallery (public group open, private group member-only).
- Updated Docker production build file to copy new `social-gallery` endpoint and S3 adapter changes.
- Added `social_media_assets` table to index uploaded gallery assets and map them to Ghost tags.
- Added upload-time tagging support for images/media/files using `tag`, `tag_slug`, or `tag_id`.
- Kept gallery upload folder path clean and stable (no tag slug path segment):
- `gallery/users/<user_alias>/YYYY/MM/...`
- `gallery/groups/<group_alias>/YYYY/MM/...`
- Added gallery API response enrichment with:
- `category` (tag name) and `category_slug`.

## Files Changed By Codex
- `.docker/prd.Dockerfile`
- `ghost/core/core/server/api/endpoints/posts.js`
- `ghost/core/core/server/api/endpoints/social-components.js`
- `ghost/core/core/server/api/endpoints/social-components-public.js`
- `ghost/core/core/server/api/endpoints/tags.js`
- `ghost/core/core/server/data/schema/schema.js`
- `ghost/core/core/server/models/post.js`
- `ghost/core/core/server/models/social-components.js`
- `ghost/core/core/server/models/user.js`
- `ghost/core/core/server/models/tag.js`
- `ghost/core/core/server/data/migrations/versions/5.116/2026-02-12-00-00-00-add-social-group-column-to-components.js`
- `ghost/core/core/server/data/migrations/versions/5.116/2026-02-12-00-00-01-backfill-social-components-group-id.js`
- `ghost/core/core/server/data/migrations/versions/5.116/2026-02-12-00-00-02-add-social-tag-column-to-components.js`
- `ghost/core/core/server/data/migrations/versions/5.116/2026-02-12-00-00-03-add-user-media-folder-alias.js`
- `ghost/core/core/server/data/migrations/versions/5.116/2026-02-12-00-00-04-add-social-group-media-folder-alias.js`
- `ghost/core/core/server/api/endpoints/media.js`
- `ghost/core/core/server/api/endpoints/images.js`
- `ghost/core/core/server/api/endpoints/files.js`
- `ghost/core/core/server/models/social-groups.js`
- `ghost/core/core/server/api/endpoints/index.js`
- `ghost/core/core/server/web/api/endpoints/admin/custom-routes.js`
- `ghost/core/core/server/api/endpoints/social-gallery.js`
- `ghost/core/content/adapters/storage/s3/src/index.js`
- `ghost/core/content/adapters/storage/s3/index.js`
- `ghost/core/core/server/data/migrations/versions/5.116/2026-02-13-00-00-00-add-social-media-assets-table.js`
- `ghost/core/core/server/api/endpoints/utils/social-media-assets.js`

## All Currently Changed Files In Workspace (git diff --name-only)
- `.docker/prd.Dockerfile`
- `.gitignore`
- `ghost/core/.yalc/@tryghost/kg-default-nodes/cjs/kg-default-nodes.js`
- `ghost/core/.yalc/@tryghost/kg-default-nodes/cjs/kg-default-nodes.js.map`
- `ghost/core/.yalc/@tryghost/kg-default-nodes/es/kg-default-nodes.js`
- `ghost/core/.yalc/@tryghost/kg-default-nodes/es/kg-default-nodes.js.map`
- `ghost/core/.yalc/@tryghost/kg-default-nodes/lib/nodes/video/video-renderer.js`
- `ghost/core/.yalc/@tryghost/kg-default-nodes/package.json`
- `ghost/core/.yalc/@tryghost/kg-default-nodes/yalc.sig`
- `ghost/core/core/server/api/endpoints/posts.js`
- `ghost/core/core/server/api/endpoints/social-components-public.js`
- `ghost/core/core/server/api/endpoints/social-components.js`
- `ghost/core/core/server/api/endpoints/media.js`
- `ghost/core/core/server/api/endpoints/images.js`
- `ghost/core/core/server/api/endpoints/files.js`
- `ghost/core/core/server/models/social-groups.js`
- `ghost/core/core/server/api/endpoints/index.js`
- `ghost/core/core/server/web/api/endpoints/admin/custom-routes.js`
- `ghost/core/core/server/api/endpoints/social-gallery.js`
- `ghost/core/content/adapters/storage/s3/src/index.js`
- `ghost/core/content/adapters/storage/s3/index.js`
- `ghost/core/core/server/data/migrations/versions/5.116/2026-02-13-00-00-00-add-social-media-assets-table.js`
- `ghost/core/core/server/api/endpoints/utils/social-media-assets.js`
- `ghost/core/core/server/data/migrations/versions/5.116/2026-02-12-00-00-04-add-social-group-media-folder-alias.js`
- `.github/scripts/dev.js`
- `package.json`
- `ghost/core/core/server/api/endpoints/tags.js`
- `ghost/core/core/server/data/schema/schema.js`
- `ghost/core/core/server/models/post.js`
- `ghost/core/core/server/models/social-components.js`
- `ghost/core/core/server/models/user.js`
- `ghost/core/core/server/models/tag.js`
- `ghost/core/core/server/data/migrations/versions/5.116/2026-02-12-00-00-03-add-user-media-folder-alias.js`
- `ghost/core/yalc.lock`

## API Access Guide

### Base Paths
- Admin/auth APIs: `/ghost/api/admin/...`
- Content/public APIs: `/ghost/api/content/...` (public group read logic is already available in your existing flow)

### Auth Notes
- Non-public group data requires Ghost `user` auth context.
- Session/cookie auth for staff users works.
- If request has only integration/content key without `context.user`, non-public group checks will be denied.
- Public group (`type=public`) read can pass without `context.user`.

### 1) Get Published Posts By Tag + Group
- Endpoint: `GET /ghost/api/admin/posts/`
- Query parameters:
- `filter`:
  - Tag filter examples: `tags:[news,release]` or `tag:news`
  - Add status: `+status:published`
- `group_id`: target group id (24-char id)
- Optional: `include`, `fields`, `limit`, `page`, `order`

Example:
`/ghost/api/admin/posts/?filter=tags:[news,release]+status:published&group_id=684fe613ac7a254f8909f8d4`

### 2) Get Tags With Group-Scoped Post Counts
- Endpoint: `GET /ghost/api/admin/tags/`
- Query parameters:
- `include=count.posts`
- `group_id=<groupId>` (scopes `count.posts` to that group’s posts)
- Optional: `filter`, `limit`, `page`, `order`

Example:
`/ghost/api/admin/tags/?include=count.posts&group_id=684fe613ac7a254f8909f8d4`

### 3) Read Social Components By Group (Page Builder)
- Endpoint: `GET /ghost/api/admin/social/components`
- Query parameters:
- `tag=<category>` (shortcut; appends `tag:<category>` to filter and defaults to `status:published` if status missing)
- `group_id=<groupId>`
- Optional: `filter` (combined with `group_id`), `limit`, `page`, `order`, `fields`

Example:
`/ghost/api/admin/social/components?group_id=684fe613ac7a254f8909f8d4&filter=status:published`

Example with category tag:
`/ghost/api/admin/social/components?group_id=684fe613ac7a254f8909f8d4&tag=marketing`

Read single:
`GET /ghost/api/admin/social/components/:id?group_id=<groupId>`

Public browse by category (published only):
`GET /ghost/api/content/social/components?tag=marketing`

### 4) Create Social Component
- Endpoint: `POST /ghost/api/admin/social/components`
- Body:
- `tag` is category field for page-builder component.
Body:
```json
{
  "socialcomponents": [
    {
      "type": "page",
      "title": "Landing A",
      "tag": "marketing",
      "group_id": "684fe613ac7a254f8909f8d4",
      "status": "draft"
    }
  ]
}
```

### 5) Edit Social Component
- Endpoint: `PUT /ghost/api/admin/social/components/:id`
- Body parameters:
- `type`, `title`, `tag` (category), `status`, optional `group_id`
- Write access is checked against component group (payload `group_id` or existing record `group_id`).

### Group Rule Summary
- Group `type=public`:
  - Read allowed without `context.user`
- Group non-public:
  - Read/write requires authenticated user in group (`SocialGroup.canAccessGroup`)

### User Gallery Folder Rule
- Uploads for authenticated staff users (`context.user`) are stored under:
- `.../gallery/users/<media_folder_alias>/YYYY/MM/...`
- Applies to images, media (video/audio included), and files upload endpoints.
- `media_folder_alias` format: `u_<12 hex>`, stable per user, not based on user id.
- If alias is missing for an existing user, it is generated lazily at upload time and persisted to `users.media_folder_alias`.

### Group Gallery Upload Rule
- Upload endpoints support optional `group_id` (multipart field or query param) for images/media/files:
- `POST /ghost/api/admin/images/upload?group_id=<groupId>`
- `POST /ghost/api/admin/media/upload?group_id=<groupId>`
- `POST /ghost/api/admin/files/upload?group_id=<groupId>`
- When `group_id` is provided:
- Must have authenticated `context.user` (cookie auth/session).
- User must pass group write permission (`SocialGroup.canAccessGroup(group, user, 'write')`).
- Files are stored under:
- `.../gallery/groups/<group_media_folder_alias>/YYYY/MM/...`
- `group_media_folder_alias` format: `g_<12 hex>`, stable per group, stored in `social_groups.media_folder_alias`.
- Optional gallery category tag on upload:
- query or multipart fields: `tag`, `tag_slug`, `tag_id`
- When tag resolves to existing Ghost tag, files are mapped in `social_media_assets` (DB source of truth).
- Example:
- `POST /ghost/api/admin/images/upload/?group_id=<groupId>&tag_slug=marketing`
- path: `.../gallery/groups/<group_alias>/YYYY/MM/...`

### Gallery List APIs (new)
- User gallery list:
- `GET /ghost/api/admin/social/gallery/user?limit=100&next_cursor=<token>&type=<all|image|video|audio|file>`
- Auth required (`context.user`).
- Returns files under `gallery/users/<user_alias>/...`.

- Group gallery list:
- `GET /ghost/api/admin/social/gallery/group/:id?limit=100&next_cursor=<token>&type=<all|image|video|audio|file>`
- Also supported (Ghost-style trailing slash / query id):
- `GET /ghost/api/admin/social/gallery/group/?group_id=<groupId>&limit=100&next_cursor=<token>&type=<...>`
- For group `type=public`: readable without group membership check.
- For non-public groups: requires authenticated user with group read access.
- Returns files under `gallery/groups/<group_alias>/...`.
- Type filter extension mapping (aligned to frontend):
- `image`: `gif,jpg,jpeg,png,svg,svgz,webp`
- `video`: `mp4,webm,ogv,mov`
- `audio`: `mp3,wav,ogg,m4a`
- `file`: anything not in image/video/audio

- Response shape (both):
```json
{
  "socialgallery": [
    {
      "key": "60-think-prd/gallery/users/u_abc.../2026/02/file.jpg",
      "url": "https://cdn.example.com/60-think-prd/gallery/users/u_abc.../2026/02/file.jpg",
      "path": "60-think-prd/gallery/users/u_abc.../2026/02/file.jpg",
      "name": "file.jpg",
      "size": 12345,
      "etag": "\"abc123\"",
      "lastModified": "2026-02-12T00:00:00.000Z",
      "category": "Marketing",
      "category_slug": "marketing"
    }
  ],
  "meta": {
    "prefix": "60-think-prd/gallery/users/u_abc.../",
    "count": 1,
    "next_cursor": null,
    "scope": "user",
    "alias": "u_abc...",
    "user_id": "..."
  }
}
```

### Gallery Tag Sync API (new)
- Endpoint:
- `POST /ghost/api/admin/social/gallery/sync-tags`
- Purpose:
- Sync uploaded gallery assets to post category tag when post is published or tag changed.
- Recommended trigger:
- frontend call once on publish and when post tags change (not on each autosave).
- Request body:
```json
{
  "post_id": "698dd9417ecf36d17cfd7649",
  "mode": "primary",
  "urls": [
    "https://cdn.example.com/60-think-prd/gallery/groups/g_xxx/marketing/2026/02/a.jpg"
  ]
}
```
- `mode` currently supports: `primary`
- If `urls` is omitted, backend extracts URLs from post `feature_image`, `html`, and `lexical`.

### Social Components Tag FK + Include (2026-02-16)
- `social_components.tag` is now treated as a foreign key reference to `tags.id` (24-char id), with `SET NULL` delete behavior.
- Migration added:
- `ghost/core/core/server/data/migrations/versions/5.116/2026-02-16-00-00-00-migrate-social-components-tag-to-tags-id.js`
- Migration behavior:
- Existing `social_components.tag` values are normalized to `tags.id` by matching in this order:
- direct tag id -> tag slug -> tag name
- Unmatched values are set to `null` to keep FK-safe data.
- Social component model now accepts `tag` input as id/slug/name and resolves to `tags.id` on save.
- Browse/read APIs now include related tag object:
- Admin: `ghost/core/core/server/api/endpoints/social-components.js` (`withRelated: ['user', 'tag']`)
- Public: `ghost/core/core/server/api/endpoints/social-components-public.js` (`withRelated: ['tag']`)
- `tag` query option remains backward-compatible (id/slug/name), resolved to `tags.id` for filtering when possible.

### Social Components Page Access Rule Matrix (2026-02-16)
- Applied simplified page-builder access rules:
- Read/Browse (public route):
- No `group_id`: published pages only, readable without auth.
- With `group_id`: published pages only, readable only by group members.
- Tag filter:
- `tag` + no `group_id`: published + no-group scope (no auth needed).
- `tag` + `group_id`: published + group scope (group member required).
- Read/Write/Destroy (admin route):
- Admin can read/write/destroy all pages.
- Creator can read/write/destroy their own pages.
- Group member read support:
- Group members can read group pages even when they are not the creator.
- Group membership alone does not grant write/destroy.

### Social Components Permission Roles Update (2026-02-16)
- Updated migration:
- `ghost/core/core/server/data/migrations/versions/5.116/2025-08-30-00-00-02-add-social-components-permissions.js`
- Role assignment change for action permissions:
- `add`, `edit`, and `destroy` now use:
- `Admin Integration`, `Administrator`, `Editor`, `Super Editor`
- `Author` and `Contributor` were removed from `add`/`edit`/`destroy`.
- Other actions (`browse`, `read`) keep the previous default role set.

### Social Components API (Frontend Integration Guide, 2026-02-16)
- Purpose:
- This section is for frontend usage (`01-jibunsee-react`), not only backend source paths.

#### Admin Endpoints (frontend write/list/edit/delete)
- List pages/components:
- `GET /ghost/api/admin/social/components/?include=user,tag&limit=all&order=updated_at desc&filter=created_by:<userId>&group_id=<optionalGroupId>`
- Read one page/component:
- `GET /ghost/api/admin/social/components/:id/?group_id=<optionalGroupId>`
- Create page/component:
- `POST /ghost/api/admin/social/components/`
- Update page/component:
- `PUT /ghost/api/admin/social/components/:id/`
- Delete page/component:
- `DELETE /ghost/api/admin/social/components/:id/`

#### Public/Content Endpoints (frontend view/preview flows)
- Browse published components:
- `GET /ghost/api/content/social/components/?tag=<tagIdOrSlugOrName>&group_id=<optionalGroupId>`
- Read published component:
- `GET /ghost/api/content/social/components/:id/?group_id=<optionalGroupId>`

#### Request Body Samples (frontend POST/PUT)
- Create sample:
```json
{
  "socialcomponents": [
    {
      "type": "page",
      "title": "Group Landing",
      "status": "draft",
      "group_id": "698dd7e128b5675e5cdec4fe",
      "tag": "marketing",
      "image": "https://cdn.example.com/page-cover.jpg",
      "attributes": "{\"theme\":\"simple\"}",
      "layout": "{\"items\":[]}",
      "source": "{\"lists\":[],\"dataSources\":[]}"
    }
  ]
}
```

- Update sample:
```json
{
  "socialcomponents": [
    {
      "id": "699a11117ecf36d17cfd7001",
      "title": "Group Landing v2",
      "status": "published",
      "group_id": "698dd7e128b5675e5cdec4fe",
      "tag": "marketing"
    }
  ]
}
```

#### Response Sample (list, include user+tag)
```json
{
  "socialcomponents": [
    {
      "id": "699a11117ecf36d17cfd7001",
      "type": "page",
      "title": "Group Landing v2",
      "status": "published",
      "group_id": "698dd7e128b5675e5cdec4fe",
      "tag": "698ab2f17ecf36d17cfd700a",
      "user": {
        "id": "698001aa7ecf36d17cfd7000",
        "name": "Admin User"
      },
      "tag": {
        "id": "698ab2f17ecf36d17cfd700a",
        "name": "Marketing",
        "slug": "marketing"
      },
      "updated_at": "2026-02-16T09:00:00.000Z"
    }
  ],
  "meta": {
    "pagination": {
      "page": 1,
      "limit": 15,
      "pages": 1,
      "total": 1,
      "next": null,
      "prev": null
    }
  }
}
```

#### Frontend Usage Mapping (01-jibunsee-react)
- API client methods:
- `apps/host/src/utils/ghostApiClient.ts`
- `getSocialComponentsList(filterObj)`
- `getSocialComponentById(componentId)`
- `createSocialComponent(data)`
- `updateSocialComponentById(componentId, data)`
- `deleteSocialComponentById(componentId)`

- Page builder store:
- `apps/host/src/components/pages/pageLayoutStore.ts`
- `getPageList(filterObj)` -> list pages for panel/pages list
- `insertPage(data)` -> create
- `updatePage(data)` -> update
- `deletePage(pageId)` -> delete

- Panel pages UI:
- `apps/host/src/app/panel/page.tsx`
- Shows creator-owned pages all status
- Group context toggle Post/Page and group page create entry

- Group detail panel pages UI:
- `apps/host/src/components/panel/PanelGroup.tsx`
- Group page list/edit/preview
- New group page action

- Page list/edit/view routes:
- `apps/host/src/app/pages/list/page.tsx`
- `apps/host/src/app/pages/edit/[pageid]/page.tsx`
- `apps/host/src/app/pages/view/[pageid]/page.tsx`

- API proxy for content read:
- `apps/host/src/app/api/pages/[pageid]/route.ts`
- Forwards optional `group_id` to content API for group-aware view auth.

### Group Event Menu Setting Storage (new)

- Backend storage location:
- `social_groups.optional_settings` (JSON)
- Group event menu key:
- `optional_settings.groupEventSetting`

- API update support:
- Updated endpoint whitelist in:
- `ghost/core/core/server/api/endpoints/social-groups.js`
- Added `optional_settings` to `add.data` and `edit.data` allowed fields.

- Purpose:
- Allow frontend settings panel to persist group-specific dynamic menubar menus per group (instead of using global `settings.my_config`).

### Group Event Setting Backfill Migration (new)

- Migration file:
- `ghost/core/core/server/data/migrations/versions/5.116/2026-02-17-00-00-00-backfill-social-group-event-setting.js`

- Behavior:
- Iterates all `social_groups` rows.
- Ensures `optional_settings` is object-like JSON.
- If `optional_settings.groupEventSetting` is missing or not an array, initializes it to `[]`.

- Purpose:
- Normalize existing groups so frontend group event menu editor can safely read/write `groupEventSetting` without null/missing-key edge cases.

### Social Group optional_settings JSON Serialization Fix (2026-02-17)

- Updated model:
- `ghost/core/core/server/models/social-groups.js`

- Change:
- Added `format()`/`parse()` handling for `optional_settings`.
- On write: object values are serialized with `JSON.stringify`.
- On read: JSON strings are parsed back to object when valid.

- Purpose:
- Fix SQL error when saving group event menu settings (`optional_settings.groupEventSetting`) where MySQL interpreted object literals as field expressions.
- Keep API behavior stable for frontend by exposing `optional_settings` as object after read.

### Super Editor Social Group Permissions Fix (2026-02-17)

- Added migration:
- `ghost/core/core/server/data/migrations/versions/5.116/2026-02-17-00-00-01-add-super-editor-social-group-permissions.js`

- Grants role `Super Editor` the following existing permissions:
- `Browse/Read/Add/Edit/Delete SocialGroups`
- `Count SocialGroups`
- `Browse/Read/Add/Edit/Delete SocialGroupMembers`

- Purpose:
- Fix `403 NoPermissionError` for super editor users when opening group panel flows that call `/ghost/api/admin/social/groups/...` and related group-member/group-count APIs.

### Super Editor Social Permissions Catch-up (2026-02-17)

- Added migration:
- `ghost/core/core/server/data/migrations/versions/5.116/2026-02-17-00-00-02-add-super-editor-social-permissions.js`

- Grants role `Super Editor` all existing social permission names introduced by social permission migrations in `5.115`/`5.116`, including:
- Social follows/bookmarks/favors/forwards
- Social groups + social group members + group count
- Social post comments + likes + reports
- Social components + social post components
- Social user logs

- Purpose:
- Ensure legacy databases and mixed migration histories consistently allow `Super Editor` to access social APIs (including social components) without 403 permission errors.
- Migration hardening update (same file):
- `2026-02-17-00-00-02-add-super-editor-social-permissions.js` now grants by querying existing permission rows and skipping missing names, with support for both spaced and legacy no-space permission names.
- This avoids migration aborts when one permission name differs across environments.

### Social Media Assets MySQL Key Length Fix (2026-02-17)

- Problem:
- Migration creating `social_media_assets` failed on MySQL/InnoDB with:
- `ER_TOO_LONG_KEY` / `Specified key was too long; max key length is 3072 bytes`
- Cause:
- `storage_key` was defined as `varchar(2000)` with both `unique` and `index`.
- Under `utf8mb4`, this exceeds index key-length limits.

- Updated migration:
- `ghost/core/core/server/data/migrations/versions/5.116/2026-02-13-00-00-00-add-social-media-assets-table.js`
- Changed `storage_key` spec:
- from: `maxlength: 2000, unique: true, index: true`
- to: `maxlength: 2000` (no DB unique/index constraints)

- Updated schema definition:
- `ghost/core/core/server/data/schema/schema.js`
- Changed `social_media_assets.storage_key` to non-indexed, non-unique field for consistency with migration/runtime.

- Note:
- App-level upsert logic still matches by exact `storage_key` (`where({storage_key})`) and remains functional.

### AI Chat History Persistence APIs (2026-02-20)

- Added admin social endpoint:
- `ghost/core/core/server/api/endpoints/social-ai-chats.js`

- Added admin routes:
- `GET /ghost/api/admin/social/ai/chats`
- `GET /ghost/api/admin/social/ai/chats/:id`
- `POST /ghost/api/admin/social/ai/chats`
- Registered in:
- `ghost/core/core/server/web/api/endpoints/admin/custom-routes.js`

- Added DB tables:
- `social_ai_conversations`
- `social_ai_messages`
- `social_ai_usages`
- Files:
- `ghost/core/core/server/data/migrations/versions/5.116/2026-02-20-00-00-00-add-social-ai-chat-tables.js`
- `ghost/core/core/server/data/migrations/versions/5.116/2026-02-20-00-00-01-add-social-ai-chat-messages-table.js`
- `ghost/core/core/server/data/migrations/versions/5.116/2026-02-20-00-00-02-add-social-ai-chat-usages-table.js`
- Schema synced in:
- `ghost/core/core/server/data/schema/schema.js`

- Added permissions:
- `Browse Social AI Chats` (`browse:socialaichat`)
- `Read Social AI Chats` (`read:socialaichat`)
- `Add Social AI Chats` (`add:socialaichat`)
- Migration:
- `ghost/core/core/server/data/migrations/versions/5.116/2026-02-20-00-00-03-add-social-ai-chat-permissions.js`
- Super Editor grant migration:
- `ghost/core/core/server/data/migrations/versions/5.116/2026-02-20-00-00-04-add-super-editor-social-ai-chat-permissions.js`

- API payload sample (save one user/assistant turn):
```json
{
  "socialaichats": [
    {
      "conversation_id": "c_123",
      "user_id": "698da1257b364dc985006308",
      "group_id": "698dd7e128b5675e5cdec4fe",
      "provider": "deepseek",
      "model": "deepseek-chat",
      "response_mode": "auto",
      "visibility": "private",
      "user_message": "hello",
      "assistant_message": "hi",
      "prompt_tokens": 120,
      "completion_tokens": 40,
      "total_tokens": 160,
      "cost_usd_micros": 0,
      "currency": "USD"
    }
  ]
}
```

- API caller notes:
- Endpoint uses admin API cookie auth (`mw.authAdminApi`) and user-scoped access checks.
- Non-admin callers can only read/write their own `user_id` conversation history.

### AI Chat Auth Fallback (2026-02-20)

- Updated:
- `ghost/core/core/server/api/endpoints/social-ai-chats.js`

- Change:
- AI chat history endpoint now accepts trusted `context.integration` calls (Admin API key JWT auth) in addition to session-user auth.
- For integration context:
- `user_id` is required in query/body and used as target scope.

- Purpose:
- Avoid `403 Authorization failed` when frontend API route cannot pass Ghost session cookies to backend.
- Allow server-to-server calls from Next API routes using `Authorization: Ghost <JWT>`.

### AI History 403 + Attachment 1210 Hotfix (2026-02-20)

- Updated endpoint:
- `ghost/core/core/server/api/endpoints/social-ai-chats.js`
- Set controller `permissions` to `false` for `browse/read/add` while keeping admin auth middleware on routes.
- Purpose: avoid permission-table block (`403`) for authenticated admin/jwt access before/without permission migration application.


### AI History Group Access Enforcement (2026-02-20)

- Updated endpoint:
- `ghost/core/core/server/api/endpoints/social-ai-chats.js`

- Added strict group checks for group-scoped history/cost paths:
- `browse`: validates `group_id` read access
- `read`: validates conversation group read access
- `add`: validates `group_id` write access before persisting messages/usage

- Enforcement method:
- Uses `SocialGroup.canAccessGroup(group, userId, "read"/"write")` with admin bypass only for actual admin users.
- No-group scope continues to work without group check.


### AI Chat MySQL Datetime + Conversation ID Fix (2026-02-20)

- Updated endpoint:
- `ghost/core/core/server/api/endpoints/social-ai-chats.js`

- Fixes:
- Convert timestamps to MySQL DATETIME format (`YYYY-MM-DD HH:mm:ss`) before insert/update for:
  - `social_ai_conversations.created_at/updated_at`
  - `social_ai_messages.created_at`
  - `social_ai_usages.created_at`
- Prevents `Incorrect datetime value ...Z` runtime errors on strict MySQL modes.


### AI History Browse Meta Count Extension (2026-02-20)

- Updated endpoint:
- `ghost/core/core/server/api/endpoints/social-ai-chats.js`

- Browse response now includes:
- `meta.count` (returned rows)
- `meta.total_count` (all matched rows before limit)
- `meta.limit`

- Purpose:
- enable frontend history count display and load-more behavior while keeping newest-first ordering (`updated_at desc`).


### AI History Provider Filter Support (2026-02-20)

- Updated endpoint:
- `ghost/core/core/server/api/endpoints/social-ai-chats.js`

- Browse now accepts optional `provider` option/query and applies DB filter on `social_ai_conversations.provider`.
- Meta (`count`, `total_count`, `limit`) is returned for the filtered set.


### AI Message Storage Simplification: One Row Per Turn (2026-02-20)

- Updated endpoint:
- `ghost/core/core/server/api/endpoints/social-ai-chats.js`

- Change:
- `social_ai_messages` now stores one row per chat turn with:
  - `role = "turn"`
  - `content = { user: string, assistant: string }` JSON string

- Read compatibility:
- `read` formatter now expands `turn` rows back into UI-friendly message sequence (`user` then `assistant`).
- Legacy rows (`role=user/assistant`) are still supported.

- Conversation update behavior:
- conversation `title` now remains stable after first insert (no overwrite on later turns).


### AI Message Format Strict Mode (2026-02-20)

- Updated endpoint:
- `ghost/core/core/server/api/endpoints/social-ai-chats.js`

- Change:
- Removed legacy compatibility branch for old `role=user/assistant` rows.
- Read formatter now strictly parses only `role="turn"` rows with JSON content `{ user, assistant }`.

- Note:
- This is aligned with cleanup of prior test data in AI tables.


### AI Table Model Consistency Update (2026-02-20)

- Added Ghost model files for AI tables:
- `ghost/core/core/server/models/social-ai-conversations.js`
- `ghost/core/core/server/models/social-ai-messages.js`
- `ghost/core/core/server/models/social-ai-usages.js`

- Endpoint consistency update:
- `ghost/core/core/server/api/endpoints/social-ai-chats.js`
- Now resolves table names from model definitions (`SocialAiConversation/SocialAiMessage/SocialAiUsage`) instead of hardcoded table string literals.

- Purpose:
- Align with existing Ghost model-layer conventions used by other `social_*` features and reduce schema/table-name drift risk.


### AI Model Existence Validation Update (2026-02-20)

- Updated:
- `ghost/core/core/server/models/social-ai-conversations.js`
- `ghost/core/core/server/models/social-ai-messages.js`
- `ghost/core/core/server/models/social-ai-usages.js`

- Validation behavior added:
- `user_id` must reference an existing row in `users`.
- `group_id` (if provided) must reference an existing row in `social_groups`.
- `conversation_id` in messages/usages must reference an existing row in `social_ai_conversations`.

- Purpose:
- Keep model-layer validation consistent with Ghost conventions and catch invalid references before persistence.


### AI Conversation Title Upgrade Logic (2026-02-20)

- Updated endpoint:
- `ghost/core/core/server/api/endpoints/social-ai-chats.js`

- Changes:
- Added server-side title normalizer/fallback using `provider + first user message` (word-safe 60 chars).
- On conversation update, if existing title is blank or provider-only, title is upgraded when a better message title is available.

- Purpose:
- Avoid history rows showing only provider name (e.g. `deepseek`) when first meaningful user text is available later.


### AI Conversation Title Format Simplification (2026-03-03)

- Updated endpoint:
- `ghost/core/core/server/api/endpoints/social-ai-chats.js`

- Changes:
- title normalizer now stores message-only title (no provider prefix), fallback `New chat` when message is empty.
- existing-conversation upgrade keeps replacing blank/provider-only legacy titles with normalized message title.

- Purpose:
- align frontend history UI request to show clean message titles while provider stays as internal filter flag.

### AI Usage Endpoint Added (2026-03-03)

- Added new admin social usage endpoint:
- `ghost/core/core/server/api/endpoints/social-ai-usages.js`

- Added admin routes:
- `GET /ghost/api/admin/social/ai/usages`
- `GET /ghost/api/admin/social/ai/usages/:id`
- Registered in:
- `ghost/core/core/server/web/api/endpoints/admin/custom-routes.js`
- `ghost/core/core/server/api/endpoints/index.js`

- Behavior:
- returns row-level usage records from `social_ai_usages` with filters:
  - `group_id`, `user_id`, `provider`, `period_start`, `period_end`, `limit`
- returns `group_totals` aggregation and `meta` (`count`, `total_count`, `limit`)
- enforces auth/group access similarly to social AI chats endpoint patterns

- Frontend proxy alignment:
- updated `01-jibunsee-react/apps/host/src/app/api/ai/usage/route.ts` to pass-through `user_id` to Ghost usage endpoint
- updated `SiteAssistantPanel.tsx` usage request to include `user_id`
