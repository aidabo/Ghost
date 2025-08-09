# syntax=docker.io/docker/dockerfile:1
FROM ghost:5.116.2-alpine

# Set timezone
ENV TZ=Asia/Tokyo
RUN apk add --no-cache tzdata && \
    cp /usr/share/zoneinfo/$TZ /etc/localtime && \
    echo $TZ > /etc/timezone

ENV GHOST_INSTALL=/var/lib/ghost
ENV GHOST_CONTENT=/var/lib/ghost/content
ENV GHOST_VERSION=5.116.2 

# Custom package name of lexical editor
ENV KG_NODES=@tryghost/kg-default-nodes
ENV KG_HTML_RENDERER=@tryghost/kg-lexical-html-renderer
ENV ADMIN_API_SCHEMA=@tryghost/admin-api-schema

# Copy local package
COPY --chown=node:node ghost/core/.yalc ${GHOST_INSTALL}/current/.yalc

# Modify package.json to use local .yalc packages
RUN set -eux; \
    cd ${GHOST_INSTALL}/current && \
    gosu node sed -i -e '/"@tryghost\/url-utils": "4.4.8",/a "@tryghost/user-events": "file:.yalc/@tryghost/user-events",' package.json && \
    gosu node sed -i 's/"@tryghost\/kg-default-nodes": "1\.4\.5"/"@tryghost\/kg-default-nodes": "file:.yalc\/@tryghost\/kg-default-nodes"/' package.json && \
    gosu node sed -i 's/"@tryghost\/kg-lexical-html-renderer": "1\.3\.5"/"@tryghost\/kg-lexical-html-renderer": "file:.yalc\/@tryghost\/kg-lexical-html-renderer"/' package.json && \
    gosu node sed -i 's/"@tryghost\/admin-api-schema": *"4\.5\.5"/"@tryghost\/admin-api-schema": "file:.yalc\/@tryghost\/admin-api-schema"/' package.json;

# use `git log --author="name@aaaa.com" --pretty=format:"" --name-status | sort -u` to get the list of customed files changed by author
# Set permissions
RUN chown -R node:node ${GHOST_CONTENT}

# 1. App package outside of core which is changed 
COPY --chown=node:node .docker/components/tryghost-api-framework-5.116.2.tgz ${GHOST_INSTALL}/current/core/components

# 2. Table's schema changed
COPY --chown=node:node ghost/core/core/server/data/schema/schema.js ${GHOST_INSTALL}/current/core/server/data/schema

# 3. Server endpoint Api changed
COPY --chown=node:node ghost/core/core/server/api/endpoints/index.js ${GHOST_INSTALL}/current/core/server/api/endpoints
COPY --chown=node:node ghost/core/core/server/api/endpoints/posts.js ${GHOST_INSTALL}/current/core/server/api/endpoints
COPY --chown=node:node ghost/core/core/server/api/endpoints/users.js ${GHOST_INSTALL}/current/core/server/api/endpoints
COPY --chown=node:node ghost/core/core/server/api/endpoints/tags.js ${GHOST_INSTALL}/current/core/server/api/endpoints 
COPY --chown=node:node ghost/core/core/server/api/endpoints/tags-public.js ${GHOST_INSTALL}/current/core/server/api/endpoints 
COPY --chown=node:node ghost/core/core/server/api/endpoints/utils/permissions.js ${GHOST_INSTALL}/current/core/server/api/endpoints 

# 4. Server endpoint Api added
COPY --chown=node:node ghost/core/core/server/api/endpoints/social-bookmarks.js ${GHOST_INSTALL}/current/core/server/api/endpoints
COPY --chown=node:node ghost/core/core/server/api/endpoints/social-favors.js ${GHOST_INSTALL}/current/core/server/api/endpoints
COPY --chown=node:node ghost/core/core/server/api/endpoints/social-follows.js ${GHOST_INSTALL}/current/core/server/api/endpoints
COPY --chown=node:node ghost/core/core/server/api/endpoints/social-forwards.js ${GHOST_INSTALL}/current/core/server/api/endpoints
COPY --chown=node:node ghost/core/core/server/api/endpoints/social-group-members.js ${GHOST_INSTALL}/current/core/server/api/endpoints
COPY --chown=node:node ghost/core/core/server/api/endpoints/social-groups.js ${GHOST_INSTALL}/current/core/server/api/endpoints
COPY --chown=node:node ghost/core/core/server/api/endpoints/social-post-comment-replies.js ${GHOST_INSTALL}/current/core/server/api/endpoints
COPY --chown=node:node ghost/core/core/server/api/endpoints/social-post-comments.js ${GHOST_INSTALL}/current/core/server/api/endpoints
COPY --chown=node:node ghost/core/core/server/api/endpoints/social-post-comment-report.js ${GHOST_INSTALL}/current/core/server/api/endpoints

# 5. Migration script added
COPY --chown=node:node ghost/core/core/server/data/migrations/versions/5.115/2025-04-01-16-00-00-drop-social-tables.js ${GHOST_INSTALL}/current/core/server/data/migrations/versions/5.115
COPY --chown=node:node ghost/core/core/server/data/migrations/versions/5.115/2025-04-01-17-00-10-add-social-groups-table.js ${GHOST_INSTALL}/current/core/server/data/migrations/versions/5.115
COPY --chown=node:node ghost/core/core/server/data/migrations/versions/5.115/2025-04-01-17-00-11-add-social-groups-permissions.js ${GHOST_INSTALL}/current/core/server/data/migrations/versions/5.115
COPY --chown=node:node ghost/core/core/server/data/migrations/versions/5.115/2025-04-01-18-00-00-add-social-group-column-to-post.js ${GHOST_INSTALL}/current/core/server/data/migrations/versions/5.115
COPY --chown=node:node ghost/core/core/server/data/migrations/versions/5.115/2025-04-01-18-00-01-add-social-index-group-to-post.js ${GHOST_INSTALL}/current/core/server/data/migrations/versions/5.115
COPY --chown=node:node ghost/core/core/server/data/migrations/versions/5.115/2025-04-01-20-00-00-add-social-group-admin-role.js ${GHOST_INSTALL}/current/core/server/data/migrations/versions/5.115
COPY --chown=node:node ghost/core/core/server/data/migrations/versions/5.115/2025-04-01-20-00-00-add-social-group-owner-role.js ${GHOST_INSTALL}/current/core/server/data/migrations/versions/5.115
COPY --chown=node:node ghost/core/core/server/data/migrations/versions/5.115/2025-04-01-20-00-01-add-social-group-member-role.js ${GHOST_INSTALL}/current/core/server/data/migrations/versions/5.115
COPY --chown=node:node ghost/core/core/server/data/migrations/versions/5.115/2025-04-01-21-00-00-add-social-follows-table.js ${GHOST_INSTALL}/current/core/server/data/migrations/versions/5.115
COPY --chown=node:node ghost/core/core/server/data/migrations/versions/5.115/2025-04-01-21-00-01-add-social-follows-permissions.js ${GHOST_INSTALL}/current/core/server/data/migrations/versions/5.115
COPY --chown=node:node ghost/core/core/server/data/migrations/versions/5.115/2025-04-01-21-00-02-add-social-bookmarks-table.js ${GHOST_INSTALL}/current/core/server/data/migrations/versions/5.115
COPY --chown=node:node ghost/core/core/server/data/migrations/versions/5.115/2025-04-01-21-00-03-add-social-bookmarks-permissions.js ${GHOST_INSTALL}/current/core/server/data/migrations/versions/5.115
COPY --chown=node:node ghost/core/core/server/data/migrations/versions/5.115/2025-04-01-21-00-04-add-social-favors-table.js ${GHOST_INSTALL}/current/core/server/data/migrations/versions/5.115
COPY --chown=node:node ghost/core/core/server/data/migrations/versions/5.115/2025-04-01-21-00-05-add-social-favors-permissions.js ${GHOST_INSTALL}/current/core/server/data/migrations/versions/5.115
COPY --chown=node:node ghost/core/core/server/data/migrations/versions/5.115/2025-04-01-21-00-06-add-social-forwards-table.js ${GHOST_INSTALL}/current/core/server/data/migrations/versions/5.115
COPY --chown=node:node ghost/core/core/server/data/migrations/versions/5.115/2025-04-01-21-00-07-add-social-forwards-permissions.js ${GHOST_INSTALL}/current/core/server/data/migrations/versions/5.115
COPY --chown=node:node ghost/core/core/server/data/migrations/versions/5.115/2025-04-01-21-00-12-add-social-groups-members-table.js ${GHOST_INSTALL}/current/core/server/data/migrations/versions/5.115
COPY --chown=node:node ghost/core/core/server/data/migrations/versions/5.115/2025-04-01-21-00-13-add-social-groups-members-permissions.js ${GHOST_INSTALL}/current/core/server/data/migrations/versions/5.115
COPY --chown=node:node ghost/core/core/server/data/migrations/versions/5.115/2025-04-01-21-00-17-add-social-post-comments-table.js ${GHOST_INSTALL}/current/core/server/data/migrations/versions/5.115
COPY --chown=node:node ghost/core/core/server/data/migrations/versions/5.115/2025-04-01-21-00-18-add-social-post-comments-permissions.js ${GHOST_INSTALL}/current/core/server/data/migrations/versions/5.115
COPY --chown=node:node ghost/core/core/server/data/migrations/versions/5.115/2025-04-01-21-01-19-add-social-post-comments-like-table.js ${GHOST_INSTALL}/current/core/server/data/migrations/versions/5.115
COPY --chown=node:node ghost/core/core/server/data/migrations/versions/5.115/2025-04-01-21-01-20-add-social-post-comments-like-permissions.js ${GHOST_INSTALL}/current/core/server/data/migrations/versions/5.115
COPY --chown=node:node ghost/core/core/server/data/migrations/versions/5.115/2025-04-01-21-01-21-add-social-post-comments-report-table.js ${GHOST_INSTALL}/current/core/server/data/migrations/versions/5.115
COPY --chown=node:node ghost/core/core/server/data/migrations/versions/5.115/2025-04-01-21-01-22-add-social-post-comments-report-permissions.js ${GHOST_INSTALL}/current/core/server/data/migrations/versions/5.115
COPY --chown=node:node ghost/core/core/server/data/migrations/versions/5.115/2025-06-15-15-00-00-add-social-groups-count-permissions.js ${GHOST_INSTALL}/current/core/server/data/migrations/versions/5.115
COPY --chown=node:node ghost/core/core/server/data/migrations/versions/5.115/2025-06-22-00-00-00-add-social-tag-count-permissions.js ${GHOST_INSTALL}/current/core/server/data/migrations/versions/5.115
COPY --chown=node:node ghost/core/core/server/data/migrations/versions/5.115/2025-06-26-00-00-00-add-social-group-trash-for-administrator.js ${GHOST_INSTALL}/current/core/server/data/migrations/versions/5.115
COPY --chown=node:node ghost/core/core/server/data/migrations/versions/5.115/2025-06-26-01-00-00-add-social-group-column-of-image.js ${GHOST_INSTALL}/current/core/server/data/migrations/versions/5.115
COPY --chown=node:node ghost/core/core/server/data/migrations/versions/5.115/2025-07-12-00-00-00-add-social-tag-count-permissions.js ${GHOST_INSTALL}/current/core/server/data/migrations/versions/5.115

# 6. Model files changed
COPY --chown=node:node ghost/core/core/server/models/post.js ${GHOST_INSTALL}/current/core/server/models
COPY --chown=node:node ghost/core/core/server/models/user.js ${GHOST_INSTALL}/current/core/server/models
COPY --chown=node:node ghost/core/core/server/models/tag.js ${GHOST_INSTALL}/current/core/server/models
COPY --chown=node:node ghost/core/core/server/models/tag-public.js ${GHOST_INSTALL}/current/core/server/models

# 7. Model files added
COPY --chown=node:node ghost/core/core/server/models/social-bookmark.js ${GHOST_INSTALL}/current/core/server/models
COPY --chown=node:node ghost/core/core/server/models/social-favor.js ${GHOST_INSTALL}/current/core/server/models
COPY --chown=node:node ghost/core/core/server/models/social-follow.js ${GHOST_INSTALL}/current/core/server/models
COPY --chown=node:node ghost/core/core/server/models/social-forward.js ${GHOST_INSTALL}/current/core/server/models
COPY --chown=node:node ghost/core/core/server/models/social-group-members.js ${GHOST_INSTALL}/current/core/server/models
COPY --chown=node:node ghost/core/core/server/models/social-groups.js ${GHOST_INSTALL}/current/core/server/models
COPY --chown=node:node ghost/core/core/server/models/social-post-comment-like.js ${GHOST_INSTALL}/current/core/server/models
COPY --chown=node:node ghost/core/core/server/models/social-post-comment-report.js ${GHOST_INSTALL}/current/core/server/models
COPY --chown=node:node ghost/core/core/server/models/social-post-comments.js ${GHOST_INSTALL}/current/core/server/models

# 8. Email templates changed
COPY --chown=node:node ghost/core/core/server/services/mail/templates/invite-user.html ${GHOST_INSTALL}/current/core/server/services/mail/templates
COPY --chown=node:node ghost/core/core/server/services/mail/templates/invite-user-by-api-key.html ${GHOST_INSTALL}/current/core/server/services/mail/templates
COPY --chown=node:node ghost/core/core/server/services/mail/templates/raw/invite-user.html ${GHOST_INSTALL}/current/core/server/services/mail/templates
COPY --chown=node:node ghost/core/core/server/services/mail/templates/raw/reset-password.html ${GHOST_INSTALL}/current/core/server/services/mail/templates
COPY --chown=node:node ghost/core/core/server/services/mail/templates/raw/test.html ${GHOST_INSTALL}/current/core/server/services/mail/templates
COPY --chown=node:node ghost/core/core/server/services/mail/templates/raw/welcome.html ${GHOST_INSTALL}/current/core/server/services/mail/templates
COPY --chown=node:node ghost/core/core/server/services/mail/templates/reset-password.html ${GHOST_INSTALL}/current/core/server/services/mail/templates
COPY --chown=node:node ghost/core/core/server/services/mail/templates/test.html ${GHOST_INSTALL}/current/core/server/services/mail/templates
COPY --chown=node:node ghost/core/core/server/services/mail/templates/welcome.html ${GHOST_INSTALL}/current/core/server/services/mail/templates

# 9. config.js changed
COPY --chown=node:node ghost/core/core/server/services/url/config.js ${GHOST_INSTALL}/current/core/server/services/url

# 10. Web route admin changed
COPY --chown=node:node ghost/core/core/server/web/api/endpoints/admin/custom-routes.js ${GHOST_INSTALL}/current/core/server/web/api/endpoints/admin
COPY --chown=node:node ghost/core/core/server/web/api/endpoints/admin/middleware.js ${GHOST_INSTALL}/current/core/server/web/api/endpoints/admin
COPY --chown=node:node ghost/core/core/server/web/api/endpoints/admin/routes.js ${GHOST_INSTALL}/current/core/server/web/api/endpoints/admin

# 11. Web route content changed
COPY --chown=node:node ghost/core/core/server/web/api/endpoints/content/routes.js ${GHOST_INSTALL}/current/core/server/web/api/endpoints/content

# 12. overrides.js changed
COPY --chown=node:node ghost/core/core/shared/config/overrides.json ${GHOST_INSTALL}/current/core/shared/config/overrides.json

# 13 boot.js changed, adding social-comments.init()
COPY --chown=node:node ghost/core/core/boot.js ${GHOST_INSTALL}/current/core

# 14 Social-comments service folder added
COPY --chown=node:node ghost/core/core/server/services/social-comments ${GHOST_INSTALL}/current/core/server/services/social-comments

# Install dependencies as node user
RUN set -eux; \
    cd ${GHOST_INSTALL}/current && \
  	# Reinstall
	rm -rf node_modules; \
	gosu node yarn --production --force; \
	gosu node yarn cache clean; \
	gosu node npm cache clean --force; \
	npm cache clean --force; \
	rm -rv /tmp/yarn*;

WORKDIR $GHOST_INSTALL
VOLUME $GHOST_CONTENT

COPY .docker/prd.docker-entrypoint.sh /usr/local/bin
ENTRYPOINT ["docker-entrypoint.sh"]

EXPOSE 2368
CMD ["node", "current/index.js"]
