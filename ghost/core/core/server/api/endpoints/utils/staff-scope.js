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
const errors = require('@tryghost/errors');
const nql = require('@tryghost/nql');
const models = require('../../../models');

const SYSTEM_ADMIN_ROLES = new Set(['Owner', 'Administrator', 'Admin']);
const NO_GROUP_READER_ROLES = new Set(['Super Editor']);
const PUBLIC_GROUP_TYPE = 'public';

const NO_SCOPE = Object.freeze({isSystemAdmin: false, isNoGroupReader: false, publicGroupIds: Object.freeze([])});

// Loaded once per scope (i.e. once per request path), and only for a
// no-group reader; list checks reuse the same array. Only active groups count:
// a public group awaiting approval or archived is not newsroom content.
const loadPublicGroupIds = async () => {
    const ids = await models.Base.knex('social_groups')
        .where({type: PUBLIC_GROUP_TYPE, status: 'active'})
        .pluck('id');
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
const getField = (row, field) => {
    if (!row) {
        return null;
    }
    return (typeof row.get === 'function' ? row.get(field) : row[field]) || null;
};
const getGroupId = row => getField(row, 'group_id');

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

// Published no-group/public-group Projects are collaborative staff containers.
// This is intentionally separate from project_purposes and from the member-facing
// Public API: purposes are discovery hints, while status/group define visibility.
const canReadPublishedProject = (scope, row) => Boolean(scope && String(getField(row, 'status') || '').toLowerCase() === 'published' && isNewsroomRow(row, scope.publicGroupIds));

const publishedProjectOrOwnFilter = (scope, userId, ownerField = 'user_id') => {
    const ids = scope?.publicGroupIds || [];
    const publicGroups = ids.length ? `,group_id:[${ids.join(',')}]` : '';
    return `(${ownerField}:${userId},(status:published+(group_id:null${publicGroups})))`;
};

// Row-level bypass of the ownership / membership check: system admin always,
// no-group reader only on newsroom rows.
const bypassesRowCheck = (scope, row) => Boolean(scope?.isSystemAdmin) || canReadRowAsNoGroupReader(scope, row);

// Super Editor manages newsroom projects and their jobs in full (read and
// every user-facing write). A job counts when its own group is newsroom (a
// safety net: jobs follow their project) and its project, if any, is a
// newsroom project. `project` is the job's project row (null = no project).
const canManageAsNewsroomEditor = (scope, row, project = null) => canReadRowAsNoGroupReader(scope, row) &&
    (!project || isNewsroomRow(project, scope.publicGroupIds));

const loadProject = async (projectId) => {
    if (!projectId) {
        return null;
    }
    return await models.Base.knex('social_ai_projects').where({id: projectId}).first('id', 'user_id', 'group_id') || null;
};

// canManageAsNewsroomEditor for a job row/model carrying `project_id`.
const canManageJobAsNewsroomEditor = async (scope, job) => {
    if (!canReadRowAsNoGroupReader(scope, job)) {
        return false;
    }
    return canManageAsNewsroomEditor(scope, job, await loadProject(getField(job, 'project_id')));
};

// Newsroom READ for every staff role (news jobs, like posts / post media): the
// staff scope with the active public group ids loaded whatever the role, or
// null when there is no such staff user (nothing to widen).
const getNewsroomReadScope = async (userId) => {
    const scope = await getStaffScope(userId);
    if (scope === NO_SCOPE) {
        return null;
    }
    if (scope.isNoGroupReader) {
        return scope;
    }
    return {...scope, publicGroupIds: await loadPublicGroupIds()};
};

// A job is newsroom when its own group is newsroom and its project, if any,
// is a newsroom project (a vanished project counts as no project).
const isNewsroomJob = async (job, publicGroupIds = []) => {
    if (!isNewsroomRow(job, publicGroupIds)) {
        return false;
    }
    const project = await loadProject(getField(job, 'project_id'));
    return !project || isNewsroomRow(project, publicGroupIds);
};

// Projects whose jobs a Super Editor must not list (non-public groups).
const loadNonNewsroomProjectIds = async (scope) => {
    const query = models.Base.knex('social_ai_projects').whereNotNull('group_id');
    if (scope?.publicGroupIds?.length) {
        query.whereNotIn('group_id', scope.publicGroupIds);
    }
    return (await query.pluck('id')).map(String);
};

// NQL clause for a no-group reader's unscoped listing: every newsroom row plus
// its own rows (own rows inside groups stay visible as for other staff). With
// `excludeProjectIds` (rows of those non-newsroom projects) or `excludeIds`
// (those rows), the matching newsroom rows drop out; own rows stay.
const newsroomOrOwnFilter = (scope, userId, ownerField = 'created_by', {excludeProjectIds = [], excludeIds = []} = {}) => {
    const ids = scope?.publicGroupIds || [];
    const publicClause = ids.length ? `,group_id:[${ids.join(',')}]` : '';
    const newsroom = [`(group_id:null${publicClause})`];
    if (excludeProjectIds.length) {
        newsroom.push(`(project_id:null,project_id:-[${excludeProjectIds.join(',')}])`);
    }
    if (excludeIds.length) {
        newsroom.push(`id:-[${excludeIds.join(',')}]`);
    }
    if (newsroom.length === 1) {
        return `(group_id:null${publicClause},${ownerField}:${userId})`;
    }
    return `(${ownerField}:${userId},(${newsroom.join('+')}))`;
};

// knex: `column` is NULL or a public group id.
const whereNewsroomGroup = (qb, column, scope) => {
    const ids = scope?.publicGroupIds || [];
    qb.whereNull(column);
    if (ids.length) {
        qb.orWhereIn(column, ids);
    }
};

// knex: the row's project (`projectColumn`, e.g. 'social_ai_news_jobs.project_id')
// is absent or a newsroom project.
const whereNewsroomProject = (qb, projectColumn, scope) => {
    const ids = scope?.publicGroupIds || [];
    qb.whereNotExists(function () {
        this.select(1)
            .from('social_ai_projects as nrp')
            .whereRaw(`nrp.id = ${projectColumn}`)
            .whereNotNull('nrp.group_id');
        if (ids.length) {
            this.whereNotIn('nrp.group_id', ids);
        }
    });
};

// Linked rows whose group makes a gallery asset a group asset even when the
// asset row itself carries no group_id (worker-written rows can keep a null
// group_id while the producing job belongs to a group). [table, asset column,
// table has project_id] — a job's project is checked as a second hop.
const ASSET_GROUP_LINKS = [
    ['social_ai_chart_jobs', 'chart_job_id', true],
    ['social_ai_content_bundle_jobs', 'content_bundle_job_id', true],
    ['social_ai_media_jobs', 'job_id', true],
    ['social_ai_dzi_jobs', 'job_id', false],
    ['social_ai_dzi_jobs', 'dzi_job_id', false],
    ['social_ai_news_jobs', 'news_job_id', true],
    ['social_ai_projects', 'project_id', false],
    ['social_charts', 'social_chart_id', false]
];

// Junction tables that attach an asset to a job without a column on the asset.
const ASSET_JOB_JUNCTIONS = [
    ['social_ai_chart_job_media', 'chart_job_id', 'social_ai_chart_jobs'],
    ['social_ai_news_job_media', 'news_job_id', 'social_ai_news_jobs']
];

// Gallery (social_media_assets AS sma): a Super Editor (no-group reader) sees
// every NEWSROOM asset: neither
// the row nor anything it hangs off — job / project / chart (by column or
// junction), the job's project, a DZI job's linked projects — belongs to a
// non-public group (no group, or a public group). `scope` is the Super
// Editor's staff scope.
const whereNewsroomAsset = (qb, scope) => {
    const publicGroupIds = scope.publicGroupIds || [];
    const inNonPublicGroup = (sub, column) => {
        sub.whereNotNull(column);
        if (publicGroupIds.length) {
            sub.whereNotIn(column, publicGroupIds);
        }
    };
    qb.where(function () {
        whereNewsroomGroup(this, 'sma.group_id', scope);
    });
    ASSET_GROUP_LINKS.forEach(([table, column, hasProject]) => {
        qb.whereNotExists(function () {
            this.select(1)
                .from(`${table} as nga`)
                .whereRaw(`nga.id = sma.${column}`);
            inNonPublicGroup(this, 'nga.group_id');
        });
        if (hasProject) {
            qb.whereNotExists(function () {
                this.select(1)
                    .from(`${table} as ngj`)
                    .join('social_ai_projects as ngp', 'ngp.id', 'ngj.project_id')
                    .whereRaw(`ngj.id = sma.${column}`);
                inNonPublicGroup(this, 'ngp.group_id');
            });
        }
    });
    ['job_id', 'dzi_job_id'].forEach((column) => {
        qb.whereNotExists(function () {
            this.select(1)
                .from('social_ai_dzi_job_projects as ngdp')
                .join('social_ai_projects as ngp', 'ngp.id', 'ngdp.project_id')
                .whereRaw(`ngdp.dzi_job_id = sma.${column}`);
            inNonPublicGroup(this, 'ngp.group_id');
        });
    });
    ASSET_JOB_JUNCTIONS.forEach(([junction, jobColumn, jobTable]) => {
        qb.whereNotExists(function () {
            this.select(1)
                .from(`${junction} as ngm`)
                .join(`${jobTable} as ngj`, 'ngj.id', `ngm.${jobColumn}`)
                .leftJoin('social_ai_projects as ngp', 'ngp.id', 'ngj.project_id')
                .whereRaw('ngm.media_id = sma.id')
                .where(function () {
                    this.where(function () {
                        inNonPublicGroup(this, 'ngj.group_id');
                    }).orWhere(function () {
                        inNonPublicGroup(this, 'ngp.group_id');
                    });
                });
        });
    });
};

// Is the write a Super Editor acting only through the newsroom rule (not as
// owner, system admin or integration)? Its cascades must stay inside newsroom
// content.
const actsAsNewsroomEditor = (scope, ownerId, userId, integrationId = null) => Boolean(scope?.isNoGroupReader) &&
    !integrationId && String(ownerId || '') !== String(userId || '');

// Refuse (403) when any asset selected by `where(qb)` (on social_media_assets
// AS sma) is not newsroom: a newsroom-rule write must not cascade into
// family / private / secret / company content.
const assertAssetsAreNewsroom = async (knex, scope, where) => {
    const hidden = await knex('social_media_assets as sma')
        .where(where)
        .whereNot(qb => whereNewsroomAsset(qb, scope))
        .first('sma.id');
    if (hidden) {
        throw new errors.NoPermissionError({message: 'This content holds items outside the newsroom.'});
    }
};

// AND a scope clause onto a caller-supplied NQL filter so the clause is always
// an outer conjunct. The caller filter is parenthesised (NQL binds `+` tighter
// than `,`, so a bare `a,b+clause` would leave `a` outside the scope) and must
// parse on its own first: an unbalanced filter such as `x:1),(group_id:g`
// would otherwise close the wrapper parenthesis and escape the clause.
const andFilter = (filter, clause) => {
    const base = String(filter || '').trim();
    if (!base) {
        return clause;
    }
    try {
        nql(base).parse();
    } catch (err) {
        throw new errors.BadRequestError({message: 'Invalid filter.', err});
    }
    // The space before `)` keeps a trailing single-letter literal (`x:a`,
    // `category:B`) a literal: NQL does not read `a)` as one.
    return `(${base} )+${clause}`;
};

// Caller-supplied values interpolated into an NQL clause (ids, job types) must
// be a single plain token, never NQL syntax.
const OBJECT_ID_REGEX = /^[a-f0-9]{24}$/i;
const NQL_TOKEN_REGEX = /^[a-z0-9_-]{1,64}$/i;
const nqlId = (value, name = 'id') => {
    const id = String(value || '').trim();
    if (!OBJECT_ID_REGEX.test(id)) {
        throw new errors.BadRequestError({message: `Invalid ${name}.`});
    }
    return id.toLowerCase();
};
const nqlToken = (value, name = 'value') => {
    const token = String(value || '').trim();
    if (!NQL_TOKEN_REGEX.test(token)) {
        throw new errors.BadRequestError({message: `Invalid ${name}.`});
    }
    return token;
};

module.exports = {
    getStaffScope,
    loadPublicGroupIds,
    isNewsroomRow,
    isNewsroomGroup,
    canReadRowAsNoGroupReader,
    canReadPublishedProject,
    publishedProjectOrOwnFilter,
    bypassesRowCheck,
    canManageAsNewsroomEditor,
    canManageJobAsNewsroomEditor,
    getNewsroomReadScope,
    isNewsroomJob,
    loadProject,
    loadNonNewsroomProjectIds,
    newsroomOrOwnFilter,
    whereNewsroomGroup,
    whereNewsroomProject,
    whereNewsroomAsset,
    actsAsNewsroomEditor,
    assertAssetsAreNewsroom,
    andFilter,
    nqlId,
    nqlToken
};
