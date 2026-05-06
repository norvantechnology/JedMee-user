'use strict';

/**
 * Single Lambda router — dispatches every API Gateway event to the correct
 * handler module.  Replaces ~155 individual Lambda functions with one,
 * cutting CloudFormation resource count from 500+ to ~50 and deploy time
 * from 20 min to ~2 min.
 *
 * Key:   "METHOD /resource-pattern"  (API Gateway event.resource uses {id} placeholders)
 * Value: require()-able path relative to this file
 */
const ROUTES = {
  // ── Hello ──────────────────────────────────────────────────────────────────
  'GET /hello': '../hello',

  // ── Auth ───────────────────────────────────────────────────────────────────
  'POST /auth/signup':                      '../auth/signup',
  'POST /auth/login':                       '../auth/login',
  'POST /auth/refresh':                     '../auth/refresh',
  'POST /auth/logout':                      '../auth/logout',
  'POST /auth/password/change':             '../auth/changePassword',
  'POST /auth/otp/request':                 '../auth/requestOtp',
  'POST /auth/otp/verify':                  '../auth/verifyOtp',
  'POST /auth/password/forgot/request':     '../auth/forgotPasswordRequest',
  'POST /auth/password/forgot/resend':      '../auth/forgotPasswordRequest',
  'POST /auth/password/forgot/reset':       '../auth/forgotPasswordReset',

  // ── User / Me ───────────────────────────────────────────────────────────────
  'GET /me':        '../user/me',
  'POST /me/update': '../user/updateMe',

  // ── Registration ────────────────────────────────────────────────────────────
  'POST /registration': '../registration/register',

  // ── Access control ──────────────────────────────────────────────────────────
  'GET /access/roles':                    '../access/listRoles',
  'POST /access/roles':                   '../access/createRole',
  'POST /access/bulk-delete-roles':       '../access/bulkDeleteRoles',
  'POST /access/roles/{id}':              '../access/deleteRole',
  'GET /access/me':                       '../access/me',
  'GET /access/permission-resources':     '../access/listPermissionResources',
  'POST /access/roles/{id}/update':       '../access/updateRole',
  'GET /access/users':                    '../access/listUsers',
  'POST /access/users':                   '../access/createUser',
  'POST /access/users/{id}/role':         '../access/assignUserRole',
  'POST /access/users/{id}/update':       '../access/updateUser',
  'POST /access/users/{id}/delete':       '../access/deleteUser',
  'POST /access/bulk-delete-users':       '../access/bulkDeleteUsers',

  // ── Vendors ─────────────────────────────────────────────────────────────────
  'GET /vendors':                         '../vendors/listVendors',
  'POST /vendors':                        '../vendors/createVendor',
  'POST /vendors/{id}/update':            '../vendors/updateVendor',
  'POST /vendors/{id}/delete':            '../vendors/deleteVendor',
  'POST /vendors/bulk-delete':            '../vendors/bulkDelete',
  'GET /vendors/{id}/ledger':             '../vendors/ledger',
  'POST /vendors/{id}/ledger/send-email': '../vendors/sendLedgerEmail',

  // ── Divisions ───────────────────────────────────────────────────────────────
  'GET /divisions':                   '../divisions/list',
  'POST /divisions':                  '../divisions/create',
  'GET /divisions/{id}':              '../divisions/get',
  'POST /divisions/{id}/update':      '../divisions/update',
  'POST /divisions/{id}/delete':      '../divisions/delete',
  'GET /divisions/{id}/outstanding':  '../divisions/outstanding',

  // ── Division payments ───────────────────────────────────────────────────────
  'GET /division-payments':                 '../divisionPayments/list',
  'POST /division-payments':               '../divisionPayments/create',
  'POST /division-payments/bulk-settle':   '../divisionPayments/bulkSettle',

  // ── Mfg companies ───────────────────────────────────────────────────────────
  'GET /mfg-companies':                       '../mfgCompanies/listMfgCompanies',
  'POST /mfg-companies':                      '../mfgCompanies/createMfgCompany',
  'POST /mfg-companies/{id}/update':          '../mfgCompanies/updateMfgCompany',
  'POST /mfg-companies/{id}/delete':          '../mfgCompanies/deleteMfgCompany',
  'POST /mfg-companies/bulk-delete':          '../mfgCompanies/bulkDelete',
  'GET /mfg-companies/check-unique':          '../mfgCompanies/checkUnique',
  'GET /mfg-companies/{id}/policy-impact':    '../mfgCompanies/getPolicyImpact',

  // ── Product batches ─────────────────────────────────────────────────────────
  'GET /api/product-batches':               '../productBatches/list',
  'GET /api/product-batches/{id}':          '../productBatches/get',
  'POST /api/product-batches':              '../productBatches/create',
  'PUT /api/product-batches/{id}':          '../productBatches/update',
  'PATCH /product-batches/{id}/loose-stock':'../productBatches/updateLooseStock',
  'DELETE /api/product-batches/{id}':       '../productBatches/delete',
  'POST /api/product-batches/bulk-delete':  '../productBatches/bulkDelete',
  'GET /api/product-batches/check':         '../productBatches/check',

  // ── Products ────────────────────────────────────────────────────────────────
  'GET /products':              '../products/list',
  'POST /products':             '../products/create',
  'PUT /products/{id}':         '../products/update',
  'DELETE /products/{id}':      '../products/delete',
  'POST /products/bulk-delete': '../products/bulkDelete',
  'GET /products/check-code':   '../products/checkCode',
  'GET /products/check-name':   '../products/checkName',
  'GET /products/rich-search':  '../products/richSearch',

  // ── Purchase invoices ───────────────────────────────────────────────────────
  'GET /purchase-invoices':                   '../purchaseInvoices/list',
  'POST /purchase-invoices':                  '../purchaseInvoices/create',
  'GET /purchase-invoices/{id}':              '../purchaseInvoices/get',
  'PUT /purchase-invoices/{id}':              '../purchaseInvoices/update',
  'POST /purchase-invoices/{id}/confirm':     '../purchaseInvoices/confirm',
  'POST /purchase-invoices/{id}/cancel':      '../purchaseInvoices/cancel',
  'POST /purchase-invoices/{id}/delete':      '../purchaseInvoices/delete',
  'POST /purchase-invoices/bulk-cancel':      '../purchaseInvoices/bulkCancel',
  'POST /purchase-invoices/bulk-confirm':     '../purchaseInvoices/bulkConfirm',
  'POST /purchase-invoices/send-email':       '../purchaseInvoices/sendEmail',

  // ── Purchase returns ────────────────────────────────────────────────────────
  'POST /purchase-returns':               '../purchaseReturns/create',
  'POST /purchase-returns/{id}/confirm':  '../purchaseReturns/confirm',

  // ── Vendor payments ─────────────────────────────────────────────────────────
  'GET /vendor-payments':               '../vendorPayments/list',
  'POST /vendor-payments':              '../vendorPayments/create',
  'POST /vendor-payments/bulk-settle':  '../vendorPayments/bulkSettle',

  // ── Customers ───────────────────────────────────────────────────────────────
  'GET /customers':                           '../customers/list',
  'POST /customers':                          '../customers/create',
  'GET /customers/{id}':                      '../customers/get',
  'PUT /customers/{id}':                      '../customers/update',
  'DELETE /customers/{id}':                   '../customers/delete',
  'POST /customers/bulk-delete':              '../customers/bulkDelete',
  'GET /customers/{id}/outstanding':          '../customers/outstanding',
  'GET /customers/{id}/ledger/print':         '../customers/ledgerPrint',
  'POST /customers/{id}/ledger/send-email':   '../customers/sendLedgerEmail',

  // ── Sales invoices ──────────────────────────────────────────────────────────
  'GET /sales-invoices':                              '../salesInvoices/list',
  'POST /sales-invoices':                             '../salesInvoices/create',
  'GET /sales-invoices/{id}':                         '../salesInvoices/get',
  'PUT /sales-invoices/{id}':                         '../salesInvoices/update',
  'PATCH /sales-invoices/{id}/rate-type':             '../salesInvoices/changeRateType',
  'PATCH /sales-invoices/{id}/global-discount':       '../salesInvoices/applyGlobalDiscount',
  'POST /sales-invoices/{id}/items/{itemId}/scheme':  '../salesInvoices/overrideLineScheme',
  'POST /sales-invoices/{id}/loose-sale':             '../salesInvoices/recordLooseSale',
  'POST /sales-invoices/{id}/confirm':                '../salesInvoices/confirm',
  'POST /sales-invoices/{id}/cancel':                 '../salesInvoices/cancel',
  'POST /sales-invoices/bulk-cancel':                 '../salesInvoices/bulkCancel',
  'POST /sales-invoices/bulk-confirm':                '../salesInvoices/bulkConfirm',
  'GET /sales-invoices/{id}/print':                   '../salesInvoices/print',
  'POST /sales-invoices/print-bulk':                  '../salesInvoices/printBulk',
  'POST /sales-invoices/send-email':                  '../salesInvoices/sendEmail',
  'GET /sales-invoices/by-barcode':                   '../salesInvoices/byBarcode',

  // ── Sales returns ───────────────────────────────────────────────────────────
  'GET /sales-returns':               '../salesReturns/list',
  'POST /sales-returns':              '../salesReturns/create',
  'GET /sales-returns/{id}':          '../salesReturns/get',
  'POST /sales-returns/{id}/confirm': '../salesReturns/confirm',
  'POST /sales-returns/{id}/cancel':  '../salesReturns/cancel',

  // ── Prescriptions ───────────────────────────────────────────────────────────
  'GET /prescriptions':       '../prescriptions/list',
  'GET /prescriptions/{id}':  '../prescriptions/get',

  // ── Customer payments ───────────────────────────────────────────────────────
  'GET /customer-payments':               '../customerPayments/list',
  'POST /customer-payments':              '../customerPayments/create',
  'POST /customer-payments/bulk-settle':  '../customerPayments/bulkSettle',

  // ── Uploads ─────────────────────────────────────────────────────────────────
  'POST /uploads/presign':    '../uploads/presign',
  'POST /uploads/access-url': '../uploads/accessUrl',

  // ── Notifications ───────────────────────────────────────────────────────────
  'GET /notifications':               '../notifications/list',
  'GET /notifications/unread-count':  '../notifications/unreadCount',
  'POST /notifications/mark-read':    '../notifications/markRead',
  'POST /notifications/broadcast':    '../notifications/createBroadcast',

  // ── Announcement ────────────────────────────────────────────────────────────
  'GET /api/announcement': '../announcement/get',

  // ── Supplier products ───────────────────────────────────────────────────────
  'GET /supplier-products':               '../supplierProducts/list',
  'POST /supplier-products':              '../supplierProducts/upsert',
  'POST /supplier-products/{id}/delete':  '../supplierProducts/delete',

  // ── Vendor manufacturers ────────────────────────────────────────────────────
  'GET /vendor-manufacturers':              '../vendorManufacturers/list',
  'POST /vendor-manufacturers':             '../vendorManufacturers/upsert',
  'POST /vendor-manufacturers/{id}/delete': '../vendorManufacturers/delete',

  // ── Reports ─────────────────────────────────────────────────────────────────
  'GET /reports/product-supplier': '../reports/productSupplier',
  'GET /reports/mfg-stockist':     '../reports/mfgStockist',
  'GET /reports/non-moving':       '../reports/nonMoving',
  'GET /reports/day-book':         '../reports/dayBook',

  // ── Dashboard ───────────────────────────────────────────────────────────────
  'GET /dashboard/alerts':  '../dashboard/alerts',
  'GET /dashboard/summary': '../dashboard/summary',

  // ── Import ──────────────────────────────────────────────────────────────────
  'POST /import/parse':       '../import/parse',
  'POST /import/validate':    '../import/validate',
  'POST /import/execute':     '../import/execute',
  'GET /import/jobs':         '../import/jobsList',
  'GET /import/jobs/{id}':    '../import/jobGet',
  'GET /import/template-meta':'../import/templateMeta',

  // ── Catalog ─────────────────────────────────────────────────────────────────
  'GET /catalog/my-catalog':        '../catalog/myCatalog',
  'POST /catalog/add-product':      '../catalog/addProduct',
  'PATCH /catalog/{id}':            '../catalog/updateCatalogItem',
  'DELETE /catalog/{id}':           '../catalog/deleteCatalogItem',
  'POST /catalog/bulk-visibility':  '../catalog/bulkVisibility',
  'GET /catalog/browse':            '../catalog/browse',
  'GET /catalog/public':            '../catalog/browse',
  'GET /catalog/wholesalers':       '../catalog/wholesalers',

  // ── Orders ──────────────────────────────────────────────────────────────────
  'POST /orders':                         '../orders/create',
  'GET /orders/my-orders':                '../orders/myOrders',
  'GET /orders/incoming':                 '../orders/incoming',
  'GET /orders/{id}':                     '../orders/get',
  'GET /orders/{id}/wholesaler-view':     '../orders/wholesalerView',
  'POST /orders/{id}/accept':             '../orders/accept',
  'POST /orders/{id}/reject':             '../orders/reject',
  'POST /orders/{id}/dispatch':           '../orders/dispatch',
  'POST /orders/{id}/cancel':             '../orders/cancelRetailer',
  'POST /orders/{id}/cancel-by-wholesaler':'../orders/cancelWholesaler',
  'POST /orders/{id}/confirm-delivery':   '../orders/confirmDelivery',
  'POST /orders/{id}/create-purchase':    '../orders/createPurchase',

  // ── Wholesaler links ────────────────────────────────────────────────────────
  'POST /wholesaler-links/connect':       '../wholesalerLinks/connect',
  'GET /wholesaler-links/my-connections': '../wholesalerLinks/myConnections',
  'PATCH /wholesaler-links/{id}':         '../wholesalerLinks/update',

  // ── Public ──────────────────────────────────────────────────────────────────
  'GET /public/plans': '../public/plans',
};

// ── Pre-compiled lookup tables ─────────────────────────────────────────────
// Built once per Lambda init so per-invocation dispatch stays O(1) for literal
// paths and O(n) only for parameterised templates.
//
// We need both because the function is now wired to API Gateway via a single
// `ANY /{proxy+}` catch-all (to keep the Lambda resource policy under the 20 KB
// limit), so `event.resource` is always `/{proxy+}` and we must dispatch on
// `event.path` instead. The literal map handles every concrete path in O(1);
// the pattern list handles `{id}`-style templates and also restores
// `event.resource` + `event.pathParameters` so downstream handlers don't care
// how they were invoked.
const LITERAL_ROUTES = Object.create(null);
const PATTERN_ROUTES = [];

for (const [key, modulePath] of Object.entries(ROUTES)) {
  const spaceIdx = key.indexOf(' ');
  const method = key.slice(0, spaceIdx);
  const template = key.slice(spaceIdx + 1);

  if (template.indexOf('{') === -1) {
    LITERAL_ROUTES[`${method} ${template}`] = { template, modulePath };
    continue;
  }

  const paramNames = [];
  const regexBody = template.replace(/\{([^}]+)\}/g, (_, name) => {
    paramNames.push(name);
    return '([^/]+)';
  });
  PATTERN_ROUTES.push({
    method,
    template,
    modulePath,
    paramNames,
    regex: new RegExp(`^${regexBody}$`),
  });
}

// Prefer more-specific templates first: fewer params, then longer literal text.
PATTERN_ROUTES.sort((a, b) => {
  if (a.paramNames.length !== b.paramNames.length) {
    return a.paramNames.length - b.paramNames.length;
  }
  return b.template.length - a.template.length;
});

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,PATCH,OPTIONS',
};

function resolveRoute(method, path, fallbackResource) {
  const literal = LITERAL_ROUTES[`${method} ${path}`];
  if (literal) {
    return { template: literal.template, modulePath: literal.modulePath, params: null };
  }

  for (const p of PATTERN_ROUTES) {
    if (p.method !== method) continue;
    const m = p.regex.exec(path);
    if (!m) continue;
    const params = {};
    for (let i = 0; i < p.paramNames.length; i++) {
      try {
        params[p.paramNames[i]] = decodeURIComponent(m[i + 1]);
      } catch (_) {
        params[p.paramNames[i]] = m[i + 1];
      }
    }
    return { template: p.template, modulePath: p.modulePath, params };
  }

  // Backward-compat: if the function is still wired to per-route events,
  // event.resource will already be the template — try a direct lookup.
  if (fallbackResource && fallbackResource !== '/{proxy+}') {
    const direct = ROUTES[`${method} ${fallbackResource}`];
    if (direct) return { template: fallbackResource, modulePath: direct, params: null };
  }

  return null;
}

exports.handler = async (event) => {
  const method = event.httpMethod;
  const path = event.path || '';

  // Preflight: API Gateway's MOCK integration normally handles this, but with
  // an `ANY /{proxy+}` route OPTIONS may still hit the Lambda. Answer it here
  // so CORS works regardless of integration type.
  if (method === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  }

  const match = resolveRoute(method, path, event.resource);

  if (!match) {
    const key = `${method} ${path}`;
    console.warn(`[router] No handler for: ${key}`);
    return {
      statusCode: 404,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      body: JSON.stringify({
        ok: false,
        data: null,
        meta: null,
        error: { code: 'NOT_FOUND', message: `Route not found: ${key}` },
      }),
    };
  }

  // Normalise the event so handlers see the same shape they used to under
  // per-route Api events (resource = template, pathParameters has named keys).
  const dispatchEvent = match.params
    ? {
        ...event,
        resource: match.template,
        pathParameters: { ...(event.pathParameters || {}), ...match.params },
      }
    : event.resource === match.template
      ? event
      : { ...event, resource: match.template };

  // Wrap handler load + invocation so any thrown error becomes a structured
  // JSON 500 instead of an opaque API Gateway 502. This also keeps the
  // function from returning a non-proxy-shaped response (which would also
  // surface as a 502 with no useful client signal).
  let mod;
  try {
    // Lazy-require: only the called module is loaded per invocation
    mod = require(match.modulePath);
  } catch (err) {
    console.error(`[router] Failed to load module ${match.modulePath}:`, err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      body: JSON.stringify({
        ok: false,
        data: null,
        meta: null,
        error: {
          code: 'HANDLER_LOAD_FAILED',
          message: 'Failed to load route handler.',
          details: { module: match.modulePath, reason: String(err && err.message || err) },
        },
      }),
    };
  }

  try {
    const result = await mod.handler(dispatchEvent);
    if (!result || typeof result.statusCode !== 'number') {
      console.error(`[router] Handler ${match.modulePath} returned non-proxy shape:`, result);
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
        body: JSON.stringify({
          ok: false,
          data: null,
          meta: null,
          error: { code: 'BAD_HANDLER_RESPONSE', message: 'Handler returned a non-API-Gateway-proxy response.' },
        }),
      };
    }
    // Always inject CORS headers so error responses (4xx) are readable cross-origin
    return {
      ...result,
      headers: { ...CORS_HEADERS, ...(result.headers || {}) },
    };
  } catch (err) {
    console.error(`[router] Handler ${match.modulePath} threw:`, err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      body: JSON.stringify({
        ok: false,
        data: null,
        meta: null,
        error: {
          code: 'HANDLER_ERROR',
          message: 'Unhandled error in route handler.',
          details: { reason: String(err && err.message || err) },
        },
      }),
    };
  }
};