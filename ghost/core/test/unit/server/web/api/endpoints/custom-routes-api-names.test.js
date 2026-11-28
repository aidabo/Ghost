// admin・content の custom-routes が使う api.<名前> が、すべて api/endpoints/index.js にあること。
// 無いと router を作るときに「Cannot read properties of undefined (reading 'browse')」で Ghost が起動しない
// （古い person の getter を消したときに、間にあった publishContent まで消えたことがある）。
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '../../../../../../core/server');
const endpoints = fs.readFileSync(path.join(ROOT, 'api/endpoints/index.js'), 'utf8');
const getters = new Set([...endpoints.matchAll(/^\s+get (\w+)\(\)/gm)].map(m => m[1]));

function usedNames(file) {
    const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
    return [...new Set([...source.matchAll(/\bapi\.(\w+)\.\w+/g)].map(m => m[1]))];
}

describe('custom-routes が使う api.<名前> は api/endpoints/index.js にある', function () {
    for (const file of ['web/api/endpoints/admin/custom-routes.js', 'web/api/endpoints/content/custom-routes.js']) {
        it(file, function () {
            const names = usedNames(file);
            assert.ok(names.length > 5, 'api.<名前> を読めた');
            const missing = names.filter(name => !getters.has(name));
            assert.deepEqual(missing, []);
        });
    }
});

// POST /person/graph/posts は slug で記事を internal 文脈（権限の確かめ無し）で upsert していた抜け道。
// 2026-11-28 に消した（news-worker は標準の /posts API を使う）。戻さないための確かめ。
describe('admin の custom-routes に権限を飛ばす記事の upsert が無い', function () {
    const source = fs.readFileSync(path.join(ROOT, 'web/api/endpoints/admin/custom-routes.js'), 'utf8');

    it('/person/ の route が無い', function () {
        assert.doesNotMatch(source, /['"]\/person\//);
    });

    it('models.Post を internal 文脈で直接書かない', function () {
        assert.doesNotMatch(source, /models\.Post\.(add|edit)\(/);
        assert.doesNotMatch(source, /context:\s*\{\s*internal:\s*true/);
    });
});
