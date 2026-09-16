# SEEKWAY Data Hub 工作交接

> 历史文档说明（2026-09-08）：本文件记录实施前的规划交接，下面的“尚未实施”、
> “阶段 0 + M1”和旧启动提示均已失效，不能作为当前执行依据。生产部署已于 2026-09-16
> 改为 Docker Compose；正文中的 systemd 方案只用于追溯。当前职责、
> 实现状态和下一门禁以根目录 `AGENTS.md`、`README.md`、完整实施方案顶部状态及
> `docs/next_prompt.md` 当前平台交接为准；保留正文仅用于追溯早期决策。
>
> 交接日期：2026-08-26
> 当前阶段：历史规划交接，已被 M1～M4 本地 MVP 实施结果覆盖
> 下一阶段：先闭合最新 Gate 的本地缺口，再取得隔离副本与 ECS 外部验收授权
> 完整方案：[web-service-implementation-plan.md](./web-service-implementation-plan.md)

## 1. 交接目标

本文件仅用于追溯 Web 服务实施前的规划。新会话不得把正文中的旧阶段、旧部署方式或旧启动提示当作当前任务。

当前事实以 README 和 `docs/next_prompt.md` 为准：第二阶段本地 MVP 已形成，但生产迁移、调度割接和 ECS 验收尚未完成。

## 2. 用户最终目标

最终产品是 SEEKWAY Data Hub（SEEKWAY 数据接入中心），积加是首个数据源连接器。第一阶段 CLI/cron 只作为历史基础和受控迁移、检查能力保留，生产日常同步最终只通过 Web Scheduler、数据库任务队列和 Worker 执行。平台使用户可以：

1. 通过管理员邀请和邮箱完成注册、登录。
2. 管理多个积加开放平台账号。
3. 为每个账号的每个接口配置同步策略。
4. 手动触发同步并查看任务进度。
5. 查看批次、接口日志、失败请求和原始 JSON 数据。
6. 在 Windows 无 Docker 环境完成开发和测试。
7. 在阿里云 ECS 通过 systemd 和 Nginx 正式部署。

## 3. 历史产品决策

以下内容记录实施前决策，仅用于追溯；与 README 最新定位冲突时，以 README 为准：

- 目前只适配桌面端。
- 注册方式是“管理员邀请后，用户通过邮箱完成注册”。
- 不开放自助注册。
- 登录使用邮箱和密码。
- 不接入任何第三方登录。
- 角色固定为 `Admin`、`Operator`、`Viewer`。
- 用户可以接入多个积加 API 账号。
- 用户可以配置每个账号、每个接口的同步策略。
- 用户只能修改运行策略，不能修改未经官方文档确认的接口契约。
- 长同步不能在 HTTP 请求中执行；创建任务后返回 `202 + jobId`。
- 第一版不实现运行中任务取消。
- 第一版使用单 Worker 串行执行同步。
- 继续保留现有 MySQL 全局命名锁。

权限基线：

| 功能 | Admin | Operator | Viewer |
| --- | --- | --- | --- |
| 用户和邀请管理 | 允许 | 禁止 | 禁止 |
| 积加账号管理 | 允许 | 允许 | 只读 |
| 接口策略修改 | 允许 | 允许 | 只读 |
| 手动同步和重试 | 允许 | 允许 | 禁止 |
| 任务和日志查看 | 允许 | 允许 | 允许 |
| 完整原始 JSON | 允许 | 允许 | 禁止 |
| 审计日志 | 允许 | 禁止 | 禁止 |

## 4. 历史技术决策

技术和开发规范参考：

- [seekway-codex-standards](https://github.com/songtu2025/seekway-codex-standards)

技术栈：

- 前端：React、TypeScript、Vite。
- 后端：Python、FastAPI、Pydantic、SQLAlchemy、Alembic。
- 数据库：继续使用 PolarDB MySQL。
- 登录态：服务端 Session Cookie，不使用 `localStorage` Token。
- 密码：Argon2id 哈希。
- 积加凭证：字段加密后入库，运行前即时解密。
- Worker：独立 Python 进程。
- 队列：数据库 `sync_job` 表。
- 调度：Worker 查询到期策略并创建任务。
- 第一版不引入 Redis、Celery、RabbitMQ、Kafka。
- 第一版不重写现有同步引擎。

环境：

- 开发环境：Windows，无 Docker。
- 测试环境：Windows，无 Docker。
- 正式环境：阿里云 ECS 原生 systemd + Nginx。
- 生产运行单元为 `nginx`、`api`、`worker`，不使用 Docker Compose。
- PolarDB 是外部托管数据库，不在 Compose 中启动 MySQL。

## 5. 设计资料

已完成的 Figma 资料：

- [P6 开发里程碑](https://www.figma.com/design/BvwiR3NqdZjcWJrPSbd3so?node-id=112-432)
- [P5 系统架构](https://www.figma.com/design/BvwiR3NqdZjcWJrPSbd3so?node-id=107-432)

实施里程碑已经固定为：

```text
M1 可登录
M2 可配置
M3 可同步
M4 发布准备
```

如果需要继续修改 Figma，应使用 Figma 插件对应技能；实现代码前不要求再次重做已经确认的里程碑和架构图。

## 6. 当前仓库事实

仓库路径：

```text
当前仓库根目录
```

当前分支：

```text
codex/section-api-integration
```

现有同步核心已经具备：

- 积加 Token 获取、缓存和 401 刷新。
- GET、POST 请求。
- 分页、限流、失败重试和日期窗口。
- YAML 接口配置。
- 原始 JSON 幂等写入。
- 批次、接口日志、checkpoint 和失败请求记录。
- Mock、探测、单接口和全部启用接口等 CLI 模式。
- MySQL 命名锁 `jijia_polardb_sync_task`。
- 长任务按页提交能力。

优先阅读文件：

```text
app/main.py
app/config.py
app/auth.py
app/api_client.py
app/sync_engine.py
app/db.py
sql/init_tables.sql
config/api_config.example.yaml
docs/web-service-implementation-plan.md
```

注意：仓库根目录存在 `.codegraph/`。理解或定位代码时，应先使用：

```powershell
codegraph explore "要查询的符号或问题"
```

不要一开始就遍历读取整个仓库。

## 7. 当前工作区状态

交接时 `git status --short --branch` 为：

```text
## codex/section-api-integration...origin/codex/section-api-integration
 M AGENTS.md
 M README.md
 M config/api_config.example.yaml
 M config/jijia_api_catalog.generated.json
 M docs/decisions.md
 M docs/next_prompt.md
 M docs/progress.md
 M tests/test_sale_return_order_page_config.py
?? docs/web-service-implementation-plan.md
?? docs/web-service-handoff.md
```

重要边界：

- 以上已有修改不能假设属于当前 Web 服务任务。
- 不允许执行 `git reset --hard`、`git checkout --` 或其他清理命令。
- 不允许覆盖用户已有修改。
- 修改重叠文件前必须先查看对应 diff，并做最小合并。
- 本次会话只新增了 `docs/web-service-implementation-plan.md` 和本交接文件。
- 本次会话没有提交 Git commit。

## 8. Web 化必须解决的核心问题

当前数据库唯一键按 `api_code` 区分，只能安全支持单积加账号：

```text
raw_api_data:
  UNIQUE (api_code, source_primary_key)
  UNIQUE (api_code, data_hash)

sync_checkpoint:
  UNIQUE (api_code)
```

多账号上线前必须改为：

```text
raw_api_data:
  UNIQUE (jijia_account_id, api_code, source_primary_key)
  UNIQUE (jijia_account_id, api_code, data_hash)

sync_checkpoint:
  UNIQUE (jijia_account_id, api_code)
```

否则不同积加账号会发生业务主键、数据哈希和 checkpoint 冲突。

迁移方案已在完整实施方案第 15 节定义。必须先创建 `legacy_default` 账号并回填历史数据，再重建唯一索引，不能直接增加非空字段或删除历史数据。

## 9. 计划新增的数据表

第一版新增七张表：

```text
app_user
auth_action_token
user_session
jijia_account
account_api_policy
sync_job
audit_log
```

Alembic 迁移顺序：

```text
0001_identity_and_session
0002_jijia_account_and_policy
0003_scope_existing_sync_tables_by_account
0004_sync_job_and_audit
```

不要在 M1 提前执行 `0003`。账号维度迁移安排在 M3，且必须先在生产备份副本或等规模测试库演练。

## 10. 新积加账号的接入规则

用户操作流程：

```text
填写账号名称、appId、appKey
  -> 服务端加密保存
  -> 用户点击验证
  -> 使用该账号凭证请求官方 Token
  -> 成功后账号变为 active
  -> 生成默认接口策略
  -> 用户选择需要启用的接口
```

实现要求：

- 账号验证只验证 Token，不自动开始全量同步。
- API 永远不返回明文 `appKey`。
- 更新凭证后必须重新验证。
- `AuthClient` 应改为接收账号凭证对象，不能继续只依赖全局配置。
- Web 账号 Token 只在 Worker 内存按账号缓存。
- 旧环境变量账号映射为 `legacy_default`，保证现有 CLI 兼容。

真实积加接口必须以官方文档为依据。官方文档不可访问或规则不明确时，只能开发通用框架和 Mock，不能凭经验添加真实接口规则或发起真实探测。

## 11. 接口同步策略边界

配置分为两层：

```text
官方接口目录：method、path、分页、参数、限流、主键规则
账号接口策略：enabled、计划、时区、允许的日期窗口
```

用户可配置：

```text
enabled
schedule_mode = manual_only | daily | cron
schedule_expr
timezone
window_mode
lookback_days
start_date
```

用户不可配置：

```text
接口 URL
HTTP 方法
认证方式
分页字段和官方上限
限流规则
未获官方文档确认的参数
原始数据主键推断规则
```

最终执行配置是“官方接口目录 + 白名单策略覆盖字段”，不能把页面保存内容直接当成完整 API 配置执行。

## 12. 任务和 Worker 边界

同步流程：

```text
FastAPI 创建 sync_job 并返回 202
  -> Worker 领取 queued 任务
  -> 解密目标账号凭证
  -> 合并接口目录与账号策略
  -> 获取现有全局 MySQL 命名锁
  -> 调用现有 SyncEngine
  -> 更新 job、batch、日志、checkpoint
```

任务状态：

```text
queued -> running -> success | partial_failed | failed
```

必须遵守：

- HTTP 请求不能同步执行长任务。
- 任务领取事务必须短，不能在网络同步期间持有数据库行锁。
- 定时任务使用唯一 `schedule_slot_key` 去重。
- 重试创建新任务，并记录 `retry_of_job_id`。
- Worker 使用心跳识别失联任务。
- 第一版只有一个 Worker，并继续使用全局命名锁。

## 13. 下一会话的正确启动顺序

### 13.1 先确认授权

当前完整方案的状态仍是“待确认后实施”。如果用户只要求阅读或评审，不要修改代码。

只有用户明确表示“确认方案并开始实施阶段 0 + M1”后，才可以修改代码和依赖。

### 13.2 实施前检查

```powershell
git status --short --branch
git diff --check
codegraph explore "app/main.py CLI 入口、SyncEngine 调用链和数据库连接"
codegraph explore "现有测试入口和配置加载方式"
.\.venv\Scripts\python.exe -m unittest discover -s tests -p "test_*.py"
.\.venv\Scripts\python.exe -m compileall -q app tests
.\.venv\Scripts\python.exe -m pip check
```

记录测试基线。如果失败是工作区已有问题，先向用户说明事实，不要擅自修改无关代码。

### 13.3 阶段 0

只建立必要脚手架：

```text
backend/
frontend/
scripts/
```

目标：

- FastAPI `/health/live` 可运行。
- React/Vite 桌面端空壳可运行。
- Ruff、mypy、pytest、ESLint、Vitest 基础检查可运行。
- Windows PowerShell 可启动 API、Worker 和前端。
- 现有同步测试不回归。

不要在阶段 0 搬迁根目录 `app/`。

### 13.4 M1 可登录

只实现：

- `app_user`、`auth_action_token`、`user_session`。
- Alembic `0001_identity_and_session`。
- bootstrap-admin CLI。
- 管理员邀请、注册、登录、登出、Session、CSRF。
- SMTP、Console、Fake 三种邮件适配器。
- 登录、邀请注册和最小成员管理页面。
- Admin、Operator、Viewer 的后端权限依赖。

M1 不实现：

- 积加账号表。
- 接口同步策略。
- 忘记密码和密码重置已正式延后，M1/M2 均不实现。
- `sync_job`。
- Worker 调度。
- 多账号历史数据迁移。

## 14. M1 关键安全要求

- 邮箱统一去空格并转小写，数据库唯一。
- 密码默认至少 12 位，使用 Argon2id。
- 邀请默认 24 小时有效，单次使用。
- 邀请和 Session 原始令牌不入库，只保存 SHA-256 哈希。
- 邀请链接使用 `/register#token=...`，减少令牌进入 Nginx 日志。
- Session Cookie 使用 `HttpOnly`、`SameSite=Lax`；生产开启 `Secure`。
- 生产 Cookie 建议命名为 `__Host-jijia_session`。
- 修改状态的请求必须校验 `X-CSRF-Token`。
- 生产环境禁止 `MAIL_PROVIDER=console`。
- 日志不得记录密码、Token、Cookie、积加凭证或完整邀请链接。

## 15. 建议的阶段 0/M1 验收

```text
[ ] 现有同步 unittest 全部通过
[ ] FastAPI health check 返回 200
[ ] React 桌面端可打开
[ ] 首个管理员可通过 CLI 生成邀请
[ ] 用户只能通过有效邀请注册
[ ] 邀请过期、撤销、重复使用均被拒绝
[ ] 邮箱密码登录成功
[ ] 登出后 Session 失效
[ ] CSRF 错误时修改请求被拒绝
[ ] Viewer 无权管理成员
[ ] 数据库和日志无明文密码、令牌
[ ] Windows 无 Docker 可完成开发和测试
[ ] git diff 只包含本阶段相关修改
```

## 16. 编码和协作要求

必须遵守仓库 `AGENTS.md`：

- 所有回复、任务清单和代码注释使用中文。
- 遵循 KISS，不提前引入复杂基础设施。
- 设计或实现前先调研；不明确且会改变结果时向用户确认。
- Python 遵循 PEP 8。
- 注释重点解释业务原因，不逐行翻译代码。
- 敏感信息只从环境变量读取。
- 使用 `apply_patch` 修改文件。
- 保留用户已有改动，避免无关格式化。
- 涉及积加真实 API 时先核对官方文档。
- 完成阶段后执行与风险相称的检查。

项目说明要求每个阶段更新：

```text
docs/progress.md
docs/decisions.md
docs/next_prompt.md
```

但这三个文件当前已有未提交修改。更新前必须先查看 diff，保留现有内容，只追加或最小合并，不能覆盖。

## 17. 不要做的事情

- 不要重新设计已冻结的技术栈和登录方式。
- 不要把 Token 放到 `localStorage`。
- 不要引入第三方登录。
- 不要为了异步任务引入 Redis/Celery。
- 不要在 FastAPI 请求线程中执行完整同步。
- 不要复制一套新的同步引擎。
- 不要在 M1 修改现有同步表唯一键。
- 不要把用户策略当成可任意编辑的 API 契约。
- 不要猜测积加接口分页、限流或字段含义。
- 不要写入真实 SMTP、数据库或积加凭证。
- 不要清理当前工作区或覆盖已有修改。
- 不要在用户未确认实施前修改代码和依赖。

## 18. 当前验证状态

本次交接前只做了文档验证：

```text
docs/web-service-implementation-plan.md 存在
Markdown 共 1346 行
git diff --check -- docs/web-service-implementation-plan.md 通过
```

因为本次只新增文档，没有运行完整业务测试。下一会话在开始实施前应重新运行第 13.2 节的基线检查。

## 19. 推荐给下一会话的启动提示词

本节旧提示词已失效。下一会话直接读取 `docs/next_prompt.md`，不得重新执行阶段 0 或 M1，也不得把接口接入、legacy cron 扩张作为当前主线。

当前启动口径：

```text
最终产品只保留 SEEKWAY 数据接入中心作为生产业务入口，积加同步核心作为首个连接器继续复用。
先核对当前未提交的平台实现和发布门禁，再推进隔离副本、数据归属、调度割接与 ECS 验收。
不得恢复或扩大 legacy cron 日常同步。
```

## 20. 交接结论

当前历史规划已经被第二阶段本地 MVP 覆盖。正确的推进方式是：

```text
收口当前工作区和测试基线
  -> 隔离 MySQL/PolarDB 副本迁移与恢复演练
  -> legacy 数据归属
  -> 停止 legacy cron
  -> Web Scheduler 独占生产调度
  -> SMTP、HTTPS、Docker Compose/Nginx 和 ECS 验收
```

所有数据模型、API、Worker、迁移、测试、部署和回滚细节，以完整实施方案为准。
