# SKILLS Change Log

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
