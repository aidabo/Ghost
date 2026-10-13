// Staff visibility scope for group-scoped social entities (charts, pages,
// DZI jobs, gallery, projects, chart/media/news/content-bundle jobs).
// Single place for the role decision; see host repo
// docs/architecture/social-entity-permissions.md "Staff visibility scope".
//
//   system admin (Owner / Administrator / legacy 'Admin') — every row,
//       including family/private groups.
//   no-group reader (Super Editor) — every row with NO group (group_id NULL),
//       whoever created it; group rows only through group membership, exactly
//       like other staff. Never bypasses group membership.
//   everyone else — own rows + member groups (decided by each endpoint).
const models = require('../../../models');

const SYSTEM_ADMIN_ROLES = new Set(['Owner', 'Administrator', 'Admin']);
const NO_GROUP_READER_ROLES = new Set(['Super Editor']);

const NO_SCOPE = Object.freeze({isSystemAdmin: false, isNoGroupReader: false});

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
    return {
        isSystemAdmin,
        isNoGroupReader: !isSystemAdmin && names.some(name => NO_GROUP_READER_ROLES.has(name))
    };
};

// Accepts a bookshelf model or a plain knex row.
const getGroupId = (row) => {
    if (!row) {
        return null;
    }
    return (typeof row.get === 'function' ? row.get('group_id') : row.group_id) || null;
};

const isNoGroupRow = row => Boolean(row) && !getGroupId(row);

const canReadRowAsNoGroupReader = (scope, row) => Boolean(scope?.isNoGroupReader) && isNoGroupRow(row);

// Row-level bypass of the ownership / membership check: system admin always,
// no-group reader only on rows without a group.
const bypassesRowCheck = (scope, row) => Boolean(scope?.isSystemAdmin) || canReadRowAsNoGroupReader(scope, row);

// NQL clause for a no-group reader's unscoped listing: every no-group row plus
// its own rows (own rows inside groups stay visible as for other staff).
const noGroupOrOwnFilter = (userId, ownerField = 'created_by') => `(group_id:null,${ownerField}:${userId})`;

// AND a scope clause onto a caller-supplied NQL filter. The caller filter is
// parenthesised: NQL binds `+` tighter than `,`, so a bare `a,b+clause` would
// leave `a` outside the scope.
const andFilter = (filter, clause) => (filter ? `(${filter})+${clause}` : clause);

module.exports = {
    getStaffScope,
    isNoGroupRow,
    canReadRowAsNoGroupReader,
    bypassesRowCheck,
    noGroupOrOwnFilter,
    andFilter
};
