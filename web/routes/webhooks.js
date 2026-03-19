/**
 * Shopify webhook handlers.
 * Body has already been verified by @shopify/shopify-app-express HMAC check.
 */

import { deleteSettings } from '../db/store.js';

export const webhookHandlers = {
  APP_UNINSTALLED: {
    deliveryMethod: 'http',
    callbackUrl: '/api/webhooks/uninstalled',
    callback: async (_topic, shop, _body) => {
      console.log(`App uninstalled by shop: ${shop}`);
      deleteSettings(shop);
    },
  },

  ORDERS_CREATE: {
    deliveryMethod: 'http',
    callbackUrl: '/api/webhooks/orders-create',
    callback: async (_topic, shop, body) => {
      try {
        const order = JSON.parse(body);
        // Log orders that contain a print file for future fulfilment tracking
        const hasPrintFile = order.line_items?.some(li =>
          li.properties?.some(p => p.name === '_Print_File_URL')
        );
        if (hasPrintFile) {
          console.log(`New print order #${order.order_number} from ${shop}`);
        }
      } catch (err) {
        console.error('ORDERS_CREATE webhook parse error:', err);
      }
    },
  },
};
