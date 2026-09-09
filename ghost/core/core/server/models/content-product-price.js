const ghostBookshelf = require('./base');

const ContentProductPrice = ghostBookshelf.Model.extend({
    tableName: 'content_product_prices',
    permittedAttributes() {
        return ['id', 'content_product_id', 'stripe_product_id', 'stripe_price_id', 'amount', 'currency', 'active', 'created_at', 'updated_at'];
    }
});

module.exports = {ContentProductPrice: ghostBookshelf.model('ContentProductPrice', ContentProductPrice)};
