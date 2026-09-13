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
# Fresh-install seeds: knex-migrator's init() builds the permissions table from
# fixtures.json and first-boot populateDefaults() seeds settings from
# default-settings.json. Neither runs the versioned migrations, so these two
# files must ship in the image; only /data/ghost/content is a volume.
COPY --chown=node:node ghost/core/core/server/data/schema/fixtures/fixtures.json ${GHOST_INSTALL}/current/core/server/data/schema/fixtures
COPY --chown=node:node ghost/core/core/server/data/schema/default-settings/default-settings.json ${GHOST_INSTALL}/current/core/server/data/schema/default-settings
COPY --chown=node:node ghost/core/core/server/api/endpoints ${GHOST_INSTALL}/current/core/server/api/endpoints
COPY --chown=node:node ghost/core/core/server/data/migrations/versions/5.115 ${GHOST_INSTALL}/current/core/server/data/migrations/versions/5.115
COPY --chown=node:node ghost/core/core/server/data/migrations/versions/5.116 ${GHOST_INSTALL}/current/core/server/data/migrations/versions/5.116
# knex-migrator's init() runs migrations/init/* only and then records versions/**
# as done without running them, so a fresh database gets nothing that lives only
# in a versioned migration. hooks/init/after.js adds the FULLTEXT(ngram) indexes
# that schema.js cannot express. The base image ships upstream's hooks/init/,
# which has no `after`, so index.js must be overridden along with it.
COPY --chown=node:node ghost/core/core/server/data/migrations/hooks/init/after.js ${GHOST_INSTALL}/current/core/server/data/migrations/hooks/init
COPY --chown=node:node ghost/core/core/server/data/migrations/hooks/init/index.js ${GHOST_INSTALL}/current/core/server/data/migrations/hooks/init
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
# The Admin bundle is built on the host before `docker build`, not inside it:
# there is no Admin build step in this image, and the base image's own
# core/built/admin is upstream's build — it carries neither the JPY currency
# entry nor anything else local. Build it first with:
#   yarn nx run ghost-admin:build
#
# rm -rf first: Docker COPY merges into an existing directory rather than
# replacing it, so the base image's upstream files would otherwise survive
# alongside the local ones and leave a mixed bundle.
RUN rm -rf ${GHOST_INSTALL}/current/core/built/admin
COPY --chown=node:node ghost/core/core/built/admin ${GHOST_INSTALL}/current/core/built/admin

# Refuse to ship a development Admin bundle. `yarn dev` (ember serve) writes the
# five Admin-X entries as symlinks to ../../apps/*/dist — Docker COPY does not
# dereference symlinks, so they land dangling and every
# /ghost/assets/admin-x-*/<app>.js 404s, which the Admin surfaces as
# "Loading interrupted / Loadless" on the Settings screen. A production build
# (admin/lib/asset-delivery) copies real directories and hashes filenames.
# This guards against `yarn dev` having re-poisoned core/built/admin after the
# production build and before this build ran.
RUN set -eu; \
    for app in admin-x-demo admin-x-settings admin-x-activitypub posts stats; do \
      if [ -L "${GHOST_INSTALL}/current/core/built/admin/assets/$app" ]; then \
        echo "ERROR: assets/$app is a symlink — dev build"; exit 1; \
      fi; \
      if [ ! -f "${GHOST_INSTALL}/current/core/built/admin/assets/$app/$app.js" ]; then \
        echo "ERROR: assets/$app/$app.js is missing"; exit 1; \
      fi; \
    done; \
    if grep -q 'ember-cli-live-reload' "${GHOST_INSTALL}/current/core/built/admin/index.html"; then \
      echo "ERROR: index.html references ember-cli-live-reload — dev build"; exit 1; \
    fi; \
    if ! grep -q '%22environment%22%3A%22production%22' "${GHOST_INSTALL}/current/core/built/admin/index.html"; then \
      echo "ERROR: index.html is not an environment=production build"; exit 1; \
    fi; \
    if ! ls "${GHOST_INSTALL}/current/core/built/admin/assets" | grep -qE '^ghost-[0-9a-f]{16,}\.js$'; then \
      echo "ERROR: no hashed ghost-<hash>.js — dev build"; exit 1; \
    fi; \
    echo "OK: production Admin bundle with 5 dereferenced Admin-X apps"
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
