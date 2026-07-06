const models = require('../../models');
const db = require('../../data/db');
const errors = require('@tryghost/errors');
const tpl = require('@tryghost/tpl');

const messages = {
    propertyNotFound: 'published estate property not found.'
};

const controller = {
    docName: 'estateinquiries',

    add: {
        statusCode: 201,
        headers: {
            cacheInvalidate: false
        },
        permissions: true,
        async query(frame) {
            const data = frame.data.estateinquiries[0];

            // Collect requested property ids (explicit list, or the single property_id).
            const requestedIds = [...new Set(
                (Array.isArray(data.property_ids)
                    ? data.property_ids
                    : (data.property_id ? [data.property_id] : []))
                    .map(id => String(id || '').trim())
                    .filter(Boolean)
            )];
            // `property_ids` is not a column on estate_inquiries — enrich, then drop it.
            delete data.property_ids;

            // Resolve authoritative property info (never trust client-supplied
            // internal_inquiry_id / name / address). Published properties only.
            let inquiryProperties = [];
            if (requestedIds.length > 0) {
                const rows = await db.knex('estate_properties')
                    .whereIn('id', requestedIds)
                    .andWhere('status', 'published')
                    .select('id', 'internal_inquiry_id', 'building_name', 'address', 'prefecture', 'city', 'ward');

                if (rows.length === 0) {
                    throw new errors.NotFoundError({
                        message: tpl(messages.propertyNotFound)
                    });
                }

                inquiryProperties = rows.map(r => ({
                    property_id: r.id,
                    internal_inquiry_id: r.internal_inquiry_id || null,
                    property_name: r.building_name || null,
                    address: [r.prefecture, r.city, r.ward, r.address].filter(Boolean).join('') || r.address || null
                }));

                // estate_inquiries keeps a single property_id FK for backward compat —
                // set it to the first (primary) property. The full list is stored in
                // the estate_inquiry_properties join table below.
                data.property_id = inquiryProperties[0].property_id;
            }

            if (data.metadata && typeof data.metadata !== 'string') {
                data.metadata = JSON.stringify(data.metadata);
            }

            // Create the inquiry header and its property rows atomically.
            const runWithTransaction = async (fn) => {
                if (frame.options.transacting) {
                    return fn(frame.options.transacting);
                }
                return db.knex.transaction(fn);
            };

            const inquiryId = await runWithTransaction(async (trx) => {
                const opts = {...frame.options, transacting: trx};
                const inquiry = await models.EstateInquiry.add(data, opts);
                for (const property of inquiryProperties) {
                    await models.EstateInquiryProperty.add({
                        inquiry_id: inquiry.id,
                        property_id: property.property_id,
                        internal_inquiry_id: property.internal_inquiry_id,
                        property_name: property.property_name,
                        address: property.address
                    }, opts);
                }
                return inquiry.id;
            });

            return models.EstateInquiry.findOne(
                {id: inquiryId},
                {...frame.options, withRelated: ['inquiryProperties']}
            );
        }
    }
};

module.exports = controller;
