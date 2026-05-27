/**
 * User sidebar navigation model (routes, labels, F-key order).
 * Keep in sync with icon wiring in Sidebar.jsx (`pickSidebarIcon`).
 * F1 = first visible link, F2 = second, … up to F24 (matches services/navShortcuts.js).
 *
 * 6 groups (in order):
 *   1. (no label)         — Dashboard
 *   2. MASTER DATA        — Products, Manufacturers, Divisions, Suppliers, Customers
 *   3. CATALOG            — My Catalog
 *   4. TRANSACTIONS       — Sales & Billing, Purchases, Sales Returns, Purchase Returns, Orders
 *   5. REPORTS & ACCOUNTS — Inventory Report, Day Book, GST reports, Ledger, Payments
 *   6. TEAM               — Users, Roles & Access
 */

const MAX_SIDEBAR_FN = 24;

/**
 * @param {{
 *   isOwner: boolean,
 *   perms: Record<string, unknown>,
 *   isRetailer: boolean,
 *   pendingOrderCount: number,
 *   taxLabel: string,
 * }} ctx
 * @returns {{ title: string, items: { to: string, label: string, badge?: string | null, fnKey?: number }[] }[]}
 */
export function buildUserSidebarSections(ctx) {
  const { isOwner, perms, isRetailer, pendingOrderCount, taxLabel } = ctx;

  let fnCounter = 0;
  function withFn(item) {
    fnCounter += 1;
    if (fnCounter > MAX_SIDEBAR_FN) return item;
    return { ...item, fnKey: fnCounter };
  }

  const canUsers    = isOwner || Boolean(perms?.USERS?.VIEW);
  const canRoles    = isOwner || Boolean(perms?.ROLES?.VIEW);
  const canDivisions = !isRetailer && (isOwner || Boolean(perms?.DIVISIONS?.VIEW));
  const canVendors   = isOwner || Boolean(perms?.VENDORS?.VIEW);
  const canQuality   = isOwner || Boolean(perms?.PRODUCT_BATCHES?.VIEW);
  const canMfg       = isOwner || Boolean(perms?.MFG_COMPANIES?.VIEW);
  const canPurchase  = isOwner || Boolean(perms?.PURCHASE_INVOICES?.VIEW);
  const canCustomers = isOwner || Boolean(perms?.CUSTOMERS?.VIEW);
  const canSales     = isOwner || Boolean(perms?.SALES_INVOICES?.VIEW);
  const canSalesReturns    = isOwner || Boolean(perms?.SALES_RETURNS?.VIEW);
  const canPurchaseReturns = isOwner || Boolean(perms?.PURCHASE_RETURNS?.VIEW);
  const canDivisionPayments = !isRetailer && (isOwner || Boolean(perms?.DIVISION_PAYMENTS?.VIEW));
  const canVendorPayments   = isRetailer  && (isOwner || Boolean(perms?.VENDOR_PAYMENTS?.VIEW));
  const canCustomerPayments  = isOwner || Boolean(perms?.CUSTOMER_PAYMENTS?.VIEW);
  const canPrescriptions = isOwner || Boolean(perms?.PRESCRIPTIONS?.VIEW);
  const canOrders    = isOwner || Boolean(perms?.PURCHASE_ORDERS?.VIEW);

  // ── GROUP 1: no label — Dashboard only ──────────────────────────────────
  const out = [
    { title: "", items: [withFn({ to: "/dashboard", label: "Dashboard" })] }
  ];

  // ── GROUP 2: MASTER DATA ─────────────────────────────────────────────────
  const masterDataItems = [
    ...(canQuality   ? [withFn({ to: "/quality-master", label: "Products"      })] : []),
    ...(canMfg       ? [withFn({ to: "/mfg-companies",  label: "Manufacturers" })] : []),
    ...(canDivisions ? [withFn({ to: "/divisions",      label: "Divisions"     })] : []),
    ...(canVendors   ? [withFn({ to: "/vendors",        label: "Suppliers"     })] : []),
    ...(canCustomers ? [withFn({ to: "/customers",      label: "Customers"     })] : []),
  ];
  if (masterDataItems.length) out.push({ title: "MASTER DATA", items: masterDataItems });

  // ── GROUP 3: CATALOG ─────────────────────────────────────────────────────
  const catalogItems = [
    ...(canOrders
      ? [withFn({
          to: isRetailer ? "/order-catalog" : "/my-catalog",
          label: isRetailer ? "Order Catalog" : "My Catalog"
        })]
      : [])
  ];
  if (catalogItems.length) out.push({ title: "CATALOG", items: catalogItems });

  // ── GROUP 4: TRANSACTIONS — Sales first, then Purchases, then Returns ────
  const txnItems = [
    ...(canSales
      ? [withFn({ to: "/sales-billing", label: "Sales & Billing" })]
      : []),
    ...(canPurchase
      ? [withFn({ to: "/purchase-invoices", label: "Purchases" })]
      : []),
    ...(canSalesReturns
      ? [withFn({ to: "/sales-returns", label: "Sales Returns" })]
      : []),
    ...(canPurchaseReturns
      ? [withFn({ to: "/purchase-returns", label: "Purchase Returns" })]
      : []),
    ...(canOrders
      ? [withFn({
          to: isRetailer ? "/my-orders" : "/orders",
          label: isRetailer ? "My Orders" : "Orders",
          badge: !isRetailer && pendingOrderCount > 0
            ? (pendingOrderCount > 99 ? "99+" : String(pendingOrderCount))
            : null
        })]
      : []),
    ...(isRetailer && canPrescriptions
      ? [withFn({ to: "/prescriptions", label: "Prescriptions" })]
      : [])
  ];
  if (txnItems.length) out.push({ title: "TRANSACTIONS", items: txnItems });

  // ── GROUP 5: REPORTS & ACCOUNTS (reports + payments merged) ─────────────
  const reportsAccountsItems = [
    ...(canQuality || canMfg
      ? [withFn({ to: "/reports/inventory", label: "Inventory Report" })]
      : []),
    ...(canSales
      ? [withFn({ to: "/reports/day-book", label: "Day Book" })]
      : []),
    ...(canSales
      ? [withFn({ to: "/reports/gst-r1", label: `${taxLabel} Report (R1)` })]
      : []),
    ...(canPurchase
      ? [withFn({ to: "/reports/gst-r2", label: `${taxLabel} ITC Report` })]
      : []),
    ...(canSales
      ? [withFn({ to: "/reports/gst-r3b", label: `${taxLabel} Return (3B)` })]
      : []),
    ...(canCustomers || canDivisions || canVendors
      ? [withFn({ to: "/reports/ledger", label: "Ledger" })]
      : []),
    ...(canDivisionPayments
      ? [withFn({ to: "/division-payments", label: "Division Payments" })]
      : []),
    ...(canVendorPayments
      ? [withFn({ to: "/vendor-payments", label: "Supplier Payments" })]
      : []),
    ...(canCustomerPayments
      ? [withFn({ to: "/customer-payments", label: "Customer Payments" })]
      : []),
  ];
  if (reportsAccountsItems.length) out.push({ title: "REPORTS & ACCOUNTS", items: reportsAccountsItems });

  // ── GROUP 6: TEAM ────────────────────────────────────────────────────────
  const teamItems = [
    ...(canUsers ? [withFn({ to: "/users",        label: "Users"          })] : []),
    ...(canRoles ? [withFn({ to: "/roles-access", label: "Roles & Access" })] : []),
  ];
  if (teamItems.length) out.push({ title: "TEAM", items: teamItems });

  return out;
}

/** Flattened routes in sidebar order (for F1… navigation). */
export function getSidebarFlatNavRoutes(ctx) {
  return buildUserSidebarSections(ctx)
    .flatMap((s) => s.items)
    .map((it) => String(it.to || ""));
}
