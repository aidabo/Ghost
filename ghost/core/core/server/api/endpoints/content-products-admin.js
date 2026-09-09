const ObjectId = require('bson-objectid').default;
const errors = require('@tryghost/errors');
const models = require('../../models');
const stripeService = require('../../services/stripe');
const logging = require('@tryghost/logging');

function serializeRecord(item) {
    return item.toJSON ? item.toJSON() : item;
}

async function productPayload(row) {
    const [prices, items] = await Promise.all([
        models.ContentProductPrice.findAll({filter: `content_product_id:${row.id}`, order: 'amount asc'}),
        models.ContentProductItem.findAll({filter: `content_product_id:${row.id}`, order: 'sort_order asc'})
    ]);
    const product = row.toJSON ? row.toJSON() : row;
    return {...product, prices: prices.map(serializeRecord), items: items.map(serializeRecord)};
}

async function browse(req, res) {
    const rows = await models.ContentProduct.findAll({order: 'updated_at desc'});
    res.json({contentproducts: await Promise.all(rows.map(productPayload))});
}

async function add(req, res) {
    const payload = req.body?.contentproducts?.[0] || req.body?.products?.[0] || req.body?.product?.[0] || req.body?.product || req.body?.content_products?.[0] || req.body?.content_product?.[0] || req.body?.content_product || req.body;
    logging.info(`[ContentProducts] create payload keys: ${Object.keys(req.body || {}).join(',')}`);
    if (!payload?.name || !payload?.product_type || payload?.amount === undefined || !payload?.currency) {
        throw new errors.ValidationError({message: 'name, product_type, amount and currency are required.'});
    }
    const id = ObjectId().toHexString();
    const now = new Date();
    await models.ContentProduct.add({id, slug: payload.slug || payload.name, name: payload.name, description: payload.description || null, product_type: payload.product_type, status: payload.status || 'draft', created_by: req.user?.id || null, created_at: now, updated_at: now}, {context: {internal: true}});
    if (payload.amount !== undefined && payload.currency) {
        if (!stripeService.api.configured) {
            throw new errors.BadRequestError({message: 'Stripe is not configured.'});
        }
        const stripeProduct = await stripeService.api.createProduct({name: payload.name, metadata: {content_product_id: id}});
        const stripePrice = await stripeService.api.createPrice({product: stripeProduct.id, amount: Number(payload.amount), currency: String(payload.currency).toLowerCase(), type: 'one-time', active: true, nickname: payload.price_name || payload.name});
        await models.ContentProductPrice.add({id: ObjectId().toHexString(), content_product_id: id, stripe_product_id: stripeProduct.id, stripe_price_id: stripePrice.id, amount: Number(payload.amount), currency: String(payload.currency).toUpperCase(), active: true, created_at: now, updated_at: now}, {context: {internal: true}});
    }
    res.status(201).json({contentproducts: [await productPayload(await models.ContentProduct.findOne({id}))]});
}

async function edit(req, res) {
    const updates = {};
    for (const key of ['name', 'description', 'status', 'product_type']) {
        if (req.body?.[key] !== undefined) {
            updates[key] = req.body[key];
        }
    }
    updates.updated_at = new Date();
    const product = await models.ContentProduct.findOne({id: req.params.id});
    if (!product) {
        throw new errors.NotFoundError({message: 'Content product not found.'});
    }
    const updated = await models.ContentProduct.edit(updates, {id: req.params.id, context: {internal: true}});
    res.json({contentproducts: [await productPayload(updated)]});
}

async function addItem(req, res) {
    const payload = req.body?.item || req.body;
    if (!payload?.content_type || !payload?.content_id) {
        throw new errors.ValidationError({message: 'content_type and content_id are required.'});
    }
    const exists = await models.ContentProduct.findOne({id: req.params.id});
    if (!exists) {
        throw new errors.NotFoundError({message: 'Content product not found.'});
    }
    if (!['preview', 'entitlement'].includes(payload.access_mode || 'preview')) {
        throw new errors.ValidationError({message: 'access_mode must be preview or entitlement.'});
    }
    await models.ContentProductItem.add({id: ObjectId().toHexString(), content_product_id: req.params.id, content_type: payload.content_type, content_id: payload.content_id, sort_order: Number(payload.sort_order || 0), required: payload.required !== false, access_mode: payload.access_mode || 'preview', source_status: payload.source_status || null, source_visibility: payload.source_visibility || null, source_title: payload.source_title || null, source_slug: payload.source_slug || null, source_url: payload.source_url || null, created_at: new Date(), updated_at: new Date()}, {context: {internal: true}});
    res.status(201).json({contentproducts: [await productPayload(exists)]});
}

async function deleteItem(req, res) {
    const item = await models.ContentProductItem.findOne({id: req.params.itemId, content_product_id: req.params.id});
    if (!item) {
        throw new errors.NotFoundError({message: 'Content product item not found.'});
    }
    await models.ContentProductItem.destroy({id: req.params.itemId, context: {internal: true}});
    res.status(204).end();
}

module.exports = {browse, add, edit, addItem, deleteItem};
