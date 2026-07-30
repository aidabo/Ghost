const { addTable } = require('../../utils');

module.exports = addTable('social_charts', {
    id: { type: 'string', maxlength: 24, nullable: false, primary: true },
    slug: { type: 'string', maxlength: 191, nullable: true, unique: true },
    title: { type: 'string', maxlength: 191, nullable: false },
    excerpt: { type: 'string', maxlength: 500, nullable: true },
    image: { type: 'string', maxlength: 500, nullable: true },
    chart_props: { type: 'text', maxlength: 1000000000, nullable: true },
    status: { type: 'string', maxlength: 50, nullable: false, defaultTo: 'draft', validations: { isIn: [['published', 'draft']] } },
    published_at: { type: 'dateTime', nullable: true },
    group_id: { type: 'string', maxlength: 24, nullable: true },
    created_at: { type: 'dateTime', nullable: false },
    created_by: { type: 'string', maxlength: 24, nullable: false },
    updated_at: { type: 'dateTime', nullable: false },
    updated_by: { type: 'string', maxlength: 24, nullable: true }
});
