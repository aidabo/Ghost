const ghostBookshelf = require('./base');

const ContentProduct = ghostBookshelf.Model.extend({
    tableName: 'content_products',
    relationships: ['prices', 'items'],
    permittedAttributes() {
        return ['id', 'slug', 'name', 'description', 'product_type', 'status', 'created_by', 'created_at', 'updated_at'];
    },
    async onSaving(model, _attrs, options) {
        ghostBookshelf.Model.prototype.onSaving.apply(this, arguments);
        const base = model.get('slug') || model.get('name');
        if (base && (model.hasChanged('slug') || model.hasChanged('name') || !model.get('slug'))) {
            model.set('slug', await ghostBookshelf.Model.generateSlug(ContentProduct, base, {transacting: options.transacting}));
        }
    },
    prices() {
        return this.hasMany('ContentProductPrice', 'content_product_id');
    },
    items() {
        return this.hasMany('ContentProductItem', 'content_product_id').query('orderBy', 'sort_order', 'ASC');
    }
});

module.exports = {ContentProduct: ghostBookshelf.model('ContentProduct', ContentProduct)};
