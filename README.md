# jijia-polardb-sync

这是公司内部使用的积加数据同步管理平台。平台通过 Web 管理积加账号、接口策略、定时任务、运行记录和数据查询，并由 Scheduler、数据库任务队列和多个 Worker 将积加开放平台数据同步到 PolarDB MySQL。

## 项目定位与阶段

项目按两个宏观阶段演进：

1. **积加 API 同步工具（历史基础）**：最初通过 CLI 和 cron 调用积加 API，形成了鉴权、分页、限流、重试、原始数据落库、日志和 checkpoint 等同步能力。该阶段不再是最终产品和生产日常入口。
2. **积加数据同步管理平台（当前且唯一目标）**：在第一阶段同步能力之上增加多账号、数据库接口目录、账号级策略、Web Scheduler、任务队列、Worker、权限、审计和运行追踪。生产同步最终只允许通过平台发起。

第一阶段的 `app/` 继续作为平台内部同步内核，并暂时保留受控的配置校验、连接检查、只读探测、迁移和故障诊断命令；`--sync-enabled` 与 legacy cron 必须在平台完成割接后退出生产日常运行。第二阶段内部仍使用 M1～M4 描述“可登录、可配置、可同步、发布准备”，它们不是新的宏观产品阶段。

当前状态是第二阶段本地 MVP 已形成，但尚未完成真实 MySQL/PolarDB 迁移、legacy 数据归属、生产调度割接、SMTP 和 ECS 验收，因此不能表述为已生产上线。

## 规范基线

- 公司规范：[SEEKWAY Codex 开发规范 V1.8.1](https://github.com/songtu2025/seekway-codex-standards/)
- 上游基准提交：`181397ca1510db153f77695e820dcf1907062bb4`
- 接入日期：2026-09-09
- 项目专项规则：`docs/codex/sync-project.md`
- Web 界面规范：`docs/web-ui-standard.md`
- 运行时主题入口：`frontend/src/styles/seekway-theme.css`

本项目是既有项目，按差异合并方式接入规范。保留 `app/` 同步核心和独立的
`backend/`、`frontend/` Web 服务；既有同步表继续由 `sql/init_tables.sql` 和
`sql/migrations/` 管理，Alembic 只管理 Web 身份域及已确认的 Web 增量表；部署继续使用
阿里云 ECS、systemd 和 Nginx，不引入 Docker；cron 仅用于尚未完成的平台割接过渡期，不属于最终生产架构。完整规则按根目录 `AGENTS.md` 的
触发条件读取，项目事实优先于公司新项目默认模板，安全、权限和生产边界不得放宽。

V1.8.1 的[登录页模板](https://github.com/songtu2025/seekway-codex-standards/tree/181397ca1510db153f77695e820dcf1907062bb4/templates/seekway-login)
已于 2026-09-09 接入登录页，来源提交为上述 `181397ca1510db153f77695e820dcf1907062bb4`。
复用 C 版字场、Logo、本地字体和布局，保留项目邮箱认证、自动填充与原页面跳转；
登录尺寸配置集中在 `frontend/src/theme/antdTheme.ts`，继承全局主题，注册页保持原实现。
字体许可位于 `frontend/public/Fonts-LICENSE.txt`，由 Vite 随构建产物分发。
后续按来源提交增量合并；适用规则见 `docs/web-ui-standard.md` 的“应用壳层与登录页”。
[开发辅助资源](https://github.com/songtu2025/seekway-codex-standards/blob/181397ca1510db153f77695e820dcf1907062bb4/README.md#开发辅助资源可选)
包括 VibeHub、Archify 和 CodeGraph，按当前问题选用，不作为启动或验收前提；推荐不等于安装授权，
不自动修改个人配置或加入生产依赖。工具不可用时继续使用现有方式，索引与图示需核对源码，不能替代测试。

## 目录结构

```text
jijia-polardb-sync/
  app/
    main.py
    config.py
    auth.py
    api_client.py
    sync_engine.py
    db.py
    logger.py
    retry.py
    transformers/
  config/
    api_config.example.yaml
  docs/
  logs/
  sql/
    init_tables.sql
  .env.example
  requirements.txt
  README.md
```

## 环境变量

复制 `.env.example` 为 `.env`，再按真实环境填写。不要把 `.env` 提交到代码仓库。

| 变量 | 说明 |
| --- | --- |
| `APP_ENV` | 运行环境，例如 `local`、`prod` |
| `LOG_LEVEL` | 日志级别 |
| `LOG_DIR` | 日志目录 |
| `JIJIA_BASE_URL` | 积加开放平台 API 域名 |
| `JIJIA_OPEN_GATEWAY_PREFIX` | 积加开放平台开放接口网关前缀，默认 `/api/open` |
| `JIJIA_APP_ID` | 积加应用 ID |
| `JIJIA_APP_KEY` | 积加应用 Key |
| `JIJIA_TOKEN_URL` | 获取 accessToken 的接口路径 |
| `JIJIA_TOKEN_CACHE_PATH` | accessToken 本地缓存路径，默认 `logs/token_cache.json` |
| `DB_HOST` | PolarDB MySQL 地址 |
| `DB_PORT` | PolarDB MySQL 端口 |
| `DB_NAME` | 数据库名 |
| `DB_USER` | 数据库用户 |
| `DB_PASSWORD` | 数据库密码 |
| `API_CONFIG_PATH` | API YAML 发布输入路径，运行时不直接读取 |
| `API_CATALOG_PATH` | 由官方文档生成的接口目录路径 |
| `PUBLIC_WEB_URL` | Web 服务对外 HTTPS 地址，用于生成邀请链接 |
| `SESSION_COOKIE_NAME`、`SESSION_COOKIE_SECURE` | Session Cookie 名称与 HTTPS 安全开关；生产必须启用 Secure |
| `SESSION_ABSOLUTE_HOURS`、`SESSION_IDLE_MINUTES` | Session 绝对有效期与空闲有效期 |
| `INVITATION_TTL_HOURS`、`PASSWORD_MIN_LENGTH`、`LOGIN_MAX_FAILURES`、`LOGIN_LOCK_MINUTES` | 邀请、密码和登录锁定策略 |
| `MAIL_PROVIDER`、`SMTP_*` | 邮件适配器与生产 SMTP 参数；生产不能使用 console/fake |
| `CREDENTIAL_ENCRYPTION_KEY` | 积加账号凭证加密密钥，必须独立生成、保管和轮换 |
| `WORKER_POLL_SECONDS`、`WORKER_HEARTBEAT_SECONDS`、`WORKER_STALE_MINUTES` | Worker 轮询、心跳与失联判定参数 |
| `WORKER_PROCESSES`、`SYNC_LOCK_SCOPE` | Worker 进程总数与同步互斥范围；多账号并发使用 `4` 和 `account` |
| `JIJIA_RATE_LIMIT_UTILIZATION` | 官方单接口限额的使用率，默认保留 10% 余量 |
| `JIJIA_TOKEN_RATE_LIMIT_REQUESTS`、`JIJIA_TOKEN_RATE_LIMIT_PERIOD_SECONDS` | 官方 accessToken 接口限额，当前为每秒 10 次 |

`.env.example` 是主要运行变量的示例清单。legacy CLI、Web API 和 Worker 共用最小权限
运行 `.env`；受控迁移只读取独立的 `.env.migration`，不能把迁移高权限凭据配置给
API、Worker 或日常 cron。

## PolarDB 初始化

先在 PolarDB MySQL 中创建数据库，然后执行初始化 SQL：

```bash
mysql -h <POLARDB_HOST> -P 3306 -u <DB_USER> -p <DB_NAME> < sql/init_tables.sql
```

`sql/init_tables.sql` 会创建：

- `api_config`
- `sync_batch`
- `sync_api_log`
- `raw_api_data`
- `sync_checkpoint`
- `failed_request_log`

其中 `raw_api_data.raw_json` 使用 MySQL `JSON` 类型，用来保存原始 API 返回。

已有数据库升级时，由部署负责人按下文顺序执行同步域增量 SQL（包含
`sql/migrations/0008_api_rate_limit_state.sql`），再执行
`python -m alembic -c backend/alembic.ini upgrade head`。前者只扩展同步核心的
表结构，后者只管理 Web 身份域和已确认的 Web 增量表；应用不会自动执行生产迁移。

## API 配置

`api_config` 数据库表是 Web、调度器、Worker 和 legacy CLI 的唯一运行时接口配置源。
`config/api_config.example.yaml` 只用于开发、评审和受控发布；
`config/jijia_api_catalog.generated.json` 保存官方文档证据。运行时不会在数据库读取失败时回退到 YAML。
发布时会校验每个已收录接口的 `rate_limit` 与官方目录一致；多个本地 `api_code`
只要指向同一 HTTP 方法和路径，就共享 `api_rate_limit_state` 中的同一限流时间线。

登录 Web 后打开 `/api-catalog` 的“接口中心”，可以查看：

- “已接入接口”：接口路径、版本、可获取的数据、分页/主键/日期规则、平台与账号启用状态、最近运行和原始数据量。
- “官方接口目录”：官方文档中的接口，以及哪些接口尚未接入、哪些路径对应多个本地业务配置。

接口的三个开关职责不同：YAML `enabled` 决定是否进入 legacy `--sync-enabled`；
`platform_enabled` 是 Web 平台全局开关；`account_api_policy.enabled` 决定某个积加账号是否启用。
Web 任务只有在官方只读已核验、平台允许、账号启用且账号有效时才能创建。

新增 API 的基本步骤：

1. 实时核对积加官方接口详情，确认请求方法、路径、参数、分页、限流、响应结构、读写性质和敏感字段；刷新官方目录生成物。
2. 在 YAML 的 `apis` 下新增唯一 `api_code`，先设置 `enabled: false` 和 `platform_enabled: false`，再填写真实请求、分页、主键、日期和存储规则。
3. 运行 `python -m app.main --validate-api-configs`，只读校验 YAML 与官方只读证据。
4. 由有权限人员运行 `python -m app.main --publish-api-configs`，原子发布到 `api_config`；已有账号会补一条默认关闭的策略。
5. 用 `python -m app.main --test-api <API_CODE>` 做受控单接口验证，并核对 `sync_api_log`、`raw_api_data`、`sync_checkpoint` 和 `failed_request_log`。
6. 验证通过后再按调度归属修改 `enabled` 或 `platform_enabled`、重新发布；Web 模式还需在账号同步配置页显式启用。

如果接口没有稳定业务主键，同步逻辑使用 `data_hash` 去重。任何写入类或未核验为只读的接口，即使手工设置平台开关，也会在发布阶段被拒绝。

对需要滚动日期窗口的接口，`params` 支持少量日期占位符：`{{ today }}`、`{{ yesterday }}` 和 `{{ days_ago:7 }}`。程序会在发起请求前展开为 `YYYY-MM-DD`。

对需要补历史窗口的接口，可以在 YAML 中增加 `date_window`，用 `default_start`、`days`、`start_field` 和 `end_field` 生成本次请求窗口；字段可写成 `model.reportStartDate` 这类点路径。同步成功后 checkpoint 会记录 `next_window_start`，下次运行从下一窗口继续；如果下一窗口已经晚于当前可同步日期，程序会跳过请求，避免严格限流接口空跑。`lag_days` 可让报表接口只同步昨天及更早完整日，避免当天数据未稳定时提前推进 checkpoint。该能力已用 `traffic_analysis_page`、`traffic_sku_analysis_page`、`product_analyze_multi_index_page`、`store_sales_performance_page`、`market_analyze_page`、`listing_analyze_page`、`listing_analyze_multi_index_page`、`sale_profit_page`、`profit_cost_analysis_page`、`financial_profit_analysis_page`、`financial_analysis_v2_page`、`traffic_page`、`traffic_sku_page`、`shipment_data_page`、`storage_ledger_page`、`storage_ledger_detail_page` 和 `inventory_receipts_page` 做过真实单日窗口验证。若官方文档明确说明 total 无效，则不配置 `total_field`，checkpoint 会如实记录 `total_count=null`，不能伪造分页完整性。

## 本地运行

安装依赖：

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Windows PowerShell：

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

执行无副作用 dry-run：

```bash
python -m app.main
```

写入一批 mock 同步数据：

```bash
python -m app.main --mock-sync
```

运行 `--mock-sync` 前，需要先在数据库执行 `sql/init_tables.sql`，并在 `.env` 中配置测试库连接。

检查数据库连接：

```bash
python -m app.main --check-db
```

测试获取积加 accessToken：

```bash
python -m app.main --test-token
```

`--test-token` 会获取真实积加 accessToken，只会输出过期时间，不会打印 accessToken。程序会优先复用本地 token 缓存，缓存失效后才重新请求接口。

调试单个业务 API 并写入原始 JSON：

```bash
python -m app.main --test-api amazon_shop_page
```

`--test-api` 会请求真实积加业务接口并写入 `sync_batch`、`sync_api_log`、`raw_api_data`，适合开发阶段验证。

同步单个真实业务 API：

```bash
python -m app.main --sync-api amazon_shop_page
```

`--sync-api` 复用分页、`sync_checkpoint`、重试、失败日志和 token 缓存能力。

依赖上游参数的接口也先用 `--sync-api` 做小样本验证。例如 `product_detail` 会从已入库的 `product_page` 原始数据中取少量产品 ID 请求详情；`market_inventory_query` 会从已入库的 `product_inventory_page.raw_json` 提取 `sku` 和 `warehouseId` 请求站点库存分布；`procure_detail` 会从已入库的 `lot_no_page.raw_json` 提取少量 `poCode` 请求采购订单详情。参数来源也支持单层数组展开，例如 `raw_json.marketListVos[].marketId`；当公开文档要求数组入参而单次只传一个来源值时，可以在字段配置中设置 `wrap_in_list: true`。这类接口在证明缺失扫描或日增量边界前默认保持 `enabled: false`，不进入每天的 enabled 批量同步。文档 1177 的店铺名称查询使用该数组形态真实请求后仍返回 HTTP 400，已登记为 `defer_runtime_rejected`，在有新官方证据前不重复探测。

同步数据库中已发布且 `enabled=true` 的真实业务 API：

分页接口在扩大首次同步范围前，可先执行只读预检：

```bash
python -m app.main --probe-api supplier_sku_quote_page
```

`--probe-api` 从数据库读取已发布配置，只请求首页并输出总数、页大小、所需页数和实际请求次数；不写入同步表。

官方 `detail` 明确返回有效 `total` 且没有规定总页数上限时，可以省略 `page.max_pages`；同步引擎会在每页响应后按最新 `total` 继续分页，因此后续业务增长不需要人工修改页数。已有 `max_pages` 的接口继续保留原容量保护；省略上限的接口若缺失有效 `total`，会在首页 raw 写入前失败。

```bash
python -m app.main --sync-enabled
```

`--sync-enabled` 是第一阶段遗留批量入口，仅用于平台割接前的受控过渡和回归验证，不得作为最终生产调度方式。它会读取 `api_config` 中已发布且 `enabled=true` 的接口，并在同一个
`sync_batch` 下逐个写入 `sync_api_log`。批次头会先提交，每个 API 使用独立事务提交
raw、log 和 checkpoint，最后提交批次汇总状态。当前清单和版本以“接口中心”及数据库
发布状态为准，不再在 README 固化容易过期的数量。

会写数据库的入口会先获取 MySQL named lock `jijia_polardb_sync_task`，包括
`--mock-sync`、`--test-api`、`--sync-api`、`--sync-enabled`、
`--publish-api-configs` 和兼容别名 `--sync-api-configs`。只读的
`--validate-api-configs` 不连接数据库；`--probe-api` 会读取数据库配置，但不会写同步表，
二者都不使用该互斥锁。

生成积加公开文档 API 覆盖矩阵：

```bash
python -m app.doc_catalog --review-config config/api_review_overrides.yaml --output config/jijia_api_catalog.generated.json --summary
```

该命令只读取公开文档目录和详情，不读取 `.env`，不请求真实业务接口。输出文件保存公开接口元数据、分类结果、本地配置覆盖状态和下一步执行分层，例如已配置、需参数源、需敏感审查、需风险复核或暂缓写操作。`config/api_review_overrides.yaml` 用来持久化鉴权专用、敏感凭证阻断、缺少参数源等人工审核终态；catalog 的 `summary.menu_progress` 会按板块统计已配置、终态暂缓和待审核数量，只有 `pending_review=0` 才标记 `closed=true`。

接入单个接口前，必须按 [`docs/jijia_api_document_access.md`](docs/jijia_api_document_access.md) 实时读取并核对官方 `detail` 契约。generated catalog 只用于定位和覆盖统计，不能代替完整官方文档。

基础数据文档 1177 的店铺名称查询和文档 1179 的仓库信息查询均使用已证明的真实上游站点 ID 单元素数组进行小样本验证，但首个请求都返回 HTTP 400；两者已登记为 `defer_runtime_rejected`，临时业务配置已清理，在有新官方证据前不重复探测或猜测其他数组编码。

基础数据文档 25 的用户列表已通过单次真实验证并保持 `enabled=false`。人员字段只保存到 `raw_api_data.raw_json`，日志和交接文档只记录聚合计数；13 位 `createdTime` 按 `Asia/Shanghai` 转换为 `data_date`，敏感接口失败时不保存响应正文或原始错误详情。

## ECS 部署

1. 在 ECS 安装 Python 3.11+ 和 MySQL 客户端。
2. 拉取或上传项目代码。
3. 创建虚拟环境并安装依赖。
4. 根据 `.env.example` 创建 `.env`。
5. 新库执行 `sql/init_tables.sql`；已有库按变更顺序执行受控 SQL 和 Alembic 迁移。
6. 运行 `python -m app.main --validate-api-configs` 校验发布输入。
7. 由部署负责人运行 `python -m app.main --publish-api-configs` 发布运行时配置。
8. 在隔离环境运行受控单接口验证，确认平台 Worker 可复用同步核心。
9. 核对 legacy 数据归属并停止目标接口的 legacy 调度。
10. 通过 Web 策略启用目标接口，观察至少两个完整运行周期后再迁移下一个接口。

## Legacy cron 退役边界

第一阶段曾使用以下 cron 执行批量同步，仅作为历史示例保留：

```cron
0 2 * * * cd /path/to/jijia-polardb-sync && /path/to/.venv/bin/python -m app.main --sync-enabled >> logs/cron.log 2>&1
```

最终生产环境禁止通过该 cron 执行日常同步。平台割接期间可以暂时保留尚未迁移接口的 legacy 调度，但必须逐账号、逐 API 建立归属清单，并在启用对应 Web 策略前先停止 legacy 调度。

过渡期内，同一积加账号、同一 API 只能有一个定时调度所有者。named lock 只能阻止同时写入，不能替代调度归属；启用 Web 策略前必须将目标接口从 legacy 调度范围移除。全部接口完成割接后，Web Scheduler 是唯一生产定时任务来源。

## 查看日志

应用日志默认写入：

```text
logs/sync.log
```

同步完成后还会通过数据库表排查：

- `sync_batch`：每次同步批次
- `sync_api_log`：每个 API 的执行结果
- `failed_request_log`：失败请求明细

## 常见问题

### 当前支持哪些真实积加 API？

当前已验证并启用 `amazon_shop_page`、`org_manage_query`、`role_list`、`dictionary_query`、`rate_page`、`continent_country_tree`、`ship_transport_list`、`country_tree`、`category_page`、`brand_page`、`product_page`、`amazon_msku_page`、`parent_product_page`、`kb_product_page`、`fba_warehouse_page`、`store_location_page`、`multi_shop_query`、`platform_msku_page`、`crm_tags_page`、`inventory_team_query`、`fba_inventory_page`、`fba_inventory_v2_page`、`inventory_adjustments_page`、`product_inventory_page`、`storage_inbound_page`、`transfer_page`、`lot_no_page`、`procure_detail`、`storage_return_page`、`strategy_template_page`、`traffic_analysis_page`、`traffic_page`、`traffic_sku_page`、`shipment_data_page`、`storage_ledger_page`、`storage_ledger_detail_page`、`storage_ledger_month_page`、`inventory_receipts_page`、`purchase_sale_storage_fba_page`、`purchase_plan_page`、`product_detail`、`country_province_query`、`transfer_detail`、`lot_no_detail` 和 `base_currency_query`。
`storage_inbound_detail` 也属于当前 enabled 清单；`ship_transport_list` 已按当前官方 GET 契约完成真实验证并恢复 daily enabled，因此 enabled 总数为 46。

另有一批已完成小窗口或风险验证但默认未启用的接口，例如 `traffic_sku_analysis_page`、`product_analyze_multi_index_page`、`store_sales_performance_page`、`market_analyze_page`、`listing_analyze_page`、`listing_analyze_multi_index_page`、`sale_profit_page`、`allocation_detail_page`、`profit_cost_analysis_page`、`financial_profit_analysis_page`、`financial_analysis_v2_page`、`financial_analysis_columns_query`、`financial_analysis_month_v2_query`、`inventory_event_page`、`inventory_age_page` 和若干库存、SKU 映射、详情类接口。这些接口需先评估数据量、限流和业务风险，再决定是否进入每天的 enabled 批量同步。十三个新增统计候选均已通过 `commit_per_page` 单接口短事务验证；统计菜单 17 个文档接口已全部配置并完成真实验证，其中 3 个 enabled、14 个 disabled。`market_analyze_page`、`financial_analysis_columns_query` 和月度对象查询没有有效 total，因此 checkpoint 如实记录 `total_count=null`。短事务页写入如果被 SQLAlchemy 明确认定为失效连接，会利用幂等 upsert 换新连接重试一次；其他数据库错误仍直接失败。enabled 主链现已按配置复用该路径，但新增候选仍全部关闭，必须另行完成运行时长和业务风险评估后才能启用。

全平台当前 YAML 与 DB 均为 74 个配置、46 个 enabled；catalog 的 187 个公开文档接口中已配置 66 个，尚未配置 121 个。基础数据板块当前为 10 个已配置、5 个终态暂缓、1 个待审，仍未收口；新增的 `monthly_statement_amount_query` 和 `all_user_list` 均保持 disabled，没有扩大每日批量范围。
当前状态更新：全平台 YAML 与 DB 均为 75 个配置、46 个 enabled；catalog 的 187 个公开文档接口中已配置 67 个，尚未配置 120 个。基础数据板块为 11 个已配置、5 个终态暂缓、0 个待审，已按审核终态收口；这不表示该板块的全部接口都已配置。新增的 `monthly_statement_amount_query`、`all_user_list` 和 `file_file_url_query` 均保持 disabled，没有扩大每日批量范围。其中附件链接接口只使用已证明的真实附件 ID 小样本做 raw-only 备份，审核和日志不输出附件 ID 或链接。

产品板块已按审核终态收口：8 个接口已配置且 enabled，10 个接口有明确终态，待审为 0。文档 5070「查询变体属性」因没有真实 `attributeName` 参数来源登记为 `defer_no_param_source`，没有新增业务配置或发起真实请求；这同样不表示产品板块 18 个接口均已配置。

### accessToken 如何获取？

根据积加开放平台文档 `id=596`，获取 token 的文档路径是 `POST /api_token`，实际开放接口网关前缀是 `/api/open`，所以程序会请求 `/api/open/api_token`。请求体包含 `appId` 和 `appKey`，响应数据包含 `accessToken`、`expiresIn` 和 `expiresOut`。

程序会把 accessToken 缓存在 `logs/token_cache.json`，并提前 60 秒视为过期。该文件包含敏感 token，已在 `.gitignore` 中排除。

### 当前接入了哪个业务 API？

登录 Web 后打开 `/api-catalog`。默认页展示数据库中已发布的接口、可获取的数据规则、
平台/账号状态、最近运行和数据量；切换“官方接口目录”可查看尚未接入的官方接口。
CLI 批量范围以 `api_config.enabled` 为准，不能用 README 中的历史数量判断当前状态。

### 如何运行测试？

```bash
python -m unittest discover -s tests -p "test_*.py"
```

### 示例 API 字段是否可以直接用于生产？

不能一概直接使用。`config/api_config.example.yaml` 中已有一批真实验证过的接口配置，也保留了少量占位示例；生产启用前应确认对应 `api_code` 已通过真实文档、单接口同步和数据库核验。

### 没有稳定业务主键怎么办？

后续同步逻辑会对原始 JSON 计算 `data_hash`，通过 `api_code + data_hash` 去重。

## 安全注意事项

- 不要提交 `.env`。
- 不要提交 `logs/token_cache.json`。
- 不要在 README、YAML 或 Python 文件中写真实密钥。
- PolarDB 账号建议使用最小权限。
- ECS 到 PolarDB 建议使用内网地址和安全组限制。

## 仓库板块进度

仓库板块已接入并真实验证供应商仓接口 `supplier_warehouse_page`（文档 64），保持 `enabled=false`。该接口无业务参数来源、使用 `id` 幂等和 `createDate` 业务日期，敏感失败详情会脱敏；本次账号返回空列表，已如实记录为成功的 1 次请求、0 条数据，不扩大每日批量范围。当前全平台 YAML/DB 为 76 个配置、46 个 enabled；catalog 为 68 个已配置，仓库板块尚有 3 个待审接口。

自营仓接口 `self_warehouse_page`（文档 212）也已真实验证并保持 `enabled=false`：1 次请求、27 条数据、0 失败；联系人类字段仅 raw 备份，`data_date` 如实为空。全平台当前为 77 个配置、46 个 enabled，仓库板块尚有 2 个待审接口。

仓库板块现已完成审核终态收口：文档 1035 因公开响应含服务商凭证字段暂缓，文档 1449 因必填 `rnType` 缺少可证明的真实参数来源暂缓。当前仓库板块为 4 个已配置、2 个 enabled、2 个终态暂缓、0 个待审；这表示审核收口，不表示 6 个接口都已配置。

## 库存板块进度

库存板块现已完成审核终态收口：9 个接口已配置（其中 8 个 enabled），4 个写操作继续暂缓；文档 1022 的日窗口真实请求已有 400/50099 证据，登记为 `defer_runtime_rejected`。当前库存板块为 5 个终态暂缓、0 个待审；这表示审核收口，不表示 14 个接口都已配置。
## 采购板块进度

采购订单列表接口 `procure_page`（文档 86，`POST /purchase/srm/procure/page`）已完成真实单接口验证，保持 `enabled=false`。分页字段在 `pageInfo.page`/`pageInfo.pagesize`，同步引擎现支持用点路径写入嵌套分页参数；本次只请求第 1 页，100 条数据均使用 `id` 主键和 `data_hash` 幂等，`updateTime` 生成 `data_date`。

供应商信息列表接口 `supplier_page`（文档 43，`POST /purchase/srm/supplier/page`）也已完成真实单接口验证，保持 `enabled=false`。成功批次 `sync_20260720_182049_479213` 为 1 次请求、27 条成功、0 失败；联系人、电话、邮箱和地址仅保存在 raw JSON，审核不输出其值，按 `data_hash` 幂等，`createdAt` 生成 `data_date`。当前 YAML/DB 均为 79 个配置、46 个 enabled，catalog 保留 187 个有效公开文档详情并离线重分类为 71 个已配置、46 个 enabled；采购板块为 7 个已配置、5 个 enabled、13 个终态暂缓、3 个待审，尚未收口。

供应商产品列表接口 `supplier_sku_quote_page`（文档 91，`POST /purchase/srm/supplierSkuQuote/page`）已配置为 `enabled=false`，使用 `id` 幂等、`createdAt` 生成 `data_date`，人员标识只做 raw 备份。首次一页验证批次 `sync_20260729_120154_588297` 已安全写入 100 条，但因配置的单页上限低于上游有效总量，被分页完整性保护标记为失败，未写 checkpoint；这不是上游拒绝，也不应表述为已验证成功。当前 YAML/DB 为 80 个配置、46 个 enabled，catalog 为 72 个已配置、46 个 enabled；采购板块为 8 个已配置、5 个 enabled、13 个终态暂缓、2 个待审，尚未收口。

经确认提高到两页后，批次 `sync_20260729_121333_642328` 仍由同一保护机制停止：2 次请求已安全写入 200 条，说明上游有效总量仍超过两页；没有 checkpoint 或失败请求记录。接口继续保持默认关闭，后续必须先确认新的受限页数，不能直接扩大到未知范围。

阶段 16AH 已完成实时 `total` 驱动配置和真实单接口验证：YAML/DB 均不再设置固定 `max_pages`，并启用 `commit_per_page=true`，接口仍保持 `enabled=false`。成功批次 `sync_20260729_151815_934165` 按运行时 `total` 自动请求 98 页，写入 9,727 条 raw；主键和 hash 均为 9,727 个，`data_date` 无空值，checkpoint 为第 98 页、98 次请求和 9,727 条，失败请求为 0。后续运行仍按当次最新 `total` 计算，不固定沿用 98 页。

阶段 16AI 已完成采购快捷入库查询接口的真实终态审核。官方文档 1080 规定 `POST /purchase/srm/quickInbound/query` 使用可选的字符串数组 `data`，最多 100 个采购单号；本次从已验证的 `procure_page.raw_json.code` 取得真实采购单号，只按官方单元素数组格式发出 1 次请求。批次 `sync_20260730_100043_263810` 收到 HTTP 400 后立即停止，没有重试或尝试其他数组编码，raw 和 checkpoint 均为 0；失败日志未保存请求参数、响应正文或敏感值。

该候选已登记为 `defer_runtime_rejected`，临时 YAML/DB 配置已清理，失败 batch/API log 保留。同步引擎保留显式 `wrap_in_list=true` 的顶层字段数组包装能力，未启用时仍保持原标量行为。当前 YAML/DB 均为 80 个配置、46 个 enabled，配置差异为 0；实时官方 catalog 已刷新为 189 个有效详情、72 个已配置、46 个 enabled，采购板块为 8 个已配置、5 个 enabled、14 个终态暂缓、1 个待审，尚未收口。

阶段 16AJ 已完成采购主体查询接口的敏感终态收口。官方文档 5262 规定 `POST /purchase/srm/purchaseSubject/list` 为无请求体、非分页的读取接口，但响应包含联系人、邮箱、电话、税号、地址、银行账户和公章图片链接等高敏感字段，因此登记为 `defer_sensitive_credentials`，未新增业务配置、未调用真实业务 API。

采购板块当前为 23 个文档接口、8 个已配置、5 个 enabled、15 个终态暂缓、0 个待审，`closed=true`。这表示采购板块审核终态已收口，不表示 23 个接口均已配置；全平台仍为 80 个 YAML/DB 配置、46 个 enabled，catalog 为 189 个有效详情、72 个已配置、46 个 enabled。

## 物流板块进度

阶段 16AK-A 已按实时官方文档修正 `ship_transport_list`（文档 3059）的本地配置：请求方法为 `GET`、每页最大 100、按 `data.total` 动态分页、限流间隔 1 秒，并在重新验证前保持 `enabled=false`。旧的固定 `max_pages=10` 已删除，不再把猜测页数作为长期上限。

唯一一次只读首页预检返回 `total_count=292`、`page_size=100`、`required_pages=3`、`request_count=1`，耗时 1.613 秒；本阶段没有运行 `--sync-api-configs`、`--sync-api` 或完整 `--sync-enabled`。因此本地 YAML/catalog 为 80 个配置、45 个 enabled，数据库仍保留上一快照 80/46，等待下一次写操作确认后再同步配置。

阶段 16AK-B 已完成 GET 单接口真实验证：`--sync-api-configs` 后 YAML/DB 均为 80 个配置、45 个 enabled，目标接口保持 `enabled=false`；批次 `sync_20260730_112541_515611` 按运行时 `total=292` 请求 3 页，292 条成功、0 失败。当前批次主键和 hash 均为 292 个，checkpoint 为第 3 页、3 次请求和 292 条，失败请求为 0。

`raw_api_data` 当前共保留 293 条：本批次覆盖 292 条，另有 1 条历史记录本次上游未返回。原始备份不主动删除历史对象；后续是否恢复该接口的 daily enabled，需单独确认。

阶段 16AK-C 已将验证通过的 `ship_transport_list` 恢复为 daily enabled：YAML、catalog 与 DB 均为 80 个配置、46 个 enabled，目标仍使用 GET、每页 100、实时 `data.total` 分页和 1 秒限流。本阶段只执行配置同步，没有调用业务接口或运行完整 `--sync-enabled`；latest batch、raw 和 checkpoint 均保持 16AK-B 的成功证据。

## 物流发货单预检

阶段 16AL-A 已按官方文档 1027 为 `delivery_page` 增加默认关闭的本地配置：`POST /fulfillment/ship/delivery/page`，每页 100、按 `data.total` 动态分页，不设置固定总页数；`id` 缺失时回退到 `data_hash` 幂等，`updateTime` 生成 `data_date`，人员、金额、单号和备注等业务敏感字段只保存在 raw JSON。唯一一次首页预检返回实时 `total=18162`，对应当前 182 页、1 次请求，耗时 5.065 秒。

本阶段未同步配置或写数据库，因此本地 YAML 为 81/46，DB 仍为 80/46，唯一差异是 `delivery_page`。下一阶段须单独确认后增加 `commit_per_page=true`、同步配置并只运行该接口；182 页只是本次 total 的计算结果，后续仍按运行时 total 自动适应业务增长。

阶段 16AL-B 已完成发货单列表的真实单接口验证。配置同步后 YAML/DB 均为 81 个配置、46 个 enabled；`delivery_page` 保持关闭、无固定 `max_pages`，使用 `commit_per_page=true` 按页短事务。批次 `sync_20260730_143314_977605` 按运行时 `total=18168` 自动请求 182 页，18168 条成功、0 失败，数据库批次耗时 1110 秒。

本批次 raw 的业务主键和 data hash 均为 18168 个，无空主键、空日期或主键/日期映射错误；checkpoint 为第 182 页、182 次请求、18168 条和 total 18168，失败请求为 0。预检时 total 为 18162，真实同步增长 6 条仍被自动覆盖，证明没有把 182 页固化成长期上限。

接口继续保持 `enabled=false`。是否加入 daily enabled 必须单独确认；按本次数据量会为每日主链增加约 182 次请求和 18.5 分钟运行时间，但后续实际请求数仍以当次最新 total 为准。

阶段 16AL-C 已将真实验证通过的 `delivery_page` 加入 daily enabled。YAML、catalog 与 DB 均为 81 个配置、47 个 enabled；目标继续使用 POST、实时 total 动态分页、每页 100、`commit_per_page=true`、`id`/hash 幂等、`updateTime` 日期和敏感 raw-only。本阶段只同步配置，没有调用业务 API，16AL-B 的 batch、18168 条 raw、API log、checkpoint 和失败记录均未变化。

文档 1778 `POST /fulfillment/ship/cost/page` 是公开读取分页接口，但实时官方说明明确要求“发货单集合、时间必传一项”。各筛选字段的 `must=false` 不能解释为允许无筛选请求；单页最大 100、响应为 `data.rows/data.total`、默认每秒 2 次。

阶段 16AM-A 增加的本地 `logistics_cost_page` 配置继续保持默认关闭。此前只传分页字段的唯一一次预检返回 `ApiRequestError` 且没有取得 total；16AM-B 重新读取完整官方说明后确认该请求缺少官方要求的业务条件，因此不再复检，也不把旧异常猜测为 HTTP 拒绝或网络问题。

probe 现已安全记录包装内的原始异常类型和 HTTP 状态码；异常消息、URL、请求参数和响应正文不会进入日志。172 个 unittest、`compileall app tests`、dry-run 和 `git diff --check` 通过。

16AM-B 没有调用业务 API、没有同步配置或写数据库。本地 YAML 为 82/47，DB 为 81/47，唯一差异仍是目标 disabled 配置；下一阶段只读审核 `codes` 或时间条件的真实来源，确认前不得探测或同步。

## 物流发货单明细

阶段 16AN-A 已按官方文档 1028 接入 delivery_detail_query：POST /fulfillment/ship/delivery/query，从已验证的 delivery_page.raw_json.code 生成单元素 deliveryCodes，固定请求 needItem=true，非分页读取 data 数组。接口保持 enabled=false，人员、金额、物流跟踪和备注等字段只作敏感 raw 备份。

唯一单接口批次 sync_20260731_105320_767996 为 success：1 次请求、1 条成功、0 失败。响应 deliveryCode 是空字符串，因此没有写业务主键，按完整对象 data_hash 幂等；updateTime 已正确生成 data_date，checkpoint 记录 1 次请求、1 条结果和下一个参数偏移。

当前 YAML/DB 均为 83 个配置、47 个 enabled，配置差异为 0；logistics_cost_page 只随配置同步写入 DB 且继续 disabled，没有产生业务日志、raw、checkpoint 或失败记录。文档 1028 不进入 daily enabled，也不在本阶段扩大到 18,168 个来源。

## 销售退货订单运行终态

阶段 16AO-C 已按实时官方文档 9 正式接入 `POST /operation/sale/returnOrder/page`。配置保持 `enabled=false`，使用 `returnStartDate/returnEndDate` 31 天窗口、`pagesize=100`、实时 `data.total` 分页和按页短事务，不设置猜测性固定页数上限；订单号、退货原因、买家备注和商品字段只保存到敏感 raw。

首个正式窗口为 `2026-01-01` 至 `2026-01-31`，批次 `sync_20260825_170357_498282` 成功完成 416 次请求并处理 41,557 个返回行。上游包含完全相同的重复行，按官方 `id` 幂等后保留 38,198 条唯一 raw；主键、hash 和 `returnDateTime -> data_date` 均完整，checkpoint 已推进到 `2026-02-01`。

YAML/DB 均为 84 个配置、47 个 enabled，code/enabled/method/path 差异为 0；catalog 为 189/76/47。目标接口没有失败请求，named lock、外部事务、活动会话和同步进程均为空。当前只完成首个历史窗口验证，尚未继续后续窗口或加入 daily enabled。

## 数据同步管理平台

Web 管理服务独立位于 `backend/` 和 `frontend/`。当前支持受邀注册、邮箱密码登录、
服务端 Session Cookie、CSRF、退出、Admin/Operator/Viewer 固定角色、成员管理、账号与
同步策略、任务、运行、原始数据，以及 `/api-catalog` 接口中心。接口中心只展示和引导，
不允许在网页直接修改路径、分页或安全分类等底层配置。

Windows PowerShell 本地完整系统启动。API 固定监听 `127.0.0.1:8004`，Web 使用 `5183`
端口并默认监听 `127.0.0.1`；`dev-local.ps1` 会同时启动 API、唯一 Scheduler、指定数量的
常驻 Worker 和 Web，任一进程退出时会停止其余进程：

```powershell
.\scripts\setup.ps1
.\.venv\Scripts\python.exe -m alembic -c backend\alembic.ini upgrade head
.\scripts\setup-local-test.ps1
.\.venv\Scripts\python.exe -m dotenv -f .env.localtest run --override -- `
  ".\.venv\Scripts\python.exe" -m backend.app.cli bootstrap-admin --email admin@example.com
.\scripts\dev-local.ps1 -WorkerProcesses 4
```

`setup-local-test.ps1` 只需在首次使用固定本地隔离库时运行；它要求 `.env` 指向本机
`127.0.0.1:3306` 已完成同步表初始化的 `jijia_sync_isolated_20260827`，并生成不会被覆盖的
`.env.localtest`。
`dev-local.ps1` 启动的 Worker 会处理该隔离库中的排队任务；本地库存在有效账号凭据和排队任务时，
任务仍会调用真实积加 API。

隔离库队列为空、API 已单独运行在 `8004` 且没有其他 Worker 在线时，可以重复执行本地
冷启动门禁。`canary` 按 1→2→4 启动，`burst` 同时启动四个 Worker；两种模式都不启动
Scheduler，并在每轮结束后清理测试进程：

```powershell
.\scripts\worker-cold-start-canary.ps1 -Rounds 10 -Mode canary
.\scripts\worker-cold-start-canary.ps1 -Rounds 10 -Mode burst
```

本地 `MAIL_PROVIDER=console` 时，邀请地址只输出到执行邀请操作的进程终端；生产环境必须配置 SMTP、HTTPS、`SESSION_COOKIE_SECURE=true` 和带 `__Host-` 前缀的 Cookie 名。`0001` 只创建 `app_user`、`auth_action_token`、`user_session`，生产迁移必须由部署负责人执行。

完整检查：

```powershell
.\scripts\check.ps1
```

该入口覆盖 Ruff 格式与静态检查、Mypy、pytest、同步核心 unittest、compileall、
pip check、前端 Prettier/ESLint/TypeScript/Vitest/Vite build、重复代码、前后端死代码、
敏感字面量和 `git diff --check`。命令只做本地离线验证，不执行真实积加 API、数据库迁移、
生产数据库写入或部署。

Linux/CI 使用以下等价检查；执行前应已按 `requirements.txt`、`requirements-dev.txt`、
根目录和 `frontend/` 的 lockfile 安装依赖：

```bash
python -m ruff format --check backend
python -m ruff check backend
python -m mypy backend/app
python -m pytest tests/test_e2e_app.py -q
python -m pytest backend/tests --cov=backend.app --cov-report=term-missing
python -m unittest discover -s tests -p "test_*.py"
python -m compileall -q app backend tests
python -m pip check

cd frontend
npm run format:check
npm run lint:eslint
npm run typecheck
npm run test -- --run
npm run build
cd ..

npm run check:duplicates
npm run check:unused
python -m vulture backend/app --min-confidence 100
python scripts/check_sensitive_literals.py
git diff --check
```

需要做浏览器冒烟时，使用仓库内的 fail-closed 合成应用。它只使用内存 SQLite、
Fake 邮件和虚构账号，不启动 Worker，也不会调用积加 API；必须从不含 `.env` 的临时目录
启动。先在一个 PowerShell 窗口运行：

```powershell
$projectRoot = (Get-Location).Path
$e2eRoot = New-Item -ItemType Directory -Path `
  (Join-Path ([System.IO.Path]::GetTempPath()) ("jijia-e2e-" + [guid]::NewGuid().ToString("N")))
$env:PYTHONPATH = $projectRoot
$env:JIJIA_E2E_ENABLED = "1"
$env:JIJIA_E2E_PASSWORD = "请替换为至少12位合成密码"
Set-Location -LiteralPath $e2eRoot
& "$projectRoot\.venv\Scripts\python.exe" -m uvicorn `
  backend.tests.e2e_app:create_e2e_app --factory --host 127.0.0.1 --port 8003
```

再开一个 PowerShell 窗口启动前端：

```powershell
$env:DEV_PROXY_TARGET = "http://127.0.0.1:8003"
Set-Location -LiteralPath .\frontend
npm run dev -- --port 5181
```

管理员、操作员和只读账号分别为 `admin@e2e.example.com`、
`operator@e2e.example.com`、`viewer@e2e.example.com`，密码使用上面设置的合成密码。
这套环境只证明浏览器、API、角色权限和合成数据闭环，不代表 MySQL/PolarDB、真实积加 API、
SMTP 或 ECS 已验证。

M3 既有同步表升级前，只能对已经获准只读扫描的隔离 MySQL/PolarDB 副本执行：

```powershell
.\.venv\Scripts\python.exe -m backend.app.migration_preflight `
  --confirm-isolated-replica
```

命令只读取元数据、Session 时区、同步锁状态和迁移后身份冲突汇总，不执行 DDL，
也不会输出数据库连接串或业务记录。返回 `PREFLIGHT_PASSED` 只表示技术前置条件通过；
执行 `0003` 前仍须单独批准，并确认已停止写入、创建可恢复快照，以及 legacy 数据归属
和首次历史基线方案。真正执行时必须停止 worker/cron，由同一迁移会话持有
`jijia_polardb_sync_task` named lock；持锁后重跑身份、NULL 和 checkpoint 冲突检查，再
立即执行迁移。副本上的瞬时空闲不代表主库已经停写。MySQL DDL 不执行破坏性 down；
失败时使用副本快照或 PITR 恢复。

仅在上述业务门禁和数据库审批完成后，使用受控入口在隔离副本执行：

```powershell
.\.venv\Scripts\python.exe -m backend.app.migration_0003 `
  --confirm-isolated-replica `
  --confirm-snapshot-ready
```

该入口在一个数据库连接内完成持锁、复检、顺序 DDL、升级后检查和释放锁。任何 DDL
失败都会停止后续语句并返回 `restoreRequired=true`；输出不包含 SQL、异常文本、连接串
或业务记录。它不会映射 legacy 账号，也不会补种首次历史基线。

同步域增量 SQL 的唯一执行顺序如下，必须先在隔离副本完成演练并逐项获得批准：

1. `0003_sync_scope_and_history.sql`
2. `0004_api_config_runtime.sql`
3. `0004_sale_return_order_projection.sql`
4. `0005_raw_query_indexes.sql`
5. `0006_sale_return_created_index.sql`
6. `0007_raw_api_data_stat.sql`
7. `0008_api_rate_limit_state.sql`

两个 `0004` 分属不同能力，不能只按编号排序或漏执行。`0003`、`0007` 使用仓库受控入口；
`0004` 至 `0006` 以及 `0008` 当前由部署负责人按上述顺序人工执行，不进入服务自动启动流程。

Web API 提供两个公开健康检查：`GET /health/live` 只证明进程存活；
`GET /health/ready` 在生产会检查运行数据库可连接且实例未处于全局只读状态，数据库
不可用或只读时返回脱敏 503，供 ECS/Nginx 决定是否导流。该只读查询不证明运行账号
拥有 DML 权限，真实权限仍须在隔离副本和 ECS 发布演练中验证。M3 Worker 已使用数据库队列、
`SKIP LOCKED` 多执行器领取和数据库共享的单接口限流实现；
密码重置已实现，Redis、Celery 和第三方登录继续不属于当前 MVP。

任务详情中的批次号可直接进入对应运行详情和日志。原始数据列表支持按
`sync_batch_no` 查询，该字段的精确语义是“当前记录最后观察批次”，不是记录形成批次，
也不表示该批次曾出现的全部历史。运行详情使用 `observed_sync_batch_no` 查询“该批次
曾观察过的业务记录”，列表返回这些业务记录的当前快照，因此条目上的 `batchNo` 可能
晚于所查批次。完整形成与变化历史仍从 `raw_api_data_history.sync_batch_no` 追溯。

## Web 服务 ECS 原生部署

Web 第一版直接使用 ECS 上的 systemd、Nginx 和静态前端产物，不使用 Docker。仓库提供：

- `config/ecs/jijia-api.service.example`：FastAPI，仅监听 `127.0.0.1:8000`。
- `config/ecs/jijia-scheduler.service.example`：唯一 Scheduler，使用 `flock` 防止重复实例。
- `config/ecs/jijia-worker@.service.example`：单 Worker 模板；生产启用 `worker-1` 至 `worker-4` 四个实例。
- `config/ecs/nginx.conf.example`：TLS、SPA 静态资源、API/健康检查代理和登录限流。

生产运行凭据放在仅服务用户可读的 `.env`；迁移高权限凭据单独放在 `.env.migration`，
只能由获批迁移命令读取，不能配置到 API、Scheduler 或 Worker 的 `EnvironmentFile`。两个文件都不得提交。
三个 systemd 模板替换占位符后，分别安装为 `/etc/systemd/system/jijia-api.service`、
`/etc/systemd/system/jijia-scheduler.service` 和
`/etc/systemd/system/jijia-worker@.service`；Worker 模板中的 `__WORKER_PROCESSES__` 替换为 `4`，
该值声明全部 Worker 实例数并参与连接预算校验，不会让单个 unit 自行派生子进程。
运行 `.env` 同时设置 `SYNC_LOCK_SCOPE=account`、`DB_POOL_SIZE=3`、`DB_MAX_OVERFLOW=2`。

发布负责人在 ECS 上替换模板中的双下划线占位符后，按以下最短链路验证：

```bash
cd /path/to/jijia-polardb-sync
python3 -m venv .venv
./.venv/bin/python -m pip install -r requirements.txt
cd frontend && npm ci && npm run build && cd ..

# 只执行生产配置、已发布接口和运行库 SELECT 检查，不执行迁移或业务 API。
# 只有 API 范围检查前端产物，Scheduler 和 Worker 不依赖 frontend/dist。
./.venv/bin/python -m backend.app.release_preflight --confirm-read-only-database --service api
./.venv/bin/python -m backend.app.release_preflight --confirm-read-only-database --service scheduler
./.venv/bin/python -m backend.app.release_preflight --confirm-read-only-database --service worker

sudo systemd-analyze verify /etc/systemd/system/jijia-api.service
sudo systemd-analyze verify /etc/systemd/system/jijia-scheduler.service
sudo systemd-analyze verify /etc/systemd/system/jijia-worker@.service
sudo nginx -t
sudo systemctl daemon-reload
sudo systemctl enable jijia-api jijia-scheduler jijia-worker@worker-1 nginx

# 第一阶段：先确认 API 与数据库就绪，再启动任务生成器和 worker-1，最后对外提供服务。
sudo systemctl start jijia-api
curl --fail http://127.0.0.1:8000/health/ready
sudo systemctl start jijia-scheduler jijia-worker@worker-1
curl --fail --silent http://127.0.0.1:8000/health/worker | ./.venv/bin/python -c \
  'import json, sys; data = json.load(sys.stdin)["data"]; assert (data["configuredWorkerCount"], data["onlineWorkerCount"]) == (4, 1), data'
sudo systemctl reload-or-restart nginx

# 第二阶段：worker-1 验收通过后扩至两个 Worker。
sudo systemctl start jijia-worker@worker-2
curl --fail --silent http://127.0.0.1:8000/health/worker | ./.venv/bin/python -c \
  'import json, sys; data = json.load(sys.stdin)["data"]; assert (data["configuredWorkerCount"], data["onlineWorkerCount"]) == (4, 2), data'
systemctl is-active jijia-api jijia-scheduler jijia-worker@worker-{1..2} nginx

# 第三阶段：两个 Worker 验收通过后扩至四个 Worker。
sudo systemctl start jijia-worker@worker-{3..4}
curl --fail --silent http://127.0.0.1:8000/health/worker | ./.venv/bin/python -c \
  'import json, sys; data = json.load(sys.stdin)["data"]; assert (data["configuredWorkerCount"], data["onlineWorkerCount"]) == (4, 4), data'
systemctl is-active jijia-api jijia-scheduler jijia-worker@worker-{1..4} nginx

# 四个 Worker 验收通过后，才允许把 worker-2 至 worker-4 设为开机自启。
sudo systemctl enable jijia-worker@worker-{2..4}
curl --fail https://sync.example.com/health/ready
curl --fail https://sync.example.com/health/worker
```

`release_preflight` 通过只代表当前生产配置、YAML、数据库中的已发布接口和运行数据库目标符合启动条件；
API 范围还要求前端产物完整。它不代表批准迁移或部署。
`0003` 仍必须先在隔离副本完成演练，并由部署负责人单独授权。
默认运行 `jijia-worker@worker-1` 至 `jijia-worker@worker-4` 四个独立 systemd 实例。
同账号仍由账号锁串行；不同账号可并发。所有账号、进程和服务对相同接口共享数据库限流器，
HTTP 401 重试和 429 冷却也进入同一时间线。扩容前必须按
`(API 进程数 + Scheduler 进程数 + Worker 子进程数) × (DB_POOL_SIZE + DB_MAX_OVERFLOW)`
核对数据库连接预算，并严格按 1→2→4 扩容。每一阶段必须同时满足健康计数准确、队列能够回落，
且 journald 没有新增 429、数据库连接异常或任务所有权异常，才允许进入下一阶段；失败时停止本阶段新增 Worker，
回到上一稳定档位。
服务日志统一进入 journald：

```bash
journalctl -u jijia-api -u jijia-scheduler -u 'jijia-worker@worker-*' --since "2 hours ago"
```

应用或 unit 回滚时先停止领取和生成新任务，恢复上一版本应用、前端产物、运行 `.env` 和 unit 文件后，
按同一顺序重新验证；本流程不执行 Alembic downgrade，也不替代已批准的数据库恢复方案：

```bash
sudo systemctl stop jijia-worker@worker-{1..4} jijia-scheduler jijia-api
# 恢复上一版本应用、frontend/dist、运行 .env 和三个 systemd unit。
sudo systemctl disable jijia-worker@worker-{2..4}
sudo systemctl daemon-reload
sudo systemctl start jijia-api
curl --fail http://127.0.0.1:8000/health/ready
sudo systemctl start jijia-scheduler jijia-worker@worker-1
curl --fail http://127.0.0.1:8000/health/worker
sudo nginx -t
sudo systemctl reload-or-restart nginx
systemctl is-active jijia-api jijia-scheduler jijia-worker@worker-1 nginx
curl --fail https://sync.example.com/health/ready
curl --fail https://sync.example.com/health/worker
```

Worker 收到停止信号后不再领取新任务，并给当前长任务最多 3 小时完成。
当前仓库只完成本地部署就绪验证，尚未在真实 ECS、Nginx 或 PolarDB 上执行。
