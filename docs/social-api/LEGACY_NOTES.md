# Ghost Social API Legacy Notes

This file keeps older historical notes that are still useful for reference.

## Change table of Ghost post

Add a group_id column into posts table.

`group_id: {type: 'string', maxlength: 24, nullable: true, references: 'social_groups.id', cascadeDelete: true},`

### Add group_id filter to post `GET` API

Now `https://localhost:2368/ghost/api/admin/posts/` work as original default but except posts not in group.  
`https://localhost:2368/ghost/api/admin/filter=group_id:00000000000000` will search posts in group `00000000000000`.

```json
curl -i -X GET \
   -H "Content-Type:application/json" \
   -H "App-Version:v5.0" \
   -H "Origin:http://localhost:3000" \
   -H "Set-Cookie:ghost-admin-api-session=s%3Aaqbf8VZkpSrOyKBxWi6PGqRbgc4NizE4.UKUK0AIWDnImNdo2k2Tgs8s4nVqR%2BD6EeQ3sHDOld78; pma_lang=ja" \
 'http://localhost:2368/ghost/api/admin/posts/?filter=group_id%3A'6815be9dfc8b03b493c74aa2''
```

### Add counts of bookmarks, favors, forwards, and posts in group to post `GET` result

```json
{
  "count": {
    "groups": 0,
    "bookmarks": 0,
    "favors": 0,
    "forwards": 0
  }
}
```

## Add count of follow, followed to user `GET` result

Specified count in include options:

`http://localhost:2368/ghost/api/admin/users/?include=count.follow,permissions,roles,count.followed`

## Project build

Ghost core project is js-based except individual ts.

- `yarn`
- `yarn build`
- `yarn dev`

## Customed Admin API

`http://localhost:2368/ghost/api/admin/social/**`

### Custom API summary

Historical custom API families:

- bookmarks
- favors
- follows
- forwards
- groups
- members
- comments

### Custom API data structure

Historical payload shapes included:

- `socialbookmarks`
- `socialfavors`
- `socialfollows`
- `socialforwards`
- `socialgroups`
- `socialgroupmembers`
- `socialpostcomments`

### Extend Ghost table

Historical Ghost table extensions included:

- `posts.group_id`
- `posts.status`
- `posts_revisions.post_status`

### Extend GhostSDK/admin-api-schema

Historical schema extensions included:

- `post.json` `status`
- `post.json` `group_id`

### Extend Ghost post API

Historical post API extension notes:

- `count.bookmarks`
- `count.favors`
- `count.forwards`
- `count.groups`
- `group_id`
- hidden status handling

### Extend Ghost user API

Historical user API extension notes:

- `count.follow`
- `count.followed`
- `group_members`
- `group_members.role`

### Extend role data for group

Historical group roles:

- `Social Group Owner`
- `Social Group Admin`
- `Social Group Member`

### All custom migration files

Historical custom migration family:

- `ghost/core/core/server/data/migrations/versions/5.115`
