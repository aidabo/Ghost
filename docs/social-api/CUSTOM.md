# How add custom API to Ghost 

## Read this first

This file is the long-form historical guide.

For faster navigation, start here:

- [README.md](./README.md)
- [API_REFERENCE.md](./API_REFERENCE.md)
- [summary-2026-02-18.md](./summary-2026-02-18.md)
- [LEGACY_NOTES.md](./LEGACY_NOTES.md)

Recommended use:

1. `README.md`
   - entry point for custom social API docs
2. `API_REFERENCE.md`
   - main custom social API reference
   - quick list of custom social APIs and related backend files
3. `summary-2026-02-18.md`
   - short functional snapshot
4. `LEGACY_NOTES.md`
   - older post/user/schema extension notes
5. this file
   - long-form implementation guide and historical notes

<!-- TOC -->

- [How add custom API to Ghost](#how-add-custom-api-to-ghost)
    - [Install or update custom packages](#install-or-update-custom-packages)
    - [Purpose](#purpose)
        - [Add table definition into schema.js](#add-table-definition-into-schemajs)
        - [Run knex migration](#run-knex-migration)
    - [Create Model core/server/models/](#create-model-coreservermodels)
    - [Create API Controller core/server/api/endpoints](#create-api-controller-coreserverapiendpoints)
        - [Create API Controller](#create-api-controller)
        - [Create API Controller /core/server/api/endpoints](#create-api-controller-coreserverapiendpoints)
    - [API Routes core/server/web/api/endpoints/admin/](#api-routes-coreserverwebapiendpointsadmin)
        - [Append routes and API Controller mapping](#append-routes-and-api-controller-mapping)
        - [Append Routes to allowlisted](#append-routes-to-allowlisted)
    - [Other files](#other-files)
    - [Summary of related files](#summary-of-related-files)
    - [API Test](#api-test)
    - [Change table of Ghost post](#change-table-of-ghost-post)
        - [Add group_id filter to post GET API](#add-group_id-filter-to-post-get-api)
        - [Add counts of bookmarks, favors, forwards, and posts in group to post GET result](#add-counts-of-bookmarks-favors-forwards-and-posts-in-group-to-post-get-result)
    - [Add count of follow, followed to user GET result](#add-count-of-follow-followed-to-user-get-result)
    - [Project build](#project-build)
    - [Customed Admin API](#customed-admin-api)
        - [Custom API summary](#custom-api-summary)
        - [Custom API data structure](#custom-api-data-structure)
        - [Extend Ghost table](#extend-ghost-table)
        - [Extend GhostSDK/admin-api-schema](#extend-ghostsdkadmin-api-schema)
        - [Extend Ghost post API](#extend-ghost-post-api)
        - [Extend Ghost user API](#extend-ghost-user-api)
        - [Extend role data for group](#extend-role-data-for-group)
        - [All custom migration files](#all-custom-migration-files)

<!-- /TOC -->

---

## Install or update custom packages  

- Custom ghost base version of Ghost 5.115.0

- Node version

`nvm use v20.19.0`

- install `yalc` to reference local package  

`npm i yalc -g` or `yarn global add yalc`

- Clone GhostSDK custom package  

`clone https://github.com/aidabo/Ghost-SDK.git`  

- Publish `admin-api-schema` as local yalc package  

```sh
cd GhostSDK/packages/admin-api-schema
yalc publish --private
```

- Clone Ghost customed version  

```sh
clone https://github.com/aidabo/Ghost-SDK.git -b v5.115.1-next
cd Ghost/ghost/core
yalc add @tryghost/admin-api-schema
```

- Change your `cocnfig.development.json`  

`ghost/core/core/shared/config/env/config.development.json`  

- Install packages and build  

```sh
cd Ghost
yarn fix
yarn build
```

- Run 

`yarn dev` or `yarn dev:debug`  

---

- Run migration js if updated

Delete from migration files from `migrations` table
Run `knex-migrator`

```sh
cd Ghost
yarn knex-migrator migrate
```

## Purpose

- Create table `social_bookmarks`
- Create API to query, read, add, delete table social_booknarks
    - POST: */ghost/api/admin/social/bookmarks/*
    ```        json    
            {
                "socialbookmarks": [
                    {
                        "post_id": "67fc90513336d884cbd8c6cc",
                        "user_id": "1"
                    }
                ]
            } 
    ``` 
- Create permissions for specified Ghost roles 

Migration file path: `ghost/core/core/server/data/migrations/versions/5.115/2025-04-01-21-00-03-add-social-bookmarks-permissions.js`  

Object value of `object: 'socialbookmark'` in permissions is the same of export name of `social-bookmarks.js`, but ignore upper-lower case.  

*TODO: Role check: User owner and administrator or editor can delete bookmarks*

```js of permissions
const {combineTransactionalMigrations, addPermissionWithRoles} = require('../../utils');

module.exports = combineTransactionalMigrations(
    addPermissionWithRoles({
        name: 'Browse Bookmarks',
        action: 'browse',
        object: 'socialbookmark'
    }, ['Administrator', 'Editor', 'Author']),
    addPermissionWithRoles({
        name: 'Read Bookmarks',
        action: 'read',
        object: 'socialbookmark'
    }, ['Administrator', 'Editor', 'Author']),
    addPermissionWithRoles({
        name: 'Add Bookmarks',
        action: 'add',
        object: 'socialbookmark'
    }, ['Administrator', 'Editor', 'Author']),
    addPermissionWithRoles({
        name: 'Delete Bookmarks',
        action: 'destroy',
        object: 'socialbookmark'
    }, ['Administrator', 'Editor', 'Author'])
);
```

### Add table definition into schema.js

Ghost some validation use `schema.js` to validate table, so besides of migration js file, you need add the same declaration of table into `schema.js`.    

`schema.js` path is `ghost/core/core/server/data/schema/schema.js`.  


```json added to schema
    social_bookmarks: {
        id: {type: 'string', maxlength: 24, nullable: false, primary: true},
        user_id: {type: 'string', maxlength: 24, nullable: false, unique: false, references: 'users.id', cascadeDelete: true},
        post_id: {type: 'string', maxlength: 24, nullable: false, unique: false, references: 'posts.id', cascadeDelete: true},
        created_at: {type: 'dateTime', nullable: false},
        created_by: {type: 'string', maxlength: 24, nullable: false},
        '@@UNIQUE_CONSTRAINTS@@': [
            ['user_id', 'post_id']
        ]    
    },    
```

### Run knex migration

Run migration command to create table.

`yarn knex migrator migrate`

---

## Create Model (core/server/models/)

Ghost model use bookshelf framework, just extend it as `ghost/core/core/server/models/social-bookmarks.js`.  


```js of bookmarks model
const ObjectId = require('bson-objectid').default;
const ghostBookshelf = require('./base');
const errors = require('@tryghost/errors');
const models = require('./index');
const debug = require('@tryghost/debug')('models');
const SocialBookmark = ghostBookshelf.Model.extend({
    tableName: 'social_bookmarks', 

    defaults() {
        return {
            id: ObjectId().toHexString()
        };
    },

    user() {
        return this.belongsTo('User', 'user_id');
    },

    post() {
        return this.belongsTo('Post', 'post_id');
    },

    initialize() {
        // @ts-ignore
        ghostBookshelf.Model.prototype.initialize.call(this);
        this.on('saving', this.validateFields);
    },

    async validateFields(model) {
        const postId = model.get('post_id');
        const userId = model.get('user_id');

        if (!postId) {
            throw new errors.ValidationError({message: '`post_id` is required.'});
        }
 
        if (!userId) {
            throw new errors.ValidationError({message: '`user_id` is required.'});
        }

        // @ts-ignore
        const post = await models.Post.findOne({id: postId}, {withRelated: ['authors']});
        if (!post) {
            throw new errors.NotFoundError({message: `Post with ID ${postId} not found.`});
        }

        // @ts-ignore
        const user = await models.User.findOne({id: userId});
        if (!user) {
            throw new errors.NotFoundError({message: `User with ID ${userId} not found.`});
        }

        const postAuthorId = post.related('authors').find(author => author.id === userId);
        if (postAuthorId) {
            throw new errors.ValidationError({message: `Users cannot bookmark their own posts.`});
        }
    }
});

module.exports = {
    SocialBookmark: ghostBookshelf.model('SocialBookmark', SocialBookmark)
};
```

---

## Create API Controller (core/server/api/endpoints)

API Controller file is server entry point, create `ghost/core/core/server/api/endpoints/social-bookmarks.js`.  

### Create API Controller

```js of API Controller
const tpl = require('@tryghost/tpl');
const errors = require('@tryghost/errors');
const models = require('../../models');
const logging = require('@tryghost/logging');
const ALLOWED_INCLUDES = [];

const messages = {
    bookmarkNotFound: 'Bookmark not found.',
    duplicateBookmark: 'Bookmark already exists for this post and user.'
};

/** @type {import('@tryghost/api-framework').Controller} */
const controller = {
    docName: 'socialbookmarks',

    browse: {
        headers: {
            cacheInvalidate: false
        },
        options: [
            'include',
            'page',
            'limit',
            'fields',
            'filter',
            'order',
            'debug'
        ],
        validation: {
            options: {
                include: ALLOWED_INCLUDES
            }
        },
        permissions: true,
        query(frame) {  
            return models.SocialBookmark.findPage(frame.options);
        }

    },

    read: {
        headers: {cacheInvalidate: false},
        options: ['include'],
        data: ['id', 'user_id', 'post_id'],
        permissions: true,
        query(frame) {
            return models.SocialBookmark.findOne(frame.data, frame.options)
                .then((bookmark) => {
                    if (!bookmark) {
                        return Promise.reject(new errors.NotFoundError({
                            message: tpl(messages.bookmarkNotFound)
                        }));
                    }
                    return bookmark;
                });
        }
    },

    add: {
        statusCode: 201,
        headers: {cacheInvalidate: false},
        options: ['include'],
        data: ['post_id'],
        permissions: true,
        async query(frame) {
            try {
                // @ts-ignore
                return await models.SocialBookmark.add(frame.data.bookmarks[0], frame.options);
            } catch (err) {
                logging.error(err);
                if (err.code === 'ER_DUP_ENTRY') {
                    throw new errors.InternalServerError({
                        message: tpl(messages.duplicateBookmark, frame.data.bookmarks)
                    });
                }
                throw err;
            }
        }
    },

    destroy: {
        statusCode: 204,
        headers: {cacheInvalidate: false},
        options: ['id'],
        permissions: true,
        query(frame) {
            // @ts-ignore
            return models.SocialBookmark.destroy({...frame.options, require: true});
        }
    }
};

module.exports = controller;
```

Above `Add` has data structure of `frame.data.bookmarks[0]`, so only add one record, no bulk processing. json file as following.  


```json    
            {
                "bookmarks": [
                    {
                        "post_id": "67fc90513336d884cbd8c6cc",
                        "user_id": "1"
                    }
                ]
            } 
``` 

### Create API Controller (/core/server/api/endpoints)

Add API Controller declaration into `ghost/core/core/server/api/endpoints/index.js`.

```js declare API Controller 
    //custom added
    get socialBookmarks() {
        return apiFramework.pipeline(require('./social-bookmarks'), localUtils);
    },
```

---

## API Routes (core/server/web/api/endpoints/admin/)

### Append routes and API Controller mapping

`ghost/core/core/server/web/api/endpoints/admin/routes.js`  
`ghost/core/core/server/web/api/endpoints/admin/custom-routes.js`

To add new routing information in web `routes.js`, modify `routes.js` as following.  

In `routes.js`  


```js
    customApi(router);
```

In new file of `custom-routes.js`  


```js
const api = require('../../../../api').endpoints;
const {http} = require('@tryghost/api-framework');
const mw = require('./middleware');

/**
 * @returns {import('express').Router}
 */
module.exports = function customApiRoutes(router) {
    // Bookmarks
    router.get('/social/bookmarks', mw.authAdminApi, http(api.socialBookmarks.browse));
    router.get('/social/bookmarks/:id', mw.authAdminApi, http(api.socialBookmarks.read));
    router.post('/social/bookmarks', mw.authAdminApi, http(api.socialBookmarks.add));
    router.del('/social/bookmarks/:id', mw.authAdminApi, http(api.socialBookmarks.destroy));

    return router;
};
```

The name of `socialBookmarks` in `api.socialBookmarks.browse` must be the same as API Controller declaration in `index.js` API Ccontroller 

`ghost/core/core/server/api/endpoints/index.js`  


```js
   get socialBookmarks() {
        return apiFramework.pipeline(require('./social-bookmarks'), localUtils);
    },
```

### Append Routes to `allowlisted`

Append routes to `allowlisted` of `ghost/core/core/server/web/api/endpoints/admin/middleware.js`.  

`social: ['GET', 'POST', 'DELETE', 'PUT']`  


```js 
const allowlisted = {
        //Ghost http route
        //Added custom route
        social: ['GET', 'POST', 'DELETE', 'PUT']
    };
```

---

## Other files 

Modify file of `ghost/api-framework/lib/validators/input/all.js` to add routes path of `socialbookmark` to permission check function.
`['posts', 'tags']` -> `['posts', 'tags', 'social']`


```js
// NOTE: this block should be removed completely once JSON Schema validations
        //       are introduced for all of the endpoints
        if (!['posts', 'tags', 'social'].includes(apiConfig.docName)) {
            if (_.isEmpty(frame.data) || _.isEmpty(frame.data[apiConfig.docName]) || _.isEmpty(frame.data[apiConfig.docName][0])) {
                return Promise.reject(new BadRequestError({
                    message: tpl(messages.noRootKeyProvided, {docName: apiConfig.docName})
                }));
            }
        }
```        

---

## Summary of related files

| Functions      | New/Modify | File                                                                                                    |
|----------------|------------|---------------------------------------------------------------------------------------------------------|
| Table          | New        | ghost/core/core/server/data/migrations/versions/5.115/2025-04-01-21-00-02-add-social-bookmarks-table.js |
|                | New        | ghost/core/core/server/data/migrations/versions/5.115/2025-04-01-21-00-03-add-social-bookmarks-permissions.js     |
|                | Append     | ghost/core/core/server/data/schema/schema.js                                                            |
| Model          | New        | ghost/core/core/server/models/social-bookmarks.js                                                        |
| API Controller | New        | ghost/core/core/server/api/endpoints/social-bookmarks.js                                                |
|                | Append     | ghost/core/core/server/api/endpoints/index.js                                                           |
|                | Modify     | ghost/api-framework/lib/validators/input/all.js                                                         |
| API Routes     | Append     | ghost/core/core/server/web/api/endpoints/admin/routes.js                                                |
|                | New        | ghost/core/core/server/web/api/endpoints/admin/custom-routes.js                                         |
|                | Modify     | ghost/core/core/server/web/api/endpoints/admin/middleware.js                                            |

---

## API Test

- Add bookmarks

```json
curl -i -X POST \
   -H "Content-Type:application/json" \
   -H "Set-Cookie:ghost-admin-api-session s%3Aaqbf8VZkpSrOyKBxWi6PGqRbgc4NizE4.UKUK0AIWDnImNdo2k2Tgs8s4nVqR%2BD6EeQ3sHDOld78; pma_lang=ja" \
   -H "App-Version:v5.0" \
   -H "Origin:http://localhost:3000" \
   -d \
'{
    "socialbookmarks": [
        {
            "post_id": "67fc94573336d884cbd8c6e1",
            "user_id": "1"
        }
    ]
}' \
 'http://localhost:2368/ghost/api/admin/social/bookmarks'
```

![alt text](https://s3-ap-northeast-1.amazonaws.com/legend-file-upload-240805/2025/04/custom03.png)


- Get bookmarks

```json
curl -i -X GET \
   -H "Content-Type:application/json" \
   -H "Set-Cookie:ghost-admin-api-session=s%3Aaqbf8VZkpSrOyKBxWi6PGqRbgc4NizE4.UKUK0AIWDnImNdo2k2Tgs8s4nVqR%2BD6EeQ3sHDOld78; pma_lang=ja" \
   -H "App-Version:v5.0" \
   -H "Origin:http://localhost:3000" \
 'http://localhost:2368/ghost/api/admin/social/bookmarks/'
```



![alt text](https://s3-ap-northeast-1.amazonaws.com/legend-file-upload-240805/2025/04/custom04.png)

- Delete bookmarks

```json
curl -i -X DELETE \
   -H "Content-Type:application/json" \
   -H "Set-Cookie:ghost-admin-api-session s%3Aaqbf8VZkpSrOyKBxWi6PGqRbgc4NizE4.UKUK0AIWDnImNdo2k2Tgs8s4nVqR%2BD6EeQ3sHDOld78; pma_lang=ja" \
   -H "App-Version:v5.0" \
   -H "Origin:http://localhost:3000" \
 'http://localhost:2368/ghost/api/admin/social/bookmarks/681729966a103f48b96844ff'
```

![alt text](https://s3-ap-northeast-1.amazonaws.com/legend-file-upload-240805/2025/04/custom05.png)

---

## Legacy extension notes

Older notes for:

- post `group_id` and count extensions
- user follow/followed count extensions
- historical custom admin API payload examples
- older `5.115` migration family

have been moved to:

- [LEGACY_NOTES.md](./LEGACY_NOTES.md)

---

## Backend image custom source and migration safety (2026-08-17)

The production backend image is based on the upstream `ghost:5.116.2-alpine`
image. Custom source files that are required by `ghost/core/core/boot.js` must
be copied explicitly in `.docker/prd.Dockerfile`.

Currently copied custom services include:

- `core/server/services/post-search-index`
- `core/server/services/post-media-index`
- `core/server/services/social-comments`

Do not copy the whole `core/server/services` directory by default. That would
replace upstream Ghost services unnecessarily, increase the image diff, and
make future upstream updates harder to audit. Add a directory-specific `COPY`
when `boot.js` or another runtime entrypoint introduces a custom service.

The DZI and Chart job table definitions must not declare the same index twice.
Keep the single-column `status` index in `@@INDEXES@@`; do not also set
`status.index: true`, because Ghost's schema builder emits both definitions and
MySQL rejects the duplicate key name with `ER_DUP_KEYNAME`.

The `2026-08-17-00-00-00-repair-social-ai-job-indexes.js` migration is
non-transactional and idempotent. It repairs indexes when an earlier MySQL DDL
migration created a table before failing, and safely skips indexes that already
exist.
