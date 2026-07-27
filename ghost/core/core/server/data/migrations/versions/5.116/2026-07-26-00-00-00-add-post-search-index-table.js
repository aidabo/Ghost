const { addTable } = require('../../utils');
const { combineNonTransactionalMigrations } = require('../../utils');

// Denormalized keyword-search index for core posts, mirroring the estate search
// index. The FULLTEXT(ngram) index on `search_text` is added by the paired
// -00-00-01 migration (schema.js @@INDEXES@@ cannot express WITH PARSER ngram).
module.exports = combineNonTransactionalMigrations(
    addTable('post_search_index', {
        post_id: { type: 'string', maxlength: 24, nullable: false, primary: true, references: 'posts.id', cascadeDelete: true },
        search_text: { type: 'text', maxlength: 1000000000, fieldtype: 'long', nullable: true },
        title_text: { type: 'string', maxlength: 2000, nullable: true },
        excerpt_text: { type: 'text', maxlength: 65535, nullable: true },
        tag_text: { type: 'text', maxlength: 65535, nullable: true },
        author_text: { type: 'string', maxlength: 1000, nullable: true },
        status: { type: 'string', maxlength: 50, nullable: false, defaultTo: 'draft' },
        visibility: { type: 'string', maxlength: 50, nullable: true },
        featured: { type: 'bool', nullable: false, defaultTo: false },
        published_at: { type: 'dateTime', nullable: true },
        updated_at: { type: 'dateTime', nullable: true },
        '@@INDEXES@@': [
            ['status', 'published_at']
        ]
    })
);
