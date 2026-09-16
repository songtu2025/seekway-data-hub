# Next Codex Prompt

请继续 `D:\DataProject\coedx_project\jijia-polardb-sync` 项目。最终产品是积加数据同步管理平台，生产业务只通过 Web、Scheduler、数据库任务队列和 Worker 运行。第一阶段 CLI/cron 已降级为历史基础和受控运维能力，不再是产品入口，也不得继续扩大其生产调度范围。

开始前读取：

1. `AGENTS.md`
2. `README.md`
3. `docs/codex/sync-project.md`
4. `docs/internal-web-platform-architecture.md`
5. `docs/web-service-implementation-plan.md`
6. `docs/progress.md` 最新记录
7. `docs/decisions.md` 最新决策

## 项目阶段

项目只有两个宏观阶段：

1. **积加 API 同步工具（历史基础）**：已沉淀鉴权、请求、分页、限流、重试、raw、日志和 checkpoint 能力。`app/` 继续作为平台内部同步内核。
2. **积加数据同步管理平台（当前且唯一目标）**：负责多账号、数据库接口目录、账号策略、Web Scheduler、任务队列、Worker、权限、审计和数据查询。

阶段 0、M1～M4、Gate 及接口接入编号都是上述阶段内部记录，不得与两个宏观阶段混用。M4 的准确含义是“发布准备”，不代表已经生产上线。

## 当前事实

- Web 平台本地 MVP 已形成，包含账号、策略、任务、Scheduler、Worker、运行追踪、原始数据、审计、接口中心和 ECS 原生部署模板。
- 并发候选使用四个独立 Worker、`SKIP LOCKED` 唯一领取、账号级 named lock，以及按 HTTP 方法与路径跨账号共享的数据库单接口限流；生产只允许按 1→2→4 灰度。
- 数据库 `api_config` 是唯一运行时接口配置源；YAML 和官方目录只用于开发、审核和受控发布。
- 第一阶段 legacy 数据默认归属 `jijia_account_id=0`，迁移到平台正数账号前必须明确目标账号和历史基线。
- 当前代码和本地测试不能替代真实 MySQL/PolarDB、积加 API、SMTP、HTTPS、systemd/Nginx 和 ECS 证据。
- 尚未完成生产迁移、数据归属、调度割接、部署、提交或推送，不得宣称项目已经生产完成。
- 工作区仍可能包含用户自己的界面和架构图改动。每次提交前必须逐项核对，不得覆盖、顺带提交或删除这些文件。

## 当前唯一主线

1. 在获准的类生产 ECS 与隔离 MySQL/PolarDB 副本执行只读 preflight、迁移和恢复演练。
2. 使用 systemd 按 1→2→4 启动 Worker，核对容量、队列、连接预算、进程重启和失联恢复；任一门禁失败即回退到单 Worker。
3. 明确并执行 legacy `jijia_account_id=0` 数据到真实平台账号的受控归属。
4. 建立逐账号、逐 API 的调度割接清单；启用 Web 策略前先停止对应 legacy 调度。
5. 经单独授权后选择低数据量只读接口进行真实积加小流量验证，不主动压测同一接口。
6. 完成全部接口割接后停用生产 `--sync-enabled` cron，使 Web Scheduler 成为唯一生产定时任务来源。
7. 完成 SMTP、HTTPS Cookie、systemd、Nginx、ECS 和真实 Worker 验收，并观察至少两个完整调度周期。
8. 生产证据完整后再清理不再需要的 legacy 业务同步入口；配置校验、连接检查、只读探测和迁移能力可以保留。

## 调度与数据不变量

- 同一积加账号和 API 在任何时刻只能有一个调度所有者。
- Scheduler 只生成幂等 `sync_job`，不直接调用积加 API。
- Worker 复用 `app/` 同步内核，FastAPI 请求不执行长同步。
- 每个计划槽位最多创建一个任务；同账号同 API 不重叠执行。
- 同一账号继续串行；不同账号可以并行。
- 相同 HTTP 方法与路径在全部账号和 Worker 间共享一条限流时间线；Worker 数量不能突破官方单接口限额。
- 成功后才能推进 checkpoint，失败必须保留任务、批次和错误证据。
- 账号、API、raw、history、batch、log 和 checkpoint 的归属必须一致。
- named lock 只提供执行互斥，不能代替调度归属或漏跑补偿。

## 不要做

- 不要继续把 legacy CLI/cron 当作最终生产方案。
- 不要在 Web Scheduler 与 legacy cron 同时启用同一账号和 API。
- 不要为了继续接入接口而推迟平台生产收口。
- 不要未经授权连接生产数据库、执行迁移、归属 DML、真实同步或部署。
- 不要读取或输出 `.env`、Token、真实凭证、数据库密码和未脱敏业务数据。
- 不要引入 Redis、Celery、Kafka、Docker、自动扩缩容或超过四个 Worker，除非真实运行证据证明当前架构不能满足需求并获得用户确认。

下一项工作应先提交精简方案，说明修改文件、数据库与部署影响、风险、验证和回滚，获得确认后再实施。
