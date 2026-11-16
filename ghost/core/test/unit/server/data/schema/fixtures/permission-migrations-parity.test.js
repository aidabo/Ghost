// 新しい DB の権限は fixtures.json からだけ作られる（init は versions/** の migration を実行せず、記録だけする）。
// そのため、権限を足す migration（addPermissionWithRoles・addPermissionToRole）を書いたら、fixtures.json にも同じ権限と
// 役割との結び付きを書く。ここでは 5.115 以降の migration がそれらの helper に渡すものを集め、fixtures.json に全部あるかを確かめる。
// helper を使わず knex で直接書く migration は見えない（その分は手で fixtures.json に反映する）。
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const VERSIONS = path.join(__dirname, '../../../../../../core/server/data/migrations/versions');
const utils = require('../../../../../../core/server/data/migrations/utils');
const fixtures = require('../../../../../../core/server/data/schema/fixtures/fixtures.json');

// この fork の migration は 5.115 から。5.117 以降のフォルダも足せば自動で入る
function forkVersions() {
    const minor = v => Number(v.split('.')[1]);
    return fs.readdirSync(VERSIONS)
        .filter(v => /^5\.\d+$/.test(v) && minor(v) >= 115)
        .sort((a, b) => minor(a) - minor(b));
}

function collectMigrationGrants() {
    const grants = [];
    const original = {addPermissionWithRoles: utils.addPermissionWithRoles, addPermissionToRole: utils.addPermissionToRole};
    // migration は読み込むときに helper を受け取るので、読み込む前に差し替えて、渡されたものだけを記録する
    utils.addPermissionWithRoles = (config, roles) => {
        grants.push({file: current, name: config.name, action: config.action, object: config.object, roles});
        return original.addPermissionWithRoles(config, roles);
    };
    utils.addPermissionToRole = (config) => {
        grants.push({file: current, name: config.permission, roles: [config.role]});
        return original.addPermissionToRole(config);
    };
    let current = '';
    try {
        for (const version of forkVersions()) {
            const dir = path.join(VERSIONS, version);
            // .cjs の migration も読む（5.116 にある）
            for (const file of fs.readdirSync(dir).filter(f => /\.c?js$/.test(f)).sort()) {
                current = `${version}/${file}`;
                const full = path.join(dir, file);
                delete require.cache[require.resolve(full)];
                require(full);
            }
        }
    } finally {
        Object.assign(utils, original);
    }
    return grants;
}

function fixtureGrants() {
    const permissions = fixtures.models.find(m => m.name === 'Permission').entries;
    const byName = new Map(permissions.map(p => [p.name, p]));
    const granted = new Set();
    for (const relation of fixtures.relations.filter(r => r.from.model === 'Role' && r.to.model === 'Permission')) {
        for (const [role, objects] of Object.entries(relation.entries)) {
            for (const [object, actions] of Object.entries(objects)) {
                const list = actions === 'all'
                    ? permissions.filter(p => p.object_type === object).map(p => p.action_type)
                    : [].concat(actions);
                list.forEach(action => granted.add(`${role}|${action}|${object}`));
            }
        }
    }
    return {byName, granted};
}

describe('Permission migrations are in fixtures.json (a new database gets them too)', function () {
    it('every permission and role grant added by a 5.115+ migration helper is in fixtures.json', function () {
        const grants = collectMigrationGrants();
        assert.ok(grants.length > 50, 'the migrations were read');
        const {byName, granted} = fixtureGrants();
        const missing = [];
        for (const grant of grants) {
            const permission = byName.get(grant.name);
            if (!permission) {
                missing.push(`${grant.file}: permission "${grant.name}" is not in fixtures.json`);
                continue;
            }
            for (const role of grant.roles) {
                if (!granted.has(`${role}|${permission.action_type}|${permission.object_type}`)) {
                    missing.push(`${grant.file}: ${role} → ${permission.action_type} ${permission.object_type} is not in fixtures.json`);
                }
            }
        }
        assert.deepEqual(missing, []);
    });
});
