import { useEffect, useMemo, useState } from "react";
import { useSeoMeta } from "../utils/seo.js";
import AppShell from "../layouts/AppShell.jsx";
import { readAuth } from "../services/authStorage.js";
import { onAuthChanged } from "../services/authStorage.js";
import CommonTable from "../components/CommonTable.jsx";
import {
  bulkDeleteAccountUsers,
  createAccountUser,
  deleteAccountUser,
  listAccountUsers,
  listUserRoles,
  assignAccountUserRole,
  updateAccountUser
} from "../services/accessService.js";
import { emitToast } from "../services/toastBus.js";
import { parseApiError } from "../utils/api.js";
import "./UsersPage.css";
import { can } from "../utils/access.js";
import UserDetailPanel from "../components/UserDetailPanel.jsx";
import ConfirmDialog from "../components/ConfirmDialog.jsx";
import AccountUserModal from "../components/AccountUserModal.jsx";
import { NAV_LABELS } from "../constants/navLabels.js";
import { IconBtn, IconEdit, IconTrash } from "../components/TableActionKit.jsx";

export default function UsersPage() {
  useSeoMeta({ title: "Users" });
  const auth = readAuth();
  const user = auth?.user || null;
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState([]);
  const [roles, setRoles] = useState([]);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sort, setSort] = useState({ by: "created_at", dir: "desc" });
  const [panelOpen, setPanelOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createSeed, setCreateSeed] = useState({ fullName: "", email: "", phoneCountryCode: "+91", phoneNumber: "", customRoleId: "" });
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [editSeed, setEditSeed] = useState({ fullName: "", email: "", phoneCountryCode: "+91", phoneNumber: "", customRoleId: "" });
  const [authTick, setAuthTick] = useState(0);
  const [confirm, setConfirm] = useState({ open: false, id: "", name: "" });

  async function refresh() {
    setBusy(true);
    const [u, r] = await Promise.all([
      listAccountUsers({ sortBy: sort.by, sortDir: sort.dir }),
      listUserRoles({ sortBy: "created_at", sortDir: "desc" })
    ]);
    if (u.status >= 200 && u.status < 300 && u.json?.ok) {
      setRows(u.json?.data?.users || []);
    } else {
      // 401 errors are auto-toasted by apiClient (avoid double toasts).
      if (u.status !== 401) emitToast({ type: "error", message: parseApiError(u) });
    }
    if (r.status >= 200 && r.status < 300 && r.json?.ok) {
      setRoles(r.json?.data?.roles || []);
    }
    setBusy(false);
  }

  useEffect(() => {
    refresh();
  }, [sort.by, sort.dir]);

  useEffect(() => {
    return onAuthChanged(() => setAuthTick((v) => v + 1));
  }, []);

  const filtered = useMemo(() => {
    const meId = String(user?.id || "");
    const q = String(search || "").trim().toLowerCase();
    const base = (rows || [])
      .filter((u) => String(u?.id || "") !== meId)
      .filter((u) => {
        if (!roleFilter) return true;
        if (roleFilter === "__none__") return !String(u.custom_role_id || "");
        return String(u.custom_role_id || "") === String(roleFilter);
      })
      .filter((u) => {
        if (!statusFilter) return true;
        if (statusFilter === "BLOCKED") return Boolean(u.is_blocked);
        return String(u.status || "").toUpperCase() === String(statusFilter || "").toUpperCase();
      });
    if (!q) return base;
    return base.filter((u) => String(u.full_name || "").toLowerCase().includes(q) || String(u.email || "").toLowerCase().includes(q));
  }, [rows, search, user?.id, roleFilter, statusFilter]);

  // Recompute permissions when auth/access changes.
  // eslint-disable-next-line no-unused-vars
  const _ = authTick;
  const canViewUsers = can("USERS", "VIEW");
  const canAddUsers = can("USERS", "ADD");
  const canUpdateUsers = can("USERS", "UPDATE");
  const canDeleteUsers = can("USERS", "DELETE");

  // Validation is handled inside AccountUserModal.

  if (!canViewUsers) {
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
            <div className="uupTitle">Users</div>
            <div className="uupSub">You don’t have permission to view users.</div>
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
            <div className="raTitle">{NAV_LABELS.users}</div>
            <div className="raSub">Create users, assign roles, and manage access.</div>
          </div>
        </div>
        <div className="pageCard">
          <CommonTable
              title=""
              subtitle=""
              countText={busy ? "Loading…" : `${filtered.length} users`}
              search={search}
              onSearchChange={setSearch}
              controlsPlacement="top"
              compact
              sort={sort}
              onSortChange={setSort}
              filters={[
                {
                  id: "status",
                  label: "Status",
                  value: statusFilter,
                  onChange: setStatusFilter,
                  options: [
                    { value: "", label: "All status" },
                    { value: "APPROVED", label: "Approved" },
                    { value: "PENDING", label: "Pending" },
                    { value: "REJECTED", label: "Rejected" },
                    { value: "BLOCKED", label: "Blocked" }
                  ]
                },
                {
                  id: "role",
                  label: "Role",
                  value: roleFilter,
                  onChange: (v) => setRoleFilter(v),
                  options: [
                    { value: "", label: "All roles" },
                    { value: "__none__", label: "No role" },
                    ...roles.map((r) => ({ value: r.id, label: r.name }))
                  ]
                }
              ]}
              primaryAction={
                canAddUsers
                  ? {
                      label: "Create user",
                      onClick: () => {
                        setCreateSeed({ fullName: "", email: "", phoneCountryCode: "+91", phoneNumber: "", customRoleId: "" });
                        setCreateOpen(true);
                      }
                    }
                  : null
              }
              rows={filtered}
              selectedId=""
              getRowId={(r) => r.id}
              onRowClick={(u) => {
                const phone = u.phone_country_code && u.phone_number ? `${u.phone_country_code}${u.phone_number}` : u.phone_number || "";
                setSelectedUser({
                  ...u,
                  phone,
                  role: u.custom_role_name || u.system_role || u.role || ""
                });
                setPanelOpen(true);
              }}
              onRowDelete={(u) => {
                if (!canDeleteUsers) return;
                setConfirm({ open: true, id: u.id, name: u.full_name || u.email || "" });
              }}
              bulkDelete={
                canDeleteUsers
                  ? {
                      label: "Delete All",
                      confirmTitle: "Delete users?",
                      confirmMessage: (n) => `Permanently remove ${n} user account(s)? The account owner cannot be deleted.`,
                      onDelete: async (ids) => {
                        setBusy(true);
                        const r = await bulkDeleteAccountUsers(ids);
                        setBusy(false);
                        if (r.status >= 200 && r.status < 300 && r.json?.ok) {
                          const failed = r.json?.data?.failed || [];
                          if (failed.length) emitToast({ type: "warning", message: `${failed.length} user(s) could not be deleted.` });
                          await refresh();
                        } else if (r.status !== 401) emitToast({ type: "error", message: parseApiError(r) });
                      }
                    }
                  : undefined
              }
              columns={[
                { id: "full_name", header: "Name", render: (u) => <span style={{ fontWeight: 700 }}>{u.full_name}</span> },
                {
                  id: "status",
                  header: "Status",
                  sortable: false,
                  render: (u) => {
                    const st = u.is_blocked ? "Blocked" : String(u.status || "").toUpperCase() || "";
                    const color = u.is_blocked ? "var(--color-danger)" : st === "APPROVED" ? "var(--color-success)" : "var(--color-text-3)";
                    return <span style={{ fontWeight: 800, color }}>{st === "APPROVED" ? "Approved" : st === "PENDING" ? "Pending" : st === "REJECTED" ? "Rejected" : st}</span>;
                  }
                },
                {
                  id: "custom_role_name",
                  header: "Custom role",
                  sortable: false,
                  render: (u) => (
                    <select
                      className="uupMiniSelect"
                      value={u.custom_role_id || ""}
                      onClick={(e) => e.stopPropagation()}
                      onChange={async (e) => {
                        const next = e.target.value;
                        if (!canUpdateUsers) return;
                        if (!next) return;
                        setBusy(true);
                        const resp = await assignAccountUserRole(u.id, next);
                        if (resp.status >= 200 && resp.status < 300 && resp.json?.ok) {
                          await refresh();
                        }
                        setBusy(false);
                      }}
                      disabled={busy || !canUpdateUsers}
                    >
                      <option value="" disabled>
                        Select role
                      </option>
                      {roles.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                  )
                },
                { id: "email", header: "Email", render: (u) => <span style={{ color: "var(--color-text-3)" }}>{u.email}</span> },
                {
                  id: "phone_number",
                  header: "Phone",
                  sortable: false,
                  render: (u) => `${u.phone_country_code || ""} ${u.phone_number || ""}`.trim()
                },
                {
                  id: "actions",
                  header: "Actions",
                  sortable: false,
                  align: "right",
                  render: (u) => (
                    <div className="ibGroup" onClick={(e) => e.stopPropagation()}>
                      {canUpdateUsers ? (
                        <IconBtn
                          tooltip="Edit user"
                          disabled={busy}
                          onClick={() => {
                            setEditing(u);
                            setEditSeed({
                              fullName: u.full_name || "",
                              email: u.email || "",
                              phoneCountryCode: u.phone_country_code || "+91",
                              phoneNumber: u.phone_number || "",
                              customRoleId: u.custom_role_id || ""
                            });
                            setEditOpen(true);
                          }}
                        >
                          <IconEdit />
                        </IconBtn>
                      ) : null}
                      {canDeleteUsers ? (
                        <IconBtn variant="danger" disabled={busy} tooltip="Delete user" onClick={() => setConfirm({ open: true, id: u.id, name: u.full_name || u.email || "" })}>
                          <IconTrash />
                        </IconBtn>
                      ) : null}
                    </div>
                  )
                }
              ]}
              pagination={null}
            />

          <UserDetailPanel
            open={panelOpen}
            user={selectedUser}
            readOnly
            onClose={() => {
              setPanelOpen(false);
              setSelectedUser(null);
            }}
          />

          <AccountUserModal
            open={createOpen}
            mode="create"
            busy={busy}
            canSubmit={canAddUsers}
            roles={roles}
            initialValues={createSeed}
            onClose={() => setCreateOpen(false)}
            onSubmit={async (payload) => {
              setBusy(true);
              const resp = await createAccountUser(
                {
                  fullName: payload.fullName,
                  email: payload.email,
                  phoneCountryCode: payload.phoneCountryCode,
                  phoneNumber: payload.phoneNumber,
                  customRoleId: payload.customRoleId
                },
                { toast: "none" } // custom toast below (includes temp password)
              );
              if (resp.status >= 200 && resp.status < 300 && resp.json?.ok) {
                const tempPassword = resp.json?.meta?.tempPassword;
                emitToast({ type: "success", message: tempPassword ? `User created. Temp password: ${tempPassword}` : "User created." });
                setCreateOpen(false);
                await refresh();
              }
              setBusy(false);
            }}
          />

          <AccountUserModal
            open={editOpen}
            mode="edit"
            busy={busy}
            canSubmit={canUpdateUsers}
            roles={roles}
            initialValues={editSeed}
            onClose={() => setEditOpen(false)}
            onSubmit={async (payload) => {
              if (!editing?.id) return;
              setBusy(true);
              const resp = await updateAccountUser(editing.id, {
                fullName: payload.fullName,
                phoneCountryCode: payload.phoneCountryCode,
                phoneNumber: payload.phoneNumber
              });
              if (resp.status >= 200 && resp.status < 300 && resp.json?.ok) {
                const prevRole = String(editing?.custom_role_id || "");
                const nextRole = String(payload.customRoleId || "");
                if (prevRole !== nextRole) {
                  await assignAccountUserRole(editing.id, nextRole);
                }
                setEditOpen(false);
                setEditing(null);
                await refresh();
              }
              setBusy(false);
            }}
          />

          <ConfirmDialog
            open={confirm.open}
            title="Delete user?"
            message={confirm.name ? `Delete ${confirm.name}?` : "Delete this user?"}
            confirmLabel="Delete"
            cancelLabel="Cancel"
            danger
            busy={busy}
            onClose={() => setConfirm({ open: false, id: "", name: "" })}
            onConfirm={async () => {
              if (!confirm.id) return;
              setBusy(true);
              const resp = await deleteAccountUser(confirm.id);
              if (resp.status >= 200 && resp.status < 300 && resp.json?.ok) {
                await refresh();
              }
              setBusy(false);
              setConfirm({ open: false, id: "", name: "" });
            }}
          />
        </div>
      </div>
    </AppShell>
  );
}

