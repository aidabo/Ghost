const assert = require('assert/strict');
const Module = require('module');
const sinon = require('sinon');
const knex = require('knex');
const nql = require('@tryghost/nql');

const helperPath = require.resolve('../../../../../core/server/api/endpoints/utils/staff-scope');
const galleryPath = require.resolve('../../../../../core/server/api/endpoints/social-gallery');
const newsPath = require.resolve('../../../../../core/server/api/endpoints/social-ai-news-jobs');
const chartsPath = require.resolve('../../../../../core/server/api/endpoints/social-charts');
const chartJobsPath = require.resolve('../../../../../core/server/api/endpoints/social-ai-chart-jobs');
const dziPath = require.resolve('../../../../../core/server/api/endpoints/social-ai-dzi-jobs');
const projectLinksPath = require.resolve('../../../../../core/server/api/endpoints/social-ai-project-links');

// Group ids must be ObjectId-shaped: endpoints reject anything else before it
// reaches NQL.
const PUB = '0000000000000000000000a1';
const FAM = '0000000000000000000000f1';
const ARCHIVED_PUB = '0000000000000000000000a2';

const ROLES = {
    owner: ['Owner'],
    admin: ['Administrator'],
    legacy: ['Admin'],
    se: ['Super Editor'],
    editor: ['Editor'],
    'se-admin': ['Super Editor', 'Administrator']
};

// User.findOne stand-in: the user id doubles as the role key above.
const User = {
    findOne: async ({id}) => {
        if (!ROLES[id]) {
            return null;
        }
        const roles = ROLES[id].map(name => ({get: () => name}));
        return {related: () => ({models: roles})};
    },
    ensureMediaFolderAlias: async () => 'alias'
};

// knex stand-in answering only the public-group lookup.
const publicGroupWheres = [];
const publicGroupsKnex = () => ({
    where: (where) => {
        publicGroupWheres.push(where);
        return {pluck: async () => [PUB]};
    }
});
// Does an NQL filter match a row? (Evaluates the filter the endpoint built.)
const matches = (filter, row) => nql(filter).queryJSON(row);

// Load `target` with its (and staff-scope's) `models` require replaced, so no
// Ghost model, config or storage is initialised.
const loadWith = (target, models, extraStubs = {}) => {
    const originalLoad = Module._load;
    const stub = sinon.stub(Module, '_load').callsFake(function (request, parent, isMain) {
        if (parent && [target, helperPath].includes(parent.filename)) {
            if (request === '../../models' || request === '../../../models') {
                return models;
            }
            if (Object.prototype.hasOwnProperty.call(extraStubs, request)) {
                return extraStubs[request];
            }
        }
        return originalLoad.call(this, request, parent, isMain);
    });
    try {
        delete require.cache[helperPath];
        delete require.cache[target];
        return require(target);
    } finally {
        stub.restore();
        delete require.cache[target];
        delete require.cache[helperPath];
    }
};

describe('staff-scope', function () {
    let staffScope;

    before(function () {
        staffScope = loadWith(helperPath, {User, Base: {knex: publicGroupsKnex}});
    });

    it('classifies system admins, Super Editor and others', async function () {
        const none = {isSystemAdmin: false, isNoGroupReader: false, publicGroupIds: []};
        const admin = {isSystemAdmin: true, isNoGroupReader: false, publicGroupIds: []};
        assert.deepEqual(await staffScope.getStaffScope('owner'), admin);
        assert.deepEqual(await staffScope.getStaffScope('admin'), admin);
        assert.deepEqual(await staffScope.getStaffScope('legacy'), admin);
        assert.deepEqual(await staffScope.getStaffScope('se'), {isSystemAdmin: false, isNoGroupReader: true, publicGroupIds: [PUB]});
        assert.deepEqual(await staffScope.getStaffScope('se-admin'), admin);
        assert.deepEqual(await staffScope.getStaffScope('editor'), none);
        assert.deepEqual(await staffScope.getStaffScope('missing'), none);
        assert.deepEqual(await staffScope.getStaffScope(null), none);
        // Only active public groups are newsroom groups.
        assert.deepEqual(publicGroupWheres.at(-1), {type: 'public', status: 'active'});
    });

    it('lets Super Editor past the row check only on newsroom rows (no group / public group)', function () {
        const se = {isSystemAdmin: false, isNoGroupReader: true, publicGroupIds: [PUB]};
        const admin = {isSystemAdmin: true, isNoGroupReader: false, publicGroupIds: []};
        const editor = {isSystemAdmin: false, isNoGroupReader: false, publicGroupIds: []};
        const model = groupId => ({get: key => (key === 'group_id' ? groupId : undefined)});

        assert.equal(staffScope.canReadRowAsNoGroupReader(se, {group_id: null}), true);
        assert.equal(staffScope.canReadRowAsNoGroupReader(se, model(null)), true);
        assert.equal(staffScope.canReadRowAsNoGroupReader(se, {group_id: PUB}), true);
        assert.equal(staffScope.canReadRowAsNoGroupReader(se, model(PUB)), true);
        assert.equal(staffScope.canReadRowAsNoGroupReader(se, {group_id: FAM}), false);
        assert.equal(staffScope.canReadRowAsNoGroupReader(se, model(FAM)), false);
        assert.equal(staffScope.canReadRowAsNoGroupReader(se, null), false);
        assert.equal(staffScope.canReadRowAsNoGroupReader(editor, {group_id: null}), false);
        assert.equal(staffScope.canReadRowAsNoGroupReader(editor, {group_id: PUB}), false);

        assert.equal(staffScope.bypassesRowCheck(admin, {group_id: FAM}), true);
        assert.equal(staffScope.bypassesRowCheck(se, {group_id: FAM}), false);
        assert.equal(staffScope.bypassesRowCheck(se, {group_id: null}), true);
        assert.equal(staffScope.bypassesRowCheck(se, {group_id: PUB}), true);
        assert.equal(staffScope.bypassesRowCheck(editor, {group_id: null}), false);
        assert.equal(staffScope.bypassesRowCheck(null, {group_id: null}), false);

        assert.equal(staffScope.isNewsroomGroup(se, PUB), true);
        assert.equal(staffScope.isNewsroomGroup(se, FAM), false);
        assert.equal(staffScope.isNewsroomGroup(editor, PUB), false);
    });

    it('builds an NQL scope a caller filter cannot widen', function () {
        const db = knex({client: 'mysql2'});
        const sql = filter => nql(filter).querySQL(db('t')).toString();
        const se = {isNoGroupReader: true, publicGroupIds: ['pub1', 'pub2']};
        const seNoPublic = {isNoGroupReader: true, publicGroupIds: []};
        const clause = staffScope.newsroomOrOwnFilter(se, 'u1', 'user_id');

        assert.equal(clause, '(group_id:null,group_id:[pub1,pub2],user_id:u1)');
        assert.equal(staffScope.newsroomOrOwnFilter(seNoPublic, 'u1'), '(group_id:null,created_by:u1)');
        assert.equal(staffScope.andFilter('', clause), clause);
        assert.equal(
            sql(staffScope.andFilter('status:aa,status:bb', clause)),
            'select * from `t` where ((`t`.`status` = \'aa\' or `t`.`status` = \'bb\') and (`t`.`group_id` is null or `t`.`group_id` in (\'pub1\', \'pub2\') or `t`.`user_id` = \'u1\'))'
        );
    });

    it('F1: rejects a caller filter that would close the wrapper parenthesis', function () {
        const clause = staffScope.newsroomOrOwnFilter({isNoGroupReader: true, publicGroupIds: []}, 'u1');
        for (const evil of [`id:-null),(group_id:${FAM}`, 'id:-null)', '(id:-null', `x:1)+(y:2`]) {
            assert.throws(() => staffScope.andFilter(evil, clause), {errorType: 'BadRequestError'}, evil);
        }
        // Balanced filters stay accepted, quoted parentheses included.
        assert.equal(staffScope.andFilter('title:\'a)b\'', 'x:1'), '(title:\'a)b\')+x:1');
    });

    it('F5: values interpolated into NQL must be a single token', function () {
        assert.equal(staffScope.nqlId(FAM), FAM);
        assert.equal(staffScope.nqlToken('csv-create'), 'csv-create');
        for (const evil of ['x,id:-null', 'x)', 'x+y:1', '', 'a b']) {
            assert.throws(() => staffScope.nqlToken(evil), {errorType: 'BadRequestError'}, evil);
        }
        assert.throws(() => staffScope.nqlId(`${FAM},id:-null`), {errorType: 'BadRequestError'});
    });
});

describe('Super Editor scope on knex-backed listings', function () {
    let database;
    const models = {
        User,
        SocialGroup: {
            findOne: async ({id}) => ({id, get: () => 'active'}),
            // Only 'editor' is a member of the family group.
            canAccessGroup: async (group, userId) => userId === 'editor' && group.id === FAM
        },
        SocialGroupMember: {
            canEditGroupContent: async ({authorId, userId}) => authorId === userId || ['owner', 'admin'].includes(userId)
        }
    };

    before(async function () {
        database = knex({client: 'sqlite3', connection: {filename: ':memory:'}, useNullAsDefault: true});
        models.Base = {knex: database};

        await database.schema.createTable('social_media_assets', (table) => {
            table.string('id').primary();
            [
                'storage_key', 'storage_url', 'thumbnail_url', 'thumbnail_storage_key', 'original_filename',
                'asset_type', 'owner_scope', 'user_id', 'group_id', 'job_id', 'dzi_job_id', 'chart_job_id',
                'content_bundle_job_id', 'news_job_id', 'project_id', 'social_chart_id', 'tag_id',
                'created_at', 'updated_at'
            ].forEach(column => table.string(column));
        });
        await database.schema.createTable('tags', (table) => {
            table.string('id').primary();
            table.string('name');
            table.string('slug');
        });
        await database.schema.createTable('posts', (table) => {
            table.string('id').primary();
            table.string('title');
        });
        await database.schema.createTable('social_ai_news_job_media', (table) => {
            ['media_id', 'news_job_id', 'role', 'post_id'].forEach(column => table.string(column));
        });
        await database.schema.createTable('estate_property_media', table => table.string('media_id'));
        await database.schema.createTable('social_groups', (table) => {
            table.string('id').primary();
            table.string('type');
            table.string('status');
        });
        await database('social_groups').insert([
            {id: PUB, type: 'public', status: 'active'},
            {id: FAM, type: 'family', status: 'active'},
            {id: ARCHIVED_PUB, type: 'public', status: 'archived'}
        ]);
        for (const name of [
            'social_ai_chart_jobs', 'social_ai_content_bundle_jobs', 'social_ai_media_jobs', 'social_ai_dzi_jobs',
            'social_ai_projects', 'social_charts'
        ]) {
            await database.schema.createTable(name, (table) => {
                table.string('id').primary();
                table.string('user_id');
                table.string('group_id');
                table.string('project_id');
                table.string('name');
            });
        }
        await database.schema.createTable('social_ai_dzi_job_projects', (table) => {
            ['id', 'dzi_job_id', 'project_id', 'created_at'].forEach(column => table.string(column));
        });
        await database.schema.createTable('social_components', (table) => {
            ['id', 'group_id', 'created_by'].forEach(column => table.string(column));
        });
        await database.schema.createTable('social_ai_project_links', (table) => {
            ['id', 'project_id', 'link_type', 'link_id', 'link_title', 'link_url', 'created_at', 'created_by'].forEach(column => table.string(column));
            table.integer('sort_order');
        });
        await database.schema.createTable('social_ai_chart_job_media', (table) => {
            ['chart_job_id', 'media_id'].forEach(column => table.string(column));
        });
        await database.schema.createTable('social_ai_news_jobs', (table) => {
            table.string('id').primary();
            [
                'type', 'status', 'current_step_id', 'status_message', 'steps', 'items', 'payload', 'result',
                'artifacts', 'project_id', 'user_id', 'group_id', 'scope_type', 'created_at', 'created_by',
                'updated_at', 'updated_by', 'started_at', 'completed_at', 'claim_worker_id', 'claim_expires_at',
                'error_code', 'error_message', 'claim_token'
            ].forEach(column => table.string(column));
            table.integer('progress');
            table.integer('claim_generation').notNullable().defaultTo(0);
        });

        // Worker-written chart artifacts (null user_id): one from a no-group
        // job, one from a family-group job whose asset row kept a null group_id.
        await database('social_ai_chart_jobs').insert([
            {id: 'cj-open', user_id: 'editor', group_id: null},
            {id: 'cj-family', user_id: 'editor', group_id: FAM},
            {id: 'cj-pub', user_id: 'editor', group_id: PUB},
            {id: 'cj-in-family-project', user_id: 'editor', group_id: null, project_id: 'p-family'},
            {id: 'cj-archived-pub', user_id: 'editor', group_id: ARCHIVED_PUB}
        ]);
        await database('social_ai_projects').insert([
            {id: 'p-family', user_id: 'editor', group_id: FAM},
            {id: 'p-open', user_id: 'editor', group_id: null}
        ]);
        await database('social_components').insert([
            {id: 'page-family', group_id: FAM, created_by: 'editor'},
            {id: 'page-open', group_id: null, created_by: 'editor'}
        ]);
        await database('social_ai_project_links').insert([
            {id: 'l-family', project_id: 'p-open', link_type: 'stackpage', link_id: 'page-family', link_title: 'family page', sort_order: 1},
            {id: 'l-open', project_id: 'p-open', link_type: 'stackpage', link_id: 'page-open', link_title: 'open page', sort_order: 2}
        ]);
        await database('social_ai_dzi_jobs').insert([{id: 'dz-open', user_id: 'editor', group_id: null}]);
        await database('social_ai_dzi_job_projects').insert([{id: 'l1', dzi_job_id: 'dz-open', project_id: 'p-family'}]);
        await database('social_ai_chart_job_media').insert([{chart_job_id: 'cj-family', media_id: 'a-junction-family'}]);
        await database('social_media_assets').insert([
            {id: 'a-open', storage_key: 'k1', owner_scope: 'chart_jobs', chart_job_id: 'cj-open', created_at: '2000-01-01 00:00:01'},
            {id: 'a-family-job', storage_key: 'k2', owner_scope: 'chart_jobs', chart_job_id: 'cj-family', created_at: '2000-01-01 00:00:02'},
            {id: 'a-family-row', storage_key: 'k3', owner_scope: 'chart_jobs', group_id: FAM, created_at: '2000-01-01 00:00:03'},
            {id: 'u-other', storage_key: 'k4', owner_scope: 'user', user_id: 'editor', created_at: '2000-01-01 00:00:04'},
            {id: 'u-other-family', storage_key: 'k5', owner_scope: 'user', user_id: 'editor', group_id: FAM, created_at: '2000-01-01 00:00:05'},
            {id: 'u-own', storage_key: 'k6', owner_scope: 'user', user_id: 'se', created_at: '2000-01-01 00:00:06'},
            {id: 'a-pub-job', storage_key: 'k7', owner_scope: 'chart_jobs', chart_job_id: 'cj-pub', created_at: '2000-01-01 00:00:07'},
            {id: 'a-pub-row', storage_key: 'k8', owner_scope: 'chart_jobs', group_id: PUB, created_at: '2000-01-01 00:00:08'},
            {id: 'a-pub-row-family-job', storage_key: 'k9', owner_scope: 'chart_jobs', group_id: PUB, chart_job_id: 'cj-family', created_at: '2000-01-01 00:00:09'},
            {id: 'u-other-pub', storage_key: 'k10', owner_scope: 'media_jobs', user_id: 'editor', group_id: PUB, created_at: '2000-01-01 00:00:10'},
            // F6 second hops: job's project is family; DZI job linked to a
            // family project; attached to a family job only via the junction.
            {id: 'a-family-project-job', storage_key: 'k11', owner_scope: 'chart_jobs', chart_job_id: 'cj-in-family-project', created_at: '2000-01-01 00:00:11'},
            {id: 'a-dzi-family-project', storage_key: 'k12', owner_scope: 'chart_jobs', dzi_job_id: 'dz-open', created_at: '2000-01-01 00:00:12'},
            {id: 'a-junction-family', storage_key: 'k13', owner_scope: 'chart_jobs', created_at: '2000-01-01 00:00:13'},
            // F9: an archived public group is not a newsroom group.
            {id: 'a-archived-pub', storage_key: 'k14', owner_scope: 'chart_jobs', chart_job_id: 'cj-archived-pub', created_at: '2000-01-01 00:00:14'}
        ]);
        await database('social_ai_news_jobs').insert([
            {id: 'n-open', user_id: 'editor', group_id: null, status: 'queued', updated_at: '2000-01-01 00:00:01'},
            {id: 'n-family', user_id: 'editor', group_id: FAM, status: 'queued', updated_at: '2000-01-01 00:00:02'},
            {id: 'n-own-family', user_id: 'se', group_id: FAM, status: 'queued', updated_at: '2000-01-01 00:00:03'},
            {id: 'n-pub', user_id: 'editor', group_id: PUB, status: 'queued', updated_at: '2000-01-01 00:00:04'}
        ]);
    });

    after(async function () {
        await database.destroy();
    });

    const userFrame = (user, options = {}) => ({options: {context: {user}, ...options}, data: {}});
    const ids = result => result.data.map(item => item.id).sort();

    describe('gallery', function () {
        let gallery;

        before(function () {
            gallery = loadWith(galleryPath, models, {
                '../../adapters/storage': {},
                './utils/social-media-assets': {}
            });
        });

        it('chart-job gallery: Super Editor sees no-group and public-group artifacts, never family ones', async function () {
            // u-other-pub: a media-job upload in the public group (the chart-job
            // listing also carries media_jobs rows); a-pub-row-family-job is
            // excluded because its producing job is in the family group. The
            // F6 second hops (job's family project, DZI job's family project,
            // family job via the media junction) and the F9 archived public
            // group are excluded too.
            assert.deepEqual(ids(await gallery.chartjobs.query(userFrame('se'))), ['a-open', 'a-pub-job', 'a-pub-row', 'u-other-pub']);
            assert.deepEqual(ids(await gallery.chartjobs.query(userFrame('editor'))), [
                'a-archived-pub', 'a-dzi-family-project', 'a-family-job', 'a-family-project-job', 'a-open', 'a-pub-job',
                'a-pub-row-family-job', 'u-other-pub'
            ]);
            assert.deepEqual(ids(await gallery.chartjobs.query(userFrame('owner'))), []);
        });

        it('user gallery: Super Editor sees every no-group / public-group upload, others only their own no-group ones', async function () {
            assert.deepEqual(ids(await gallery.user.query(userFrame('se'))), ['u-other', 'u-other-pub', 'u-own']);
            assert.deepEqual(ids(await gallery.user.query(userFrame('editor'))), ['u-other']);
        });
    });

    describe('DZI job <-> project links (F7)', function () {
        let dzi;

        before(function () {
            dzi = loadWith(dziPath, models, {
                '../../adapters/storage': {},
                '@tryghost/logging': {warn: () => {}}
            });
        });

        it('linkProject needs write on the project; listProjects hides unreadable projects', async function () {
            const link = user => dzi.linkProject.query({options: {id: 'dz-open', context: {user}}, data: {project_id: 'p-family'}});
            // Super Editor may write the newsroom job but not the family project.
            await assert.rejects(link('se'), {errorType: 'NoPermissionError'});
            const seList = await dzi.listProjects.query({options: {id: 'dz-open', context: {user: 'se'}}, data: {}});
            assert.deepEqual(seList.data, []);
            // The owner of both still links and lists it.
            const ownerList = await link('editor');
            assert.deepEqual(ownerList.data.map(p => p.id), ['p-family']);
        });
    });

    describe('project links (F3)', function () {
        let links;

        before(function () {
            links = loadWith(projectLinksPath, models);
        });

        it('Super Editor reading another user\'s newsroom project only sees links to targets it may read', async function () {
            const browse = user => links.browse.query({options: {id: 'p-open', context: {user}}, data: {}});
            assert.deepEqual((await browse('se')).data.map(l => l.id), ['l-open']);
            assert.deepEqual((await browse('editor')).data.map(l => l.id), ['l-family', 'l-open']);
            await assert.rejects(browse('editor-2'), {errorType: 'NoPermissionError'});
        });
    });

    describe('news jobs', function () {
        let news;

        before(function () {
            news = loadWith(newsPath, models, {
                '../../adapters/storage': {},
                './utils/social-media-assets': {},
                '@tryghost/logging': {}
            });
        });

        it('browse: Super Editor sees no-group / public-group jobs + its own, Editor only its own', async function () {
            assert.deepEqual(ids(await news.browse.query(userFrame('se'))), ['n-open', 'n-own-family', 'n-pub']);
            assert.deepEqual(ids(await news.browse.query(userFrame('editor'))), ['n-family', 'n-open', 'n-pub']);
            assert.deepEqual(ids(await news.browse.query(userFrame('owner'))), ['n-family', 'n-open', 'n-own-family', 'n-pub']);
        });

        it('read: Super Editor reads a no-group job, not a family one', async function () {
            assert.equal((await news.read.query(userFrame('se', {id: 'n-open'}))).id, 'n-open');
            assert.equal((await news.read.query(userFrame('se', {id: 'n-pub'}))).id, 'n-pub');
            await assert.rejects(news.read.query(userFrame('se', {id: 'n-family'})), {errorType: 'NoPermissionError'});
            await assert.rejects(news.read.query(userFrame('legacy-none', {id: 'n-open'})), {errorType: 'NoPermissionError'});
        });

        it('cancel: Super Editor gets no write on another user\'s no-group job', async function () {
            await assert.rejects(news.cancel.query(userFrame('se', {id: 'n-open'})), {errorType: 'NoPermissionError'});
            await assert.rejects(news.cancel.query(userFrame('se', {id: 'n-pub'})), {errorType: 'NoPermissionError'});
        });
    });
});

describe('Super Editor scope on social charts (narrowed from admin bypass)', function () {
    let charts;
    const rows = {
        open: {id: 'open', created_by: 'editor', group_id: null},
        family: {id: 'family-chart', created_by: 'editor', group_id: FAM},
        pub: {id: 'pub-chart', created_by: 'editor', group_id: PUB}
    };
    const asModel = row => ({
        get: key => row[key],
        set: (key, value) => {
            row[key] = value;
        }
    });
    const models = {
        User,
        Base: {knex: publicGroupsKnex},
        SocialChart: {
            findOne: async ({id}) => {
                const row = Object.values(rows).find(r => r.id === id);
                return row ? asModel(row) : null;
            },
            findPage: async options => ({data: [], options}),
            edit: async () => asModel({}),
            add: async data => data,
            destroy: async () => null
        },
        SocialGroup: {
            findOne: async ({id}) => ({id, get: () => 'active'}),
            canAccessGroup: async () => false
        },
        SocialGroupMember: {
            // Author or Owner/Administrator only (mirrors the model).
            canEditGroupContent: async ({authorId, userId}) => authorId === userId || ['owner', 'admin'].includes(userId)
        }
    };
    const frame = (user, options = {}, data = {}) => ({options: {context: {user}, ...options}, data});

    before(function () {
        charts = loadWith(chartsPath, models, {'@tryghost/logging': {error: () => {}}});
    });

    it('read: no-group chart yes, family chart no (admin still yes)', async function () {
        const entry = await charts.read.query(frame('se', {}, {id: 'open'}));
        assert.equal(entry.get('can_edit'), true);
        await assert.rejects(charts.read.query(frame('se', {}, {id: 'family-chart'})), {errorType: 'NoPermissionError'});
        await charts.read.query(frame('owner', {}, {id: 'family-chart'}));
        await assert.rejects(charts.read.query(frame('editor-2', {}, {id: 'open'})), {errorType: 'NoPermissionError'});
        // Public group: Super Editor reads without membership; Editor does not gain it.
        assert.equal((await charts.read.query(frame('se', {}, {id: 'pub-chart'}))).get('can_edit'), true);
        await assert.rejects(charts.read.query(frame('editor-2', {}, {id: 'pub-chart'})), {errorType: 'NoPermissionError'});
    });

    it('write: no-group chart yes, family chart and family-group create no', async function () {
        await charts.edit.query(frame('se', {id: 'open'}, {socialcharts: [{title: 'x'}]}));
        await assert.rejects(charts.edit.query(frame('se', {id: 'family-chart'}, {socialcharts: [{title: 'x'}]})), {errorType: 'NoPermissionError'});
        await assert.rejects(charts.destroy.query(frame('se', {id: 'family-chart'})), {errorType: 'NoPermissionError'});
        await assert.rejects(charts.add.query(frame('se', {}, {socialcharts: [{title: 'x', group_id: FAM}]})), {errorType: 'NoPermissionError'});
        await charts.add.query(frame('owner', {}, {socialcharts: [{title: 'x', group_id: FAM}]}));
        await charts.edit.query(frame('se', {id: 'pub-chart'}, {socialcharts: [{title: 'x'}]}));
        await charts.add.query(frame('se', {}, {socialcharts: [{title: 'x', group_id: PUB}]}));
        await assert.rejects(charts.add.query(frame('editor', {}, {socialcharts: [{title: 'x', group_id: PUB}]})), {errorType: 'NoPermissionError'});
    });

    it('browse: Super Editor gets the newsroom-or-own clause AND-ed onto the caller filter', async function () {
        const result = await charts.browse.query(frame('se', {filter: 'status:aa,status:bb'}));
        assert.equal(result.options.filter, `(status:aa,status:bb)+(group_id:null,group_id:[${PUB}],created_by:se)`);
        // A public group it is not a member of: no own-rows restriction.
        const pubResult = await charts.browse.query(frame('se', {group_id: PUB}));
        assert.equal(pubResult.options.filter, `group_id:${PUB}`);
        const familyResult = await charts.browse.query(frame('se', {group_id: FAM}));
        assert.equal(familyResult.options.filter, `(group_id:${FAM})+created_by:se`);
        const adminResult = await charts.browse.query(frame('owner', {filter: 'status:aa'}));
        assert.equal(adminResult.options.filter, 'status:aa');
        const editorResult = await charts.browse.query(frame('editor', {}));
        assert.equal(editorResult.options.filter, 'created_by:editor');
    });

    it('F1: an unbalanced caller filter is rejected, for every role', async function () {
        for (const user of ['se', 'editor']) {
            await assert.rejects(
                charts.browse.query(frame(user, {filter: `id:-null),(group_id:${FAM}`})),
                {errorType: 'BadRequestError'}
            );
        }
    });

    it('F2: the requested group is always AND-ed; a caller filter naming another group cannot replace it', async function () {
        const familyRow = {id: 'x', group_id: FAM, created_by: 'editor'};
        const pubRow = {id: 'y', group_id: PUB, created_by: 'editor'};
        const se = await charts.browse.query(frame('se', {group_id: PUB, filter: `group_id:${FAM}`}));
        assert.equal(matches(se.options.filter, familyRow), false);
        const seAll = await charts.browse.query(frame('se', {group_id: PUB, filter: 'group_id:-null'}));
        assert.equal(matches(seAll.options.filter, familyRow), false);
        assert.equal(matches(seAll.options.filter, pubRow), true);
        // Editor: created_by can no longer be swapped for someone else's.
        const editor = await charts.browse.query(frame('editor-2', {filter: 'created_by:editor'}));
        assert.equal(matches(editor.options.filter, {created_by: 'editor', group_id: null}), false);
        // Malformed group id never reaches NQL.
        await assert.rejects(charts.browse.query(frame('se', {group_id: `${PUB},id:-null`})), {errorType: 'BadRequestError'});
    });

    it('F4: moving a row into a group is gated like creating in it, for every role', async function () {
        // Super Editor: newsroom row -> family group (not a member): denied; -> public: allowed.
        await assert.rejects(
            charts.edit.query(frame('se', {id: 'open'}, {socialcharts: [{group_id: FAM}]})),
            {errorType: 'NoPermissionError'}
        );
        await charts.edit.query(frame('se', {id: 'open'}, {socialcharts: [{group_id: PUB}]}));
        rows.open.group_id = null;
        // Author moving its own row into a group it is not a member of: denied.
        await assert.rejects(
            charts.edit.query(frame('editor', {id: 'open'}, {socialcharts: [{group_id: FAM}]})),
            {errorType: 'NoPermissionError'}
        );
        // Unchanged group or no group_id in the payload: no gate.
        await charts.edit.query(frame('editor', {id: 'family-chart'}, {socialcharts: [{group_id: FAM, title: 't'}]}));
        await charts.edit.query(frame('owner', {id: 'open'}, {socialcharts: [{group_id: FAM}]}));
    });
});

describe('Super Editor scope on chart-job browse (F3 / F5 / F8)', function () {
    const P_OPEN = '0000000000000000000000b1';
    const P_MINE = '0000000000000000000000b2';
    let chartJobs;
    const projects = {
        [P_OPEN]: {id: P_OPEN, user_id: 'editor', group_id: null},
        [P_MINE]: {id: P_MINE, user_id: 'se', group_id: null}
    };
    const models = {
        User,
        Base: {knex: publicGroupsKnex},
        SocialAiProject: {
            findOne: async ({id}) => {
                const row = projects[id];
                return row ? {get: key => row[key]} : null;
            }
        },
        SocialAiChartJob: {findPage: async options => ({data: [], options})},
        SocialGroup: {findOne: async () => null, canAccessGroup: async () => false}
    };
    const frame = (user, options = {}) => ({options: {context: {user}, ...options}, data: {}});

    before(function () {
        chartJobs = loadWith(chartJobsPath, models, {
            '../../adapters/storage': {},
            './utils/social-media-assets': {},
            '@tryghost/logging': {}
        });
    });

    it('F3: another user\'s newsroom project yields only its newsroom jobs (+ own) to Super Editor', async function () {
        const {options} = await chartJobs.browse.query(frame('se', {project_id: P_OPEN}));
        const job = fields => ({project_id: P_OPEN, user_id: 'editor', group_id: null, ...fields});
        assert.equal(matches(options.filter, job({group_id: FAM})), false);
        assert.equal(matches(options.filter, job({})), true);
        assert.equal(matches(options.filter, job({group_id: PUB})), true);
        assert.equal(matches(options.filter, job({group_id: FAM, user_id: 'se'})), true);
        // Its own project: every job of the project, as for any owner.
        const own = await chartJobs.browse.query(frame('se', {project_id: P_MINE}));
        assert.equal(own.options.filter, `project_id:${P_MINE}`);
        // Editors still cannot read another user's personal project.
        await assert.rejects(chartJobs.browse.query(frame('editor-2', {project_id: P_OPEN})), {errorType: 'NoPermissionError'});
    });

    it('F5: `type` is a single token and the scope stays an outer AND', async function () {
        await assert.rejects(chartJobs.browse.query(frame('se', {type: 'x,id:-null'})), {errorType: 'BadRequestError'});
        await assert.rejects(chartJobs.browse.query(frame('editor', {type: 'x,id:-null'})), {errorType: 'BadRequestError'});
        const {options} = await chartJobs.browse.query(frame('editor', {type: 'csv-create', filter: 'status:aa,status:bb'}));
        assert.equal(options.filter, '((status:aa,status:bb)+user_id:editor)+type:csv-create');
        assert.equal(matches(options.filter, {status: 'aa', user_id: 'other', type: 'csv-create'}), false);
    });
});
