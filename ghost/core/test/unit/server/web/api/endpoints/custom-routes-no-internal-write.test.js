// POST /person/graph/posts は slug で記事を internal 文脈（権限の確かめ無し）で upsert していた抜け道。
// 2026-11-28 に消した（news-worker は標準の /posts API を使う）。戻さないための確かめ。
// web/api/endpoints の admin・content の route の定義はどれもモデルを直接触らない（api の endpoints を通す）ので、
// 全ファイルで「models.Post に触る」「internal: true」「/person/ の route」が 0 件であることを見る。
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '../../../../../../core/server/web/api/endpoints');
const files = ['admin', 'content'].flatMap(dir => fs.readdirSync(path.join(ROOT, dir))
    .filter(name => name.endsWith('.js'))
    .map(name => `${dir}/${name}`));

const forbidden = [
    ['/person/ の route', /['"`]\/person\//],
    ['models.Post に直接触る（add・edit・save・destroy・new ほか）', /\bmodels\.Post\b/],
    ['internal: true（権限を飛ばす文脈）', /\binternal\s*:\s*true\b/]
];

describe('web/api/endpoints の route に権限を飛ばす記事の書き込みが無い', function () {
    it('admin・content の .js を読めた', function () {
        assert.ok(files.includes('admin/custom-routes.js'));
        assert.ok(files.includes('content/custom-routes.js'));
    });

    for (const file of files) {
        it(file, function () {
            const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
            const hits = forbidden.filter(([, pattern]) => pattern.test(source)).map(([label]) => label);
            assert.deepEqual(hits, []);
        });
    }
});
