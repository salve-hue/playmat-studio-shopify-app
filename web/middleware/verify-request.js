/**
 * Middleware: verify that incoming requests from the Shopify admin embed
 * carry a valid session token (App Bridge JWT) or a valid session cookie.
 *
 * Uses @shopify/shopify-app-express's built-in verifyRequest helper.
 */

export function verifyRequest(shopify) {
  return shopify.validateAuthenticatedSession();
}

/**
 * Middleware: verify HMAC for Shopify webhook payloads.
 * Must be applied BEFORE express.json() parses the body.
 */
export function verifyWebhook(shopify) {
  return shopify.processWebhooks({ webhookHandlers: {} });
}
