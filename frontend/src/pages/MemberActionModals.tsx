import { useRef } from "react";
import { Alert, Button, Form, Input, Modal as AntdModal, Select, type InputRef } from "antd";

import type { UserRole } from "../api/types";
import { permissions, roleNames, type PendingConfirmation } from "./memberAccessModel";

export function InviteMemberModal({
  busy,
  error,
  open,
  onClose,
  onSubmit,
}: {
  busy: boolean;
  error: string;
  open: boolean;
  onClose: () => void;
  onSubmit: (email: string, role: UserRole) => Promise<boolean>;
}) {
  const [form] = Form.useForm<{ email: string; role: UserRole }>();
  const emailInputRef = useRef<InputRef>(null);
  const role = Form.useWatch("role", form) ?? "operator";

  return (
    <AntdModal
      centered
      destroyOnHidden
      footer={null}
      open={open}
      rootClassName="invite-member-modal"
      title="邀请成员"
      width={480}
      afterOpenChange={(isOpen) => {
        if (isOpen) emailInputRef.current?.focus();
      }}
      onCancel={onClose}
    >
      <Form
        clearOnDestroy
        className="invite-member-form"
        form={form}
        layout="vertical"
        onFinish={(values) => void onSubmit(values.email, values.role)}
      >
        <Form.Item
          htmlFor="invite-email"
          label="邮箱"
          name="email"
          rules={[
            { message: "请输入邮箱地址", required: true },
            { message: "请输入有效的邮箱地址", type: "email" },
          ]}
        >
          <Input
            id="invite-email"
            placeholder="name@example.com"
            ref={emailInputRef}
            type="email"
          />
        </Form.Item>
        <Form.Item
          extra={
            <span className="invite-role-description">
              {roleNames[role]}：{permissions[role].join("；")}。
            </span>
          }
          htmlFor="invite-role"
          initialValue="operator"
          label="角色"
          name="role"
        >
          <Select
            id="invite-role"
            options={[
              { label: "管理员", value: "admin" },
              { label: "操作员", value: "operator" },
              { label: "只读成员", value: "viewer" },
            ]}
            virtual={false}
          />
        </Form.Item>
        <p className="invite-note">将向该邮箱发送一次性注册链接；过期后可重新发送。</p>
        {error ? <Alert title={error} type="error" /> : null}
        <div className="invite-member-actions">
          <Button autoInsertSpace={false} htmlType="button" onClick={onClose}>
            取消
          </Button>
          <Button
            aria-label={busy ? "发送中…" : "发送邀请"}
            autoInsertSpace={false}
            disabled={busy}
            htmlType="submit"
            loading={busy}
            type="primary"
          >
            {busy ? "发送中…" : "发送邀请"}
          </Button>
        </div>
      </Form>
    </AntdModal>
  );
}

export function ConfirmationModal({
  busy,
  confirmation,
  error,
  isSelf,
  onClose,
  onConfirm,
}: {
  busy: boolean;
  confirmation: PendingConfirmation;
  error: string;
  isSelf: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const isDisable = confirmation.kind === "disable";
  const isDemote = confirmation.kind === "demote";
  const title = isDisable ? "确认停用成员" : isDemote ? "确认调整管理员角色" : "确认撤销邀请";
  const target =
    confirmation.kind === "revoke"
      ? confirmation.invitation.email
      : `${confirmation.user.displayName ?? confirmation.user.email}（${confirmation.user.email}）`;
  const impact = isDisable
    ? "该账号的现有会话会立即失效，重新启用前不能登录。"
    : isDemote
      ? `该账号将改为${roleNames[confirmation.role]}，并失去管理员专属权限。`
      : "该注册链接会立即失效，受邀人将无法再用它完成注册。";
  const confirmLabel = isDisable ? "确认停用" : isDemote ? "确认调整" : "确认撤销";

  return (
    <AntdModal centered footer={null} open title={title} width={480} onCancel={onClose}>
      <div className="confirmation-target">
        <span>对象</span>
        <strong>{target}</strong>
      </div>
      <p className="confirmation-impact">
        <strong>影响：</strong>
        {impact}
      </p>
      {isSelf ? (
        <Alert
          className="confirmation-warning"
          title={
            isDisable
              ? "这是你当前登录的账号。确认后当前会话也会失效，需要其他管理员重新启用。"
              : "这是你当前登录的账号。确认后你将失去成员与权限管理能力。"
          }
          type="warning"
        />
      ) : null}
      {error ? <Alert title={error} type="error" /> : null}
      <div className="modal-actions">
        <Button autoFocus autoInsertSpace={false} disabled={busy} onClick={onClose}>
          取消
        </Button>
        <Button danger disabled={busy} loading={busy} type="primary" onClick={onConfirm}>
          {busy ? "处理中…" : confirmLabel}
        </Button>
      </div>
    </AntdModal>
  );
}
