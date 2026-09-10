const models = require('../../models');
const membersService = require('../../services/members');
const {searchPosts} = require('../../services/post-search-index/search');
const mapPost = require('./utils/serializers/output/mappers/posts');
const tiersService = require('../../services/tiers');
const adminSessionService = require('../../services/auth/session').sessionService;
const logging = require('@tryghost/logging');
const STAFF_PREVIEW_ROLES = new Set(['Owner', 'Administrator', 'Admin', 'Super Editor']);
const POST_RELATION_NAMES = new Set(['tags', 'authors', 'mobiledoc_revisions', 'post_revisions', 'posts_meta', 'tiers', 'social_post_components']);
const POST_COLUMNS = models.Post.prototype.permittedAttributes().filter(column => !POST_RELATION_NAMES.has(column));
const POST_RELATED = ['tags', 'authors', 'count.bookmarks', 'count.favors', 'count.forwards', 'count.comments'];

function hasStaffPreviewRole(user) {
    const roles = user?.related('roles')?.models || [];
    return roles.some(role => STAFF_PREVIEW_ROLES.has(role.get('name')));
}

async function attachPostTiers(posts) {
    const postIds = posts.map(post => post.id).filter(Boolean);
    if (!postIds.length) {
        return posts;
    }
    const rows = await models.Base.knex('posts_products')
        .join('products', 'products.id', 'posts_products.product_id')
        .whereIn('posts_products.post_id', postIds)
        .select('posts_products.post_id', 'products.id', 'products.slug', 'products.active', 'products.type');
    const tiersByPost = new Map();
    for (const row of rows) {
        const tiers = tiersByPost.get(row.post_id) || [];
        tiers.push({id: row.id, slug: row.slug, active: row.active, type: row.type});
        tiersByPost.set(row.post_id, tiers);
    }
    for (const post of posts) {
        post.set('tiers', tiersByPost.get(post.id) || []);
    }
    return posts;
}

async function serializePosts(posts, memberData) {
    const tiersPage = await tiersService.api.browse({});
    const tiers = (tiersPage.data || []).map((model) => {
        const json = model.toJSON();
        return {
            id: json.id,
            name: json.name,
            slug: json.slug,
            active: json.status === 'active',
            welcome_page_url: json.welcomePageURL,
            visibility: json.visibility,
            trial_days: json.trialDays,
            description: json.description,
            type: json.type,
            currency: json.type === 'paid' ? json.currency?.toLowerCase() : null,
            monthly_price: json.monthlyPrice,
            yearly_price: json.yearlyPrice,
            created_at: json.createdAt,
            updated_at: json.updatedAt,
            monthly_price_id: null,
            yearly_price_id: null
        };
    });
    const frame = {
        apiType: 'admin',
        options: {
            withRelated: POST_RELATED,
            formats: 'lexical',
            context: {member: memberData}
        }
    };
    return Promise.all(posts.map(post => mapPost(post, frame, {tiers})));
}

function staffRoleNames(user) {
    return (user?.related('roles')?.models || []).map(role => role.get('name')).filter(Boolean).join(',') || 'none';
}

async function resolveStaffUser(user) {
    if (!user?.id) {
        return null;
    }
    const userWithRoles = await models.User.findOne({id: user.id});
    if (userWithRoles) {
        await userWithRoles.related('roles').fetch();
    }
    return hasStaffPreviewRole(userWithRoles) ? userWithRoles : null;
}

async function search(req, res) {
    logging.info(`[MemberPostSearch] start cookie=${Boolean(req.headers?.cookie)} origin=${req.get('origin') || 'none'}`);
    let authenticatedStaffUser = null;
    let staffUser = null;
    try {
        if (req.user?.id) {
            authenticatedStaffUser = req.user;
            staffUser = await resolveStaffUser(req.user);
        } else {
            authenticatedStaffUser = await adminSessionService.getUserForSession(req, res);
            staffUser = await resolveStaffUser(authenticatedStaffUser);
        }
    } catch (error) {
        staffUser = null;
    }
    logging.info(`[MemberPostSearch] staff_authenticated=${Boolean(authenticatedStaffUser?.id)} staff_user_id=${authenticatedStaffUser?.id || 'none'} staff_roles=${staffRoleNames(staffUser || authenticatedStaffUser)} staff_preview_role=${Boolean(staffUser?.id)}`);

    let member;
    try {
        member = await membersService.ssr.getMemberDataFromSession(req, res);
    } catch (error) {
        if (!staffUser) {
            if (authenticatedStaffUser?.id) {
                logging.warn('[MemberPostSearch] denied: staff role is not allowed to preview member content');
                return res.status(403).json({errors: [{message: 'Staff role does not permit Member Content preview.', code: 'STAFF_PREVIEW_ROLE_REQUIRED'}]});
            }
            logging.warn('[MemberPostSearch] denied: no member or staff session');
            return res.status(401).json({errors: [{message: 'Member or Staff session is required.', code: 'SESSION_REQUIRED'}]});
        }
    }
    if (!member?.id && !staffUser?.id) {
        if (authenticatedStaffUser?.id) {
            logging.warn('[MemberPostSearch] denied: staff role is not allowed to preview member content');
            return res.status(403).json({errors: [{message: 'Staff role does not permit Member Content preview.', code: 'STAFF_PREVIEW_ROLE_REQUIRED'}]});
        }
        logging.warn('[MemberPostSearch] denied: no member or staff session');
        return res.status(401).json({errors: [{message: 'Member or Staff session is required.', code: 'SESSION_REQUIRED'}]});
    }
    const memberData = member?.toJSON ? member.toJSON() : member;

    const keyword = String(req.body?.keyword || '').trim();
    const limit = Math.max(1, Math.min(50, Number(req.body?.limit) || 25));
    const page = Math.max(1, Number(req.body?.page) || 1);
    let candidates;
    let total;
    if (keyword) {
        const {ids, total: indexedTotal} = await searchPosts({
            keyword,
            field: req.body?.field,
            order: req.body?.order,
            limit,
            page,
            status: 'published,sent',
            visibility: 'all'
        });
        const safeIds = ids.filter(id => /^[0-9a-f]{24}$/.test(String(id)));
        const result = safeIds.length ? await models.Post.findPage({
            filter: `id:[${safeIds.join(',')}]`,
            columns: POST_COLUMNS,
            withRelated: POST_RELATED,
            formats: 'lexical',
            limit: 'all',
            context: {member: memberData}
        }) : {data: []};
        const byId = new Map((result.data || []).map(model => [model.id, model]));
        candidates = await attachPostTiers(safeIds.map(id => byId.get(id)).filter(Boolean));
        total = indexedTotal;
    } else {
        const result = await models.Post.findPage({
            filter: 'status:[published,sent]',
            order: req.body?.order || 'featured desc,published_at desc',
            columns: POST_COLUMNS,
            withRelated: POST_RELATED,
            formats: 'lexical',
            limit,
            page,
            context: {member: memberData}
        });
        candidates = await attachPostTiers(result.data || []);
        total = result.meta?.pagination?.total || candidates.length;
    }

    const posts = candidates.filter((post) => {
        const data = post.toJSON();
        if (!['published', 'sent'].includes(String(data.status || '').toLowerCase())) {
            return false;
        }
        return staffUser?.id || membersService.contentGating.checkPostAccess(data, memberData);
    });
    logging.info(`[MemberPostSearch] candidates=${candidates.length} access_allowed=${posts.length} keyword=${Boolean(keyword)} staff_preview=${Boolean(staffUser?.id)}`);
    const serializedPosts = await serializePosts(posts, memberData);
    logging.info(`[MemberPostSearch] serialized=${serializedPosts.length}`);

    return res.json({
        posts: serializedPosts,
        meta: {pagination: {page, limit, pages: total ? Math.ceil(total / limit) : 0, total, next: page < Math.ceil(total / limit) ? page + 1 : null, prev: page > 1 ? page - 1 : null}}
    });
}

module.exports = {search};
