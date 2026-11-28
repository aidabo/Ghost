// 2026-11-28 の drop-person-tables: 古い person の 9 表を（在るときだけ）消し、person の権限と役割の結び付きも消す。
// 何度流しても同じ。新しい DB（schema.js・fixtures.json）にも person の表・権限が作られない。
const assert = require('assert/strict');
const knex = require('knex').default;

const migration = require('../../../../../core/server/data/migrations/versions/5.116/2026-11-28-00-00-00-drop-person-tables');
const schema = require('../../../../../core/server/data/schema/schema');
const fixtures = require('../../../../../core/server/data/schema/fixtures/fixtures.json');

describe('migration: drop-person-tables', function () {
    let db;

    beforeEach(async function () {
        db = knex({client: 'sqlite3', connection: {filename: ':memory:'}, useNullAsDefault: true});
        await db.schema.createTable('persons', t => t.string('id').primary());
        for (const name of ['person_roles', 'person_life_events', 'person_relations', 'person_story_series', 'person_post_relations']) {
            await db.schema.createTable(name, (t) => {
                t.string('id').primary();
                t.string('person_id').references('persons.id');
            });
        }
        await db.schema.createTable('person_story_episodes', (t) => {
            t.string('id').primary();
            t.string('series_id').references('person_story_series.id');
        });
        await db.schema.createTable('person_media', (t) => {
            t.string('id').primary();
            t.string('person_id').references('persons.id');
        });
        await db.schema.createTable('person_stories', t => t.string('id').primary());
        await db.schema.createTable('posts', t => t.string('id').primary());
        await db.schema.createTable('permissions', (t) => {
            t.string('id').primary();
            t.string('object_type');
        });
        await db.schema.createTable('permissions_roles', (t) => {
            t.string('id').primary();
            t.string('role_id');
            t.string('permission_id');
        });
        await db.schema.createTable('permissions_users', (t) => {
            t.string('id').primary();
            t.string('user_id');
            t.string('permission_id');
        });
        await db('persons').insert({id: 'p1'});
        await db('person_roles').insert({id: 'r1', person_id: 'p1'});
        await db('posts').insert({id: 'post1'});
        await db('permissions').insert([
            {id: 'perm-person', object_type: 'person'},
            {id: 'perm-story', object_type: 'personstory'},
            {id: 'perm-post', object_type: 'post'}
        ]);
        await db('permissions_roles').insert([
            {id: 'pr1', role_id: 'admin', permission_id: 'perm-person'},
            {id: 'pr2', role_id: 'editor', permission_id: 'perm-story'},
            {id: 'pr3', role_id: 'admin', permission_id: 'perm-post'}
        ]);
        await db('permissions_users').insert([
            {id: 'pu1', user_id: 'u1', permission_id: 'perm-person'},
            {id: 'pu2', user_id: 'u1', permission_id: 'perm-post'}
        ]);
    });

    afterEach(async function () {
        await db.destroy();
    });

    it('9 表を消し、person の権限と結び付き（役割・ユーザー）だけを消す（ほかの表・権限は残る）', async function () {
        await migration.up({connection: db});
        for (const name of migration.droppedTables) {
            assert.equal(await db.schema.hasTable(name), false, name);
        }
        assert.equal(migration.droppedTables.length, 9);
        assert.equal(await db.schema.hasTable('posts'), true);
        assert.deepEqual((await db('permissions').select('id')).map(r => r.id), ['perm-post']);
        assert.deepEqual((await db('permissions_roles').select('id')).map(r => r.id), ['pr3']);
        assert.deepEqual((await db('permissions_users').select('id')).map(r => r.id), ['pu2']);
    });

    it('何度流しても同じ（表・権限が無ければ何もしない）', async function () {
        await migration.up({connection: db});
        await migration.up({connection: db});
        assert.equal(await db.schema.hasTable('persons'), false);
        assert.deepEqual((await db('permissions').select('id')).map(r => r.id), ['perm-post']);
    });

    it('戻せない（irreversible）', function () {
        assert.equal(migration.config.irreversible, true);
    });
});

describe('新しい DB に person の表・権限が作られない', function () {
    it('schema.js に person の表が無い', function () {
        assert.deepEqual(Object.keys(schema).filter(name => /^person/.test(name)), []);
    });

    it('fixtures.json に person の権限と役割の結び付きが無い', function () {
        const permissions = fixtures.models.find(m => m.name === 'Permission').entries;
        assert.deepEqual(permissions.filter(p => p.object_type.startsWith('person')), []);
        for (const relation of fixtures.relations) {
            for (const [role, objects] of Object.entries(relation.entries)) {
                if (objects && typeof objects === 'object') {
                    assert.deepEqual(Object.keys(objects).filter(k => k.startsWith('person')), [], role);
                }
            }
        }
    });

    it('消す権限の一覧は、古い migration が足した person の権限をすべて含む', function () {
        const fs = require('fs');
        const path = require('path');
        const dir = path.join(__dirname, '../../../../../core/server/data/migrations/versions/5.116');
        const added = new Set();
        for (const file of fs.readdirSync(dir).filter(f => /person/.test(f) && /permissions/.test(f))) {
            for (const m of fs.readFileSync(path.join(dir, file), 'utf8').matchAll(/object: '([a-z]+)'/g)) {
                added.add(m[1]);
            }
        }
        assert.ok(added.size >= 9);
        assert.deepEqual([...added].filter(type => !migration.removedPermissionObjectTypes.includes(type)), []);
    });
});
