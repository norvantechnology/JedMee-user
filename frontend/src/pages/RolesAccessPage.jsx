import { InlineButtonProgress } from "../components/ui/buttons.jsx";
import { useSeoMeta } from "../utils/seo.js";
import { useEffect, useMemo, useState } from "react";
import AppShell from "../layouts/AppShell.jsx";
import { readAuth } from "../services/authStorage.js";
import { onAuthChanged } from "../services/authStorage.js";
import {
  bulkDeleteUserRoles,
  createUserRole,
  deleteUserRole,
  listUserRoles,
  listPermissionResources,
  updateUserRole
} from "../services/accessService.js";
import { emitToast } from "../services/toastBus.js";
import { parseApiError } from "../utils/api.js";
import CommonTable from "../components/CommonTable.jsx";
import CommonModal from "../components/CommonModal.jsx";
import "./RolesAccessPage.css";
import { can } from "../utils/access.js";
import ConfirmDialog from "../components/ConfirmDialog.jsx";
import "../components/StructuredForm.css";
import { IconShieldKey } from "../components/ui/AppIcons.jsx";
import { NAV_LABELS } from "../constants/navLabels.js";
import { IconBtn, IconSettings, IconTrash } from "../components/TableActionKit.jsx";

export default function RolesAccessPage() {
  useSeoMeta({ title: "Roles & Access" });
  const auth = readAuth();
  const user = auth?.user || null;
  const [busy, setBusy] = useState(false);
  const [roles, setRoles] = useState([]);
  const [search, setSearch] = useState("");
  const [presetFilter, setPresetFilter] = useState("");
  const [sort, setSort] = useState({ by: "created_at", dir: "desc" });
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createSubmitted, setCreateSubmitted] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState(null); // role
  const [editName, setEditName] = useState("");
  const [editPerms, setEditPerms] = useState({});
  const [authTick, setAuthTick] = useState(0);
  const [confirm, setConfirm] = useState({ open: false, id: "", name: "" });
  const [resources, setResources] = useState([
    { resource: "USERS", display_name: "Users" },
    { resource: "ROLES", display_name: "Roles & Permissions" },
    { resource: "DIVISIONS", display_name: "Divisions" },
    { resource: "VENDORS", display_name: "Vendors" },
    { resource: "DIVISION_PAYMENTS", display_name: "Division Payments" },
    { resource: "VENDOR_PAYMENTS", display_name: "Vendor Payments" },
    { resource: "MFG_COMPANIES", display_name: "Manufacturing Companies" },
    { resource: "PRODUCT_BATCHES", display_name: "Quality Master" }
  ]);

  const canView = can("ROLES", "VIEW");
  const canAdd = can("ROLES", "ADD");
  const canUpdate = can("ROLES", "UPDATE");
  const canDelete = can("ROLES", "DELETE");

  async function refresh() {
    setBusy(true);
    const resp = await listUserRoles({ sortBy: sort.by, sortDir: sort.dir });
    if (resp.status >= 200 && resp.status < 300 && resp.json?.ok) {
      setRoles(resp.json?.data?.roles || []);
    }
    setBusy(false);
  }

  useEffect(() => {
    return onAuthChanged(() => setAuthTick((v) => v + 1));
  }, []);

  useEffect(() => {
    if (canView) refresh();
  }, [authTick, canView, sort.by, sort.dir]);

  // Load canonical list of permission resources from the backend so the
  // permissions matrix stays in sync with the server-side allowlist.
  useEffect(() => {
    let alive = true;
    (async () => {
      const resp = await listPermissionResources();
      if (!alive) return;
      const list = resp?.json?.data?.resources;
      if (Array.isArray(list) && list.length) setResources(list);
    })();
    return () => { alive = false; };
  }, [authTick]);

  const filtered = useMemo(() => {
    const q = String(search || "").trim().toLowerCase();
    const base = (roles || []).filter((r) => {
      if (!presetFilter) return true;
      const p = r.permissions || {};
      const anyManage = (obj) => Boolean(obj?.add || obj?.update || obj?.delete);
      if (presetFilter === "MANAGE_USERS") return anyManage(p.USERS);
      if (presetFilter === "MANAGE_ROLES") return anyManage(p.ROLES);
      if (presetFilter === "MANAGE_VENDORS") return anyManage(p.VENDORS) || anyManage(p.DIVISIONS);
      if (presetFilter === "MANAGE_QUALITY") return anyManage(p.PRODUCT_BATCHES);
      if (presetFilter === "MANAGE_MFG") return anyManage(p.MFG_COMPANIES);
      if (presetFilter === "VIEW_ONLY") {
        const isViewOnly = (obj) => Boolean(obj?.view) && !obj?.add && !obj?.update && !obj?.delete;
        return (
          isViewOnly(p.USERS) &&
          isViewOnly(p.ROLES) &&
          isViewOnly(p.VENDORS) &&
          isViewOnly(p.DIVISIONS) &&
          isViewOnly(p.PRODUCT_BATCHES) &&
          isViewOnly(p.MFG_COMPANIES)
        );
      }
      return true;
    });
    if (!q) return base;
    return base.filter((r) => String(r.name || "").toLowerCase().includes(q));
  }, [roles, search, presetFilter]);

  if (!canView) {
    return (
      <AppShell
       
        userName={user?.full_name || "User"}
        userEmail={user?.email || auth?.email || ""}
        userBusinessName={user?.firm_name || ""}
        userGstNumber={user?.gst_number || ""}
        variant="user"
      >
        <div className="pageWrap">
          <div className="pageCard">
            <div className="raTitle">{NAV_LABELS.rolesAccess}</div>
            <div className="raSub">You don’t have permission to view roles.</div>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
     
      userName={user?.full_name || "User"}
      userEmail={user?.email || auth?.email || ""}
      userBusinessName={user?.firm_name || ""}
      userGstNumber={user?.gst_number || ""}
      variant="user"
    >
      <div className="pageWrap">
        <div className="raTop">
          <div>
            <div className="raTitle">{NAV_LABELS.rolesAccess}</div>
            <div className="raSub">Create custom roles and manage permissions (user-defined roles).</div>
          </div>
        </div>

        <div className="pageCard">
          <CommonTable
            title=""
            subtitle=""
            countText={busy ? "Loading…" : `${filtered.length} roles`}
            search={search}
            onSearchChange={setSearch}
            controlsPlacement="top"
            compact
            sort={sort}
            onSortChange={setSort}
            filters={[
              {
                id: "preset",
                label: "Preset",
                value: presetFilter,
                onChange: setPresetFilter,
                options: [
                  { value: "", label: "All roles" },
                  { value: "MANAGE_USERS", label: "Can manage users" },
                  { value: "MANAGE_VENDORS", label: "Can manage vendors" },
                  { value: "MANAGE_ROLES", label: "Can manage roles" },
                  { value: "MANAGE_QUALITY", label: "Can manage quality master" },
                  { value: "MANAGE_MFG", label: "Can manage mfg companies" },
                  { value: "VIEW_ONLY", label: "View-only roles" }
                ]
              }
            ]}
            primaryAction={
              canAdd
                ? {
                    label: "Create role",
                    onClick: () => {
                      setCreateName("");
                      setCreateOpen(true);
                    }
                  }
                : null
            }
            rows={filtered}
            selectedId={editing?.id || ""}
            getRowId={(r) => r.id}
            onRowClick={(r) => {
              setEditing(r);
              setEditName(r.name || "");
              setEditPerms(r.permissions || {});
              setEditOpen(true);
            }}
            onRowDelete={(r) => {
              if (!canDelete) return;
              setConfirm({ open: true, id: r.id, name: r.name || "" });
            }}
            bulkDelete={
              canDelete
                ? {
                    label: "Delete All",
                    confirmTitle: "Delete roles?",
                    confirmMessage: (n) => `Remove ${n} role(s)? Roles assigned to users cannot be deleted until reassigned.`,
                    onDelete: async (ids) => {
                      setBusy(true);
                      const r = await bulkDeleteUserRoles(ids);
                      setBusy(false);
                      if (r.status >= 200 && r.status < 300 && r.json?.ok) {
                        const failed = r.json?.data?.failed || [];
                        if (failed.length) emitToast({ type: "warning", message: `${failed.length} role(s) could not be deleted.` });
                        await refresh();
                      } else if (r.status !== 401) emitToast({ type: "error", message: parseApiError(r) });
                    }
                  }
                : undefined
            }
            columns={[
              { id: "name", header: "Role name", render: (r) => <span style={{ fontWeight: 800 }}>{r.name}</span> },
              {
                id: "summary",
                header: "Permissions",
                sortable: false,
                render: (r) => {
                  const u = r.permissions?.USERS || {};
                  const ro = r.permissions?.ROLES || {};
                  const divPerm = r.permissions?.DIVISIONS || r.permissions?.VENDORS || {};
                  const q = r.permissions?.PRODUCT_BATCHES || {};
                  const m = r.permissions?.MFG_COMPANIES || {};
                  const sum = (p) => ["add", "view", "update", "delete"].filter((k) => p?.[k]).length;
                  return (
                    <span style={{ color: "var(--color-text-3)" }}>
                      USERS {sum(u)}/4 • ROLES {sum(ro)}/4 • DIVISIONS {sum(divPerm)}/4 • QUALITY {sum(q)}/4 • MFG {sum(m)}/4
                    </span>
                  );
                }
              },
              {
                id: "created_at",
                header: "Created",
                sortable: false,
                render: (r) => <span style={{ color: "var(--color-text-3)" }}>{String(r.created_at || "").slice(0, 10)}</span>
              },
              {
                id: "actions",
                header: "Actions",
                align: "right",
                sortable: false,
                render: (r) => (
                  <div className="ibGroup" onClick={(e) => e.stopPropagation()}>
                    <IconBtn
                      tooltip="Manage permissions"
                      disabled={busy}
                      onClick={() => {
                        setEditing(r);
                        setEditName(r.name || "");
                        setEditPerms(r.permissions || {});
                        setEditOpen(true);
                      }}
                    >
                      <IconSettings />
                    </IconBtn>
                    {canDelete ? (
                      <IconBtn variant="danger" disabled={busy} tooltip="Delete role" onClick={() => setConfirm({ open: true, id: r.id, name: r.name || "" })}>
                        <IconTrash />
                      </IconBtn>
                    ) : null}
                  </div>
                )
              }
            ]}
            pagination={null}
          />
        </div>
      </div>

      <CommonModal
        open={createOpen}
        title="Add Role"
        onClose={() => { setCreateOpen(false); setCreateSubmitted(false); setCreateName(""); }}
        icon={<IconShieldKey />}
        footer={
          <div className="raModalFooter sfmModalFooter">
            <button className="raBtnGhost sfmBtnGhost" type="button" data-cm-cancel="true" onClick={() => { setCreateOpen(false); setCreateSubmitted(false); setCreateName(""); }} disabled={busy}>
              Cancel
            </button>
            <button
              className="raBtn sfmBtnPrimary"
              type="button"
              data-cm-primary="true"
              disabled={!canAdd || busy}
              onClick={async () => {
                setCreateSubmitted(true);
                const trimmed = String(createName || "").trim();
                if (trimmed.length < 2) return;
                setBusy(true);
                const resp = await createUserRole({ name: trimmed });
                if (resp.status >= 200 && resp.status < 300 && resp.json?.ok) {
                  setCreateOpen(false);
                  setCreateSubmitted(false);
                  setCreateName("");
                  await refresh();
                }
                setBusy(false);
              }}
            >
              {busy ? <InlineButtonProgress label="Working…" /> : "Create Role"}
            </button>
          </div>
        }
      >
        <div className="sfm">
          <div className="sfmSection">
            <div className="sfmSectionHead">
              <div className="sfmTitle">Role</div>
            </div>
            <div className="sfmGrid">
              <div className="raField sfmFull">
                <label>
                  Role name <span className="reqMark" aria-hidden="true">*</span>
                </label>
                <input
                  className={`raInput${createSubmitted && String(createName || "").trim().length < 2 ? " raInput_err" : ""}`}
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  placeholder="e.g. Manager"
                />
                {createSubmitted && String(createName || "").trim().length < 2 && (
                  <div className="mfzErr">Role name is required (min 2 characters).</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </CommonModal>

      <CommonModal
        open={editOpen}
        title="Edit Role"
        onClose={() => setEditOpen(false)}
        size="lg"
        icon={<IconShieldKey />}
        footer={
          <div className="raModalFooter sfmModalFooter">
            <button className="raBtnGhost sfmBtnGhost" type="button" data-cm-cancel="true" onClick={() => setEditOpen(false)} disabled={busy}>
              Cancel
            </button>
            {canUpdate ? (
              <button
                className="raBtn sfmBtnPrimary"
                type="button"
                data-cm-primary="true"
                disabled={busy}
                onClick={async () => {
                  if (!editing?.id) return;
                  const trimmed = String(editName || "").trim();
                  if (trimmed.length < 2) {
                    emitToast({ type: "error", message: "Role name must be at least 2 characters." });
                    return;
                  }
                  setBusy(true);
                  const resp = await updateUserRole(editing.id, { name: trimmed, permissions: editPerms });
                  if (resp.status >= 200 && resp.status < 300 && resp.json?.ok) {
                    setEditOpen(false);
                    await refresh();
                  }
                  setBusy(false);
                }}
              >
                {busy ? <InlineButtonProgress label="Saving…" /> : "Save Changes"}
              </button>
            ) : null}
          </div>
        }
      >
        <div className="sfm">
          <div className="sfmSection">
            <div className="sfmSectionHead">
              <div className="sfmTitle">Role</div>
            </div>
            <div className="sfmGrid">
              <div className="raField sfmFull">
                <label>
                  Role name <span className="reqMark" aria-hidden="true">*</span>
                </label>
                <input className="raInput" value={editName} onChange={(e) => setEditName(e.target.value)} disabled={!canUpdate} />
              </div>
            </div>
          </div>

          <div className="sfmSection">
            <div className="sfmSectionHead">
              <div className="sfmTitle">Permissions</div>
            </div>
            <div className="raMatrix">
              {(resources || []).map((res) => {
                const resKey = String(res?.resource || "").toUpperCase();
                if (!resKey) return null;
                const p = editPerms?.[resKey] || { add: false, view: true, update: false, delete: false };
                const label = String(res?.display_name || resKey.replace(/_/g, " "));
                return (
                  <div className="raPermRow" key={resKey}>
                    <div className="raPermRes">{label}</div>
                    {[
                      ["add", "Add"],
                      ["view", "View"],
                      ["update", "Update"],
                      ["delete", "Delete"]
                    ].map(([k, label]) => (
                      <label className="raCheck" key={k}>
                        <input
                          type="checkbox"
                          checked={Boolean(p[k])}
                          onChange={(ev) => {
                            setEditPerms((prev) => ({
                              ...(prev || {}),
                              [resKey]: { ...(prev?.[resKey] || {}), [k]: ev.target.checked }
                            }));
                          }}
                          disabled={!canUpdate}
                        />
                        <span>{label}</span>
                      </label>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </CommonModal>

      <ConfirmDialog
        open={confirm.open}
        title="Delete role?"
        message={confirm.name ? `Delete role “${confirm.name}”?` : "Delete this role?"}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        danger
        busy={busy}
        onClose={() => setConfirm({ open: false, id: "", name: "" })}
        onConfirm={async () => {
          if (!confirm.id) return;
          setBusy(true);
          const resp = await deleteUserRole(confirm.id);
          if (resp.status >= 200 && resp.status < 300 && resp.json?.ok) {
            await refresh();
          }
          setBusy(false);
          setConfirm({ open: false, id: "", name: "" });
        }}
      />
    </AppShell>
  );
}

