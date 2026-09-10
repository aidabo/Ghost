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

# Simplified COPY section (grouped by directory)
COPY --chown=node:node .docker/components/tryghost-api-framework-5.116.2.tgz ${GHOST_INSTALL}/current/core/components
COPY --chown=node:node ghost/core/core/server/data/schema/schema.js ${GHOST_INSTALL}/current/core/server/data/schema
COPY --chown=node:node ghost/core/core/server/api/endpoints ${GHOST_INSTALL}/current/core/server/api/endpoints
COPY --chown=node:node ghost/core/core/server/data/migrations/versions/5.115 ${GHOST_INSTALL}/current/core/server/data/migrations/versions/5.115
COPY --chown=node:node ghost/core/core/server/data/migrations/versions/5.116 ${GHOST_INSTALL}/current/core/server/data/migrations/versions/5.116
COPY --chown=node:node ghost/core/core/server/models ${GHOST_INSTALL}/current/core/server/models
COPY --chown=node:node ghost/core/core/server/services/mail ${GHOST_INSTALL}/current/core/server/services/mail
COPY --chown=node:node ghost/core/core/server/services/stripe/StripeAPI.js ${GHOST_INSTALL}/current/core/server/services/stripe
COPY --chown=node:node ghost/core/core/server/services/stripe/StripeService.js ${GHOST_INSTALL}/current/core/server/services/stripe
COPY --chown=node:node ghost/core/core/server/services/stripe/WebhookController.js ${GHOST_INSTALL}/current/core/server/services/stripe
COPY --chown=node:node ghost/core/core/server/services/stripe/WebhookManager.js ${GHOST_INSTALL}/current/core/server/services/stripe
COPY --chown=node:node ghost/core/core/server/services/stripe/services/webhook/CheckoutSessionEventService.js ${GHOST_INSTALL}/current/core/server/services/stripe/services/webhook
COPY --chown=node:node ghost/core/core/server/api/endpoints/member-invoices.js ${GHOST_INSTALL}/current/core/server/api/endpoints
COPY --chown=node:node ghost/core/core/server/api/endpoints/content-products.js ${GHOST_INSTALL}/current/core/server/api/endpoints
COPY --chown=node:node ghost/core/core/server/api/endpoints/content-products-admin.js ${GHOST_INSTALL}/current/core/server/api/endpoints
COPY --chown=node:node ghost/admin/app/utils/currency.js ${GHOST_INSTALL}/current/admin/app/utils
# The local development Admin build contains symlinks for Admin-X apps. Remove
# the base image's asset directory before copying the dereferenced production
# bundle, otherwise Docker cannot replace a directory symlink with a directory.
RUN rm -rf ${GHOST_INSTALL}/current/core/built/admin
COPY --chown=node:node ghost/core/core/built/admin ${GHOST_INSTALL}/current/core/built/admin
COPY --chown=node:node ghost/core/core/server/services/url/config.js ${GHOST_INSTALL}/current/core/server/services/url
COPY --chown=node:node ghost/core/core/server/web/api/endpoints/admin ${GHOST_INSTALL}/current/core/server/web/api/endpoints/admin
COPY --chown=node:node ghost/core/core/server/web/api/endpoints/content ${GHOST_INSTALL}/current/core/server/web/api/endpoints/content
COPY --chown=node:node ghost/core/core/server/web/members/app.js ${GHOST_INSTALL}/current/core/server/web/members/app.js
COPY --chown=node:node ghost/core/core/shared/config/overrides.json ${GHOST_INSTALL}/current/core/shared/config/overrides.json
COPY --chown=node:node ghost/core/core/boot.js ${GHOST_INSTALL}/current/core
COPY --chown=node:node ghost/core/core/server/services/social-comments ${GHOST_INSTALL}/current/core/server/services/social-comments
COPY --chown=node:node ghost/core/core/server/services/post-search-index ${GHOST_INSTALL}/current/core/server/services/post-search-index
COPY --chown=node:node ghost/core/core/server/services/post-media-index ${GHOST_INSTALL}/current/core/server/services/post-media-index
COPY --chown=node:node ghost/core/core/server/adapters/scheduling/post-scheduling/PostScheduler.js ${GHOST_INSTALL}/current/core/server/adapters/scheduling/post-scheduling
COPY --chown=node:node ghost/core/core/server/lib/common ${GHOST_INSTALL}/current/core/server/lib/common
COPY --chown=node:node ghost/core/core/server/lib/person-graph ${GHOST_INSTALL}/current/core/server/lib/person-graph
COPY --chown=node:node ghost/core/core/server/lib/person-story ${GHOST_INSTALL}/current/core/server/lib/person-story
COPY --chown=node:node ghost/core/core/server/lib/lexical.js ${GHOST_INSTALL}/current/core/server/lib

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

# The dependency install above recreates node_modules, so custom members-api
# modules must be overlaid after it completes.
COPY --chown=node:node ghost/members-api/lib/controllers/MemberController.js ${GHOST_INSTALL}/current/node_modules/@tryghost/members-api/lib/controllers/
COPY --chown=node:node ghost/members-api/lib/controllers/RouterController.js ${GHOST_INSTALL}/current/node_modules/@tryghost/members-api/lib/controllers/
COPY --chown=node:node ghost/members-api/lib/repositories/MemberRepository.js ${GHOST_INSTALL}/current/node_modules/@tryghost/members-api/lib/repositories/
COPY --chown=node:node ghost/members-api/lib/services/PaymentsService.js ${GHOST_INSTALL}/current/node_modules/@tryghost/members-api/lib/services/

WORKDIR $GHOST_INSTALL
VOLUME $GHOST_CONTENT

COPY .docker/prd.docker-entrypoint.sh /usr/local/bin
ENTRYPOINT ["docker-entrypoint.sh"]

EXPOSE 2368
CMD ["node", "current/index.js"]
