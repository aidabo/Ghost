// Checks that a media-store key lies inside one gallery area, e.g.
// <root>/gallery/users/<alias>/... — the area a presign for the same scope
// hands out. Used where a client sends back a key/URL that Ghost then records
// as a social_media_assets row (and later deletes from the store), so a key of
// another person's or another job's area cannot be taken over.
//
// Same rules as the video job link-assets check (social-ai-video-jobs.js):
// <root> is the media store's configured root (pathPrefix || storagePath, ''
// when none); a leading '/' is ignored; no '.', '..' or empty segments, no
// backslash, no trailing '/'; and the part below the area must not hold a
// second 'gallery/' segment or a 'jobs/' segment (job cleanups match keys with
// LIKE '%/gallery/<scope>/<id>/%' or '%/jobs/<id>/%' and would sweep it up).

const trimSlashes = value => String(value || '').replace(/^\/+|\/+$/g, '');

const mediaRootOf = store => String(store?.pathPrefix || store?.storagePath || '');

/**
 * @param {string} root media store root (pathPrefix || storagePath)
 * @param {...string} parts e.g. 'gallery', 'users', alias
 * @returns {string} 'root/gallery/users/alias/' without a leading '/'
 */
const buildAreaPrefix = (root, ...parts) => [trimSlashes(root), ...parts.map(trimSlashes)].filter(Boolean).join('/') + '/';

/**
 * @param {string} key storage key as sent by the client
 * @param {string[]} prefixes area prefixes from buildAreaPrefix
 * @returns {boolean}
 */
const isKeyInAreas = (key, prefixes) => {
    const raw = String(key || '').trim();
    const clean = trimSlashes(raw);
    if (!clean || raw.endsWith('/') || clean.includes('\\')) {
        return false;
    }
    return (prefixes || []).some((prefix) => {
        if (!prefix || !clean.startsWith(prefix)) {
            return false;
        }
        const segments = clean.slice(prefix.length).split('/');
        if (segments.some(segment => !segment || segment === '.' || segment === '..')) {
            return false;
        }
        return !segments.slice(0, -1).some(segment => segment === 'gallery' || segment === 'jobs');
    });
};

module.exports = {
    buildAreaPrefix,
    isKeyInAreas,
    mediaRootOf,
    trimSlashes
};
