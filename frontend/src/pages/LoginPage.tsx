import { type FormEvent, useEffect, useRef, useState } from "react";
import { Alert, Button, Form, Input } from "antd";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";

import { ApiError } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { AuthPageFrame } from "../components/login/AuthPageFrame";
import { PRODUCT_NAME } from "../config/product";

interface LoginValues {
  email: string;
  password: string;
}

export function LoginPage() {
  const { clearSession, login, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form] = Form.useForm<LoginValues>();
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const pending = useRef(false);
  const routeState = location.state as {
    from?: string;
    passwordChanged?: boolean;
    passwordReset?: boolean;
  } | null;
  const requested = routeState?.from;
  const successMessage = routeState?.passwordChanged
    ? "密码已修改，请使用新密码登录"
    : routeState?.passwordReset
      ? "密码已重置，请使用新密码登录"
      : "";

  useEffect(() => {
    if (successMessage) clearSession();
  }, [clearSession, successMessage]);

  if (user && !successMessage) {
    return <Navigate replace to={requested ?? "/"} />;
  }

  function syncAutofilledValues(event: FormEvent<HTMLFormElement>) {
    if (pending.current) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    // 密码管理器可能没有触发输入事件，校验前以浏览器实际填入的值为准。
    const formData = new FormData(event.currentTarget);
    form.setFieldsValue({
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
    });
  }

  async function handleSubmit(values: LoginValues) {
    if (pending.current) return;
    pending.current = true;
    setError("");
    setSubmitting(true);
    try {
      await login(values.email, values.password);
      navigate(requested ?? "/", { replace: true });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "登录失败，请稍后重试");
    } finally {
      pending.current = false;
      setSubmitting(false);
    }
  }

  return (
    <AuthPageFrame title={PRODUCT_NAME}>
      {successMessage ? (
        <Alert
          className="seekway-login__feedback seekway-login__feedback--before-form"
          role="status"
          title={successMessage}
          type="success"
          showIcon
        />
      ) : null}
      <Form<LoginValues>
        form={form}
        name="login"
        layout="vertical"
        requiredMark={false}
        disabled={submitting}
        noValidate
        validateTrigger="onBlur"
        scrollToFirstError={{ focus: true }}
        onSubmitCapture={syncAutofilledValues}
        onFinish={handleSubmit}
      >
        <Form.Item
          name="email"
          label="邮箱"
          rules={[
            { required: true, whitespace: true, message: "请输入邮箱" },
            { type: "email", message: "请输入有效的邮箱地址" },
          ]}
        >
          <Input autoComplete="email" name="email" placeholder="name@example.com" type="email" />
        </Form.Item>
        <Form.Item name="password" label="密码" rules={[{ required: true, message: "请输入密码" }]}>
          <Input.Password
            autoComplete="current-password"
            name="password"
            placeholder="请输入密码"
          />
        </Form.Item>
        <div className="seekway-login__password-help">
          <Link to="/forgot-password">忘记密码？</Link>
        </div>
        <Button autoInsertSpace={false} block htmlType="submit" loading={submitting} type="primary">
          {submitting ? "登录中…" : "登录"}
        </Button>
      </Form>
      <div aria-live="polite" aria-atomic="true">
        {error ? (
          <Alert className="seekway-login__feedback" title={error} type="error" showIcon />
        ) : null}
      </div>
      <p className="seekway-login__help">仅限受邀成员使用。</p>
    </AuthPageFrame>
  );
}
