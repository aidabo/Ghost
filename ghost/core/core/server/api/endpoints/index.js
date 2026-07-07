const apiFramework = require('@tryghost/api-framework');
const localUtils = require('./utils');

// ESLint Override Notice
// This is a valid index.js file - it just exports a lot of stuff!
// Long term we would like to change the API architecture to reduce this file,
// but that's not the problem the index.js max - line eslint "proxy" rule is there to solve.
/* eslint-disable max-lines */

module.exports = {
    get authentication() {
        return apiFramework.pipeline(require('./authentication'), localUtils);
    },

    get db() {
        return apiFramework.pipeline(require('./db'), localUtils);
    },

    get identities() {
        return apiFramework.pipeline(require('./identities'), localUtils);
    },

    get integrations() {
        return apiFramework.pipeline(require('./integrations'), localUtils);
    },

    // @TODO: transform
    get session() {
        return require('./session');
    },

    get schedules() {
        return apiFramework.pipeline(require('./schedules'), localUtils);
    },

    get pages() {
        return apiFramework.pipeline(require('./pages'), localUtils);
    },

    get redirects() {
        return apiFramework.pipeline(require('./redirects'), localUtils);
    },

    get roles() {
        return apiFramework.pipeline(require('./roles'), localUtils);
    },

    get slugs() {
        return apiFramework.pipeline(require('./slugs'), localUtils);
    },

    get webhooks() {
        return apiFramework.pipeline(require('./webhooks'), localUtils);
    },

    get posts() {
        return apiFramework.pipeline(require('./posts'), localUtils);
    },

    get mentions() {
        return apiFramework.pipeline(require('./mentions'), localUtils);
    },

    get invites() {
        return apiFramework.pipeline(require('./invites'), localUtils);
    },

    get mail() {
        return apiFramework.pipeline(require('./mail'), localUtils);
    },

    get notifications() {
        return apiFramework.pipeline(require('./notifications'), localUtils);
    },

    get settings() {
        return apiFramework.pipeline(require('./settings'), localUtils);
    },

    get announcements() {
        return apiFramework.pipeline(require('./announcements'), localUtils);
    },

    get membersStripeConnect() {
        return apiFramework.pipeline(require('./members-stripe-connect'), localUtils);
    },

    get members() {
        return apiFramework.pipeline(require('./members'), localUtils);
    },

    get offers() {
        return apiFramework.pipeline(require('./offers'), localUtils);
    },

    get tiers() {
        return apiFramework.pipeline(require('./tiers'), localUtils);
    },

    get memberSigninUrls() {
        return apiFramework.pipeline(require('./member-signin-urls.js'), localUtils);
    },

    get labels() {
        return apiFramework.pipeline(require('./labels'), localUtils);
    },

    get images() {
        return apiFramework.pipeline(require('./images'), localUtils);
    },

    get media() {
        return apiFramework.pipeline(require('./media'), localUtils);
    },

    get files() {
        return apiFramework.pipeline(require('./files'), localUtils);
    },

    get tags() {
        return apiFramework.pipeline(require('./tags'), localUtils);
    },

    get users() {
        return apiFramework.pipeline(require('./users'), localUtils);
    },

    get previews() {
        return apiFramework.pipeline(require('./previews'), localUtils);
    },

    get emailPost() {
        return apiFramework.pipeline(require('./email-post'), localUtils);
    },

    get oembed() {
        return apiFramework.pipeline(require('./oembed'), localUtils);
    },

    get slack() {
        return apiFramework.pipeline(require('./slack'), localUtils);
    },

    get config() {
        return apiFramework.pipeline(require('./config'), localUtils);
    },

    get explore() {
        return apiFramework.pipeline(require('./explore'), localUtils);
    },

    get themes() {
        return apiFramework.pipeline(require('./themes'), localUtils);
    },

    get actions() {
        return apiFramework.pipeline(require('./actions'), localUtils);
    },

    get email_previews() {
        return apiFramework.pipeline(require('./email-previews'), localUtils);
    },

    get emails() {
        return apiFramework.pipeline(require('./emails'), localUtils);
    },

    get site() {
        return apiFramework.pipeline(require('./site'), localUtils);
    },

    get snippets() {
        return apiFramework.pipeline(require('./snippets'), localUtils);
    },

    get stats() {
        return apiFramework.pipeline(require('./stats'), localUtils);
    },

    get customThemeSettings() {
        return apiFramework.pipeline(require('./custom-theme-settings'), localUtils);
    },

    get serializers() {
        return require('./utils/serializers');
    },

    get newsletters() {
        return apiFramework.pipeline(require('./newsletters'), localUtils);
    },

    get comments() {
        return apiFramework.pipeline(require('./comments'), localUtils);
    },

    get commentReplies() {
        return apiFramework.pipeline(require('./comment-replies'), localUtils);
    },

    get links() {
        return apiFramework.pipeline(require('./links'), localUtils);
    },

    get mailEvents() {
        return apiFramework.pipeline(require('./mail-events'), localUtils);
    },

    get recommendations() {
        return apiFramework.pipeline(require('./recommendations'), localUtils);
    },

    get incomingRecommendations() {
        return apiFramework.pipeline(require('./incoming-recommendations'), localUtils);
    },

    //custom begin
    get socialBookmarks() {
        return apiFramework.pipeline(require('./social-bookmarks'), localUtils);
    },

    get socialForwards() {
        return apiFramework.pipeline(require('./social-forwards'), localUtils);
    },

    get socialFollows() {
        return apiFramework.pipeline(require('./social-follows'), localUtils);
    },

    get socialFavors() {
        return apiFramework.pipeline(require('./social-favors'), localUtils);
    },

    get socialGroups() {
        return apiFramework.pipeline(require('./social-groups'), localUtils);
    },

    get socialGroupMembers() {
        return apiFramework.pipeline(require('./social-group-members'), localUtils);
    },

    get socialComments() {
        return apiFramework.pipeline(require('./social-post-comments'), localUtils);
    },

    get socialCommentReplies() {
        return apiFramework.pipeline(require('./social-post-comment-replies'), localUtils);
    },

    get socialCommentReports() {
        return apiFramework.pipeline(require('./social-post-comment-report'), localUtils);
    },

    get socialComponents() {
        return apiFramework.pipeline(require('./social-components'), localUtils);
    },

    get socialPostComponents() {
        return apiFramework.pipeline(require('./social-post-components'), localUtils);
    },

    get socialUserLogs() {
        return apiFramework.pipeline(require('./social-user-logs'), localUtils);
    },

    get socialGallery() {
        return apiFramework.pipeline(require('./social-gallery'), localUtils);
    },

    get socialAiChats() {
        return apiFramework.pipeline(require('./social-ai-chats'), localUtils);
    },

    get socialAiUsages() {
        return apiFramework.pipeline(require('./social-ai-usages'), localUtils);
    },

    get socialAiReminders() {
        return apiFramework.pipeline(require('./social-ai-reminders'), localUtils);
    },

    get socialAiReminderEvents() {
        return apiFramework.pipeline(require('./social-ai-reminder-events'), localUtils);
    },

    get socialAiReminderDispatch() {
        return apiFramework.pipeline(require('./social-ai-reminder-dispatch'), localUtils);
    },

    get socialAiDevices() {
        return apiFramework.pipeline(require('./social-ai-devices'), localUtils);
    },

    get socialAiSmsLogs() {
        return apiFramework.pipeline(require('./social-ai-sms-logs'), localUtils);
    },

    get socialAiUserPhones() {
        return apiFramework.pipeline(require('./social-ai-user-phones'), localUtils);
    },

    get socialAiAgentSettings() {
        return apiFramework.pipeline(require('./social-ai-agent-settings'), localUtils);
    },

    get socialAiMediaJobs() {
        return apiFramework.pipeline(require('./social-ai-media-jobs'), localUtils);
    },

    get socialAiDziJobs() {
        return apiFramework.pipeline(require('./social-ai-dzi-jobs'), localUtils);
    },

    //custom end

    // estate admin endpoints
    get estateProperties() {
        return apiFramework.pipeline(require('./estate-properties'), localUtils);
    },

    get estatePropertyPosts() {
        return apiFramework.pipeline(require('./estate-property-posts'), localUtils);
    },

    get estatePropertyTags() {
        return apiFramework.pipeline(require('./estate-property-tags'), localUtils);
    },

    get estatePropertyMedia() {
        return apiFramework.pipeline(require('./estate-property-media'), localUtils);
    },

    get estatePropertyStaff() {
        return apiFramework.pipeline(require('./estate-property-staff'), localUtils);
    },

    get estateInquiries() {
        return apiFramework.pipeline(require('./estate-inquiries'), localUtils);
    },

    get estateSettings() {
        return apiFramework.pipeline(require('./estate-settings'), localUtils);
    },

    // person story admin endpoints
    get personStories() {
        return apiFramework.pipeline(require('./person-stories'), localUtils);
    },

    // person graph admin endpoints
    get persons() {
        return apiFramework.pipeline(require('./person-graph').persons, localUtils);
    },

    // publish content admin endpoints
    get publishContent() {
        return apiFramework.pipeline(require('./publish-content'), localUtils);
    },

    get personRoles() {
        return apiFramework.pipeline(require('./person-graph').personroles, localUtils);
    },

    get personLifeEvents() {
        return apiFramework.pipeline(require('./person-graph').personlifeevents, localUtils);
    },

    get personStorySeries() {
        return apiFramework.pipeline(require('./person-graph').personstoryseries, localUtils);
    },

    get personStoryEpisodes() {
        return apiFramework.pipeline(require('./person-graph').personstoryepisodes, localUtils);
    },

    get personRelations() {
        return apiFramework.pipeline(require('./person-graph').personrelations, localUtils);
    },

    get personPostRelations() {
        return apiFramework.pipeline(require('./person-graph').personpostrelations, localUtils);
    },

    get personGalleryAssets() {
        return apiFramework.pipeline(require('./person-graph').persongalleryassets, localUtils);
    },

    get personGraphPosts() {
        return apiFramework.pipeline(require('./person-graph-posts'), localUtils);
    },

    get personGraphGalleryAssets() {
        return apiFramework.pipeline(require('./person-graph-gallery-assets'), localUtils);
    },

    // person media admin endpoints
    get personMedia() {
        return apiFramework.pipeline(require('./person-media'), localUtils);
    },

    /**
     * Content API Controllers
     *
     * @NOTE:
     *
     * Please create separate controllers for Content & Admin API. The goal is to expose `api.content` and
     * `api.admin` soon. Need to figure out how serializers & validation works then.
     */
    get pagesPublic() {
        return apiFramework.pipeline(require('./pages-public'), localUtils, 'content');
    },

    get tagsPublic() {
        return apiFramework.pipeline(require('./tags-public'), localUtils, 'content');
    },

    get publicSettings() {
        return apiFramework.pipeline(require('./settings-public'), localUtils, 'content');
    },

    get postsPublic() {
        return apiFramework.pipeline(require('./posts-public'), localUtils, 'content');
    },

    get authorsPublic() {
        return apiFramework.pipeline(require('./authors-public'), localUtils, 'content');
    },

    get tiersPublic() {
        return apiFramework.pipeline(require('./tiers-public'), localUtils, 'content');
    },

    get newslettersPublic() {
        return apiFramework.pipeline(require('./newsletters-public'), localUtils, 'content');
    },

    get offersPublic() {
        return apiFramework.pipeline(require('./offers-public'), localUtils, 'content');
    },

    get commentsMembers() {
        return apiFramework.pipeline(require('./comments-members'), localUtils, 'members');
    },

    get feedbackMembers() {
        return apiFramework.pipeline(require('./feedback-members'), localUtils, 'members');
    },

    get recommendationsPublic() {
        return apiFramework.pipeline(require('./recommendations-public'), localUtils, 'content');
    },

    //add custom
    get socialCommentsPublic() {
        return apiFramework.pipeline(require('./social-post-comments-public'), localUtils, 'social');
    },

    get socialComponentsPublic() {
        return apiFramework.pipeline(require('./social-components-public'), localUtils, 'social');
    },

    // estate content endpoints
    get estatePropertiesPublic() {
        return apiFramework.pipeline(require('./estate-properties-public'), localUtils, 'content');
    },

    get estateInquiriesPublic() {
        return apiFramework.pipeline(require('./estate-inquiries-public'), localUtils, 'content');
    },

    // person story content endpoints
    get personStoriesPublic() {
        return apiFramework.pipeline(require('./person-stories-public'), localUtils, 'content');
    },

    // person graph content endpoints
    get personsPublic() {
        return apiFramework.pipeline(require('./person-graph-public').persons, localUtils, 'content');
    },

    get personRolesPublic() {
        return apiFramework.pipeline(require('./person-graph-public').personroles, localUtils, 'content');
    },

    get personLifeEventsPublic() {
        return apiFramework.pipeline(require('./person-graph-public').personlifeevents, localUtils, 'content');
    },

    get personStorySeriesPublic() {
        return apiFramework.pipeline(require('./person-graph-public').personstoryseries, localUtils, 'content');
    },

    get personStoryEpisodesPublic() {
        return apiFramework.pipeline(require('./person-graph-public').personstoryepisodes, localUtils, 'content');
    },

    get personRelationsPublic() {
        return apiFramework.pipeline(require('./person-graph-public').personrelations, localUtils, 'content');
    },

    get personPostRelationsPublic() {
        return apiFramework.pipeline(require('./person-graph-public').personpostrelations, localUtils, 'content');
    },

    get personGalleryAssetsPublic() {
        return apiFramework.pipeline(require('./person-graph-public').persongalleryassets, localUtils, 'content');
    },

    // publish content public endpoints
    get publishContentPublic() {
        return apiFramework.pipeline(require('./publish-content-public'), localUtils, 'content');
    }

};
