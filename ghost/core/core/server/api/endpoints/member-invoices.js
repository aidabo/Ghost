const errors = require('@tryghost/errors');
const logging = require('@tryghost/logging');
const models = require('../../models');
const membersService = require('../../services/members');
const stripeService = require('../../services/stripe');

async function formatInvoice(invoice) {
    const productNames = new Map();
    for (const line of invoice.lines?.data || []) {
        const productId = typeof line.price?.product === 'string' ? line.price.product : line.price?.product?.id;
        if (!productId || productNames.has(productId)) {
            continue;
        }
        try {
            const product = await stripeService.api.getProduct(productId);
            productNames.set(productId, product.name || null);
        } catch (error) {
            logging.warn(`[Members] invoice product lookup failed: product=${productId}`);
            productNames.set(productId, null);
        }
    }
    return {
        id: invoice.id,
        number: invoice.number || null,
        status: invoice.status || null,
        currency: String(invoice.currency || '').toUpperCase(),
        amount_due: invoice.amount_due,
        amount_paid: invoice.amount_paid,
        created: invoice.created,
        period_start: invoice.period_start || null,
        period_end: invoice.period_end || null,
        hosted_invoice_url: invoice.hosted_invoice_url || null,
        invoice_pdf: invoice.invoice_pdf || null,
        items: (invoice.lines?.data || []).map(line => ({
            description: line.description || null,
            quantity: line.quantity || 1,
            amount: line.amount,
            currency: String(line.currency || invoice.currency || '').toUpperCase(),
            period_start: line.period?.start || null,
            period_end: line.period?.end || null,
            price_name: line.price?.nickname || null,
            product_name: productNames.get(typeof line.price?.product === 'string' ? line.price.product : line.price?.product?.id) || null
        }))
    };
}

async function list(req, res) {
    try {
        const member = await membersService.ssr.getMemberDataFromSession(req, res);
        if (!member?.id) {
            throw new errors.NoPermissionError({message: 'Member session is required.'});
        }

        const customers = await models.Base.knex('members_stripe_customers')
            .where({member_id: member.id})
            .select('customer_id');
        logging.info(`[Members] invoice list customers: member=${member.id}, count=${customers.length}`);
        const invoices = [];
        const seen = new Set();
        for (const customer of customers) {
            const customerId = customer.customer_id;
            const result = await stripeService.api.listInvoices(customerId, {limit: 100});
            logging.info(`[Members] invoice list result: customer=${customerId}, count=${result.data?.length || 0}`);
            for (const invoice of result.data || []) {
                if (!seen.has(invoice.id)) {
                    seen.add(invoice.id);
                    invoices.push(await formatInvoice(invoice));
                }
            }
        }
        invoices.sort((left, right) => Number(right.created || 0) - Number(left.created || 0));
        res.json({invoices});
    } catch (error) {
        logging.error('[Members] invoice list failed', error);
        res.status(error.statusCode || 500).json({errors: [{message: error.message || 'Invoice request failed.'}]});
    }
}

module.exports = {list};
