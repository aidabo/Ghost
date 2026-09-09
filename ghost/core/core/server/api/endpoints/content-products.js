const ObjectId = require('bson-objectid').default;
const errors = require('@tryghost/errors');
const models = require('../../models');
const membersService = require('../../services/members');
const stripeService = require('../../services/stripe');

function publicProduct(row, prices, items, entitlement = null) {
    const product = row.toJSON ? row.toJSON() : row;
    const serializePrice = (price) => {
        const value = price.toJSON ? price.toJSON() : price;
        return {id: value.id, amount: value.amount, currency: value.currency, active: Boolean(value.active)};
    };
    const serializeItem = (item) => {
        const value = item.toJSON ? item.toJSON() : item;
        return {id: value.id, content_type: value.content_type, content_id: value.content_id, sort_order: value.sort_order, required: Boolean(value.required)};
    };
    return {
        id: product.id,
        slug: product.slug,
        name: product.name,
        description: product.description,
        product_type: product.product_type,
        entitled: Boolean(entitlement),
        entitlement: entitlement ? {
            status: entitlement.status,
            granted_at: entitlement.granted_at,
            expires_at: entitlement.expires_at
        } : null,
        prices: prices.map(serializePrice),
        items: items.map(serializeItem)
    };
}

async function readProduct(productId, memberId = null) {
    const product = await models.ContentProduct.findOne({id: productId, status: 'published'});
    if (!product) {
        throw new errors.NotFoundError({message: 'Content product not found.'});
    }
    const [prices, items, entitlement] = await Promise.all([
        models.ContentProductPrice.findAll({filter: `content_product_id:${product.id}+active:true`, order: 'amount asc'}),
        models.ContentProductItem.findAll({filter: `content_product_id:${product.id}`, order: 'sort_order asc'}),
        memberId ? models.Base.knex('member_entitlements')
            .where({member_id: memberId, content_product_id: product.id, status: 'active'})
            .where(query => query.whereNull('expires_at').orWhere('expires_at', '>', new Date()))
            .orderBy('granted_at', 'desc')
            .first() : null
    ]);
    return publicProduct(product, prices, items, entitlement);
}

async function getMember(req, res) {
    const member = await membersService.ssr.getMemberDataFromSession(req, res);
    if (!member?.id) {
        throw new errors.NoPermissionError({message: 'Member session is required.'});
    }
    return member;
}

async function list(req, res) {
    const member = await getMember(req, res);
    const rows = await models.ContentProduct.findAll({filter: 'status:published', order: 'name asc'});
    const products = [];
    for (const row of rows) {
        products.push(await readProduct(row.id, member.id));
    }
    res.json({products});
}

async function read(req, res) {
    const member = await getMember(req, res);
    res.json({products: [await readProduct(req.params.slug, member.id)]});
}

async function checkout(req, res) {
    const member = await getMember(req, res);
    const product = await readProduct(req.params.id);
    const price = await models.Base.knex('content_product_prices').where({id: req.body?.price_id, content_product_id: product.id, active: true}).first();
    if (!price) {
        throw new errors.NotFoundError({message: 'Content product price not found.'});
    }
    const customer = await stripeService.api.getCustomerForMemberCheckoutSession(member);
    const session = await stripeService.api.createOneTimeCheckoutSession({
        priceId: price.stripe_price_id,
        successUrl: req.body?.success_url,
        cancelUrl: req.body?.cancel_url,
        customer,
        metadata: {
            content_product_id: product.id,
            content_product_price_id: price.id,
            member_id: member.id,
            order_id: ObjectId().toHexString()
        }
    });
    res.json({checkout: [{url: session.url}]});
}

module.exports = {list, read, checkout};
