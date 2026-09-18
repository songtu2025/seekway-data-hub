import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Button } from "antd";
import { useSearchParams } from "react-router-dom";

import { api, ApiError } from "../api/client";
import type { Invitation, User, UserRole, UserStatus } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { AppShell } from "../components/AppShell";
import { RefreshStatus } from "../components/RefreshStatus";
import { useUrlSearchInput } from "../hooks/useUrlSearchInput";
import { ConfirmationModal, InviteMemberModal } from "./MemberActionModals";
import { InvitationWorkspace, MemberToolbar, MemberWorkspace } from "./MemberDirectorySections";
import {
  deriveMemberDirectory,
  type MembersView,
  type PendingConfirmation,
} from "./memberAccessModel";

export function MembersPage() {
  const { csrfToken, user: currentUser } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [users, setUsers] = useState<User[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [selectedRole, setSelectedRole] = useState<UserRole>("viewer");
  const [usersLoading, setUsersLoading] = useState(true);
  const [invitationsLoading, setInvitationsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastCheckedAt, setLastCheckedAt] = useState<Date | null>(null);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [usersLoaded, setUsersLoaded] = useState(false);
  const [invitationsLoaded, setInvitationsLoaded] = useState(false);
  const [error, setError] = useState("");
  const [usersError, setUsersError] = useState("");
  const [invitationsError, setInvitationsError] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [confirmation, setConfirmation] = useState<PendingConfirmation | null>(null);
  const [busy, setBusy] = useState(false);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const usersGenerationRef = useRef(0);
  const invitationsGenerationRef = useRef(0);
  const inviteGenerationRef = useRef(0);
  const refreshRequestedRef = useRef(false);
  const view: MembersView = searchParams.get("view") === "invitations" ? "invitations" : "members";
  const urlSearch = searchParams.get("q") ?? "";
  const selectedId = parseSelectedId(searchParams.get("member"));
  const selectedInvitationId = parseSelectedId(searchParams.get("invitation"));

  const updateUrl = useCallback(
    (changes: Record<string, string | null>, replace = false) => {
      const next = new URLSearchParams(searchParams);
      Object.entries(changes).forEach(([name, value]) => {
        if (value) next.set(name, value);
        else next.delete(name);
      });
      setSearchParams(next, { replace });
    },
    [searchParams, setSearchParams],
  );
  const {
    inputProps: searchInputProps,
    setValue: setSearch,
    value: search,
  } = useUrlSearchInput(urlSearch, (value) => updateUrl({ q: value || null }, true));

  const loadUsers = useCallback(async (showLoading = true): Promise<boolean> => {
    const generation = ++usersGenerationRef.current;
    setUsersError("");
    if (showLoading) setUsersLoading(true);
    try {
      const rows = await api.listUsers();
      if (usersGenerationRef.current !== generation) return false;
      setUsers(rows);
      setUsersLoaded(true);
      return true;
    } catch (caught) {
      if (usersGenerationRef.current !== generation) return false;
      setUsersError(caught instanceof ApiError ? caught.message : "成员数据加载失败");
      return false;
    } finally {
      if (showLoading && usersGenerationRef.current === generation) setUsersLoading(false);
    }
  }, []);

  const loadInvitations = useCallback(async (showLoading = true): Promise<boolean> => {
    const generation = ++invitationsGenerationRef.current;
    setInvitationsError("");
    if (showLoading) setInvitationsLoading(true);
    try {
      const rows = await api.listInvitations();
      if (invitationsGenerationRef.current !== generation) return false;
      setInvitations(rows);
      setInvitationsLoaded(true);
      return true;
    } catch (caught) {
      if (invitationsGenerationRef.current !== generation) return false;
      setInvitationsError(caught instanceof ApiError ? caught.message : "邀请数据加载失败");
      return false;
    } finally {
      if (showLoading && invitationsGenerationRef.current === generation)
        setInvitationsLoading(false);
    }
  }, []);

  const loadData = useCallback(
    async (showLoading = true) => {
      const [usersSucceeded, invitationsSucceeded] = await Promise.all([
        loadUsers(showLoading),
        loadInvitations(showLoading),
      ]);
      if (usersSucceeded && invitationsSucceeded) {
        setLastCheckedAt(new Date());
        setRefreshFailed(false);
      }
      return { invitationsSucceeded, usersSucceeded };
    },
    [loadInvitations, loadUsers],
  );

  useEffect(() => {
    void loadData();
    return () => {
      usersGenerationRef.current += 1;
      invitationsGenerationRef.current += 1;
      inviteGenerationRef.current += 1;
      refreshRequestedRef.current = false;
    };
  }, [loadData]);

  async function refreshData() {
    if (
      refreshRequestedRef.current ||
      usersLoading ||
      invitationsLoading ||
      refreshing ||
      busy ||
      inviteBusy
    )
      return;
    refreshRequestedRef.current = true;
    setRefreshing(true);
    setRefreshFailed(false);
    setStatusMessage("");
    try {
      const result = await loadData(false);
      const complete = result.usersSucceeded && result.invitationsSucceeded;
      const hasAvailableData =
        usersLoaded || invitationsLoaded || result.usersSucceeded || result.invitationsSucceeded;
      setRefreshFailed(!complete && hasAvailableData);
    } finally {
      setRefreshing(false);
      refreshRequestedRef.current = false;
    }
  }

  const {
    filteredInvitations,
    filteredUsers,
    members,
    protectsLastAdmin,
    selectedInvitationRow,
    selectedUser,
  } = deriveMemberDirectory({
    invitations,
    search,
    selectedId,
    selectedInvitationId,
    users,
  });

  useEffect(() => {
    if (selectedUser) setSelectedRole(selectedUser.role);
  }, [selectedUser]);

  useEffect(() => {
    if (view === "members" && selectedUser && selectedId !== selectedUser.id) {
      updateUrl({ member: String(selectedUser.id) }, true);
    }
    if (
      view === "invitations" &&
      selectedInvitationRow &&
      selectedInvitationId !== selectedInvitationRow.invitation.id
    ) {
      updateUrl({ invitation: String(selectedInvitationRow.invitation.id) }, true);
    }
  }, [selectedId, selectedInvitationId, selectedInvitationRow, selectedUser, updateUrl, view]);

  async function runMutation<T>(
    action: () => Promise<T>,
    successMessage: string,
    onSuccess?: (result: T) => void,
  ) {
    if (!csrfToken) return false;
    setBusy(true);
    setError("");
    setStatusMessage("");
    try {
      const result = await action();
      onSuccess?.(result);
      setStatusMessage(successMessage);
      const refreshResult = await loadData(false);
      const refreshed = refreshResult.usersSucceeded && refreshResult.invitationsSucceeded;
      if (!refreshed) {
        setStatusMessage(`${successMessage}；操作已成功，列表刷新失败，请稍后重试。`);
      }
      return true;
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "操作失败，请稍后重试");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function updateRole(target: User, role: UserRole) {
    if (!csrfToken || role === target.role) return false;
    return runMutation(
      () => api.updateUser(target.id, { role }, csrfToken),
      "成员角色已更新",
      (updated) => {
        setUsers((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      },
    );
  }

  async function updateStatus(target: User, status: UserStatus) {
    if (!csrfToken || status === target.status) return false;
    return runMutation(
      () => api.updateUser(target.id, { status }, csrfToken),
      status === "disabled" ? "成员已停用" : "成员已启用",
      (updated) => {
        setUsers((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      },
    );
  }

  async function resendInvitation(target: Invitation) {
    if (!csrfToken) return;
    await runMutation(
      () => api.resendInvitation(target.id, csrfToken),
      "邀请已重新发送",
      (updated) => {
        setInvitations((current) =>
          current.map((item) => (item.id === target.id ? updated : item)),
        );
        updateUrl({ invitation: String(updated.id) }, true);
      },
    );
  }

  async function revokeInvitation(target: Invitation) {
    if (!csrfToken) return false;
    return runMutation(
      () => api.revokeInvitation(target.id, csrfToken),
      "邀请已撤销",
      (updated) => {
        setInvitations((current) =>
          current.map((item) => (item.id === target.id ? updated : item)),
        );
      },
    );
  }

  function openConfirmation(nextConfirmation: PendingConfirmation) {
    setError("");
    setConfirmation(nextConfirmation);
  }

  async function confirmPendingAction() {
    if (!confirmation) return;
    const succeeded =
      confirmation.kind === "disable"
        ? await updateStatus(confirmation.user, "disabled")
        : confirmation.kind === "demote"
          ? await updateRole(confirmation.user, confirmation.role)
          : await revokeInvitation(confirmation.invitation);
    if (succeeded) setConfirmation(null);
  }

  function saveRole() {
    if (!selectedUser || selectedRole === selectedUser.role) return;
    if (selectedUser.role === "admin" && selectedRole !== "admin") {
      openConfirmation({ kind: "demote", role: selectedRole, user: selectedUser });
      return;
    }
    void updateRole(selectedUser, selectedRole);
  }

  function toggleStatus() {
    if (!selectedUser) return;
    if (selectedUser.status === "disabled") {
      void updateStatus(selectedUser, "active");
      return;
    }
    openConfirmation({ kind: "disable", user: selectedUser });
  }

  function openInviteModal() {
    inviteGenerationRef.current += 1;
    setError("");
    setInviteBusy(false);
    setInviteOpen(true);
  }

  function closeInviteModal() {
    inviteGenerationRef.current += 1;
    setError("");
    setInviteBusy(false);
    setInviteOpen(false);
  }

  async function submitInvitation(email: string, role: UserRole): Promise<boolean> {
    if (!csrfToken) return false;
    const generation = ++inviteGenerationRef.current;
    setInviteBusy(true);
    setError("");
    setStatusMessage("");
    try {
      const created = await api.createInvitation(email, role, csrfToken);
      if (inviteGenerationRef.current !== generation) return false;
      setInviteOpen(false);
      updateUrl({ invitation: String(created.id), q: null, view: "invitations" }, true);
      setStatusMessage("邀请已发送");
      const refreshResult = await loadData(false);
      const refreshed = refreshResult.usersSucceeded && refreshResult.invitationsSucceeded;
      if (inviteGenerationRef.current !== generation) return true;
      if (!refreshed) {
        setStatusMessage("邀请已发送；操作已成功，列表刷新失败，请稍后重试。");
      }
      return true;
    } catch (caught) {
      if (inviteGenerationRef.current !== generation) return false;
      setError(caught instanceof ApiError ? caught.message : "操作失败，请稍后重试");
      return false;
    } finally {
      if (inviteGenerationRef.current === generation) setInviteBusy(false);
    }
  }

  async function retryUsers() {
    const succeeded = await loadUsers();
    if (succeeded && invitationsLoaded) {
      setLastCheckedAt(new Date());
      setRefreshFailed(false);
    }
  }

  async function retryInvitations() {
    const succeeded = await loadInvitations();
    if (succeeded && usersLoaded) {
      setLastCheckedAt(new Date());
      setRefreshFailed(false);
    }
  }

  const pageBusy = busy || refreshing;

  return (
    <AppShell>
      <main className="members-page" data-node-id="46:344">
        <header className="page-heading">
          <div>
            <h1>成员与权限</h1>
          </div>
          <div className="m3-refresh-controls member-heading-actions">
            <RefreshStatus
              failedWithPreviousData={refreshFailed && (usersLoaded || invitationsLoaded)}
              lastUpdatedAt={lastCheckedAt}
              refreshing={refreshing}
            />
            <Button
              aria-label="刷新成员与邀请"
              disabled={usersLoading || invitationsLoading || pageBusy || inviteBusy}
              loading={refreshing}
              onClick={() => void refreshData()}
            >
              刷新成员与邀请
            </Button>
            <Button
              className="invite-button"
              disabled={pageBusy || inviteBusy}
              type="primary"
              onClick={openInviteModal}
            >
              ＋&nbsp;&nbsp;邀请成员
            </Button>
          </div>
        </header>

        <MemberToolbar
          actions={{
            selectView: (nextView) => {
              setSearch("");
              updateUrl({ q: null, view: nextView === "members" ? null : nextView });
            },
          }}
          state={{
            invitationCount: invitations.length,
            memberCount: members.length,
            searchInputProps,
            view,
          }}
        />

        {usersError ? (
          <Alert
            action={<Button onClick={() => void retryUsers()}>重试成员</Button>}
            title={usersError}
            type={usersLoaded ? "warning" : "error"}
          />
        ) : null}
        {invitationsError ? (
          <Alert
            action={<Button onClick={() => void retryInvitations()}>重试邀请</Button>}
            title={invitationsError}
            type={invitationsLoaded ? "warning" : "error"}
          />
        ) : null}
        {error && !inviteOpen && !confirmation ? <Alert title={error} type="error" /> : null}
        {statusMessage ? (
          <Alert aria-live="polite" role="status" title={statusMessage} type="success" />
        ) : null}

        {view === "members" ? (
          <MemberWorkspace
            actions={{
              changeRole: setSelectedRole,
              saveRole,
              selectUser: (id) => updateUrl({ member: String(id) }),
              toggleStatus,
            }}
            state={{
              busy,
              filteredUsers,
              loading: usersLoading,
              searchActive: Boolean(search.trim()),
              protectsLastAdmin,
              selectedRole,
              selectedUser,
              writeDisabled: refreshing,
            }}
          />
        ) : (
          <InvitationWorkspace
            actions={{
              resend: (invitation) => void resendInvitation(invitation),
              revoke: (invitation) => openConfirmation({ invitation, kind: "revoke" }),
              selectInvitation: (id) => updateUrl({ invitation: String(id) }),
            }}
            state={{
              busy,
              filteredInvitations,
              loading: invitationsLoading,
              searchActive: Boolean(search.trim()),
              selectedInvitationRow,
              writeDisabled: refreshing,
            }}
          />
        )}
      </main>
      <InviteMemberModal
        busy={inviteBusy}
        error={error}
        open={inviteOpen}
        onClose={closeInviteModal}
        onSubmit={submitInvitation}
      />
      {confirmation ? (
        <ConfirmationModal
          busy={busy}
          confirmation={confirmation}
          error={error}
          isSelf={"user" in confirmation && confirmation.user.id === currentUser?.id}
          onClose={() => {
            if (!busy) setConfirmation(null);
          }}
          onConfirm={() => void confirmPendingAction()}
        />
      ) : null}
    </AppShell>
  );
}

function parseSelectedId(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}
