const assert = require('assert/strict');
const Module = require('module');
const sinon = require('sinon');
const knex = require('knex');
const nql = require('@tryghost/nql');

const helperPath = require.resolve('../../../../../core/server/api/endpoints/utils/staff-scope');
const galleryPath = require.resolve('../../../../../core/server/api/endpoints/social-gallery');
const newsPath = require.resolve('../../../../../core/server/api/endpoints/social-ai-news-jobs');
const chartsPath = require.resolve('../../../../../core/server/api/endpoints/social-charts');

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
        staffScope = loadWith(helperPath, {User});
    });

    it('classifies system admins, Super Editor and others', async function () {
        assert.deepEqual(await staffScope.getStaffScope('owner'), {isSystemAdmin: true, isNoGroupReader: false});
        assert.deepEqual(await staffScope.getStaffScope('admin'), {isSystemAdmin: true, isNoGroupReader: false});
        assert.deepEqual(await staffScope.getStaffScope('legacy'), {isSystemAdmin: true, isNoGroupReader: false});
        assert.deepEqual(await staffScope.getStaffScope('se'), {isSystemAdmin: false, isNoGroupReader: true});
        assert.deepEqual(await staffScope.getStaffScope('se-admin'), {isSystemAdmin: true, isNoGroupReader: false});
        assert.deepEqual(await staffScope.getStaffScope('editor'), {isSystemAdmin: false, isNoGroupReader: false});
        assert.deepEqual(await staffScope.getStaffScope('missing'), {isSystemAdmin: false, isNoGroupReader: false});
        assert.deepEqual(await staffScope.getStaffScope(null), {isSystemAdmin: false, isNoGroupReader: false});
    });

    it('lets Super Editor past the row check only on rows without a group', function () {
        const se = {isSystemAdmin: false, isNoGroupReader: true};
        const admin = {isSystemAdmin: true, isNoGroupReader: false};
        const editor = {isSystemAdmin: false, isNoGroupReader: false};
        const model = groupId => ({get: key => (key === 'group_id' ? groupId : undefined)});

        assert.equal(staffScope.canReadRowAsNoGroupReader(se, {group_id: null}), true);
        assert.equal(staffScope.canReadRowAsNoGroupReader(se, model(null)), true);
        assert.equal(staffScope.canReadRowAsNoGroupReader(se, {group_id: 'family'}), false);
        assert.equal(staffScope.canReadRowAsNoGroupReader(se, model('family')), false);
        assert.equal(staffScope.canReadRowAsNoGroupReader(se, null), false);
        assert.equal(staffScope.canReadRowAsNoGroupReader(editor, {group_id: null}), false);

        assert.equal(staffScope.bypassesRowCheck(admin, {group_id: 'family'}), true);
        assert.equal(staffScope.bypassesRowCheck(se, {group_id: 'family'}), false);
        assert.equal(staffScope.bypassesRowCheck(se, {group_id: null}), true);
        assert.equal(staffScope.bypassesRowCheck(editor, {group_id: null}), false);
        assert.equal(staffScope.bypassesRowCheck(null, {group_id: null}), false);
    });

    it('builds an NQL scope a caller filter cannot widen', function () {
        const db = knex({client: 'mysql2'});
        const sql = filter => nql(filter).querySQL(db('t')).toString();
        const clause = staffScope.noGroupOrOwnFilter('u1', 'user_id');

        assert.equal(clause, '(group_id:null,user_id:u1)');
        assert.equal(staffScope.noGroupOrOwnFilter('u1'), '(group_id:null,created_by:u1)');
        assert.equal(staffScope.andFilter('', clause), clause);
        assert.equal(
            sql(staffScope.andFilter('status:aa,status:bb', clause)),
            'select * from `t` where ((`t`.`status` = \'aa\' or `t`.`status` = \'bb\') and (`t`.`group_id` is null or `t`.`user_id` = \'u1\'))'
        );
    });
});

describe('Super Editor scope on knex-backed listings', function () {
    let database;
    const models = {User};

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
            ['media_id', 'role', 'post_id'].forEach(column => table.string(column));
        });
        await database.schema.createTable('estate_property_media', table => table.string('media_id'));
        for (const name of [
            'social_ai_chart_jobs', 'social_ai_content_bundle_jobs', 'social_ai_media_jobs', 'social_ai_dzi_jobs',
            'social_ai_projects', 'social_charts'
        ]) {
            await database.schema.createTable(name, (table) => {
                table.string('id').primary();
                table.string('user_id');
                table.string('group_id');
            });
        }
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
            {id: 'cj-family', user_id: 'editor', group_id: 'family'}
        ]);
        await database('social_media_assets').insert([
            {id: 'a-open', storage_key: 'k1', owner_scope: 'chart_jobs', chart_job_id: 'cj-open', created_at: '2000-01-01 00:00:01'},
            {id: 'a-family-job', storage_key: 'k2', owner_scope: 'chart_jobs', chart_job_id: 'cj-family', created_at: '2000-01-01 00:00:02'},
            {id: 'a-family-row', storage_key: 'k3', owner_scope: 'chart_jobs', group_id: 'family', created_at: '2000-01-01 00:00:03'},
            {id: 'u-other', storage_key: 'k4', owner_scope: 'user', user_id: 'editor', created_at: '2000-01-01 00:00:04'},
            {id: 'u-other-family', storage_key: 'k5', owner_scope: 'user', user_id: 'editor', group_id: 'family', created_at: '2000-01-01 00:00:05'},
            {id: 'u-own', storage_key: 'k6', owner_scope: 'user', user_id: 'se', created_at: '2000-01-01 00:00:06'}
        ]);
        await database('social_ai_news_jobs').insert([
            {id: 'n-open', user_id: 'editor', group_id: null, status: 'queued', updated_at: '2000-01-01 00:00:01'},
            {id: 'n-family', user_id: 'editor', group_id: 'family', status: 'queued', updated_at: '2000-01-01 00:00:02'},
            {id: 'n-own-family', user_id: 'se', group_id: 'family', status: 'queued', updated_at: '2000-01-01 00:00:03'}
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

        it('chart-job gallery: Super Editor sees no-group artifacts, never family ones', async function () {
            assert.deepEqual(ids(await gallery.chartjobs.query(userFrame('se'))), ['a-open']);
            assert.deepEqual(ids(await gallery.chartjobs.query(userFrame('editor'))), ['a-family-job', 'a-open']);
            assert.deepEqual(ids(await gallery.chartjobs.query(userFrame('owner'))), []);
        });

        it('user gallery: Super Editor sees every no-group upload, others only their own', async function () {
            assert.deepEqual(ids(await gallery.user.query(userFrame('se'))), ['u-other', 'u-own']);
            assert.deepEqual(ids(await gallery.user.query(userFrame('editor'))), ['u-other']);
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

        it('browse: Super Editor sees no-group jobs + its own, Editor only its own', async function () {
            assert.deepEqual(ids(await news.browse.query(userFrame('se'))), ['n-open', 'n-own-family']);
            assert.deepEqual(ids(await news.browse.query(userFrame('editor'))), ['n-family', 'n-open']);
            assert.deepEqual(ids(await news.browse.query(userFrame('owner'))), ['n-family', 'n-open', 'n-own-family']);
        });

        it('read: Super Editor reads a no-group job, not a family one', async function () {
            assert.equal((await news.read.query(userFrame('se', {id: 'n-open'}))).id, 'n-open');
            await assert.rejects(news.read.query(userFrame('se', {id: 'n-family'})), {errorType: 'NoPermissionError'});
            await assert.rejects(news.read.query(userFrame('legacy-none', {id: 'n-open'})), {errorType: 'NoPermissionError'});
        });

        it('cancel: Super Editor gets no write on another user\'s no-group job', async function () {
            await assert.rejects(news.cancel.query(userFrame('se', {id: 'n-open'})), {errorType: 'NoPermissionError'});
        });
    });
});

describe('Super Editor scope on social charts (narrowed from admin bypass)', function () {
    let charts;
    const rows = {
        open: {id: 'open', created_by: 'editor', group_id: null},
        family: {id: 'family-chart', created_by: 'editor', group_id: 'family'}
    };
    const asModel = row => ({
        get: key => row[key],
        set: (key, value) => {
            row[key] = value;
        }
    });
    const models = {
        User,
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
    });

    it('write: no-group chart yes, family chart and family-group create no', async function () {
        await charts.edit.query(frame('se', {id: 'open'}, {socialcharts: [{title: 'x'}]}));
        await assert.rejects(charts.edit.query(frame('se', {id: 'family-chart'}, {socialcharts: [{title: 'x'}]})), {errorType: 'NoPermissionError'});
        await assert.rejects(charts.destroy.query(frame('se', {id: 'family-chart'})), {errorType: 'NoPermissionError'});
        await assert.rejects(charts.add.query(frame('se', {}, {socialcharts: [{title: 'x', group_id: 'family'}]})), {errorType: 'NoPermissionError'});
        await charts.add.query(frame('owner', {}, {socialcharts: [{title: 'x', group_id: 'family'}]}));
    });

    it('browse: Super Editor gets the no-group-or-own clause AND-ed onto the caller filter', async function () {
        const result = await charts.browse.query(frame('se', {filter: 'status:aa,status:bb'}));
        assert.equal(result.options.filter, '(status:aa,status:bb)+(group_id:null,created_by:se)');
        const adminResult = await charts.browse.query(frame('owner', {filter: 'status:aa'}));
        assert.equal(adminResult.options.filter, 'status:aa');
        const editorResult = await charts.browse.query(frame('editor', {}));
        assert.equal(editorResult.options.filter, 'created_by:editor');
    });
});
