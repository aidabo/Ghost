const debug = require('@tryghost/debug')('members');
const cors = require('cors');
const bodyParser = require('body-parser');
const express = require('../../../shared/express');
const sentry = require('../../../shared/sentry');
const membersService = require('../../services/members');
const stripeService = require('../../services/stripe');
const middleware = membersService.middleware;
const shared = require('../shared');
const labs = require('../../../shared/labs');
const errorHandler = require('@tryghost/mw-error-handler');
const memberGallery = require('../../api/endpoints/member-gallery');
const memberInvoices = require('../../api/endpoints/member-invoices');
const contentProducts = require('../../api/endpoints/content-products');
const memberPostSearch = require('../../api/endpoints/member-post-search');
const config = require('../../../shared/config');
const {http} = require('@tryghost/api-framework');
const api = require('../../api').endpoints;

const commentRouter = require('../comments');
const announcementRouter = require('../announcement');

/**
 * @returns {import('express').Application}
 */
module.exports = function setupMembersApp() {
    debug('Members App setup start');
    const membersApp = express('members');

    // Members API shouldn't be cached
    membersApp.use(shared.middleware.cacheControl('private'));

    // Support CORS for requests from the frontend
    membersApp.use(cors({maxAge: config.get('caching:cors:maxAge')}));

    // Currently global handling for signing in with ?token= magiclinks
    membersApp.use(middleware.createSessionFromMagicLink);

    // Routing

    // Webhooks
    membersApp.post('/webhooks/stripe', bodyParser.raw({type: 'application/json'}), stripeService.webhookController.handle.bind(stripeService.webhookController));

    // Initializes members specific routes as well as assigns members specific data to the req/res objects
    // We don't want to add global bodyParser middleware as that interferes with stripe webhook requests on - `/webhooks`.

    // Manage newsletter subscription via unsubscribe link - these should be authenticated by uuid and hashed key
    membersApp.get('/api/member/newsletters', 
        middleware.authMemberByUuid,
        middleware.getMemberNewsletters
    );
    membersApp.put('/api/member/newsletters',
        bodyParser.json({limit: '50mb'}),
        middleware.authMemberByUuid,
        middleware.updateMemberNewsletters
    );

    // Get and update member data
    // Caching members content is an experimental feature
    const shouldCacheMembersContent = config.get('cacheMembersContent:enabled');
    if (shouldCacheMembersContent) {
        membersApp.get('/api/member', middleware.loadMemberSession, middleware.accessInfoSession, middleware.getMemberData);
    } else {
        membersApp.get('/api/member', middleware.getMemberData);
    }
    
    membersApp.put('/api/member', bodyParser.json({limit: '50mb'}), middleware.updateMemberData);
    membersApp.post('/api/gallery/presign', bodyParser.json({limit: '1mb'}), memberGallery.presign);
    membersApp.post('/api/gallery/finalize', bodyParser.json({limit: '1mb'}), memberGallery.finalize);
    membersApp.get('/api/gallery', memberGallery.list);
    membersApp.delete('/api/gallery/:id', memberGallery.destroy);
    membersApp.get('/api/invoices', memberInvoices.list);
    membersApp.get('/api/content-products', contentProducts.list);
    membersApp.get('/api/content-products/:slug', contentProducts.read);
    membersApp.post('/api/content-products/:id/checkout', bodyParser.json({limit: '1mb'}), contentProducts.checkout);
    membersApp.post('/api/posts/search', bodyParser.json({limit: '1mb'}), memberPostSearch.search);
    membersApp.post('/api/member/email', bodyParser.json({limit: '50mb'}), (req, res, next) => membersService.api.middleware.updateEmailAddress(req, res, next));

    // Remove email from suppression list
    membersApp.delete('/api/member/suppression', middleware.deleteSuppression);

    // Manage session
    membersApp.get('/api/session', middleware.getIdentityToken);
    membersApp.delete('/api/session', bodyParser.json({limit: '5mb'}), middleware.deleteSession);

    membersApp.get('/api/integrity-token', middleware.createIntegrityToken);

    // NOTE: this is wrapped in a function to ensure we always go via the getter
    membersApp.post(
        '/api/send-magic-link',
        bodyParser.json(),
        middleware.verifyIntegrityToken,
        // Prevent brute forcing email addresses (user enumeration)
        shared.middleware.brute.membersAuthEnumeration,
        // Prevent brute forcing passwords for the same email address
        shared.middleware.brute.membersAuth,
        function lazySendMagicLinkMw(req, res, next) {
            return membersService.api.middleware.sendMagicLink(req, res, next);
        }
    );
    membersApp.post('/api/create-stripe-checkout-session', function lazyCreateCheckoutSessionMw(req, res, next) {
        return membersService.api.middleware.createCheckoutSession(req, res, next);
    });
    membersApp.post('/api/create-stripe-update-session', function lazyCreateCheckoutSetupSessionMw(req, res, next) {
        return membersService.api.middleware.createCheckoutSetupSession(req, res, next);
    });
    membersApp.put('/api/subscriptions/:id', function lazyUpdateSubscriptionMw(req, res, next) {
        return membersService.api.middleware.updateSubscription(req, res, next);
    });

    // Comments
    membersApp.use('/api/comments', commentRouter());

    // Feedback
    membersApp.post(
        '/api/feedback',
        labs.enabledMiddleware('audienceFeedback'),
        bodyParser.json({limit: '50mb'}),
        middleware.loadMemberSession,
        middleware.authMemberByUuid,
        http(api.feedbackMembers.add)
    );

    // Announcement
    membersApp.use(
        '/api/announcement',
        labs.enabledMiddleware('announcementBar'),
        middleware.loadMemberSession,
        announcementRouter()
    );

    // Recommendations
    membersApp.post(
        '/api/recommendations/:id/clicked',
        middleware.loadMemberSession,
        http(api.recommendationsPublic.trackClicked)
    );

    // Recommendations
    membersApp.post(
        '/api/recommendations/:id/subscribed',
        middleware.loadMemberSession,
        http(api.recommendationsPublic.trackSubscribed)
    );

    // Allow external systems to read public settings via the members api
    // Without CORS issues and without a required integration token
    // 1. Detect if a site is Running Ghost
    // 2. For recommendations to know when we can offer 'one-click-subscribe' to know if members are enabled
    // Why not content API? Domain can be different from recommended domain + CORS issues
    membersApp.get('/api/site', http(api.site.read));

    // API error handling
    membersApp.use('/api', errorHandler.resourceNotFound);
    membersApp.use('/api', errorHandler.handleJSONResponse(sentry));

    // Webhook error handling
    membersApp.use('/webhooks', errorHandler.resourceNotFound);
    membersApp.use('/webhooks', errorHandler.handleJSONResponse(sentry));

    debug('Members App setup end');

    return membersApp;
};
