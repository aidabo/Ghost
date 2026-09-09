const ghostBookshelf = require('./base');

const ContentProductItem = ghostBookshelf.Model.extend({
    tableName: 'content_product_items',
    permittedAttributes() {
        return ['id', 'content_product_id', 'content_type', 'content_id', 'sort_order', 'required', 'access_mode', 'source_status', 'source_visibility', 'source_title', 'source_slug', 'source_url', 'created_at', 'updated_at'];
    }
});

module.exports = {ContentProductItem: ghostBookshelf.model('ContentProductItem', ContentProductItem)};
