/**
 * User sidebar navigation model (routes, labels, F-key order).
 * Keep in sync with icon wiring in Sidebar.jsx (`pickSidebarIcon`).
 * F1 = first visible link, F2 = second, … up to F24 (matches services/navShortcuts.js).
 */
import { NAV_LABELS } from "../constants/navLabels.js";

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
  // Wholesalers: divisions (manufacturer sales divisions) and vendors (actual suppliers) are separate.
  // Retailers:   vendors are shown as "Suppliers" — no divisions tab.
  const canDivisions = !isRetailer && (isOwner || Boolean(perms?.DIVISIONS?.VIEW));
  const canVendors   = isOwner || Boolean(perms?.VENDORS?.VIEW);
  const canQuality   = isOwner || Boolean(perms?.PRODUCT_BATCHES?.VIEW);
  const canMfg       = isOwner || Boolean(perms?.MFG_COMPANIES?.VIEW);
  const canPurchase  = isOwner || Boolean(perms?.PURCHASE_INVOICES?.VIEW);
  const canCustomers = isOwner || Boolean(perms?.CUSTOMERS?.VIEW);
  const canSales     = isOwner || Boolean(perms?.SALES_INVOICES?.VIEW);
  const canSalesReturns    = isOwner || Boolean(perms?.SALES_RETURNS?.VIEW);
  const canPurchaseReturns = isOwner || Boolean(perms?.PURCHASE_RETURNS?.VIEW);
  // FE-01 fix: DIVISION_PAYMENTS and VENDOR_PAYMENTS are separate resources.
  // Wholesalers use division payments; retailers use vendor payments.
  // Do NOT merge them — a user with only VENDOR_PAYMENTS should not see Division Payments.
  const canDivisionPayments = !isRetailer && (isOwner || Boolean(perms?.DIVISION_PAYMENTS?.VIEW));
  const canVendorPayments   = isRetailer  && (isOwner || Boolean(perms?.VENDOR_PAYMENTS?.VIEW));
  const canCustomerPayments  = isOwner || Boolean(perms?.CUSTOMER_PAYMENTS?.VIEW);
  const canPrescriptions = isOwner || Boolean(perms?.PRESCRIPTIONS?.VIEW);
  const canOrders    = isOwner || Boolean(perms?.PURCHASE_ORDERS?.VIEW);

  const out = [
    {
      title: "MAIN",
      items: [withFn({ to: "/dashboard", label: NAV_LABELS.dashboard })]
    }
  ];

  const masterSetupItems = [
    ...(canQuality ? [withFn({ to: "/quality-master", label: NAV_LABELS.qualityMaster })] : []),
    ...(canMfg     ? [withFn({ to: "/mfg-companies",  label: NAV_LABELS.mfgCompanies  })] : []),
    // Wholesalers: Divisions tab (manufacturer's sales divisions)
    ...(canDivisions ? [withFn({ to: "/divisions", label: NAV_LABELS.divisions })] : []),
    // FE-02 fix: Both wholesalers and retailers use /vendors (labelled "Suppliers").
    // Consolidated into a single conditional — no need to duplicate for each role.
    ...(canVendors ? [withFn({ to: "/vendors", label: "Suppliers" })] : []),
    ...(canCustomers ? [withFn({ to: "/customers", label: NAV_LABELS.customers })] : []),
    ...(canOrders
      ? [
          withFn({
            to: isRetailer ? "/order-catalog" : "/my-catalog",
            label: isRetailer ? NAV_LABELS.orderCatalog : NAV_LABELS.myCatalog
          })
        ]
      : [])
  ];
  if (masterSetupItems.length) out.push({ title: "MASTER SETUP", items: masterSetupItems });

  const txnItems = [
    ...(canSales
      ? [
          withFn({
            to: "/sales-billing",
            label: isRetailer ? "Sales & Billing" : NAV_LABELS.salesBilling
          })
        ]
      : []),
    ...(canSalesReturns    ? [withFn({ to: "/sales-returns",    label: NAV_LABELS.salesReturns    })] : []),
    ...(canPurchase        ? [withFn({ to: "/purchase-invoices", label: NAV_LABELS.purchaseInvoices })] : []),
    ...(canPurchaseReturns ? [withFn({ to: "/purchase-returns",  label: "Purchase Returns"          })] : []),
    ...(canOrders
      ? [
          withFn({
            to: isRetailer ? "/my-orders" : "/orders",
            label: isRetailer ? NAV_LABELS.myOrders : NAV_LABELS.orders,
            badge: !isRetailer && pendingOrderCount > 0 ? (pendingOrderCount > 99 ? "99+" : String(pendingOrderCount)) : null
          })
        ]
      : []),
    ...(isRetailer && canPrescriptions ? [withFn({ to: "/prescriptions", label: "Prescriptions" })] : [])
  ];
  if (txnItems.length) out.push({ title: "TRANSACTIONS", items: txnItems });

  const reportItems = [
    ...(canQuality || canMfg ? [withFn({ to: "/reports/inventory", label: "Inventory Reports" })] : []),
    ...(canSales ? [withFn({ to: "/reports/day-book", label: "Day Book"                    })] : []),
    ...(canSales ? [withFn({ to: "/reports/gst-r1",   label: `${taxLabel} Report (R1)`     })] : []),
    ...(canPurchase ? [withFn({ to: "/reports/gst-r2", label: `${taxLabel} ITC Report (R2)` })] : []),
    ...(canSales ? [withFn({ to: "/reports/gst-r3b",  label: `${taxLabel} Return (3B)`     })] : []),
    ...(canCustomers || canDivisions || canVendors
      ? [withFn({ to: "/reports/ledger", label: "Ledger" })]
      : [])
  ];
  if (reportItems.length) out.push({ title: "REPORTS", items: reportItems });

  const paymentItems = [
    // FE-01 fix: Division Payments (wholesaler only) and Vendor Payments (retailer only) are separate.
    ...(canDivisionPayments
      ? [withFn({ to: "/division-payments", label: NAV_LABELS.divisionPayments })]
      : []),
    ...(canVendorPayments
      ? [withFn({ to: "/vendor-payments", label: "Supplier Payments" })]
      : []),
    ...(canCustomerPayments ? [withFn({ to: "/customer-payments", label: NAV_LABELS.customerPayments })] : [])
  ];
  if (paymentItems.length) out.push({ title: "PAYMENTS", items: paymentItems });

  const userManagementItems = [
    ...(canUsers ? [withFn({ to: "/users",        label: NAV_LABELS.users       })] : []),
    ...(canRoles ? [withFn({ to: "/roles-access", label: NAV_LABELS.rolesAccess })] : [])
  ];
  if (userManagementItems.length) out.push({ title: "USER MANAGEMENT", items: userManagementItems });

  return out;
}

/** Flattened routes in sidebar order (for F1… navigation). */
export function getSidebarFlatNavRoutes(ctx) {
  return buildUserSidebarSections(ctx)
    .flatMap((s) => s.items)
    .map((it) => String(it.to || ""));
}
