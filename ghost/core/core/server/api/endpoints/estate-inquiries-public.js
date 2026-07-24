const models = require('../../models');
const db = require('../../data/db');
const errors = require('@tryghost/errors');
const tpl = require('@tryghost/tpl');
const logging = require('@tryghost/logging');
const {GhostMailer} = require('../../services/mail');

const messages = {
    propertyNotFound: 'published estate property not found.',
    inquiryNotFound: 'estate inquiry not found.',
    emailRequired: 'email is required.',
    tooManyResends: 'too many confirmation resend attempts.'
};

// Customer-facing reference prefix by property type.
function referencePrefixForType(propertyType) {
    switch (String(propertyType || '').toLowerCase()) {
    case 'rent':
        return 'R';
    case 'sale':
        return 'S';
    case 'investment':
        return 'V';
    default:
        return 'I';
    }
}

// Generate a unique short reference code like `R-482913` (retry on collision).
async function generateReferenceCode(trx, prefix) {
    for (let attempt = 0; attempt < 12; attempt += 1) {
        const number = Math.floor(100000 + (Math.random() * 900000));
        const code = `${prefix}-${number}`;
        // eslint-disable-next-line no-await-in-loop
        const existing = await trx('estate_inquiries').where('reference_code', code).first('id');
        if (!existing) {
            return code;
        }
    }
    return `${prefix}-${Math.floor(100000 + (Math.random() * 900000))}`;
}

function escapeHtml(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function takeAgentUserId(data) {
    const agentUserId = String(data.agent_user_id || '').trim();
    delete data.agent_user_id;
    return agentUserId;
}

// Recipients: the explicitly selected valuation staff plus each property's
// primary staff (or all property staff when no primary exists). If neither path
// resolves, use the configured estate inbox. Only server-resolved addresses are
// accepted; the public request never supplies a recipient email.
async function collectStaffEmails(propertyIds, agentUserId) {
    const rows = propertyIds && propertyIds.length > 0
        ? await db.knex('estate_property_staff as s')
            .join('users as u', 's.user_id', 'u.id')
            .whereIn('s.property_id', propertyIds)
            .whereNotNull('u.email')
            .select('s.property_id', 's.is_primary', 'u.email')
        : [];

    const byProperty = new Map();
    for (const row of rows) {
        const list = byProperty.get(row.property_id) || [];
        list.push(row);
        byProperty.set(row.property_id, list);
    }

    const emails = new Map();
    for (const list of byProperty.values()) {
        const primaries = list.filter(row => row.is_primary);
        const chosen = primaries.length > 0 ? primaries : list;
        for (const row of chosen) {
            if (row.email) {
                emails.set(String(row.email).toLowerCase(), row.email);
            }
        }
    }

    const selectedUserId = String(agentUserId || '').trim();
    if (selectedUserId) {
        const selectedUser = await db.knex('users')
            .where({id: selectedUserId, status: 'active'})
            .whereNotNull('email')
            .first('email');
        if (selectedUser && selectedUser.email) {
            emails.set(String(selectedUser.email).toLowerCase(), selectedUser.email);
        } else {
            logging.warn(`estate inquiry: agent_user_id ${selectedUserId} did not resolve to an active user with an email; using the default inbox when configured.`);
        }
    }

    if (emails.size === 0) {
        const fallback = String(process.env.ESTATE_AGENT_INBOX || '').trim();
        if (fallback) {
            emails.set(fallback.toLowerCase(), fallback);
        }
    }
    return [...emails.values()];
}

function renderPropertyListHtml(inquiryProperties) {
    const items = inquiryProperties.map((property) => {
        const name = escapeHtml(property.property_name || property.property_id);
        const code = property.internal_inquiry_id ? `（${escapeHtml(property.internal_inquiry_id)}）` : '';
        const address = property.address ? ` - ${escapeHtml(property.address)}` : '';
        return `<li>${name}${code}${address}</li>`;
    }).join('');
    return items ? `<ul>${items}</ul>` : '';
}

// Persist the notification outcome onto the inquiry metadata (admin-visible).
async function recordNotificationStatus(inquiryId, status) {
    try {
        const row = await db.knex('estate_inquiries').where('id', inquiryId).first('metadata');
        let metadata = {};
        if (row && row.metadata) {
            try {
                metadata = JSON.parse(row.metadata);
            } catch (err) {
                metadata = {};
            }
        }
        if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
            metadata = {};
        }
        metadata.notifications = status;
        await db.knex('estate_inquiries').where('id', inquiryId).update({metadata: JSON.stringify(metadata)});
    } catch (err) {
        logging.error(err);
    }
}

// Customer confirmation email (also reused by the resend action). Never throws.
async function sendCustomerConfirmationEmail(mailer, inquiry, inquiryProperties) {
    const reference = inquiry.reference_code || '';
    const isValuation = inquiry.inquiry_type === 'valuation';
    const subject = isValuation
        ? `査定依頼を受け付けました（${reference}）`
        : `お問い合わせを受け付けました（${reference}）`;
    const propertySection = inquiryProperties.length > 0
        ? `<p><strong>対象物件:</strong></p>${renderPropertyListHtml(inquiryProperties)}`
        : '';
    try {
        await mailer.send({
            to: inquiry.email,
            subject,
            html: `
                <p>${escapeHtml(inquiry.name || '')} 様</p>
                <p>${isValuation ? 'この度は査定をご依頼いただきありがとうございます。以下の内容で受け付けました。' : 'この度はお問い合わせいただきありがとうございます。以下の内容で受け付けました。'}</p>
                <p><strong>受付番号:</strong> ${escapeHtml(reference)}</p>
                ${propertySection}
                <p>${isValuation ? '査定担当者' : '担当者'}より折り返しご連絡いたします。</p>
            `
        });
        return {ok: true, to: inquiry.email};
    } catch (err) {
        logging.error(err);
        return {ok: false, to: inquiry.email, error: err.message};
    }
}

// Notify the property staff and confirm to the customer. Best-effort: never throws,
// each email is independent (one failure never blocks the other), and the outcome
// is logged + recorded on the inquiry so failures (incl. the customer email) are visible.
async function sendInquiryNotifications({inquiryId, inquiry, inquiryProperties, propertyIds, agentUserId}) {
    const mailer = new GhostMailer();
    const reference = inquiry.reference_code || '';
    const propertyListHtml = renderPropertyListHtml(inquiryProperties);
    const messageHtml = escapeHtml(inquiry.message || '').replace(/\n/g, '<br/>');
    const isValuation = inquiry.inquiry_type === 'valuation';
    const propertySection = inquiryProperties.length > 0
        ? `<p><strong>対象物件:</strong></p>${propertyListHtml}`
        : '';
    const status = {staff: null, customer: null};

    try {
        const staffEmails = await collectStaffEmails(propertyIds, agentUserId);
        if (staffEmails.length > 0) {
            await mailer.send({
                to: staffEmails.join(', '),
                replyTo: inquiry.email || undefined,
                subject: `【${isValuation ? '査定依頼' : '物件お問い合わせ'}】${reference} ${inquiry.name || ''}`,
                html: `
                    <p>${isValuation ? '所有物件の査定依頼を受け付けました。' : '物件のお問い合わせを受け付けました。'}</p>
                    <p><strong>受付番号:</strong> ${escapeHtml(reference)}</p>
                    <p><strong>お客様:</strong> ${escapeHtml(inquiry.name)}<br/>
                       Email: ${escapeHtml(inquiry.email)}<br/>
                       電話: ${escapeHtml(inquiry.phone || '-')}</p>
                    ${propertySection}
                    <p><strong>メッセージ:</strong><br/>${messageHtml}</p>
                `
            });
            status.staff = {ok: true, recipients: staffEmails.length};
        } else {
            status.staff = {ok: true, recipients: 0, note: 'no staff assigned'};
        }
    } catch (err) {
        logging.error(err);
        status.staff = {ok: false, error: err.message};
    }

    if (inquiry.email) {
        status.customer = await sendCustomerConfirmationEmail(mailer, inquiry, inquiryProperties);
    }

    await recordNotificationStatus(inquiryId, status);
    return status;
}

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

            // `agent_user_id` selects a server-side staff recipient and is not a
            // column on estate_inquiries, so remove it before persisting the model.
            const agentUserId = takeAgentUserId(data);

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
            let referencePrefix = 'I';
            if (requestedIds.length > 0) {
                const rows = await db.knex('estate_properties')
                    .whereIn('id', requestedIds)
                    .andWhere('status', 'published')
                    .select('id', 'property_type', 'internal_inquiry_id', 'building_name', 'address', 'prefecture', 'city', 'ward');

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

                // Reference prefix comes from the first requested (primary) property.
                const firstProperty = rows.find(r => r.id === requestedIds[0]) || rows[0];
                referencePrefix = referencePrefixForType(firstProperty && firstProperty.property_type);

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
                if (!data.reference_code) {
                    data.reference_code = await generateReferenceCode(trx, referencePrefix);
                }
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

            // Notify staff + confirm to the customer. Awaited so the response carries
            // the outcome (a failed customer email is recorded on metadata and returned,
            // letting the UI prompt the customer to correct the address and resend). A
            // mail failure never throws — the inquiry is already committed.
            await sendInquiryNotifications({inquiryId, inquiry: data, inquiryProperties, propertyIds: requestedIds, agentUserId})
                .catch(err => logging.error(err));

            return models.EstateInquiry.findOne(
                {id: inquiryId},
                {...frame.options, withRelated: ['inquiryProperties']}
            );
        }
    },

    // Resend ONLY the customer confirmation for an existing inquiry (e.g. the
    // customer mistyped their email). Staff are NOT re-notified and nothing is
    // re-saved. Capped to prevent confirmation-email abuse.
    resendConfirmation: {
        headers: {
            cacheInvalidate: false
        },
        options: [],
        data: ['id'],
        permissions: true,
        async query(frame) {
            const id = frame.data.id;
            const body = (frame.data.estateinquiries && frame.data.estateinquiries[0]) || {};
            const newEmail = String(body.email || '').trim();

            const row = await db.knex('estate_inquiries')
                .where('id', id)
                .first('id', 'name', 'email', 'reference_code', 'metadata');
            if (!row) {
                throw new errors.NotFoundError({
                    message: tpl(messages.inquiryNotFound)
                });
            }

            let metadata = {};
            try {
                metadata = row.metadata ? JSON.parse(row.metadata) : {};
            } catch (err) {
                metadata = {};
            }
            if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
                metadata = {};
            }

            const resendCount = Number(metadata.confirmationResendCount || 0);
            if (resendCount >= 5) {
                throw new errors.TooManyRequestsError({
                    message: tpl(messages.tooManyResends)
                });
            }

            const email = newEmail || row.email;
            if (!email) {
                throw new errors.ValidationError({
                    message: tpl(messages.emailRequired)
                });
            }
            // Persist the corrected email so future contact uses it.
            if (newEmail && newEmail !== row.email) {
                await db.knex('estate_inquiries').where('id', id).update({email: newEmail});
            }

            const properties = await db.knex('estate_inquiry_properties')
                .where('inquiry_id', id)
                .select('property_id', 'internal_inquiry_id', 'property_name', 'address');

            const mailer = new GhostMailer();
            const customer = await sendCustomerConfirmationEmail(
                mailer,
                {name: row.name, email, reference_code: row.reference_code},
                properties
            );

            metadata.confirmationResendCount = resendCount + 1;
            metadata.notifications = {...(metadata.notifications || {}), customer};
            await db.knex('estate_inquiries').where('id', id).update({metadata: JSON.stringify(metadata)});

            return models.EstateInquiry.findOne(
                {id},
                {...frame.options, withRelated: ['inquiryProperties']}
            );
        }
    }
};

module.exports = controller;
