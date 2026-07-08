const models = require('../../models');
const errors = require('@tryghost/errors');
const tpl = require('@tryghost/tpl');
const logging = require('@tryghost/logging');
const {GhostMailer} = require('../../services/mail');

const messages = {
    recipientRequired: 'no agent recipient configured for this contact form.',
    fieldRequired: 'required contact fields are missing.',
    consentRequired: 'privacy-policy consent is required.',
    mailFailed: 'failed to send the message to the agent.'
};

function escapeHtml(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// Resolve the recipient (担当者) server-side from an opaque identifier.
//
// The visitor's browser only ever sends `agent_user_id` — an opaque Ghost user id
// chosen by the page author from the AgentCard staff pulldown. The email is looked
// up here from the users table and is NEVER accepted from the request body, so a
// forged/tampered request can never turn this endpoint into an open mail relay: an
// unknown id simply resolves to nothing, and an existing id can only ever map to a
// real staff member's address. When no (valid) id is supplied we fall back to the
// ESTATE_AGENT_INBOX env default. Returns {email, name} or {email: '', name: ''}.
async function resolveRecipient(data) {
    const agentUserId = String(data.agent_user_id || '').trim();
    if (agentUserId) {
        try {
            const user = await models.User.findOne(
                {id: agentUserId, status: 'active'}
            );
            const email = user && user.get('email');
            if (email) {
                return {email: String(email).trim(), name: String(user.get('name') || '').trim()};
            }
            logging.warn(`estate agent-contact: agent_user_id ${agentUserId} did not resolve to an active user with an email; using the default inbox.`);
        } catch (err) {
            logging.error(err);
        }
    }
    const fallback = String(process.env.ESTATE_AGENT_INBOX || '').trim();
    return {email: fallback, name: ''};
}

const controller = {
    docName: 'estateagentcontact',

    add: {
        statusCode: 201,
        headers: {
            cacheInvalidate: false
        },
        permissions: true,
        async query(frame) {
            const data = (frame.data.estateagentcontact && frame.data.estateagentcontact[0]) || {};

            const name = String(data.name || '').trim();
            const nameKana = String(data.name_kana || '').trim();
            const email = String(data.email || '').trim();
            const phone = String(data.phone || '').trim();
            const message = String(data.message || '').trim();
            const company = String(data.company || '').trim();
            const companyKana = String(data.company_kana || '').trim();
            const consent = data.consent === true || data.consent === 'true';

            if (!name || !nameKana || !email || !phone || !message) {
                throw new errors.ValidationError({message: tpl(messages.fieldRequired)});
            }
            if (!consent) {
                throw new errors.ValidationError({message: tpl(messages.consentRequired)});
            }

            const recipient = await resolveRecipient(data);
            if (!recipient.email) {
                throw new errors.ValidationError({message: tpl(messages.recipientRequired)});
            }
            // Prefer the resolved staff member's real name for display; fall back to
            // the client-supplied label only when the id did not resolve.
            const agentName = recipient.name || String(data.agent_name || '').trim();

            const messageHtml = escapeHtml(message).replace(/\n/g, '<br/>');
            const companyLine = company
                ? `<p><strong>会社名:</strong> ${escapeHtml(company)}${companyKana ? `（${escapeHtml(companyKana)}）` : ''}</p>`
                : '';

            const mailer = new GhostMailer();

            // Agent notification (critical path). replyTo the visitor so the agent can
            // answer directly. If this fails we surface the error to the client — there
            // is no DB fallback for a direct agent contact.
            try {
                await mailer.send({
                    to: recipient.email,
                    replyTo: email,
                    subject: `【担当者へのお問い合わせ】${agentName ? `${agentName} 宛 ` : ''}${name}`,
                    html: `
                        <p>担当者へのお問い合わせを受け付けました。</p>
                        ${agentName ? `<p><strong>担当者:</strong> ${escapeHtml(agentName)}</p>` : ''}
                        <p><strong>お名前:</strong> ${escapeHtml(name)}（${escapeHtml(nameKana)}）</p>
                        ${companyLine}
                        <p><strong>Email:</strong> ${escapeHtml(email)}<br/>
                           <strong>電話:</strong> ${escapeHtml(phone)}</p>
                        <p><strong>お問い合わせ内容:</strong><br/>${messageHtml}</p>
                    `
                });
            } catch (err) {
                logging.error(err);
                throw new errors.EmailError({
                    message: tpl(messages.mailFailed),
                    err,
                    statusCode: 502
                });
            }

            // Visitor confirmation (best-effort — never blocks a successful agent send).
            let customerOk = false;
            try {
                await mailer.send({
                    to: email,
                    subject: 'お問い合わせを受け付けました',
                    html: `
                        <p>${escapeHtml(name)} 様</p>
                        <p>この度はお問い合わせいただきありがとうございます。以下の内容で受け付けました。担当者より折り返しご連絡いたします。</p>
                        ${agentName ? `<p><strong>担当者:</strong> ${escapeHtml(agentName)}</p>` : ''}
                        <p><strong>お問い合わせ内容:</strong><br/>${messageHtml}</p>
                    `
                });
                customerOk = true;
            } catch (err) {
                logging.error(err);
            }

            return {
                sent: true,
                agent_notified: true,
                customer_notified: customerOk
            };
        }
    }
};

module.exports = controller;
