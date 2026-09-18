import { Button, Empty, Input, Select, Spin, Tag } from "antd";
import { Link } from "react-router-dom";

import type { Invitation, User, UserRole } from "../api/types";
import {
  canResendInvitation,
  canRevokeInvitation,
  formatDate,
  invitationStatusNames,
  invitationTimeline,
  permissions,
  roleNames,
  statusNames,
  type InvitationRow,
  type MembersView,
} from "./memberAccessModel";

type MemberToolbarState = {
  invitationCount: number;
  memberCount: number;
  search: string;
  view: MembersView;
};

type MemberToolbarActions = {
  changeSearch: (value: string) => void;
  selectView: (view: MembersView) => void;
};

export function MemberToolbar({
  actions,
  state,
}: {
  actions: MemberToolbarActions;
  state: MemberToolbarState;
}) {
  return (
    <section className="member-toolbar">
      <div aria-label="成员与邀请视图" className="member-view-tabs" role="group">
        <Button
          aria-pressed={state.view === "members"}
          aria-controls="members-view-panel"
          className={state.view === "members" ? "active" : ""}
          type={state.view === "members" ? "primary" : "default"}
          onClick={() => actions.selectView("members")}
        >
          成员 {state.memberCount}
        </Button>
        <Button
          aria-pressed={state.view === "invitations"}
          aria-controls="invitations-view-panel"
          className={state.view === "invitations" ? "active" : ""}
          type={state.view === "invitations" ? "primary" : "default"}
          onClick={() => actions.selectView("invitations")}
        >
          邀请 {state.invitationCount}
        </Button>
      </div>
      <Input
        aria-label={state.view === "members" ? "搜索成员" : "搜索邀请"}
        placeholder={state.view === "members" ? "搜索姓名或邮箱" : "搜索受邀邮箱"}
        type="search"
        value={state.search}
        onChange={(event) => actions.changeSearch(event.target.value)}
      />
    </section>
  );
}

type MemberWorkspaceState = {
  busy: boolean;
  filteredUsers: User[];
  loading: boolean;
  searchActive: boolean;
  protectsLastAdmin: boolean;
  selectedRole: UserRole;
  selectedUser: User | null;
  writeDisabled: boolean;
};

type MemberWorkspaceActions = {
  changeRole: (role: UserRole) => void;
  saveRole: () => void;
  selectUser: (id: number) => void;
  toggleStatus: () => void;
};

export function MemberWorkspace({
  actions,
  state,
}: {
  actions: MemberWorkspaceActions;
  state: MemberWorkspaceState;
}) {
  const {
    busy,
    filteredUsers,
    loading,
    protectsLastAdmin,
    searchActive,
    selectedRole,
    selectedUser,
    writeDisabled,
  } = state;

  return (
    <section aria-label="成员列表与权限" className="member-workspace" id="members-view-panel">
      <div className="member-list">
        <div className="member-list-title">
          <strong>成员</strong>
        </div>
        <div className="member-table-head">
          <span>成员</span>
          <span>角色</span>
          <span>状态</span>
          <span>最近登录</span>
        </div>
        <div className="member-rows">
          {loading ? (
            <div className="empty-state">
              <Spin /> 正在加载成员…
            </div>
          ) : null}
          {!loading && filteredUsers.length === 0 ? (
            <Empty
              description={searchActive ? "搜索无匹配成员" : "尚无成员"}
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            />
          ) : null}
          {filteredUsers.map((user) => (
            <Button
              aria-label={`${user.displayName ?? user.email}，${user.email}，${statusNames[user.status]}`}
              className={`member-row ${user.id === selectedUser?.id ? "selected" : ""}`}
              key={user.id}
              type="text"
              onClick={() => actions.selectUser(user.id)}
            >
              <span className="member-identity">
                <i>{(user.displayName ?? user.email).slice(0, 1)}</i>
                <span>
                  <strong>{user.displayName ?? user.email}</strong>
                  <small>{user.email}</small>
                </span>
              </span>
              <Tag className={`badge role-${user.role}`}>{roleNames[user.role]}</Tag>
              <Tag className={`badge status-${user.status}`}>{statusNames[user.status]}</Tag>
              <span className="last-seen">{formatDate(user.lastLoginAt)}</span>
            </Button>
          ))}
        </div>
      </div>

      <aside className="member-detail">
        {selectedUser ? (
          <>
            <div className="detail-heading">
              <Tag className={`badge status-${selectedUser.status}`}>
                {statusNames[selectedUser.status]}
              </Tag>
              <h2>{selectedUser.displayName ?? selectedUser.email}</h2>
              <p>{selectedUser.email}</p>
              <small>最近登录：{formatDate(selectedUser.lastLoginAt)}</small>
              <Link
                className="m3-link member-audit-link"
                to={`/audit?resourceType=user&resourceId=${selectedUser.id}`}
              >
                查看该成员的审计日志
              </Link>
            </div>
            <div className="detail-section-heading">
              <strong>权限范围</strong>
            </div>
            <div className="permission-card">
              <h3>{roleNames[selectedUser.role]}权限</h3>
              <ul>
                {permissions[selectedUser.role].map((item) => (
                  <li key={item}>✓&nbsp;&nbsp;{item}</li>
                ))}
              </ul>
            </div>
            <div className="role-editor">
              <label htmlFor="member-role">当前角色</label>
              <div>
                <Select
                  aria-label="当前角色"
                  disabled={protectsLastAdmin || busy || writeDisabled}
                  id="member-role"
                  options={[
                    { label: "管理员", value: "admin" },
                    { label: "操作员", value: "operator" },
                    { label: "只读成员", value: "viewer" },
                  ]}
                  value={selectedRole}
                  onChange={actions.changeRole}
                />
                <Button
                  disabled={
                    busy || writeDisabled || protectsLastAdmin || selectedRole === selectedUser.role
                  }
                  loading={busy}
                  type="primary"
                  onClick={actions.saveRole}
                >
                  保存角色
                </Button>
              </div>
              <p className="muted-copy">
                改为{roleNames[selectedRole]}后：{permissions[selectedRole].join("；")}。
                {selectedRole === "viewer"
                  ? " 保存后将不能配置策略或发起任务。"
                  : " 保存后立即生效。"}
              </p>
            </div>
            {!protectsLastAdmin ? (
              <div className="member-danger-row">
                <Button
                  danger={selectedUser.status !== "disabled"}
                  disabled={busy || writeDisabled}
                  loading={busy}
                  onClick={actions.toggleStatus}
                >
                  {selectedUser.status === "disabled" ? "启用成员" : "停用成员"}
                </Button>
              </div>
            ) : null}
          </>
        ) : (
          <Empty
            description={searchActive ? "搜索无匹配成员" : "尚无成员"}
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          />
        )}
      </aside>
    </section>
  );
}

type InvitationWorkspaceState = {
  busy: boolean;
  filteredInvitations: InvitationRow[];
  loading: boolean;
  searchActive: boolean;
  selectedInvitationRow: InvitationRow | null;
  writeDisabled: boolean;
};

type InvitationWorkspaceActions = {
  resend: (invitation: Invitation) => void;
  revoke: (invitation: Invitation) => void;
  selectInvitation: (id: number) => void;
};

export function InvitationWorkspace({
  actions,
  state,
}: {
  actions: InvitationWorkspaceActions;
  state: InvitationWorkspaceState;
}) {
  const { busy, filteredInvitations, loading, searchActive, selectedInvitationRow, writeDisabled } =
    state;

  return (
    <section
      aria-label="邀请列表与详情"
      className="member-workspace invitation-workspace"
      id="invitations-view-panel"
    >
      <div className="member-list">
        <div className="member-list-title">
          <strong>邀请</strong>
        </div>
        <div className="invitation-table-head">
          <span>受邀邮箱</span>
          <span>角色</span>
          <span>状态</span>
          <span>状态时间</span>
        </div>
        <div className="member-rows">
          {loading ? (
            <div className="empty-state">
              <Spin /> 正在加载邀请…
            </div>
          ) : null}
          {!loading && filteredInvitations.length === 0 ? (
            <Empty
              description={searchActive ? "搜索无匹配邀请" : "尚无邀请"}
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            />
          ) : null}
          {filteredInvitations.map(({ invitation, status }) => (
            <Button
              aria-label={`${invitation.email}，${invitationStatusNames[status]}`}
              className={`invitation-row ${invitation.id === selectedInvitationRow?.invitation.id ? "selected" : ""}`}
              key={invitation.id}
              type="text"
              onClick={() => actions.selectInvitation(invitation.id)}
            >
              <span className="member-identity">
                <i>{invitation.email.slice(0, 1)}</i>
                <span>
                  <strong>{invitation.email}</strong>
                  <small>邀请 #{invitation.id}</small>
                </span>
              </span>
              <Tag className={`badge role-${invitation.role}`}>{roleNames[invitation.role]}</Tag>
              <Tag className={`badge invitation-status--${status}`}>
                {invitationStatusNames[status]}
              </Tag>
              <span className="invitation-time">{invitationTimeline(invitation, status)}</span>
            </Button>
          ))}
        </div>
      </div>

      <aside className="member-detail">
        {selectedInvitationRow ? (
          <>
            <div className="detail-heading">
              <Tag className={`badge invitation-status--${selectedInvitationRow.status}`}>
                {invitationStatusNames[selectedInvitationRow.status]}
              </Tag>
              <h2>{selectedInvitationRow.invitation.email}</h2>
              <p>受邀角色：{roleNames[selectedInvitationRow.invitation.role]}</p>
              <small>
                {invitationTimeline(selectedInvitationRow.invitation, selectedInvitationRow.status)}
              </small>
            </div>
            <div className="detail-section-heading">
              <strong>邀请权限</strong>
            </div>
            <div className="permission-card">
              <h3>{roleNames[selectedInvitationRow.invitation.role]}权限</h3>
              <ul>
                {permissions[selectedInvitationRow.invitation.role].map((item) => (
                  <li key={item}>✓&nbsp;&nbsp;{item}</li>
                ))}
              </ul>
            </div>
            <div className="invitation-actions">
              {canResendInvitation(selectedInvitationRow.status) ? (
                <Button
                  disabled={busy || writeDisabled}
                  loading={busy}
                  onClick={() => actions.resend(selectedInvitationRow.invitation)}
                >
                  重新发送
                </Button>
              ) : null}
              {canRevokeInvitation(selectedInvitationRow.status) ? (
                <Button
                  danger
                  disabled={busy || writeDisabled}
                  onClick={() => actions.revoke(selectedInvitationRow.invitation)}
                >
                  撤销邀请
                </Button>
              ) : null}
              {!canResendInvitation(selectedInvitationRow.status) &&
              !canRevokeInvitation(selectedInvitationRow.status) ? (
                <span>当前状态无需操作</span>
              ) : null}
            </div>
          </>
        ) : (
          <Empty
            description={searchActive ? "搜索无匹配邀请" : "尚无邀请"}
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          />
        )}
      </aside>
    </section>
  );
}
