# SEEKWAY Data Hub 完整实施方案

> 现行部署基线覆盖说明（2026-08-26）：根目录 `AGENTS.md` 已确认生产继续使用
> 阿里云 ECS + systemd，不引入 Docker。本文早期 M4 中的 Dockerfile、
> Compose 和镜像发布条目已失效；后续实施以 ECS 原生 FastAPI/Worker 服务、Nginx
> 静态资源与反向代理为准。legacy cron 只允许存在于尚未完成的平台割接期，不属于最终生产架构。

> 文档状态：M1～M4 本地 MVP 已实施，外部迁移与 ECS 发布待授权验证
> 适用范围：桌面端 Web 管理后台
> 技术规范：[seekway-codex-standards](https://github.com/songtu2025/seekway-codex-standards)
> 设计基线：Figma [P6 开发里程碑](https://www.figma.com/design/BvwiR3NqdZjcWJrPSbd3so?node-id=112-432)、[P5 系统架构](https://www.figma.com/design/BvwiR3NqdZjcWJrPSbd3so?node-id=107-432)

## 1. 方案结论

本项目最终交付“支持多积加账号、接口级同步策略、定时任务、运行追踪和权限管理的数据同步管理平台”。生产业务只通过 Web、Scheduler、数据库任务队列和 Worker 运行，不再直接使用第一阶段 CLI 或 cron 同步数据。

项目只有两个宏观阶段：

1. **积加 API 同步工具（历史基础）**：沉淀鉴权、请求、分页、重试、落库和 checkpoint 能力，不再作为最终产品入口。
2. **SEEKWAY 数据接入中心（当前且唯一目标）**：积加作为首个数据源连接器，复用第一阶段同步内核，对外提供账号、策略、调度、任务、权限、审计和查询能力。

本方案中的阶段 0、M1～M4 都是第二阶段内部里程碑，不是新的宏观项目阶段。

第一版采用以下最小可维护架构：

- 前端：React、TypeScript、Vite。
- 后端：FastAPI、Pydantic、SQLAlchemy、Alembic。
- 数据库：继续使用 PolarDB MySQL，不新增 PostgreSQL。
- Worker：独立 Python 进程，通过 MySQL 任务表取任务。
- 调度：Worker 根据数据库中的同步策略生成任务。
- 队列：使用数据库任务队列，不引入 Redis、Celery、RabbitMQ。
- 登录：管理员邀请，用户通过邮箱设置密码完成注册；不接入第三方登录。
- 会话：服务端 Session Cookie，不在 `localStorage` 保存登录令牌。
- 部署：生产环境使用 ECS 原生 systemd + Nginx；开发、测试环境在 Windows 电脑运行。
- 同步内核：复用现有 `app/sync_engine.py` 等模块，不重写已验证的同步能力。

该架构优先解决当前业务问题，并保留以后拆分调度器、队列或多个 Worker 的空间，但第一版不提前引入这些复杂度。

## 2. 项目定位

### 2.1 服务定位

这是一个面向内部运营、数据和技术人员的 SEEKWAY 数据接入中心，当前以积加作为首个数据源连接器，负责：

1. 管理多个积加开放平台账号。
2. 管理每个账号、每个接口的同步策略。
3. 手动或定时生成同步任务。
4. 调用现有同步引擎，将积加原始 JSON 数据同步到 PolarDB MySQL。
5. 展示任务、批次、接口执行、失败请求和原始数据。
6. 通过角色权限和审计日志控制敏感操作。

### 2.2 第一版目标

- 用户可通过管理员邀请完成注册和登录。
- 管理员或操作员可接入新的积加 API 账号并验证凭证。
- 用户可为每个账号的每个接口配置启停和同步计划。
- 用户可手动触发同步，并获得可追踪的 `jobId`。
- Worker 可执行手动任务和到期的定时任务。
- 多账号数据在原始数据、checkpoint、批次和日志中完全隔离。
- 用户可从桌面端查看同步状态、错误和原始数据。
- 生产环境可通过 ECS 原生 systemd + Nginx 部署并可回滚。

### 2.3 第一版不做

- 不适配手机端和平板端。
- 不提供用户自行注册入口。
- 不接入微信、企业微信、钉钉、Google、GitHub 等第三方登录。
- 不允许用户在页面中随意填写未知接口路径、分页规则或限流规则。
- 不引入多租户计费、订阅或组织体系。
- 不做分布式任务调度和并行 Worker 集群。
- 不在第一版重构所有现有同步代码或结构化全部业务数据。
- 不把生产 PolarDB、SMTP 或积加真实密钥写入仓库。

## 3. 当前项目基线与复用原则

### 3.1 已有能力

第一阶段已经沉淀以下可复用能力：

- 积加 Token 获取、缓存和 401 后刷新。
- GET、POST 请求封装。
- 分页、限流、失败重试和日期窗口处理。
- YAML 接口配置加载。
- 原始 JSON 幂等写入。
- `sync_batch`、`sync_api_log`、`sync_checkpoint`、`failed_request_log` 记录。
- 单接口、全部启用接口、Mock、探测和数据库检查等 CLI 模式。
- MySQL 命名锁 `jijia_polardb_sync_task`，可防止同步任务并发执行。
- 按页提交等长任务事务优化。

### 3.2 复用原则

1. Web API 和 Worker 调用现有 `SyncEngine`，不复制同步逻辑。
2. YAML/数据库中的接口目录继续描述官方接口契约。
3. Web 层只增加账号、策略、任务、权限和查询能力。
4. 先保留根目录 `app/`，避免在 Web 化同时搬迁同步内核。
5. 平台生产验收稳定后，再单独评估是否移动包目录；这不属于本次必做项。

## 4. 必须先解决的数据边界

当前同步表的唯一键主要按 `api_code` 区分，适用于单账号，但不适用于多积加账号。例如：

- `raw_api_data` 当前唯一键为 `(api_code, source_primary_key)` 和 `(api_code, data_hash)`。
- `sync_checkpoint` 当前唯一键为 `api_code`。

两个积加账号可能返回相同业务主键或相同 JSON。如果不增加账号维度，第二个账号的数据会覆盖或冲突，checkpoint 也会互相影响。

因此，多账号功能上线前必须完成以下迁移：

```text
raw_api_data:
  UNIQUE (jijia_account_id, api_code, source_primary_key)
  UNIQUE (jijia_account_id, api_code, data_hash)

sync_checkpoint:
  UNIQUE (jijia_account_id, api_code)
```

`sync_batch`、`sync_api_log`、`failed_request_log` 也必须增加账号和任务上下文。这个迁移是 Web 服务上线的前置条件，不能延期。

## 5. 目标架构

```text
桌面浏览器
    |
    | HTTPS
    v
Nginx
    |----------------------> React 静态资源
    |
    | /api/v1/*
    v
FastAPI
    |-- 身份认证与权限
    |-- 积加账号管理
    |-- 接口同步策略
    |-- 创建/查询同步任务
    |-- 批次、日志、原始数据查询
    |
    v
PolarDB MySQL <--------------------------+
    |                                    |
    | sync_job 队列、策略、业务数据       |
    v                                    |
独立 Worker -----------------------------+
    |-- 生成到期定时任务
    |-- 领取 queued 任务
    |-- 解密指定账号凭证
    |-- 获取 accessToken
    |-- 调用现有 SyncEngine
    |-- 更新 job、batch、日志、checkpoint
    v
积加开放平台 API
```

### 5.1 进程职责

| 进程 | 职责 | 禁止承担的职责 |
| --- | --- | --- |
| Nginx | TLS、静态资源、反向代理、基础限流 | 不执行业务逻辑 |
| FastAPI | 鉴权、配置、查询、创建任务 | 不在 HTTP 请求内执行长同步 |
| Worker | 调度、领取任务、调用同步内核 | 不提供外部 HTTP 管理接口 |
| PolarDB | 配置、队列、同步数据、日志 | 不保存明文密码和明文积加密钥 |

### 5.2 长任务响应

手动同步接口只创建任务，立即返回：

```http
HTTP/1.1 202 Accepted
Content-Type: application/json

{
  "data": {
    "jobId": "01J...",
    "status": "queued"
  },
  "requestId": "01J..."
}
```

前端通过任务详情接口轮询状态。第一版不需要 WebSocket；建议运行中每 3 秒轮询，任务完成后停止。

## 6. 目标目录结构

```text
seekway-data-hub/
  app/                              # 现有同步内核，第一版保留
  config/                           # 积加官方接口目录及示例配置
  sql/                              # 当前初始化 SQL，保留用于基线参考
  tests/                            # 现有同步内核测试

  backend/
    app/
      main.py                       # FastAPI 应用入口
      cli.py                        # 首个管理员等运维命令
      api/
        deps.py
        v1/
          auth.py
          users.py
          invitations.py
          jijia_accounts.py
          api_policies.py
          sync_jobs.py
          sync_runs.py
          raw_data.py
          dashboard.py
          audit_logs.py
      core/
        config.py
        database.py
        security.py
        logging.py
        errors.py
      models/
      schemas/
      repositories/
      services/
        auth_service.py
        mail_service.py
        credential_service.py
        policy_service.py
        job_service.py
        sync_adapter.py
      worker/
        main.py
        scheduler.py
        job_runner.py
        recovery.py
    migrations/
      env.py
      versions/
    tests/
      unit/
      integration/
      api/
    alembic.ini

  frontend/
    src/
      app/
      pages/
      components/
      features/
      lib/
      styles/
    tests/
    package.json
    vite.config.ts

  scripts/
    setup.ps1
    dev-api.ps1
    dev-worker.ps1
    dev-web.ps1
    check.ps1

  config/ecs/
    seekway-datahub-api.service.example
    seekway-datahub-scheduler.service.example
    seekway-datahub-worker@.service.example
    nginx.conf.example
  .env.example
  .env.migration.example
```

`backend` 可直接从仓库根目录导入现有 `app` 包。实施期间不同时进行“大搬家”和“功能开发”，以降低回归风险。

## 7. 技术栈与依赖计划

以下依赖只在用户确认开始实施后加入，本文档阶段不修改依赖文件。

### 7.1 后端运行依赖

```text
fastapi
uvicorn[standard]
alembic
argon2-cffi
cryptography
email-validator
```

继续使用现有依赖：

```text
requests
SQLAlchemy
PyMySQL
pydantic
pydantic-settings
python-dotenv
PyYAML
tzdata
```

### 7.2 后端开发依赖

```text
pytest
pytest-cov
httpx
ruff
mypy
```

### 7.3 前端依赖

运行依赖：

```text
react
react-dom
react-router-dom
```

开发依赖：

```text
typescript
vite
eslint
vitest
@testing-library/react
@testing-library/user-event
playwright
```

第一版使用原生 `fetch` 封装 API 请求，不默认引入 Axios、Redux 或复杂状态框架。出现明确的缓存、并发请求或跨页面状态需求后再决定是否增加。

## 8. 环境方案

### 8.1 开发环境：Windows，无 Docker

要求：

- Python 3.11+。
- Node.js LTS。
- PowerShell 7 优先。
- 可访问独立的开发 MySQL 8/PolarDB 开发库。
- 不允许连接生产数据库进行开发。

启动方式：

```powershell
.\scripts\setup.ps1
.\scripts\dev-api.ps1
.\scripts\dev-worker.ps1
.\scripts\dev-web.ps1
```

三个开发进程分别运行。API 和前端支持热更新，Worker 使用开发数据库队列。

邮件使用 `console` 适配器，但邀请链接只能输出到启动 Worker/API 的本地终端，不写入应用日志文件。开发账号不得使用生产邮箱名单。

### 8.2 测试环境：Windows，无 Docker

- 使用独立测试数据库或临时测试 schema。
- 默认使用 Mock 积加响应，不访问真实生产账号。
- 使用 Fake MailSender 捕获邮件内容供测试断言。
- 集成测试每次运行前应用 Alembic migration，测试后清理本次数据。
- E2E 使用 Playwright 启动本地 API 和 Vite 测试服务。

### 8.3 生产环境：ECS 原生服务

PolarDB 是外部托管数据库。第一版不启动 Redis，也不引入容器运行时。

部署约束：

- Nginx 是唯一暴露公网端口的服务。
- API 和 Worker 使用同一发布目录、不同 systemd unit 和启动命令。
- API 仅监听 `127.0.0.1:8000`；前端由 `npm ci && npm run build` 生成静态资源并交给 Nginx。
- migration 由部署命令单次执行，不能由多个 API/Worker 启动时自动抢跑。
- Worker 第一版固定一个 systemd 实例，并用 `flock` 防止重复启动。
- 运行 `.env` 与迁移 `.env.migration` 分离；systemd 只能读取最小权限运行配置。
- API、Worker 使用非 root 服务用户，日志输出到 journald。

### 8.4 规范在 Windows 的执行方式

Windows 使用 `scripts/check.ps1` 完成本地代码门禁。Linux/ECS 发布前另执行只读 `release_preflight`、`systemd-analyze verify` 和 `nginx -t`；这些外部检查未执行时必须明确记录，不能把跳过伪装成通过。

## 9. 配置和密钥

### 9.1 新增配置项

| 配置项 | 用途 | 示例是否可入库 |
| --- | --- | --- |
| `PUBLIC_WEB_URL` | 邮件链接对应的公开地址 | 可放占位符 |
| `SESSION_COOKIE_NAME` | Session Cookie 名称 | 可 |
| `SESSION_ABSOLUTE_HOURS` | 会话绝对有效期，默认 12 小时 | 可 |
| `SESSION_IDLE_MINUTES` | 会话空闲有效期，默认 120 分钟 | 可 |
| `INVITATION_TTL_HOURS` | 邀请有效期，默认 24 小时 | 可 |
| `PASSWORD_RESET_TTL_MINUTES` | 已正式延后，当前不读取 | 可 |
| `PASSWORD_MIN_LENGTH` | 密码最小长度，默认 12 | 可 |
| `CREDENTIAL_ENCRYPTION_KEY` | 积加凭证字段加密主密钥 | 不可 |
| `MAIL_PROVIDER` | `smtp`、`console` 或 `fake` | 可 |
| `SMTP_HOST`、`SMTP_PORT` | SMTP 服务 | 仅占位符 |
| `SMTP_USER`、`SMTP_PASSWORD` | SMTP 凭证 | 不可 |
| `SMTP_FROM` | 发件人 | 可放示例 |
| `WORKER_POLL_SECONDS` | Worker 轮询间隔，默认 3 秒 | 可 |
| `WORKER_HEARTBEAT_SECONDS` | 心跳间隔，默认 30 秒 | 可 |
| `WORKER_STALE_MINUTES` | 任务失联阈值，默认 10 分钟 | 可 |

### 9.2 密钥规则

- 密码只保存 Argon2id 哈希。
- 邀请和 Session 的原始令牌只发送给客户端，数据库只保存 SHA-256 哈希。
- 积加 `appId`、`appKey` 使用 `CREDENTIAL_ENCRYPTION_KEY` 加密后保存。
- `CREDENTIAL_ENCRYPTION_KEY` 不进入数据库、日志、镜像或 Git。
- API 响应不返回积加密钥明文；账号列表只显示脱敏标识。
- 生产环境禁止 `MAIL_PROVIDER=console`，配置错误时启动失败。
- 日志统一脱敏 `password`、`token`、`authorization`、`cookie`、`appKey` 和密钥字段。

## 10. 用户、邀请和登录

### 10.1 首个管理员

系统不开放首个用户自助注册。首次部署后由运维执行：

```powershell
.\.venv\Scripts\python.exe -m backend.app.cli bootstrap-admin --email admin@example.com
```

命令只在系统不存在有效管理员时创建一次性管理员邀请。它不会要求运维在命令行输入或保存管理员密码。

### 10.2 邀请注册流程

```text
管理员填写邮箱和角色
  -> 服务端生成 256 位随机令牌
  -> 数据库保存令牌 SHA-256 哈希和过期时间
  -> 邮件发送一次性链接
  -> 用户打开注册页并设置密码
  -> 服务端验证邮箱、令牌、状态和有效期
  -> 创建/激活用户，令牌标记为已使用
  -> 创建 Session，进入系统
```

邮件链接采用 URL Fragment：

```text
https://sync.example.com/register#token=<raw-token>
```

Fragment 不会随首个页面请求发送给 Nginx，减少令牌进入访问日志的风险。前端读取令牌后，通过 POST 请求体提交验证和注册。

规则：

- 邮箱统一去首尾空格并转小写，数据库唯一。
- 邀请默认 24 小时有效，可配置。
- 邀请单次使用。
- 重新发送邀请时废弃旧邀请。
- 管理员可撤销未使用邀请。
- 已存在用户不能通过邀请覆盖密码或角色。
- 密码默认至少 12 位，使用 Argon2id 哈希。

### 10.3 Session 和 CSRF

- Session 原始 ID 使用至少 256 位安全随机数。
- 数据库只保存 Session ID 哈希。
- 生产 Cookie 名称建议 `__Host-jijia_session`。
- Cookie 属性：`Secure`、`HttpOnly`、`SameSite=Lax`、`Path=/`。
- 默认绝对有效期 12 小时、空闲有效期 2 小时，均可配置。
- 登录、登出、改密、禁用用户时撤销相关 Session。
- `/auth/session` 返回 CSRF Token，前端只保存在内存。
- 所有修改状态的请求必须携带 `X-CSRF-Token`。
- 登录接口由 Nginx 限流，用户表记录失败次数和短期锁定时间。

### 10.4 忘记密码

忘记密码和密码重置已正式延后，M1/M2 均不实现；后续须另立里程碑确认接口、安全规则和页面后再开发。

### 10.5 邮件适配器

定义统一 `MailSender` 接口：

- `SmtpMailSender`：生产环境。
- `ConsoleMailSender`：仅本地开发。
- `FakeMailSender`：自动化测试。

业务服务不能直接依赖某个 SMTP SDK，避免以后切换邮件服务时修改邀请逻辑。

## 11. 权限模型

第一版固定三个角色：

| 功能 | Admin | Operator | Viewer |
| --- | --- | --- | --- |
| 登录、查看个人信息 | 允许 | 允许 | 允许 |
| 查看仪表盘 | 允许 | 允许 | 允许 |
| 查看积加账号脱敏信息 | 允许 | 允许 | 允许 |
| 新增、验证、停用积加账号 | 允许 | 允许 | 禁止 |
| 查看接口策略 | 允许 | 允许 | 允许 |
| 修改接口策略 | 允许 | 允许 | 禁止 |
| 手动触发、重试同步 | 允许 | 允许 | 禁止 |
| 查看任务和接口日志 | 允许 | 允许 | 允许 |
| 查看完整原始 JSON | 允许 | 允许 | 禁止 |
| 邀请、禁用用户、修改角色 | 允许 | 禁止 | 禁止 |
| 查看审计日志 | 允许 | 禁止 | 禁止 |

后端是权限最终执行者，前端隐藏按钮只用于改善体验，不能替代后端鉴权。

## 12. 新积加 API 账号接入

### 12.1 用户操作流程

1. 进入“积加账号”。
2. 点击“接入账号”。
3. 填写账号名称、`appId`、`appKey`。
4. 后端加密保存凭证，返回账号 ID 和脱敏信息。
5. 用户点击“验证连接”。
6. Worker/API 使用该账号凭证进行一次官方 Token 请求，超时不超过 30 秒。
7. 成功后账号状态变为 `active`，并生成该账号的默认接口策略。
8. 用户进入“接口策略”，启用需要同步的接口并配置计划。

验证只证明凭证可获得 Token，不应自动执行全量同步。

### 12.2 代码改造要求

现有认证配置主要从全局环境变量读取。多账号上线时需要：

- `AuthClient` 接收账号凭证对象，而不是只依赖全局 `Settings`。
- Worker 按 `jijia_account_id` 解密凭证并创建客户端。
- accessToken 仅在 Worker 内存中按账号缓存，不把 Web 账号 Token 写入共享文件。
- 保留环境变量凭证作为旧 CLI 的 `legacy_default` 账号兼容来源。

### 12.3 凭证更新

用户更新 `appKey` 时：

- 只能提交新值，接口不回显旧值。
- 更新后账号状态先变为 `pending_verification`。
- 验证通过后恢复 `active`。
- 更新操作写入审计日志，但审计内容不包含明文密钥。

## 13. 每个接口的同步策略

用户可以配置每个账号、每个接口的同步策略，但不能修改积加官方接口契约。

### 13.1 两层配置

```text
接口目录（平台级、受代码和官方文档控制）
  method、path、分页、参数来源、限流、官方能力、主键规则

账号接口策略（用户可配置）
  enabled、schedule_mode、schedule_expr、timezone、窗口策略
```

最终执行配置：

```text
effective_config = 官方接口目录 + 允许覆盖的账号策略字段
```

用户不得通过页面修改：

- URL 和 HTTP 方法。
- 认证方式。
- 分页字段和官方最大页大小。
- 限流值。
- 未经官方文档确认的参数。
- 原始数据主键推断规则。

### 13.2 可配置字段

| 字段 | 说明 |
| --- | --- |
| `enabled` | 是否参与定时同步 |
| `schedule_mode` | `manual_only`、`daily`、`cron` |
| `schedule_expr` | 每日时间或受限 Cron 表达式 |
| `timezone` | 默认 `Asia/Shanghai` |
| `window_mode` | 接口支持时可选 checkpoint、固定回看天数或指定起始日期 |
| `lookback_days` | 固定回看天数 |
| `start_date` | 首次同步起始日期 |
| `next_run_at` | 服务端计算的下次执行时间，只读展示 |

如果接口目录未声明支持日期窗口，页面必须禁用相关选项。不能凭经验给接口增加日期参数。

### 13.3 策略保存校验

- 禁用策略时不再生成新的定时任务，不中断正在执行的任务。
- `manual_only` 不设置 `next_run_at`。
- `daily` 只允许一个本地时间。
- `cron` 第一版只接受 5 段表达式，并禁止高于系统允许频率的配置。
- 所有时间保存为 UTC，展示和计算时使用策略时区。
- 修改策略后重新计算 `next_run_at`，并写入审计日志。

## 14. 任务队列与 Worker

### 14.1 任务状态

```text
queued -> running -> success
                  -> partial_failed
                  -> failed
```

取消功能不进入第一版，避免在同步内核缺少安全中断点时产生半取消状态。

### 14.2 任务来源

- `manual`：用户手动触发。
- `schedule`：Worker 根据到期策略生成。
- `retry`：用户对失败任务发起重试。

### 14.3 生成任务

- 手动触发写入 `sync_job` 后返回 `202 + jobId`。
- 定时调度每轮查询 `next_run_at <= now()` 的启用策略。
- 同一策略、同一计划时间使用唯一 `schedule_slot_key` 防止重复创建。
- 重试生成新任务，并记录 `retry_of_job_id`，不覆盖旧任务历史。

### 14.4 领取任务

Worker 使用短事务领取任务：

1. 查询最早的 `queued` 任务。
2. 使用行锁或原子状态更新抢占。
3. 写入 `worker_id`、`started_at`、`heartbeat_at`。
4. 立即提交领取事务。
5. 在事务外执行长同步。

不能在整个网络同步期间持有领取事务或数据库行锁。

### 14.5 执行任务

```text
读取任务
  -> 检查账号 active
  -> 解密账号凭证
  -> 获取/刷新 accessToken
  -> 合并接口目录和账号策略
  -> 获取全局 MySQL 命名锁
  -> 创建 sync_batch
  -> 调用 SyncEngine
  -> 按现有逻辑写原始数据、日志、checkpoint
  -> 更新 sync_job 最终状态
  -> 释放命名锁
```

现有全局命名锁继续保留。第一版即使有多个账号，也串行执行同步，以保护积加限流和数据库稳定性。需要并行时应先基于生产数据评估，再把锁粒度调整到账号级。

### 14.6 心跳与异常恢复

- Worker 每 30 秒更新运行中任务心跳。
- Worker 启动时检查心跳超时的 `running` 任务。
- 如果任务尚未生成批次，可回到 `queued`，并增加 `attempt_count`。
- 如果已经生成批次但无法确认执行状态，标记 `failed`，由用户显式重试。
- 恢复动作写入任务错误信息和审计/结构化日志。
- 单个任务超过 `max_attempts` 后不再自动领取。

## 15. 数据模型和迁移

### 15.1 新增表

#### `app_user`

```text
id, email, display_name, password_hash, role, status,
failed_login_count, locked_until, last_login_at,
created_at, updated_at
```

约束：`email` 唯一；`role` 为 `admin/operator/viewer`；`status` 为 `invited/active/disabled`。

#### `auth_action_token`

```text
id, user_id, email, purpose, token_hash, expires_at,
used_at, revoked_at, created_by, created_at, updated_at
```

当前 `purpose` 只使用 `invitation`；`password_reset` 已正式延后。`token_hash` 唯一，原始令牌不落库。

#### `user_session`

```text
id, user_id, session_hash, csrf_hash, expires_at,
idle_expires_at, last_seen_at, revoked_at,
ip_hash, user_agent_summary, created_at, updated_at
```

`session_hash` 唯一。IP 只保存不可逆摘要或不保存完整值。

#### `jijia_account`

```text
id, account_code, name, masked_app_id,
encrypted_app_id, encrypted_app_key, credential_source,
status, last_verified_at, last_verify_error,
created_by, updated_by, created_at, updated_at
```

新建账号必须具有加密凭证。只有迁移生成的 `legacy_default` 可以使用 `credential_source=environment_legacy` 且加密字段为空。

#### `account_api_policy`

```text
id, jijia_account_id, api_code, enabled,
schedule_mode, schedule_expr, timezone,
window_mode, lookback_days, start_date, next_run_at,
created_by, updated_by, created_at, updated_at
```

唯一键：`(jijia_account_id, api_code)`。

#### `sync_job`

```text
id, job_no, jijia_account_id, api_code,
trigger_type, status, priority, schedule_slot_key,
requested_by, retry_of_job_id, worker_id,
attempt_count, max_attempts, heartbeat_at,
sync_batch_no, error_code, error_message,
queued_at, started_at, finished_at, created_at, updated_at
```

`api_code` 为空表示同步该账号所有启用接口。`job_no` 唯一；非空 `schedule_slot_key` 唯一。

#### `audit_log`

```text
id, actor_user_id, action, resource_type, resource_id,
request_id, result, changes_json, created_at, updated_at
```

`changes_json` 只保存脱敏后的差异，不保存密码、令牌和积加密钥。

### 15.2 现有表修改

| 表 | 修改内容 |
| --- | --- |
| `api_config` | 继续作为全局接口目录，不按账号复制官方契约 |
| `sync_batch` | 增加 `jijia_account_id`、`sync_job_id` |
| `sync_api_log` | 增加 `jijia_account_id` |
| `raw_api_data` | 增加账号、记录身份、首次/最后观察时间和观察次数，重建账号级唯一键 |
| `sync_checkpoint` | 增加 `jijia_account_id`、`checkpoint_kind`，将 checkpoint 值改为 JSON，重建账号级唯一键 |
| `failed_request_log` | 增加 `jijia_account_id` |
| `raw_api_data_history` | 新增内容变化版本表；同账号、接口、记录身份和内容 hash 唯一 |

### 15.3 Alembic 迁移顺序

```text
0001_identity_and_session
0002_jijia_account_and_policy
0003_sync_job_and_audit
```

Alembic `0003_sync_job_and_audit` 只创建 `sync_job` 和 `audit_log`。既有同步表由受控入口
`python -m backend.app.migration_0003` 执行 `sql/migrations/0003_sync_scope_and_history.sql`，
二者都不能在生产自动运行。

受控同步表升级的安全步骤：

1. 停止 Worker/cron，创建可恢复快照或 PITR 恢复点。
2. 在隔离副本运行只读 preflight，确认 UTC、锁、旧结构、NULL 和 projected identity 冲突。
3. 同一迁移连接取得并验证 `jijia_polardb_sync_task` named lock，再重跑关键 preflight。
4. 给现有同步表增加可空账号及记录身份字段，把 legacy 行暂时标记为 `jijia_account_id=0`。
5. 重建账号级索引和 checkpoint JSON，创建空的 `raw_api_data_history`。
6. 精确核对目标结构、行摘要、ID 摘要和创建/更新时间边界；失败只使用快照/PITR 或演练过的前向修复。
7. 正数账号映射和首次历史版本补种不属于结构升级，必须在业务确认后单独执行。

迁移不能删除历史数据。上线前必须在生产备份副本或等规模测试库完成一次完整演练并记录耗时。

### 15.4 旧 CLI 过渡与退役

- 割接完成前，旧 CLI 继续从现有 `JIJIA_APP_ID`、`JIJIA_APP_KEY` 环境变量读取凭证，并默认写入 `jijia_account_id=0`。
- Web Worker 只执行正数账号，使用数据库中的加密凭证进行认证，不使用 legacy 环境凭证或本地 Token 缓存进行认证。
- 当前代码不会自动把账号 0 映射到正数账号；映射范围、目标账号和历史基线必须先确认。
- 把 legacy 行映射到正数账号时，必须同时停止对应旧 CLI 定时入口；否则下一次 cron 会再次写入账号 0，造成数据归属分裂。
- Web 新建账号不使用本地 Token 缓存文件。
- 在完成调度切换前旧 CLI 仅为受控过渡入口；同一账号和 API 只能由 legacy cron 或 Web Scheduler 中一个负责。
- 全部接口割接并通过生产验收后，停止 `--sync-enabled` cron，生产业务不再直接执行 `--sync-api` 或 `--test-api`；配置校验、连接检查、只读探测和迁移命令继续作为受控运维能力保留。

## 16. HTTP API 设计

统一前缀：`/api/v1`。

### 16.1 通用响应

成功：

```json
{
  "data": {},
  "requestId": "01J..."
}
```

列表：

```json
{
  "data": [],
  "page": {
    "cursor": null,
    "nextCursor": "...",
    "limit": 50
  },
  "requestId": "01J..."
}
```

错误：

```json
{
  "error": {
    "code": "ACCOUNT_CREDENTIAL_INVALID",
    "message": "积加账号验证失败",
    "details": null
  },
  "requestId": "01J..."
}
```

### 16.2 认证

```text
POST /auth/login
POST /auth/logout
GET  /auth/session
GET  /auth/me
POST /auth/invitations/validate
POST /auth/register
POST /auth/password/forgot
POST /auth/password/reset
```

### 16.3 用户和邀请

```text
GET   /users
PATCH /users/{userId}
POST  /invitations
GET   /invitations
POST  /invitations/{invitationId}/resend
POST  /invitations/{invitationId}/revoke
```

### 16.4 积加账号

```text
GET    /jijia-accounts
POST   /jijia-accounts
GET    /jijia-accounts/{accountId}
PATCH  /jijia-accounts/{accountId}
POST   /jijia-accounts/{accountId}/verify
POST   /jijia-accounts/{accountId}/deactivate
```

不提供返回明文凭证的接口。

### 16.5 接口目录与策略

```text
GET /api-catalog
GET /jijia-accounts/{accountId}/api-policies
PUT /jijia-accounts/{accountId}/api-policies/{apiCode}
```

### 16.6 同步任务和运行记录

```text
POST /sync-jobs
GET  /sync-jobs
GET  /sync-jobs/{jobId}
POST /sync-jobs/{jobId}/retry

GET  /sync-runs
GET  /sync-runs/{batchNo}
GET  /sync-runs/{batchNo}/api-logs
GET  /sync-runs/{batchNo}/failed-requests
```

### 16.7 原始数据和仪表盘

```text
GET /raw-data
GET /raw-data/{rawDataId}
GET /dashboard/summary
GET /audit-logs
```

所有列表必须支持账号筛选。原始数据列表默认不返回完整 `raw_json`，只有详情接口返回，防止列表响应过大。

## 17. 桌面端页面

| 路由 | 页面 | 主要功能 |
| --- | --- | --- |
| `/login` | 登录 | 邮箱、密码登录 |
| `/register` | 邀请注册 | 验证邀请、设置密码 |
| `/` | 仪表盘 | 账号状态、最近任务、失败接口、待处理提醒 |
| `/accounts` | 积加账号 | 新增、验证、更新、停用账号 |
| `/accounts/:id/policies` | 接口策略 | 接口级启停、计划和窗口策略 |
| `/jobs` | 同步任务 | 手动任务、定时任务、状态筛选 |
| `/jobs/:id` | 任务详情 | 批次、接口进度、错误、重试 |
| `/raw-data` | 原始数据 | 按账号、接口、日期查询 |
| `/members` | 成员 | 邀请、禁用、角色管理 |
| `/audit` | 审计日志 | 管理员查看敏感操作 |

桌面端最小支持宽度为 1280 px，优先验证 1440 px 和 1920 px。第一版不为窄屏重新编排信息架构，但登录和邀请页应避免在较窄浏览器窗口中完全不可用。

## 18. 日志、监控和审计

### 18.1 关联标识

每条结构化日志尽量包含：

```text
request_id
user_id
jijia_account_id
job_id
sync_batch_no
api_code
```

HTTP 请求生成 `requestId` 并通过响应头和响应体返回。任务从创建到执行保留 `jobId`，同步内核继续使用 `sync_batch_no`。

### 18.2 健康检查

```text
GET /health/live   # 进程存活，不访问外部服务
GET /health/ready  # 验证配置和数据库连接
```

Worker 没有外部 HTTP 端口，通过 `sync_job.heartbeat_at`、进程状态和日志检查。

### 18.3 审计范围

以下操作必须写 `audit_log`：

- 登录成功、连续失败锁定、登出。
- 邀请、重发、撤销、禁用用户、修改角色。
- 新增、更新、验证、停用积加账号。
- 修改接口同步策略。
- 手动触发和重试任务。
- 查看完整原始 JSON 可记录资源访问事件，至少保留 Admin/Operator 和账号范围。

## 19. 安全基线

- 生产环境只允许 HTTPS，并启用 HSTS。
- Nginx 设置合理的 CSP、`X-Content-Type-Options` 和 Referrer Policy。
- 认证响应使用 `Cache-Control: no-store`。
- Session Cookie 不可被 JavaScript 读取。
- 修改状态的接口执行 CSRF 校验。
- 用户输入经过 Pydantic 校验，SQL 只使用 SQLAlchemy 参数绑定。
- 登录接口由 Nginx 按 IP 限流，用户连续失败后短期锁定。
- 权限判断在后端统一依赖中执行。
- 积加凭证仅在 Worker/API 验证动作执行前解密，使用后不写磁盘。
- 错误响应不返回堆栈、SQL、密钥或积加完整响应中的敏感字段。
- 数据库账号按环境隔离；生产应用账号不授予建库和超出业务 schema 的权限。
- API 和 Worker 使用非 root 用户运行，依赖版本锁定，发布前进行漏洞扫描。

## 20. 分阶段实施计划

以下全部属于第二阶段内部里程碑：M1 可登录、M2 可配置、M3 可同步、M4 发布准备。每个里程碑必须独立验收；M4 只表示发布条件已经在代码和本地环境准备，不表示真实生产验收完成。

### 20.1 阶段 0：基线冻结与脚手架

目标：在不改变现有同步行为的前提下建立 Web 开发基础。

任务：

1. 记录现有测试、CLI 和数据库结构基线。
2. 创建 `backend/`、`frontend/`、`scripts/` 目录。
3. 配置 FastAPI、Vite、Ruff、mypy、ESLint、Vitest。
4. 建立开发/测试配置分层和统一日志格式。
5. 创建 Alembic 基线，但不修改现有生产表。
6. 提供 Windows setup/dev/check 脚本。

验收：

- 现有同步测试全部通过。
- FastAPI `/health/live` 返回 200。
- React 空壳页面可打开。
- Windows 无 Docker 可启动前后端。
- 仓库中不存在真实密钥。

回滚：删除新增脚手架和依赖改动；现有 `app/` 与数据库不受影响。

### 20.2 M1：可登录

目标：管理员可邀请用户，用户可通过邮箱完成注册并安全登录。

数据库：

- `0001_identity_and_session`。
- 新增 `app_user`、`auth_action_token`、`user_session`。

后端：

- 密码哈希、Session、CSRF、角色依赖。
- bootstrap-admin CLI。
- 邀请、注册、登录、登出 API；忘记密码已正式延后。
- SMTP、Console、Fake 邮件适配器。

前端：

- 登录页、邀请注册页。
- 登录态加载和受保护路由。
- 成员与邀请管理页的最小版本。

测试：

- 邀请过期、撤销、重复使用。
- 注册、登录失败锁定、登出、Session 过期。
- CSRF 缺失或错误时拒绝请求。
- Viewer 无法访问成员管理接口。

验收：

- 首个管理员能收到邀请并完成注册。
- 管理员能邀请三个角色的用户。
- 用户不能自行注册。
- 浏览器关闭或刷新后会话行为符合有效期配置。
- Cookie 和数据库中均不存在明文密码或 Session ID。

回滚：回退应用版本；`0001` 表可保留，不影响现有同步程序。

### 20.3 M2：可配置

目标：用户可接入积加账号并配置每个接口的同步策略。

数据库：

- `0002_jijia_account_and_policy`。
- 新增 `jijia_account`、`account_api_policy`。

后端：

- 凭证加密服务。
- 积加账号 CRUD、验证和停用。
- 接口目录只读 API。
- 策略读取、校验、保存和 `next_run_at` 计算。
- `AuthClient` 支持显式账号凭证。

前端：

- 积加账号列表和接入向导。
- 账号验证状态。
- 接口策略列表、筛选、编辑抽屉或页面。
- 依据接口能力禁用不支持的策略项。

测试：

- 数据库只保存加密凭证。
- API 不返回明文 `appKey`。
- 不同账号策略互不影响。
- 非法 Cron、日期窗口和未知接口被拒绝。
- Operator 可编辑，Viewer 只读。

验收：

- 新账号可完成 Token 验证。
- 每个接口可独立启停和配置计划。
- 用户无法修改官方接口路径、分页和限流配置。
- 更新凭证后必须重新验证。

回滚：停用 Web 账号管理入口，旧环境变量账号继续可用；新增表保留以避免数据丢失。

### 20.4 M3：可同步

目标：手动和定时任务都能通过独立 Worker 执行，且多账号数据隔离。

数据库：

- 演练并执行 `0003_scope_existing_sync_tables_by_account`。
- 执行 `0004_sync_job_and_audit`。
- 新增 `sync_job`、`audit_log`。

后端：

- 创建、列表、详情和重试任务 API。
- 批次、接口日志、失败请求和原始数据查询 API。
- SyncEngine 账号上下文适配。
- 仪表盘汇总 API。

Worker：

- 数据库任务领取、心跳、恢复。
- 到期策略调度和去重。
- 账号凭证即时解密。
- 任务状态与 `sync_batch_no` 映射。
- 继续使用现有 MySQL 全局命名锁。

前端：

- 仪表盘。
- 手动触发同步。
- 任务列表、详情、接口日志和重试。
- 原始数据查询和 JSON 详情。

测试：

- 两个账号返回相同主键时都能保存。
- 两个账号 checkpoint 独立。
- 同一计划时间不会重复生成任务。
- HTTP 请求不会等待长同步完成。
- Worker 崩溃后任务按规则恢复。
- 失败接口产生可查询日志，任务为 `partial_failed` 或 `failed`。
- Worker 复用第一阶段同步内核时，既有同步行为和数据结果保持一致。

验收：

- 手动请求在短时间内返回 `202 + jobId`。
- Worker 完成任务后，job、batch、api log、checkpoint、raw data 可串联查询。
- 定时策略只生成一次任务。
- 多账号数据和进度无交叉覆盖。

回滚：部署前备份数据库；如果应用回退，不回滚账号维度数据。旧版本若无法识别新 schema，只能使用已准备的兼容版本，禁止直接执行破坏性 downgrade。

### 20.5 M4：发布准备

目标：完成 ECS 原生服务、Nginx、安全启动门禁、备份和发布演练。

任务：

1. 创建 FastAPI 和单 Worker 的 systemd unit 模板。
2. 配置 Nginx TLS、静态资源、反向代理和登录限流。
3. API、Worker 使用非 root 用户并输出到 journald。
4. 增加 liveness/readiness、启动配置和运行数据库只读门禁。
5. 分离运行凭据与迁移凭据。
6. 建立数据库备份和恢复演练。
7. 在隔离的生产备份副本演练 migration。
8. 执行依赖、构建产物和密钥泄露检查。
9. 完成管理员、Operator、Viewer 的桌面端 E2E。
10. 完成发布和回滚演练。

验收：

- `systemd-analyze verify`、`nginx -t` 和只读 `release_preflight` 通过。
- 新服务器按发布步骤可一次启动。
- API 未就绪时 Nginx 不错误导流。
- Worker 同时只有一个实例执行。
- 生产环境不能启用 Console 邮件。
- 备份可恢复，恢复后的任务和历史数据可查询。
- 所有关键 E2E 和现有同步回归测试通过。
- 生产 legacy cron 已停用，所有日常同步均由 Web Scheduler 和 Worker 发起。

回滚：保留上一发布目录及 systemd/Nginx 配置；应用可回退，数据库只执行经过验证的前向修复或兼容迁移，不在现场盲目删除列和索引。

## 21. 文件级实施清单

| 阶段 | 主要文件 |
| --- | --- |
| 阶段 0 | `backend/app/main.py`、`backend/app/core/*`、`frontend/*`、`scripts/*.ps1` |
| M1 | `backend/app/models/user.py`、`auth_token.py`、`session.py`、认证服务和路由、登录/注册/成员页面、`0001` |
| M2 | `jijia_account.py`、`account_api_policy.py`、凭证/策略服务和路由、账号/策略页面、`0002`、现有 `app/auth.py` 的账号参数化 |
| M3 | `sync_job.py`、`audit_log.py`、Worker、任务/运行/原始数据路由和页面、`0003`、`0004`、现有同步仓储的账号维度改造 |
| M4 | `config/ecs/*.service.example`、`config/ecs/nginx.conf.example`、`release_preflight`、生产配置和 E2E |

每个阶段只修改该阶段需要的文件；不借机格式化或重写无关代码。

## 22. 测试策略

### 22.1 后端单元测试

- 密码、令牌、Session 和 CSRF。
- 角色权限矩阵。
- 凭证加密和脱敏。
- 策略校验与 `next_run_at`。
- 任务状态转换和调度去重。

### 22.2 后端集成测试

- Alembic 从空库升级到最新版本。
- 现有数据库快照升级并完成历史账号回填。
- 多账号原始数据唯一键。
- 多账号 checkpoint。
- Worker 领取、心跳、失败恢复。
- SyncEngine 与新账号上下文连接。

### 22.3 API 测试

- 成功、未登录、无权限、CSRF 错误、参数错误。
- 列表分页和账号筛选。
- `202` 任务创建和重试关系。
- 敏感字段不出现在响应中。

### 22.4 前端测试

- 登录和邀请表单。
- 受保护路由。
- 权限按钮展示。
- 账号接入和策略编辑。
- 任务轮询停止条件和错误展示。

### 22.5 E2E

```text
管理员邀请 -> 用户注册 -> 登录
管理员接入积加测试账号 -> 验证 -> 配置接口
Operator 手动同步 -> Worker 执行 -> 查看详情
Viewer 查看任务 -> 无法修改策略或查看完整原始 JSON
失败任务 -> Operator 重试 -> 新任务关联旧任务
```

真实积加 API 只在取得官方文档、专用测试凭证和用户明确授权后验证。否则使用 Mock，不对未知接口做真实探测。

## 23. 开发与检查命令

### 23.1 改造前基线

```powershell
git status --short --branch
git diff --check
.\.venv\Scripts\python.exe -m unittest discover -s tests -p "test_*.py"
.\.venv\Scripts\python.exe -m compileall -q app tests
.\.venv\Scripts\python.exe -m pip check
```

### 23.2 Windows 开发

```powershell
.\scripts\setup.ps1
.\.venv\Scripts\alembic.exe -c backend\alembic.ini upgrade head
.\scripts\dev-api.ps1
.\scripts\dev-worker.ps1
.\scripts\dev-web.ps1
```

### 23.3 Windows 全量检查

```powershell
.\scripts\check.ps1
```

脚本应顺序执行：

```text
Ruff format check
Ruff lint
mypy
pytest + coverage
现有 unittest 回归
Python compileall
npm lint
npm test
npm build
Playwright E2E（具备测试数据库时）
密钥模式扫描
git diff --check
```

### 23.4 生产发布前

```bash
cd frontend && npm ci && npm run build && cd ..
./.venv/bin/python -m backend.app.release_preflight --confirm-read-only-database --service api
./.venv/bin/python -m backend.app.release_preflight --confirm-read-only-database --service scheduler
./.venv/bin/python -m backend.app.release_preflight --confirm-read-only-database --service worker
sudo systemd-analyze verify /etc/systemd/system/seekway-datahub-api.service
sudo systemd-analyze verify /etc/systemd/system/seekway-datahub-scheduler.service
sudo systemd-analyze verify /etc/systemd/system/seekway-datahub-worker@.service
sudo nginx -t
curl --fail https://datahub.seekwaygroup.com/health/ready
```

实际发布时，migration 必须在数据库备份完成且 Worker 停止领取新任务后执行。

## 24. 发布步骤

1. 确认全部检查通过并准备不可变发布目录。
2. 备份 PolarDB，并验证备份状态。
3. 暂停旧定时入口，停止 Worker 领取新任务。
4. 等待正在执行的同步完成；不能直接杀死正常运行中的长任务。
5. 在备份副本或预发布库再次验证 migration。
6. 部署新发布目录，但暂不开放公网流量。
7. 单次执行 Alembic upgrade。
8. 启动 API，检查 readiness。
9. 启动唯一 Worker，检查心跳。
10. 启动 Nginx 并执行登录、账号列表和任务查询冒烟测试。
11. 创建一个受控测试任务，确认 job、batch、日志和数据链路。
12. 开放流量并观察错误率、Worker 心跳和数据库负载。

## 25. 回滚方案

### 25.1 应用回滚

- 保留上一发布目录及已验证的 systemd、Nginx 配置。
- 停止新 Worker，避免新旧 Worker 同时运行。
- 将 API、Worker、前端切回兼容上一版。
- 恢复旧定时入口前，确认没有 queued/running 新任务被重复执行。

### 25.2 数据库回滚

- 身份和账号新增表一般保留，不为回退应用删除数据。
- `0003` 涉及唯一索引重建，不现场执行未经演练的自动 downgrade。
- MySQL DDL 可能隐式提交，`0003` 任一步失败都不能假定事务可完整回滚。
- 如果迁移已部分提交，只使用演练过的前向修复或迁移前快照/PITR 恢复。
- 数据恢复后核对 `raw_api_data` 数量、账号维度唯一键和 checkpoint。

## 26. 完成定义

以下清单定义“生产正式完成”，只在本地与外部验收全部闭合后统一勾选；当前本地实现
状态以本文顶部和 `docs/next_prompt.md` 最新 Gate 为准。所有以下条件满足，Web 服务
第一版才算完成：

- [ ] 用户只能通过管理员邀请注册。
- [ ] 邮箱密码登录、Session、CSRF 和三个角色可用。
- [ ] 生产环境接入 SMTP，且不使用第三方登录。
- [ ] 积加凭证加密保存，接口和日志不泄露明文。
- [ ] 可接入、验证、更新和停用多个积加账号。
- [ ] 每个账号的每个接口可独立配置同步策略。
- [ ] 用户不能修改未获官方文档确认的接口契约。
- [ ] 手动同步返回 `202 + jobId`，不阻塞 HTTP 请求。
- [ ] Worker 可调度、领取、执行、心跳和恢复任务。
- [ ] 多账号原始数据、checkpoint、批次和日志完全隔离。
- [ ] 现有同步 CLI 和测试保持可用。
- [ ] Admin、Operator、Viewer 权限符合矩阵。
- [ ] 桌面端主要流程完成 E2E。
- [ ] Windows 无 Docker 可开发和测试。
- [ ] 生产 ECS 原生服务可构建、部署、检查和回滚。
- [ ] migration 已在生产备份副本演练。
- [ ] 生产备份恢复演练成功。
- [ ] 仓库、构建产物、日志和数据库中没有不应存在的明文密钥。

## 27. 实施前需要准备的外部条件

这些不是架构待定项，但在对应阶段开始前必须由项目方提供：

| 条件 | 最晚提供阶段 |
| --- | --- |
| 首个管理员邮箱 | M1 |
| 开发/测试 MySQL 8 或 PolarDB 非生产 schema | 阶段 0 |
| 生产 SMTP 地址、账号、发件人和网络白名单 | M1 上生产前 |
| 积加专用测试账号和可访问的官方接口文档 | M2/M3 真实联调前 |
| 生产域名、DNS、TLS 证书方案 | M4 |
| `CREDENTIAL_ENCRYPTION_KEY` 的生成、保管和轮换负责人 | M2 上生产前 |
| PolarDB 备份、恢复权限和生产维护窗口 | M3/M4 |

如果积加官方文档对某个接口的参数、分页、限流或字段语义不明确，该接口只能保留为未启用状态，不能凭经验接入生产同步。

## 28. 主要风险和处理方式

| 风险 | 影响 | 处理方式 |
| --- | --- | --- |
| 历史唯一键不含账号 | 多账号数据冲突 | M3 前强制执行 `0003` 迁移和历史回填 |
| 长同步占用 HTTP 请求 | 超时、重复提交 | API 只创建任务，Worker 异步执行 |
| 数据库队列重复调度 | 相同任务重复执行 | `schedule_slot_key` 唯一键加领取事务 |
| Worker 意外退出 | 任务永久 running | 心跳、失联检测和显式恢复规则 |
| 凭证泄露 | 账号和数据风险 | 字段加密、响应脱敏、日志清洗、密钥外置 |
| migration 锁表时间长 | 生产不可用 | 备份副本演练、维护窗口、索引耗时评估 |
| Windows 与 Linux 行为差异 | 开发通过但部署失败 | Windows 检查加 ECS 原生 systemd/Nginx 验证 |
| 接口规则靠猜测 | 数据缺失或请求违规 | YAML 只采用官方文档确认规则 |
| 引入过多基础设施 | 开发和运维成本上升 | 第一版只用 MySQL 队列和单 Worker |

## 29. 建议工期与启动条件

单人开发的粗略工作量，不含等待官方接口、SMTP、域名和生产维护窗口的时间：

| 阶段 | 预计工作日 |
| --- | ---: |
| 阶段 0 | 2～3 |
| M1 可登录 | 4～6 |
| M2 可配置 | 5～7 |
| M3 可同步 | 6～8 |
| M4 发布准备 | 4～6 |

总计约 21～30 个工作日。每个里程碑验收后再进入下一阶段，优先保证可运行和可回滚，不以压缩测试和迁移演练换取表面进度。

实施状态：M1～M4 本地 MVP 已完成。后续只推进最新 Gate 明确的本地缺口；隔离副本迁移、
真实 API/SMTP、ECS 发布以及提交、推送或合并仍需分别取得明确授权。
