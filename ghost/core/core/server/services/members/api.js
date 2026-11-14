const stripeService = require('../stripe');
const settingsCache = require('../../../shared/settings-cache');
const settingsHelpers = require('../../services/settings-helpers');
const MembersApi = require('@tryghost/members-api');
const logging = require('@tryghost/logging');
const mail = require('../mail');
const models = require('../../models');
const signinEmail = require('./emails/signin');
const signupEmail = require('./emails/signup');
const signupPaidEmail = require('./emails/signup-paid');
const subscribeEmail = require('./emails/subscribe');
const updateEmail = require('./emails/update-email');
const SingleUseTokenProvider = require('./SingleUseTokenProvider');
const urlUtils = require('../../../shared/url-utils');
const labsService = require('../../../shared/labs');
const offersService = require('../offers');
const tiersService = require('../tiers');
const newslettersService = require('../newsletters');
const memberAttributionService = require('../member-attribution');
const emailSuppressionList = require('../email-suppression-list');
const CaptchaService = require('./CaptchaService');
const {t} = require('../i18n');
const sentry = require('../../../shared/sentry');
const sharedConfig = require('../../../shared/config');
const {getMembersFrontendUrl} = require('./frontend-url');

const MAGIC_LINK_TOKEN_VALIDITY = 24 * 60 * 60 * 1000;
const MAGIC_LINK_TOKEN_VALIDITY_AFTER_USAGE = 10 * 60 * 1000;
const MAGIC_LINK_TOKEN_MAX_USAGE_COUNT = 3;

const ghostMailer = new mail.GhostMailer();

module.exports = createApiInstance;

function trimLeadingWhitespace(strings, ...values) {
    // Interweave the strings with the
    // substitution vars first.
    let output = '';
    for (let i = 0; i < values.length; i++) {
        output += strings[i] + values[i];
    }
    output += strings[values.length];

    // Split on newlines.
    const lines = output.split(/(?:\r\n|\n|\r)/);

    // Rip out the leading whitespace on each line.
    return lines.map((line) => {
        return line.trimStart();
    }).join('\n').trim();
}

/**
 * 6 桁のコード（OTC）をメールに足す（jibunsee-react docs/planning/staff-password-reset-code.md §8）。
 * 件名の頭に 6 桁（携帯の通知だけで読める）。本文は今のリンクの説明の前に 6 桁の欄を入れる。
 */
function otcSubject(type, otc, siteTitle) {
    const vars = {code: otc, siteTitle, interpolation: {escapeValue: false}};
    return type === 'signin'
        ? t('{{code}} is your verification code to sign in to {{siteTitle}}', vars)
        : t('{{code}} is your verification code to sign up for {{siteTitle}}', vars);
}

function otcText(otc) {
    return `${t('Your verification code: {{code}}', {code: otc, interpolation: {escapeValue: false}})}\n${t('Enter this verification code on the screen you have open within 10 minutes, or use the link below.')}`;
}

function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, ch => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;'}[ch]));
}

function addOtcToHtml(html, otc) {
    const block = `<p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 16px; color: #3A464C; margin: 0 0 8px;">${escapeHtml(t('Enter this verification code on the screen you have open within 10 minutes, or use the link below.'))}</p>`
        + `<p data-otc style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 32px; font-weight: 700; letter-spacing: 6px; color: #15212A; margin: 0 0 16px;">${escapeHtml(otc)}</p>`;
    // 今の「リンクは 24 時間で切れます」の段落の前に入れる。見つからなければ本文の頭（<body> の後）に
    const marker = t('For your security, the link will expire in 24 hours time.');
    const at = html.indexOf(marker);
    const pStart = at >= 0 ? html.lastIndexOf('<p', at) : -1;
    if (pStart >= 0) {
        return html.slice(0, pStart) + block + html.slice(pStart);
    }
    const body = html.indexOf('>', html.indexOf('<body')) + 1;
    return body > 0 ? html.slice(0, body) + block + html.slice(body) : block + html;
}

function getTextWithoutOTC(url, type, email) {
    const siteTitle = settingsCache.get('title');
    switch (type) {
    case 'subscribe':
        return trimLeadingWhitespace`
                ${t(`Hey there,`)}

                ${t('You\'re one tap away from subscribing to {{siteTitle}} — please confirm your email address with this link:', {siteTitle, interpolation: {escapeValue: false}})}

                ${url}

                ${t('For your security, the link will expire in 24 hours time.')}

                ${t('All the best!')}

                ---

                ${t('Sent to {{email}}', {email})}
                ${t('If you did not make this request, you can simply delete this message.')} ${t('You will not be subscribed.')}
                `;
    case 'signup':
        return trimLeadingWhitespace`
                ${t(`Hey there,`)}

                ${t('Tap the link below to complete the signup process for {{siteTitle}}, and be automatically signed in:', {siteTitle, interpolation: {escapeValue: false}})}

                ${url}

                ${t('For your security, the link will expire in 24 hours time.')}

                ${t('See you soon!')}

                ---

                ${t('Sent to {{email}}', {email})}
                ${t('If you did not make this request, you can simply delete this message.')} ${t('You will not be signed up, and no account will be created for you.')}
                `;
    case 'signup-paid':
        return trimLeadingWhitespace`
                ${t(`Hey there,`)}

                ${t('Thank you for subscribing to {{siteTitle}}. Tap the link below to be automatically signed in:', {siteTitle, interpolation: {escapeValue: false}})}

                ${url}

                ${t('For your security, the link will expire in 24 hours time.')}

                ${t('See you soon!')}

                ---

                ${t('Sent to {{email}}', {email})}
                ${t('Thank you for subscribing to {{siteTitle}}!', {siteTitle, interpolation: {escapeValue: false}})}
                `;
    case 'updateEmail':
        return trimLeadingWhitespace`
                ${t(`Hey there,`)}

                ${t('Please confirm your email address with this link:')}

                ${url}

                ${t('For your security, the link will expire in 24 hours time.')}

                ---

                ${t('Sent to {{email}}', {email})}
                ${t('If you did not make this request, you can simply delete this message.')} ${t('This email address will not be used.')}
                `;
    case 'signin':
    default:
        return trimLeadingWhitespace`
                ${t(`Hey there,`)}

                ${t('Welcome back! Use this link to securely sign in to your {{siteTitle}} account:', {siteTitle, interpolation: {escapeValue: false}})}

                ${url}

                ${t('For your security, the link will expire in 24 hours time.')}

                ${t('See you soon!')}

                ---

                ${t('Sent to {{email}}', {email})}
                ${t('If you did not make this request, you can safely ignore this email.')}
                `;
    }
}

function getHTMLWithoutOTC(url, type, email) {
    const siteTitle = settingsCache.get('title');
    const siteUrl = getMembersFrontendUrl(urlUtils);
    const domain = siteUrl.match(new RegExp('^https?://([^/:?#]+)(?:[/:?#]|$)', 'i'));
    const siteDomain = (domain && domain[1]);
    const accentColor = settingsCache.get('accent_color');
    switch (type) {
    case 'subscribe':
        return subscribeEmail({t, url, email, siteTitle, accentColor, siteDomain, siteUrl});
    case 'signup':
        return signupEmail({t, url, email, siteTitle, accentColor, siteDomain, siteUrl});
    case 'signup-paid':
        return signupPaidEmail({t, url, email, siteTitle, accentColor, siteDomain, siteUrl});
    case 'updateEmail':
        return updateEmail({t, url, email, siteTitle, accentColor, siteDomain, siteUrl});
    case 'signin':
    default:
        return signinEmail({t, url, email, siteTitle, accentColor, siteDomain, siteUrl});
    }
}

function createApiInstance(config) {
    const tokenProvider = new SingleUseTokenProvider({
        SingleUseTokenModel: models.SingleUseToken,
        validityPeriod: MAGIC_LINK_TOKEN_VALIDITY,
        validityPeriodAfterUsage: MAGIC_LINK_TOKEN_VALIDITY_AFTER_USAGE,
        maxUsageCount: MAGIC_LINK_TOKEN_MAX_USAGE_COUNT,
        getOTCSecret: () => settingsCache.get('members_email_auth_secret')
    });
    const membersApiInstance = MembersApi({
        tokenConfig: config.getTokenConfig(),
        auth: {
            getSigninURL: config.getSigninURL.bind(config),
            allowSelfSignup: config.getAllowSelfSignup.bind(config),
            tokenProvider
        },
        mail: {
            transporter: {
                sendMail(message) {
                    if (process.env.NODE_ENV !== 'production') {
                        logging.warn(message.text);
                    }
                    let msg = Object.assign({
                        from: config.getEmailSupportAddress(),
                        subject: 'Signin',
                        forceTextContent: true
                    }, message);

                    return ghostMailer.send(msg);
                }
            },
            getSubject(type, otc) {
                const siteTitle = settingsCache.get('title');
                if (otc) {
                    return otcSubject(type, otc, siteTitle);
                }
                switch (type) {
                case 'subscribe':
                    return `📫 ${t(`Confirm your subscription to {{siteTitle}}`, {siteTitle, interpolation: {escapeValue: false}})}`;
                case 'signup':
                    return `🙌 ${t(`Complete your sign up to {{siteTitle}}!`, {siteTitle, interpolation: {escapeValue: false}})}`;
                case 'signup-paid':
                    return `🙌 ${t(`Thank you for signing up to {{siteTitle}}!`, {siteTitle, interpolation: {escapeValue: false}})}`;
                case 'updateEmail':
                    return `📫 ${t(`Confirm your email update for {{siteTitle}}!`, {siteTitle, interpolation: {escapeValue: false}})}`;
                case 'signin':
                default:
                    return `🔑 ${t(`Secure sign in link for {{siteTitle}}`, {siteTitle, interpolation: {escapeValue: false}})}`;
                }
            },
            getText(url, type, email, otc) {
                const text = getTextWithoutOTC(url, type, email);
                return otc ? `${otcText(otc)}\n\n${text}` : text;
            },
            getHTML(url, type, email, otc) {
                const html = getHTMLWithoutOTC(url, type, email);
                return otc ? addOtcToHtml(html, otc) : html;
            }

        },
        models: {
            DonationPaymentEvent: models.DonationPaymentEvent,
            EmailRecipient: models.EmailRecipient,
            StripeCustomer: models.MemberStripeCustomer,
            StripeCustomerSubscription: models.StripeCustomerSubscription,
            Member: models.Member,
            MemberNewsletter: models.MemberNewsletter,
            MemberCancelEvent: models.MemberCancelEvent,
            MemberSubscribeEvent: models.MemberSubscribeEvent,
            MemberPaidSubscriptionEvent: models.MemberPaidSubscriptionEvent,
            MemberLoginEvent: models.MemberLoginEvent,
            MemberEmailChangeEvent: models.MemberEmailChangeEvent,
            MemberPaymentEvent: models.MemberPaymentEvent,
            MemberStatusEvent: models.MemberStatusEvent,
            MemberProductEvent: models.MemberProductEvent,
            MemberCreatedEvent: models.MemberCreatedEvent,
            SubscriptionCreatedEvent: models.SubscriptionCreatedEvent,
            MemberLinkClickEvent: models.MemberClickEvent,
            OfferRedemption: models.OfferRedemption,
            Offer: models.Offer,
            StripeProduct: models.StripeProduct,
            StripePrice: models.StripePrice,
            Product: models.Product,
            Settings: models.Settings,
            Comment: models.Comment,
            MemberFeedback: models.MemberFeedback,
            EmailSpamComplaintEvent: models.EmailSpamComplaintEvent
        },
        stripeAPIService: stripeService.api,
        tiersService: tiersService,
        offersAPI: offersService.api,
        labsService: labsService,
        newslettersService: newslettersService,
        memberAttributionService: memberAttributionService.service,
        emailSuppressionList,
        settingsCache,
        sentry,
        settingsHelpers,
        captchaService: new CaptchaService({
            enabled: labsService.isSet('captcha') && sharedConfig.get('captcha:enabled'),
            scoreThreshold: sharedConfig.get('captcha:scoreThreshold'),
            secretKey: sharedConfig.get('captcha:secretKey')
        })
    });

    // 6 桁のコードを確かめる口（middleware の verifyOTC）が使う
    membersApiInstance.tokenProvider = tokenProvider;

    return membersApiInstance;
}
