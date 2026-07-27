// Post keyword search over `post_search_index` using MySQL FULLTEXT(ngram),
// fronted by the shared Redis cache. Mirrors the estate search cache, but with
// POST-specific env vars and a `post:search:v1:` key prefix so post and estate
// keys never collide in the one shared Redis. Redis is optional: any Redis error
// falls back to a direct DB query. Returns ranked post ids (hydration to full
// post objects happens in the route/frontend layer).
const crypto = require('crypto');
const logging = require('@tryghost/logging');
const db = require('../../data/db');

const CACHE_PREFIX = 'post:search:v1:';

// Which FULLTEXT column each `field` maps to. Values are fixed identifiers (never
// user input) so they are safe to interpolate into the MATCH() expression.
const FIELD_COLUMN = {
    all: 'search_text',
    title: 'title_text',
    excerpt: 'excerpt_text',
    tag: 'tag_text',
    author: 'author_text'
};

// Columns a caller may order by. `score` is the FULLTEXT relevance. Anything not
// whitelisted is ignored (so an `order` string can never inject SQL).
const ORDERABLE = new Set(['score', 'published_at', 'updated_at', 'featured', 'status']);

// Parse an NQL-ish order string ("published_at desc,featured desc") into safe
// ORDER BY clauses. Defaults to relevance then recency when empty/invalid.
function parseOrder(orderStr) {
    const clauses = [];
    for (const part of String(orderStr || '').split(',')) {
        const [colRaw, dirRaw] = part.trim().split(/\s+/);
        const col = String(colRaw || '').toLowerCase();
        if (!ORDERABLE.has(col)) {
            continue;
        }
        const dir = String(dirRaw || 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';
        clauses.push(`${col} ${dir}`);
    }
    return clauses.length ? clauses : ['score DESC', 'published_at DESC'];
}

// ---- Redis (shared instance; post-specific TTL) ---------------------------
let redisClient;
let redisModuleMissing = false;   // permanent: the ioredis package is not installed
let redisCooldownUntil = 0;       // transient: skip Redis until this ms timestamp (fast DB fallback)
let redisWarned = false;

// After a connect failure, wait this long before retrying rather than latching the
// cache off for the whole process lifetime — so a brief Redis restart or a
// container-ordering race at boot recovers on its own.
const REDIS_COOLDOWN_MS = 30000;

function getRedisUrl() {
    if (process.env.POST_SEARCH_REDIS_ENABLED === 'false') {
        return null;
    }
    // Neutral first: the one shared Redis serves both estate and posts.
    return process.env.POST_SEARCH_REDIS_URL
        || process.env.SEARCH_REDIS_URL
        || process.env.REDIS_URL
        || process.env.ESTATE_SEARCH_REDIS_URL
        || 'redis://127.0.0.1:6379';
}

// POST-specific TTL: posts are edited at a different cadence than estate, so this
// is deliberately its own env var. Edits invalidate the cache anyway, so a longer
// TTL is safe (default 300s).
function getRedisTtlSeconds() {
    const ttl = Number(process.env.POST_SEARCH_REDIS_TTL_SECONDS || 300);
    return Number.isFinite(ttl) && ttl > 0 ? Math.trunc(ttl) : 300;
}

async function getRedisClient() {
    const url = getRedisUrl();
    if (!url || redisModuleMissing) {
        return null;
    }
    // Within the post-failure cooldown: skip Redis and serve from the DB directly,
    // without paying a connect attempt on every search.
    if (redisCooldownUntil && Date.now() < redisCooldownUntil) {
        return null;
    }
    if (!redisClient) {
        try {
            const Redis = require('ioredis');
            redisClient = new Redis(url, {
                lazyConnect: true,
                maxRetriesPerRequest: 1,
                enableOfflineQueue: false,
                connectTimeout: 500
            });
            redisClient.on('error', (err) => {
                if (!redisWarned) {
                    redisWarned = true;
                    logging.warn(`[post.search.cache] Redis error, falling back to DB search: ${err.message}`);
                }
            });
        } catch (err) {
            // ioredis is not installed → permanent; retrying can never help.
            redisModuleMissing = true;
            return null;
        }
    }
    try {
        if (redisClient.status === 'wait' || redisClient.status === 'end') {
            await redisClient.connect();
        }
        redisCooldownUntil = 0;   // connected: clear any backoff
        redisWarned = false;      // let a future outage warn again
        return redisClient;
    } catch (err) {
        // Transient connect failure: back off and retry after the cooldown instead of
        // disabling the cache for the whole process lifetime. Drop the client so the
        // next attempt (post-cooldown) reconnects cleanly.
        redisCooldownUntil = Date.now() + REDIS_COOLDOWN_MS;
        try {
            if (redisClient) {
                redisClient.disconnect();
            }
        } catch (disconnectErr) {
            // ignore
        }
        redisClient = null;
        if (!redisWarned) {
            redisWarned = true;
            logging.warn(`[post.search.cache] Redis connect failed, DB fallback for ${Math.round(REDIS_COOLDOWN_MS / 1000)}s: ${err.message}`);
        }
        return null;
    }
}

function normalizeKeyword(value) {
    return String(value || '').normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
}

function buildCacheKey(options) {
    const normalized = {
        keyword: normalizeKeyword(options.keyword),
        field: options.field,
        limit: options.limit,
        page: options.page,
        status: options.status,
        visibility: options.visibility,
        authorId: options.authorId,
        groupId: options.groupId,
        order: options.order
    };
    const digest = crypto.createHash('sha1').update(JSON.stringify(normalized)).digest('hex');
    return `${CACHE_PREFIX}${digest}`;
}

async function readCache(options) {
    const redis = await getRedisClient();
    if (!redis) {
        return null;
    }
    try {
        const raw = await redis.get(buildCacheKey(options));
        if (!raw) {
            return null;
        }
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed.ids) || !Number.isFinite(Number(parsed.total))) {
            return null;
        }
        return parsed;
    } catch (err) {
        return null;
    }
}

async function writeCache(options, payload) {
    const redis = await getRedisClient();
    if (!redis) {
        return;
    }
    try {
        await redis.set(buildCacheKey(options), JSON.stringify(payload), 'EX', getRedisTtlSeconds());
    } catch (err) {
        // Cache write failure must never block search.
    }
}

// Flush all post-search cache keys. Called after an index write so an edit never
// serves stale results. Non-fatal (DB is source of truth, TTL is short).
async function invalidatePostSearchCache() {
    const redis = await getRedisClient();
    if (!redis) {
        return;
    }
    try {
        let cursor = '0';
        do {
            const [next, keys] = await redis.scan(cursor, 'MATCH', `${CACHE_PREFIX}*`, 'COUNT', 100);
            cursor = next;
            if (keys.length > 0) {
                await redis.del(keys);
            }
        } while (cursor !== '0');
    } catch (err) {
        // ignore
    }
}

// Turn a raw keyword into an ngram-friendly BOOLEAN MODE phrase query. Quoting the
// phrase lets the ngram parser tokenize CJK correctly; strip characters that would
// break the boolean grammar.
function buildBooleanQuery(keyword) {
    const kw = String(keyword || '').replace(/["()<>~*+@-]/g, ' ').replace(/\s+/g, ' ').trim();
    return kw ? `"${kw}"` : '';
}

// ---- Search ---------------------------------------------------------------
async function searchPosts(rawOptions = {}) {
    const knex = db.knex;
    const field = FIELD_COLUMN[rawOptions.field] ? rawOptions.field : 'all';
    const column = FIELD_COLUMN[field];
    const limit = Math.max(1, Math.min(50, Number(rawOptions.limit) || 10));
    const page = Math.max(1, Number(rawOptions.page) || 1);
    // 'all' (or empty) disables the facet filter — used by the authenticated admin
    // search to include drafts / non-public posts. Public search keeps the defaults.
    const status = rawOptions.status === undefined ? 'published' : rawOptions.status;
    const visibility = rawOptions.visibility === undefined ? 'public' : rawOptions.visibility;
    // Optional scope filters for the session / "my home" datasource.
    //   authorId — restrict to posts the given user is an author of.
    //   groupId  — '' = no facet; 'none' = only group-less posts; <id> = that group.
    const authorId = rawOptions.authorId ? String(rawOptions.authorId).trim() : '';
    const groupId = (rawOptions.groupId === undefined || rawOptions.groupId === null)
        ? '' : String(rawOptions.groupId).trim();
    const orderClauses = parseOrder(rawOptions.order);
    const options = {keyword: rawOptions.keyword, field, limit, page, status, visibility, authorId, groupId, order: orderClauses.join(',')};

    const booleanQuery = buildBooleanQuery(rawOptions.keyword);
    if (!booleanQuery) {
        return {ids: [], total: 0, field, cached: false};
    }

    const cached = await readCache(options);
    if (cached) {
        return {...cached, field, cached: true};
    }

    const offset = (page - 1) * limit;
    // `column` is a whitelisted identifier; keyword is a bound parameter.
    const matchSql = `MATCH(${column}) AGAINST(? IN BOOLEAN MODE)`;

    const applyFilters = (qb) => {
        qb.whereRaw(matchSql, [booleanQuery]);
        // status may be a single value or a CSV (e.g. 'published,sent') → whereIn.
        if (status && status !== 'all') {
            const statuses = String(status).split(',').map(s => s.trim()).filter(Boolean);
            if (statuses.length > 1) {
                qb.whereIn('status', statuses);
            } else if (statuses.length === 1) {
                qb.where('status', statuses[0]);
            }
        }
        if (visibility && visibility !== 'all') {
            qb.where('visibility', visibility);
        }
        if (authorId) {
            // author_ids is a comma-separated list of this post's author ids.
            qb.whereRaw('FIND_IN_SET(?, author_ids) > 0', [authorId]);
        }
        if (groupId === 'none') {
            qb.whereNull('group_id');
        } else if (groupId) {
            qb.where('group_id', groupId);
        }
    };

    const rows = await knex('post_search_index')
        .select('post_id')
        .select(knex.raw(`${matchSql} AS score`, [booleanQuery]))
        .modify(applyFilters)
        .orderByRaw(orderClauses.join(', '))
        .limit(limit)
        .offset(offset);

    const totalRow = await knex('post_search_index')
        .modify(applyFilters)
        .count({c: 'post_id'})
        .first();
    const total = Number((totalRow && totalRow.c) || 0);

    // NOTE: `score` stays in the SELECT because the ORDER BY references it, but the
    // per-id relevance map is not consumed by any caller — the controllers hydrate by
    // id order only — so it is deliberately not built or cached.
    const ids = rows.map(r => r.post_id);

    const payload = {ids, total};
    await writeCache(options, payload);
    return {...payload, field, cached: false};
}

module.exports = {
    searchPosts,
    invalidatePostSearchCache,
    buildBooleanQuery,
    CACHE_PREFIX,
    FIELD_COLUMN
};
