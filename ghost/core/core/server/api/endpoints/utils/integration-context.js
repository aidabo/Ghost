// Whether a request was authenticated by a custom integration's Admin API key.
//
// The api-framework sets `context.integration = {id: api_key.integration_id}`
// for EVERY Admin API key. A Staff Access Token (a user's personal Admin API
// key) has `integration_id = null`, so its context carries `{id: null}` — an
// object, and therefore truthy. Checking `context.integration` by truthiness
// lets a staff token pass as a worker integration. Always go through these
// helpers, which look at the id (as upstream webhooks.js does).

/**
 * @param {object} frame
 * @returns {string|null} the integration id, or null for staff tokens,
 *   browser sessions and anything else
 */
const getIntegrationId = frame => frame?.options?.context?.integration?.id || null;

/**
 * @param {object} frame
 * @returns {boolean}
 */
const isIntegrationRequest = frame => Boolean(getIntegrationId(frame));

module.exports = {
    getIntegrationId,
    isIntegrationRequest
};
