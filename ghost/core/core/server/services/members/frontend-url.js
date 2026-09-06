const normalizeFrontendUrl = (value) => {
    const normalized = String(value || '').trim().replace(/\/+$/, '');
    return normalized || null;
};

/** Resolve the separate frontend origin without changing Ghost's canonical site URL. */
module.exports.getMembersFrontendUrl = (urlUtils) => {
    const configured = normalizeFrontendUrl(
        process.env.MEMBERS_FRONTEND_URL ||
        process.env.FRONTEND_URL ||
        process.env.FRONT_END_URL ||
        process.env.NEXT_PUBLIC_FRONT_URL
    );
    return configured || urlUtils.urlFor({relativeUrl: '/'}, true).replace(/\/+$/, '');
};
