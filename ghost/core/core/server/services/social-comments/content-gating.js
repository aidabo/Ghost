const nql = require('@tryghost/nql');

// @ts-check
/** @typedef { boolean } AccessFlag */

const PERMIT_ACCESS = true;
const BLOCK_ACCESS = false;

// TODO: better place to store this?
const MEMBER_NQL_EXPANSIONS = [{
    key: 'products',
    replacement: 'products.slug'
}, {
    key: 'product',
    replacement: 'products.slug'
}];

const rejectUnknownKeys = input => nql.utils.mapQuery(input, function (value, key) {
    if (!['product', 'products', 'status'].includes(key.toLowerCase())) {
        return;
    }

    return {
        [key]: value
    };
});

/**
 * @param {object} post - A post object to check access to
 * @param {object} user - The member whos access should be checked
 *
 * @returns {AccessFlag}
 */
function checkPostAccess(post, user) {
    if (post.visibility === 'public') {
        return PERMIT_ACCESS;
    }

    if (!user) {
        return BLOCK_ACCESS;
    }

    if (post.visibility === 'free' || post.visibility === 'user') {
        return PERMIT_ACCESS;
    }

    let visibility = post.visibility === 'paid' ? 'status:-free' : post.visibility;
    if (visibility === 'tiers') {
        if (!post.tiers) {
            return BLOCK_ACCESS;
        }
        visibility = post.tiers.map((product) => {
            return `product:'${product.slug}'`;
        }).join(',');
    }

    if (visibility && user.status && nql(visibility, {expansions: MEMBER_NQL_EXPANSIONS, transformer: rejectUnknownKeys}).queryJSON(user)) {
        return PERMIT_ACCESS;
    }

    return BLOCK_ACCESS;    
}

function checkGatedBlockAccess(gatedBlockParams, user) {
    const {nonMember, memberSegment} = gatedBlockParams;
    const isLoggedIn = !!user;

    if (nonMember && !isLoggedIn) {
        return PERMIT_ACCESS;
    }

    if (!memberSegment && isLoggedIn) {
        return BLOCK_ACCESS;
    }

    if (memberSegment && user) {
        const nqlQuery = nql(memberSegment, {expansions: MEMBER_NQL_EXPANSIONS, transformer: rejectUnknownKeys});

        // if we only have unknown keys the NQL query will be empty and "pass" for all members
        // we should block access in this case to match the memberSegment:"" behaviour
        const parsedQuery = nqlQuery.parse();
        if (Object.keys(parsedQuery).length > 0) {
            return nqlQuery.queryJSON(user) ? PERMIT_ACCESS : BLOCK_ACCESS;
        }
    }

    return BLOCK_ACCESS;
}

module.exports = {
    checkPostAccess,
    checkGatedBlockAccess,
    PERMIT_ACCESS,
    BLOCK_ACCESS
};
