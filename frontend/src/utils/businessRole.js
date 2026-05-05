export function getRoleCodeFromAuth(auth) {
  const code = String(auth?.access?.roleCode || auth?.user?.role || "").toUpperCase();
  return code === "RETAILER" ? "RETAILER" : "WHOLESALER";
}

export function isRetailerAuth(auth) {
  return getRoleCodeFromAuth(auth) === "RETAILER";
}
