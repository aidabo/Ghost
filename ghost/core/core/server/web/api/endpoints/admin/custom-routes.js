const api = require('../../../../api').endpoints;
const {http} = require('@tryghost/api-framework');
const mw = require('./middleware');

/**
 * @returns {import('express').Router}
 */
module.exports = function customApiRoutes(router) {
    // bookmarks
    router.get('/social/bookmarks', mw.authAdminApi, http(api.socialBookmarks.browse));
    router.get('/social/bookmarks/:id', mw.authAdminApi, http(api.socialBookmarks.read));
    router.post('/social/bookmarks', mw.authAdminApi, http(api.socialBookmarks.add));
    router.del('/social/bookmarks/:id', mw.authAdminApi, http(api.socialBookmarks.destroy));

    // forwards
    router.get('/social/forwards', mw.authAdminApi, http(api.socialForwards.browse));
    router.get('/social/forwards/:id', mw.authAdminApi, http(api.socialForwards.read));
    router.post('/social/forwards', mw.authAdminApi, http(api.socialForwards.add));
    router.del('/social/forwards/:id', mw.authAdminApi, http(api.socialForwards.destroy));

    //follows
    router.get('/social/follows', mw.authAdminApi, http(api.socialFollows.browse));
    router.get('/social/follows/:id', mw.authAdminApi, http(api.socialFollows.read));
    router.post('/social/follows', mw.authAdminApi, http(api.socialFollows.add));
    router.del('/social/follows/:id', mw.authAdminApi, http(api.socialFollows.destroy));

    //favors
    router.get('/social/favors', mw.authAdminApi, http(api.socialFavors.browse));
    router.get('/social/favors/:id', mw.authAdminApi, http(api.socialFavors.read));
    router.post('/social/favors', mw.authAdminApi, http(api.socialFavors.add));
    router.del('/social/favors/:id', mw.authAdminApi, http(api.socialFavors.destroy));

    //social groups
    router.get('/social/groups', mw.authAdminApi, http(api.socialGroups.browse));
    router.get('/social/groups/:id', mw.authAdminApi, http(api.socialGroups.read));
    router.get('/social/groups_count', mw.authAdminApi, http(api.socialGroups.count));
    router.post('/social/groups', mw.authAdminApi, http(api.socialGroups.add));
    router.put('/social/groups/:id', mw.authAdminApi, http(api.socialGroups.edit));
    router.del('/social/groups/:id', mw.authAdminApi, http(api.socialGroups.destroy));

    //social group members
    router.get('/social/members', mw.authAdminApi, http(api.socialGroupMembers.browse));
    router.get('/social/members/:id', mw.authAdminApi, http(api.socialGroupMembers.read));
    router.post('/social/members', mw.authAdminApi, http(api.socialGroupMembers.add));
    router.put('/social/members/:id', mw.authAdminApi, http(api.socialGroupMembers.edit));
    router.del('/social/members/:id', mw.authAdminApi, http(api.socialGroupMembers.destroy));
    
    // ## Tags
    router.get('/tags/all/count', mw.authAdminApi, http(api.tags.count));

    // ## social comments
    router.get('/social/comments/post/:post_id', mw.authAdminApi, http(api.socialComments.browse));
    router.get('/social/comments/:id/replies/', mw.authAdminApi, http(api.socialComments.replies));    
    router.get('/social/comments/counts/:ids', mw.authAdminApi, http(api.socialComments.counts));

    router.post('/social/comments/post', mw.authAdminApi, http(api.socialComments.add));
    router.get('/social/comments/:id', mw.authAdminApi, http(api.socialComments.read));    
    router.put('/social/comments/:id', mw.authAdminApi, http(api.socialComments.edit));
    
    router.post('/social/comments/:id/like', mw.authAdminApi, http(api.socialComments.like));
    router.post('/social/comments/:id/unlike', mw.authAdminApi, http(api.socialComments.unlike));
    router.post('/social/comments/:id/report/', mw.authAdminApi, http(api.socialComments.report));

    // ## for Admin user
    router.get('/social/comments/status/:post_id', mw.authAdminApi, http(api.socialCommentReports.browse));
    router.put('/social/comments/:id/status', mw.authAdminApi, http(api.socialCommentReports.edit));
    router.get('/social/comments/:id/new-replies', mw.authAdminApi, http(api.socialCommentReplies.browse));

    return router;
};
