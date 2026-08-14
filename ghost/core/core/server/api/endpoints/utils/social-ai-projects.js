// Shared helpers for the generic project container (P1, plan §0-1/§2-2).
// The project `status` is a user-controlled PUBLICATION state — enum:
// draft | published — set from the project detail page / edit dialog. It is
// NOT derived from the jobs (review M2: the old derived draft/active/completed
// scheme was removed; job transitions no longer touch project status).

const PROJECT_STATUS = {
    DRAFT: 'draft',
    PUBLISHED: 'published'
};

module.exports = {
    PROJECT_STATUS
};
