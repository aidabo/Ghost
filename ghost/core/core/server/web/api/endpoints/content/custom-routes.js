const api = require('../../../../api').endpoints;
const {http} = require('@tryghost/api-framework');
const mw = require('./middleware');

/**
 * @returns {import('express').Router}
 */
module.exports = function customApiRoutes(router) {
    router.get('/social/comments/post/:post_id', mw.authenticatePublic, http(api.socialCommentsPublic.browse));
    router.get('/social/comments/:id/replies/', mw.authenticatePublic, http(api.socialCommentsPublic.replies));    
    router.get('/social/comments/:id', mw.authenticatePublic, http(api.socialCommentsPublic.read));    
    router.get('/social/comments/counts/:ids', mw.authenticatePublic, http(api.socialCommentsPublic.counts));

    router.get('/social/components', mw.authenticatePublic, http(api.socialComponentsPublic.browse));
    router.get('/social/components/:id', mw.authenticatePublic, http(api.socialComponentsPublic.read));

    router.get('/social/charts', mw.authenticatePublic, http(api.socialChartsPublic.browse));
    router.get('/social/charts/:id', mw.authenticatePublic, http(api.socialChartsPublic.read));

    router.get('/social/projects', mw.authenticatePublic, http(api.socialAiProjectsPublic.browse));
    router.get('/social/projects/:id/gallery', mw.authenticatePublic, http(api.socialAiProjectsPublic.gallery));

    // ## post search index (public: published + public)
    // NOTE: mounted under /search/* — NOT /posts/* — because the core `/posts/:id`
    // route above is registered before customApi() and would otherwise capture
    // `/posts/search-index` as id="search-index" (422 on the 24-hex id validator).
    router.get('/search/posts', mw.authenticatePublic, http(api.postsSearchIndexPublic.search));
    router.get('/post-media', mw.authenticatePublic, http(api.postMediaPublic.browse));

    // ## estate content routes
    router.get('/estate/properties', mw.authenticatePublic, http(api.estatePropertiesPublic.browse));
    router.get('/estate/properties/search', mw.authenticatePublic, http(api.estatePropertiesPublic.search));
    router.get('/estate/properties/:id', mw.authenticatePublic, http(api.estatePropertiesPublic.read));
    router.get('/social/ai/dzi/jobs', mw.authenticatePublic, http(api.socialAiDziPublic.browse));
    router.get('/social/ai/dzi/jobs/:id', mw.authenticatePublic, http(api.socialAiDziPublic.read));
    router.post('/estate/inquiries', mw.authenticatePublic, http(api.estateInquiriesPublic.add));
    router.post('/estate/inquiries/:id/resend-confirmation', mw.authenticatePublic, http(api.estateInquiriesPublic.resendConfirmation));
    router.post('/estate/agent-contact', mw.authenticatePublic, http(api.estateAgentContactPublic.add));

    // ## publish content routes
    router.get('/publish/content', mw.authenticatePublic, http(api.publishContentPublic.browse));
    router.get('/publish/content/:id', mw.authenticatePublic, http(api.publishContentPublic.read));

    return router;
};
