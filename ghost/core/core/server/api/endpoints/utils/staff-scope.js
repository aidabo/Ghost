// Staff visibility scope for group-scoped social entities (charts, pages,
// DZI jobs, gallery, projects, chart/media/news/content-bundle jobs).
// Single place for the role decision; see host repo
// docs/architecture/social-entity-permissions.md "Staff visibility scope".
//
//   system admin (Owner / Administrator / legacy 'Admin') — every row,
//       including family/private groups.
//   no-group reader (Super Editor) — every NEWSROOM row, whoever created it:
//       no group (group_id NULL) or a group of type 'public' (treated like
//       public articles). Rows of non-public groups (family / private /
//       secret / company) only through group membership, exactly like other
//       staff. Never bypasses membership of a non-public group.
//   everyone else — own rows + member groups (decided by each endpoint).
const models = require('../../../models');

const SYSTEM_ADMIN_ROLES = new Set(['Owner', 'Administrator', 'Admin']);
const NO_GROUP_READER_ROLES = new Set(['Super Editor']);
const PUBLIC_GROUP_TYPE = 'public';

const NO_SCOPE = Object.freeze({isSystemAdmin: false, isNoGroupReader: false, publicGroupIds: Object.freeze([])});

// Loaded once per scope (i.e. once per request path), and only for a
// no-group reader; list checks reuse the same array.
const loadPublicGroupIds = async () => {
    const ids = await models.Base.knex('social_groups').where('type', PUBLIC_GROUP_TYPE).pluck('id');
    return Object.freeze(ids.map(String));
};

const getStaffScope = async (userId) => {
    if (!userId) {
        return NO_SCOPE;
    }

    // @ts-ignore
    const user = await models.User.findOne({id: userId}, {withRelated: ['roles']});
    if (!user) {
        return NO_SCOPE;
    }

    const names = (user.related('roles')?.models || []).map(role => role.get('name'));
    const isSystemAdmin = names.some(name => SYSTEM_ADMIN_ROLES.has(name));
    const isNoGroupReader = !isSystemAdmin && names.some(name => NO_GROUP_READER_ROLES.has(name));
    return {
        isSystemAdmin,
        isNoGroupReader,
        publicGroupIds: isNoGroupReader ? await loadPublicGroupIds() : NO_SCOPE.publicGroupIds
    };
};

// Accepts a bookshelf model or a plain knex row.
const getGroupId = (row) => {
    if (!row) {
        return null;
    }
    return (typeof row.get === 'function' ? row.get('group_id') : row.group_id) || null;
};

// No group, or a public group.
const isNewsroomRow = (row, publicGroupIds = []) => {
    if (!row) {
        return false;
    }
    const groupId = getGroupId(row);
    return !groupId || publicGroupIds.includes(String(groupId));
};

// A requested / target group the no-group reader may use without membership.
const isNewsroomGroup = (scope, groupId) => Boolean(scope?.isNoGroupReader) && (!groupId || (scope.publicGroupIds || []).includes(String(groupId)));

const canReadRowAsNoGroupReader = (scope, row) => Boolean(scope?.isNoGroupReader) && isNewsroomRow(row, scope.publicGroupIds);

// Row-level bypass of the ownership / membership check: system admin always,
// no-group reader only on newsroom rows.
const bypassesRowCheck = (scope, row) => Boolean(scope?.isSystemAdmin) || canReadRowAsNoGroupReader(scope, row);

// NQL clause for a no-group reader's unscoped listing: every newsroom row plus
// its own rows (own rows inside groups stay visible as for other staff).
const newsroomOrOwnFilter = (scope, userId, ownerField = 'created_by') => {
    const ids = scope?.publicGroupIds || [];
    const publicClause = ids.length ? `,group_id:[${ids.join(',')}]` : '';
    return `(group_id:null${publicClause},${ownerField}:${userId})`;
};

// knex: `column` is NULL or a public group id.
const whereNewsroomGroup = (qb, column, scope) => {
    const ids = scope?.publicGroupIds || [];
    qb.whereNull(column);
    if (ids.length) {
        qb.orWhereIn(column, ids);
    }
};

// AND a scope clause onto a caller-supplied NQL filter. The caller filter is
// parenthesised: NQL binds `+` tighter than `,`, so a bare `a,b+clause` would
// leave `a` outside the scope.
const andFilter = (filter, clause) => (filter ? `(${filter})+${clause}` : clause);

module.exports = {
    getStaffScope,
    isNewsroomRow,
    isNewsroomGroup,
    canReadRowAsNoGroupReader,
    bypassesRowCheck,
    newsroomOrOwnFilter,
    whereNewsroomGroup,
    andFilter
};
