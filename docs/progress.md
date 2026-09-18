# Project Progress

## Current Stage

阶段 16O 已完成：20 个 `commit_per_page` disabled 配置已按当前 YAML、catalog 风险标签和历史真实单接口证据完成只读分层，结果为低风险 3 个、中风险 7 个、高风险或存在阻断 10 个。推荐下一轮只对 `financial_analysis_v2_page` 做启用前审核；本阶段没有修改代码、YAML、DB 或 enabled 数量。

## Completed

- 阶段 1 已完成：
  - 创建根目录 `AGENTS.md`。
  - 创建 `app/` 基础模块。
  - 创建 `app/transformers/` 占位 transformer。
  - 创建 `config/api_config.example.yaml`。
  - 创建 `sql/init_tables.sql`，包含核心 6 张表。
  - 创建 `.env.example`、`requirements.txt`、`.gitignore`、`logs/.gitkeep`。
  - 创建 README 初稿。
- 阶段 2A 已完成：
  - `python -m app.main` 继续执行 dry-run，只读取 YAML，不连接数据库。
  - 新增 `python -m app.main --mock-sync`。
  - mock-sync 会写入 `sync_batch`、`sync_api_log` 和 `raw_api_data`。
  - 已实现稳定 `data_hash` 计算。
  - 已用 `ON DUPLICATE KEY UPDATE` 支持重复运行时更新同一条 mock 数据。
- 阶段 2B 已完成：
  - 已执行 `sql/init_tables.sql`，创建 6 张核心表。
  - 已执行 `python -m app.main --check-db`，数据库连接通过。
  - 已执行两次 `python -m app.main --mock-sync`。
  - 已验证重复运行后 `raw_api_data` 仍为 1 条，mock 原始数据没有重复膨胀。
  - 已改进 CLI 数据库错误处理，避免连接失败时打印完整异常栈和敏感连接信息。
- 阶段 3A/3B 已完成：
  - 已从积加开放平台文档 `id=596` 确认获取 token 接口。
  - 已确认真实 token 请求路径为 `/api/open/api_token`。
  - 已新增 `JIJIA_OPEN_GATEWAY_PREFIX=/api/open`。
  - 已实现 `JijiaAuthClient.get_access_token()`。
  - 已新增 `python -m app.main --test-token`。
  - 已实测 `--test-token` 成功，且不输出 accessToken。
- 阶段 3C 已完成：
  - 已从积加开放平台文档 `id=153` 读取“查询亚马逊店铺信息”接口。
  - 已新增 `amazon_shop_page` API 配置。
  - 已实现 `JijiaApiClient.request()`。
  - 已新增 `python -m app.main --test-api amazon_shop_page`。
  - 已实现单个业务 API 测试落库：写入 `sync_batch`、`sync_api_log`、`raw_api_data`。
  - 当前只请求第一页，`pagesize=20`，不做全量分页循环。
- 阶段 3D 已完成：
  - 已在用户确认后执行真实业务 API 测试：`.\\.venv\\Scripts\\python.exe -m app.main --test-api amazon_shop_page`。
  - 执行成功，批次号为 `sync_20260702_141413_745961`。
  - `sync_batch` 状态为 `success`，`success_api_count=1`，`failed_api_count=0`。
  - `sync_api_log` 中 `amazon_shop_page` 状态为 `success`，`request_count=1`，`success_count=7`，`failed_count=0`。
  - `raw_api_data` 中本批次写入 7 条 `amazon_shop_page` 原始记录。
  - 验证过程没有输出 accessToken，也没有输出完整业务 `raw_json`。
- 阶段 3E 已完成：
  - `JijiaApiClient.request()` 支持传入单次请求参数覆盖，用于分页请求。
  - `amazon_shop_page` 配置新增 `page.max_pages=5` 作为测试保护。
  - `SyncEngine.test_api_once()` 已按 `page`、`pagesize`、`data.total` 做分页循环。
  - 每页返回数据继续写入 `raw_api_data`，仍使用 `data_hash` 去重。
  - API 成功后会 upsert `sync_checkpoint`，记录最后页、请求次数、写入条数、总数和批次号。
  - 已执行真实分页测试，批次号为 `sync_20260702_163706_146056`。
  - 本次 `sync_api_log.request_count=2`，`success_count=13`，`failed_count=0`。
  - `sync_checkpoint.last_sync_batch_no=sync_20260702_163706_146056`。
- 阶段 3F 已完成：
  - `amazon_shop_page` 配置新增 `retry.retries=3`、`retry.delay_seconds=1`。
  - 真实 API 分页请求已通过 `retry_call()` 做最小重试。
  - 重试失败时会写入 `failed_request_log`。
  - 失败日志写入 `request_url`、`request_method`、`request_params`、`response_status_code`、`response_body`、`error_message`、`retry_count`。
  - `request_params` 不包含 `accessToken`。
  - 正常真实 API 验证成功，批次号 `sync_20260702_170155_676007`，请求 2 页，写入 13 条。
  - 临时错误路径验证成功，失败批次号 `sync_20260702_170231_079008`，`request_count=2`，`retry_count=1`。
  - 已确认失败日志中 `request_params` 不包含 `accessToken`。
- 阶段 3G 已完成：
  - 新增 CLI 参数 `--sync-api`。
  - `--sync-api` 复用当前单接口同步链路，包括分页、`sync_checkpoint`、重试和失败日志。
  - `--test-api` 保留为兼容入口，仍可用于开发调试。
  - README 已补充 `--sync-api amazon_shop_page` 的本地运行、ECS 和 cron 示例。
  - 已执行 `--sync-api amazon_shop_page` 成功，批次号 `sync_20260702_170601_361540`，请求 2 页，写入 13 条。
  - 已执行 `--test-api amazon_shop_page` 成功，批次号 `sync_20260702_170650_348326`，确认兼容入口仍可用。
  - 已给新增关键代码补充中文备注，覆盖分页参数覆盖、失败上下文脱敏、真实请求次数统计、`max_pages` 保护、重试计数、checkpoint 摘要和失败请求落库边界。
- 阶段 3H 已完成：
  - 已明确批次边界：一个 `sync_batch` 表示一次调度运行，多接口同步时所有 enabled API 共用同一个批次。
  - 已整理 `config/api_config.example.yaml` 启用状态：占位接口 `order_list`、`product_list` 禁用，真实验证过的 `amazon_shop_page` 启用。
  - 已新增 CLI 参数 `--sync-enabled`。
  - `--sync-enabled` 会读取 YAML 中 `enabled: true` 的接口，在同一个批次下逐个写入 `sync_api_log`。
  - 当前第一版 enabled 同步仍只跑 `amazon_shop_page`，没有新增第二个业务接口。
  - 已执行 `--sync-enabled` 成功，批次号 `sync_20260702_171221_307284`，`total_api_count=1`，请求 2 页，写入 13 条。
  - README 已补充 `--sync-enabled` 本地运行、ECS 和 cron 示例。
- 阶段 3I 已完成：
  - 已从积加开放平台文档 `id=66` 调研“获取本位币币种”，确认其响应 `data` 是单个字符串，不适合当前列表型 raw item 同步模型，暂不接入。
  - 已从积加开放平台文档 `id=2537` 调研“查询部门列表”。
  - 已选择“查询部门列表”作为第二个低风险业务 API 候选。
  - 已确认文档路径为 `POST /middle/base/orgManage/query`，实际请求路径将是 `/api/open/middle/base/orgManage/query`。
  - 已确认请求头需要 `accessToken`。
  - 已确认请求体字段：`startTime`、`endTime`、`status`、`condition`，均可选。
  - 已确认响应列表字段为 `data`，无分页字段。
  - 已确认候选主键字段为 `id`，候选日期字段为 `createdTime`。
  - 已新增 `org_manage_query` YAML 配置，默认 `enabled: false`。
  - 未执行 `org_manage_query` 真实 API，避免在未确认前扩大真实同步范围。
- 阶段 3J 已完成：
  - 已在保持 `org_manage_query.enabled=false` 的前提下执行单接口验证。
  - 已运行 `.\\.venv\\Scripts\\python.exe -m app.main --sync-api org_manage_query`。
  - 验证成功，批次号 `sync_20260702_173136_319602`，请求 1 次，写入 1 条。
  - `sync_batch.status=success`，`success_api_count=1`，`failed_api_count=0`。
  - `sync_api_log.status=success`，`request_count=1`，`success_count=1`，`failed_count=0`。
  - `raw_api_data.source_primary_key` 已从 `id` 写入。
  - `raw_api_data.data_date` 已从 `createdTime` 提取日期写入。
  - `sync_checkpoint` 已写入 `org_manage_query` 的分页摘要。
  - 已再次运行 `--sync-enabled`，确认仍只同步 `amazon_shop_page`，没有执行 `org_manage_query`。
- 阶段 3K 已完成：
  - 已将 `org_manage_query.enabled` 从 `false` 改为 `true`。
  - 未新增第三个 API。
  - dry-run 已确认 enabled API 变为 2 个：`amazon_shop_page`、`org_manage_query`。
  - 已运行 `.\\.venv\\Scripts\\python.exe -m app.main --sync-enabled`。
  - 验证成功，批次号 `sync_20260702_174830_926688`，`apis=2`，`rows=14`，`requests=3`。
  - 数据库确认该批次 `total_api_count=2`、`success_api_count=2`、`failed_api_count=0`。
  - 同一批次下有两条 `sync_api_log`：`amazon_shop_page` 成功写入 13 条，`org_manage_query` 成功写入 1 条。
  - 两个 API 的 `sync_checkpoint.last_sync_batch_no` 均已更新到该批次。
- 阶段 3L 已完成：
  - 新增 `JIJIA_TOKEN_CACHE_PATH` 配置，默认 `logs/token_cache.json`。
  - `JijiaAuthClient.get_access_token()` 会先读取本地 token 缓存，缓存不存在或快过期时才请求 `/api/open/api_token`。
  - token 缓存提前 60 秒视为过期。
  - `logs/token_cache.json` 已加入 `.gitignore`。
  - 已更新 README，说明 token 缓存路径、安全边界和当前 enabled API。
  - 已连续运行两次 `--test-token`，第二次命中缓存且未输出 accessToken。
  - 已运行 `--sync-enabled`，确认 token 缓存不影响真实同步。
- 阶段 3M 已完成：
  - 新增 CLI 参数 `--sync-api-configs`。
  - 新增 `SyncEngine.sync_api_configs()`，将 YAML API 配置 upsert 到 `api_config` 表。
  - 写入字段包括 `api_code`、`api_name`、`enabled`、`method`、`path`、`config_json`。
  - 已连续运行两次 `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`。
  - 每次均同步 4 条配置，重复运行没有重复插入。
  - 数据库确认 `api_config` 总数为 4，启用数为 2。
  - `amazon_shop_page` 和 `org_manage_query` 为启用状态。
  - `order_list` 和 `product_list` 为禁用状态。
  - 本阶段未新增第三个业务 API，也未请求真实业务接口。
- 阶段 3N 已完成：
  - 已通过公开文档站只读接口确认文档目录来自 `/api/openAdmin/doc/tree`。
  - 已确认文档详情接口来自 `/api/openAdmin/doc/detail?id=2885`。
  - 已选择“查询角色列表”作为第三个低风险业务 API 候选。
  - 已确认文档路径为 `POST /middle/base/role/list`，实际请求路径将是 `/api/open/middle/base/role/list`。
  - 已确认请求头需要 `accessToken`。
  - 已确认请求体示例为 `{}`，无必填请求体字段。
  - 已确认响应列表字段为 `data`，无分页字段。
  - 已确认候选主键字段为 `roleId`。
  - 该接口响应未提供明确时间字段，`date_field` 暂为空。
  - 已新增 `role_list` YAML 配置，默认 `enabled: false`。
  - 本阶段未执行 `role_list` 真实 API，避免未经单接口验证就扩大同步范围。
- 阶段 3O 已完成：
  - 已保持 `role_list.enabled=false`。
  - 已运行 `.\\.venv\\Scripts\\python.exe -m app.main --sync-api role_list`。
  - 验证成功，批次号 `sync_20260702_181544_620924`，请求 1 次，写入 36 条。
  - `sync_batch.status=success`，`success_api_count=1`，`failed_api_count=0`。
  - `sync_api_log.status=success`，`request_count=1`，`success_count=36`，`failed_count=0`。
  - 本批次 `raw_api_data` 中 `role_list` 写入 36 条，且 36 条都有 `source_primary_key`。
  - `source_primary_key` 已确认来自 `roleId`。
  - `sync_checkpoint.last_sync_batch_no` 已更新为 `sync_20260702_181544_620924`。
  - 已再次运行 `.\\.venv\\Scripts\\python.exe -m app.main --sync-enabled`。
  - `--sync-enabled` 成功，批次号 `sync_20260702_181639_728324`，仍为 `apis=2`，未执行 `role_list`。
- 阶段 3P 已完成：
  - 已将 `role_list.enabled` 从 `false` 改为 `true`。
  - 已运行 `.\\.venv\\Scripts\\python.exe -m app.main`，dry-run 显示 enabled API 为 3 个。
  - 已运行 `.\\.venv\\Scripts\\python.exe -m app.main --sync-enabled`。
  - 验证成功，批次号 `sync_20260702_181854_408493`，`apis=3`，`rows=50`，`requests=4`。
  - 数据库确认该批次 `total_api_count=3`、`success_api_count=3`、`failed_api_count=0`。
  - 同一批次下有三条 `sync_api_log`：`amazon_shop_page` 写入 13 条，`org_manage_query` 写入 1 条，`role_list` 写入 36 条。
  - 三个 API 的 `sync_checkpoint.last_sync_batch_no` 均已更新到该批次。
  - 已运行 `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，同步配置数为 5。
  - 数据库确认 `api_config.role_list.enabled=1`。
- 阶段 3Q 已完成：
  - 已通过公开文档站只读接口 `/api/openAdmin/doc/detail?id=2538` 调研“查询字典管理列表”。
  - 已选择“查询字典管理列表”作为第四个低风险业务 API 候选。
  - 已确认文档路径为 `POST /middle/base/dictionary/query`，实际请求路径将是 `/api/open/middle/base/dictionary/query`。
  - 已确认请求头需要 `accessToken`。
  - 已确认请求体字段 `id`、`dictionaryTypeList`、`status`、`startRecordDate`、`endRecordDate`、`type` 均可选。
  - 已确认响应列表字段为 `data`，无分页字段。
  - 已确认候选主键字段为 `id`，候选日期字段为 `recordDate`。
  - 已新增 `dictionary_query` YAML 配置，默认 `enabled: false`。
  - 本阶段未执行 `dictionary_query` 真实 API，避免未经单接口验证就扩大同步范围。
- 阶段 3R 已完成：
  - 已保持 `dictionary_query.enabled=false`。
  - 首次运行 `.\\.venv\\Scripts\\python.exe -m app.main --sync-api dictionary_query` 时工具超时。
  - 已确认接口本身不慢：短 timeout 单次请求空请求体返回 700 条，文档示例请求体返回 6 条。
  - 已确认根因是 700 条 raw 数据逐条 SQL 写入远程 PolarDB，耗时超过工具窗口。
  - 已新增 `tests/test_sync_engine_bulk_insert.py`，用标准库 unittest 验证多条 raw item 只触发一次批量 execute。
  - 已将 `_sync_api_in_batch()` 中 raw item 写入改为按页批量写入。
  - 已保留 `_insert_raw_item()` 作为单条兼容入口，内部复用批量写入。
  - 已重试 `.\\.venv\\Scripts\\python.exe -m app.main --sync-api dictionary_query`。
  - 验证成功，批次号 `sync_20260702_182921_619823`，请求 1 次，写入 700 条。
  - `sync_batch.status=success`，`success_api_count=1`，`failed_api_count=0`。
  - `sync_api_log.status=success`，`request_count=1`，`success_count=700`，`failed_count=0`。
  - 本批次 `raw_api_data` 中 `dictionary_query` 写入 700 条，700 条都有 `source_primary_key` 和 `data_date`。
  - `source_primary_key` 已确认来自 `id`，`data_date` 已确认来自 `recordDate`。
  - `sync_checkpoint.last_sync_batch_no` 已更新为 `sync_20260702_182921_619823`。
  - 已再次运行 `.\\.venv\\Scripts\\python.exe -m app.main --sync-enabled`。
  - `--sync-enabled` 成功，批次号 `sync_20260702_182952_860680`，仍为 `apis=3`，未执行 `dictionary_query`。
- 阶段 3S 已完成：
  - 已将 `dictionary_query.enabled` 从 `false` 改为 `true`。
  - 已运行 `.\\.venv\\Scripts\\python.exe -m app.main`，dry-run 显示 enabled API 为 4 个。
  - 已运行 `.\\.venv\\Scripts\\python.exe -m app.main --sync-enabled`。
  - 验证成功，批次号 `sync_20260702_183342_663394`，`apis=4`，`rows=750`，`requests=5`。
  - 数据库确认该批次 `total_api_count=4`、`success_api_count=4`、`failed_api_count=0`。
  - 同一批次下有四条 `sync_api_log`：`amazon_shop_page` 写入 13 条，`org_manage_query` 写入 1 条，`role_list` 写入 36 条，`dictionary_query` 写入 700 条。
  - 四个 API 的 `sync_checkpoint.last_sync_batch_no` 均已更新到该批次。
  - 已运行 `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，同步配置数为 6。
  - 数据库确认 `api_config.dictionary_query.enabled=1`。
- 阶段 3T 已完成：
  - 已通过公开文档站只读接口 `/api/openAdmin/doc/detail?id=139` 调研“查询汇率设置”。
  - 已选择“查询汇率设置”作为第五个低风险业务 API 候选。
  - 已确认文档路径为 `POST /middle/base/rate/page`，实际请求路径将是 `/api/open/middle/base/rate/page`。
  - 已确认请求头需要 `accessToken`。
  - 已确认请求体必填 `page` 和 `pagesize`，可选 `condition.currency` 和 `condition.monthDate`。
  - 已确认响应列表字段为 `data.rows`，总数字段为 `data.total`。
  - 已确认候选主键字段为 `id`，候选日期字段为 `lastDate`。
  - 已新增 `rate_page` YAML 配置，默认 `enabled: false`。
  - 本阶段未执行 `rate_page` 真实 API，避免未经单接口验证就扩大同步范围。
- 阶段 3U 已完成：
  - 已保持 `rate_page.enabled=false`。
  - 首次运行 `.\\.venv\\Scripts\\python.exe -m app.main --sync-api rate_page` 时，请求 5 页写入 2500 条，但接口 `total_count=2590`，命中 `max_pages=5` 保护值。
  - 已将 `rate_page.page.max_pages` 从 5 调整为 10，同时保持 `amazon_shop_page.page.max_pages=5` 不变。
  - 已重跑 `.\\.venv\\Scripts\\python.exe -m app.main --sync-api rate_page`。
  - 验证成功，批次号 `sync_20260702_184242_907458`，请求 6 次，写入 2590 条。
  - `sync_batch.status=success`，`success_api_count=1`，`failed_api_count=0`。
  - `sync_api_log.status=success`，`request_count=6`，`success_count=2590`，`failed_count=0`。
  - 本批次 `raw_api_data` 中 `rate_page` 写入 2590 条，2590 条都有 `source_primary_key` 和 `data_date`。
  - `source_primary_key` 已确认来自 `id`，`data_date` 已确认来自 `lastDate`。
  - `sync_checkpoint.checkpoint_value` 已记录 `item_count=2590`、`total_count=2590`。
  - 已再次运行 `.\\.venv\\Scripts\\python.exe -m app.main --sync-enabled`。
  - `--sync-enabled` 成功，批次号 `sync_20260702_184336_640026`，仍为 `apis=4`，未执行 `rate_page`。
- 阶段 3V 已完成：
  - 已将 `rate_page.enabled` 从 `false` 改为 `true`。
  - 已运行 `.\\.venv\\Scripts\\python.exe -m app.main`，dry-run 显示 enabled API 为 5 个。
  - 已运行 `.\\.venv\\Scripts\\python.exe -m app.main --sync-enabled`。
  - 验证成功，批次号 `sync_20260702_184635_149384`，`apis=5`，`rows=3340`，`requests=11`。
  - 数据库确认该批次 `total_api_count=5`、`success_api_count=5`、`failed_api_count=0`。
  - 同一批次下有五条 `sync_api_log`：`amazon_shop_page` 写入 13 条，`org_manage_query` 写入 1 条，`role_list` 写入 36 条，`dictionary_query` 写入 700 条，`rate_page` 写入 2590 条。
  - 五个 API 的 `sync_checkpoint.last_sync_batch_no` 均已更新到该批次。
  - 已运行 `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，同步配置数为 7。
  - 数据库确认 `api_config.rate_page.enabled=1`。
- 阶段 3W 已完成：
  - 已调研“获取国家省州信息”，文档 id 为 `5066`，但其请求体 `countryCode` 必填，不适合当前单次 YAML 配置直接全量同步，暂不接入。
  - 已调研“查询所有用户列表”，文档 id 为 `25`，字段包含 phone/email，当前阶段不作为低风险候选。
  - 已通过公开文档站只读接口 `/api/openAdmin/doc/detail?id=4943` 调研“获取大洲国家关系”。
  - 已选择“获取大洲国家关系”作为第六个低风险业务 API 候选。
  - 已确认文档路径为 `POST /middle/base/continentCountryTree/page`，实际请求路径将是 `/api/open/middle/base/continentCountryTree/page`。
  - 已确认请求头需要 `accessToken`。
  - 已确认请求体为空 `{}`。
  - 已确认响应列表字段为 `data`，无分页字段。
  - 文档未展开 `data` 元素字段，因此不编造主键，第一版使用 `data_hash` 去重。
  - 已新增 `continent_country_tree` YAML 配置，默认 `enabled: false`。
  - 本阶段未执行 `continent_country_tree` 真实 API。
- 阶段 3X 已完成：
  - 已保持 `continent_country_tree.enabled=false`。
  - 已运行 `.\\.venv\\Scripts\\python.exe -m app.main --sync-api continent_country_tree`。
  - 验证成功，批次号 `sync_20260702_185400_214824`，请求 1 次，写入 7 条。
  - `sync_batch.status=success`，`success_api_count=1`，`failed_api_count=0`。
  - `sync_api_log.status=success`，`request_count=1`，`success_count=7`，`failed_count=0`。
  - 本批次 `raw_api_data` 中 `continent_country_tree` 写入 7 条，`source_primary_key` 为空，7 条都有 `data_hash`。
  - 已确认该接口按 `api_code + data_hash` 去重。
  - `sync_checkpoint.last_sync_batch_no` 已更新为 `sync_20260702_185400_214824`。
  - 已再次运行 `.\\.venv\\Scripts\\python.exe -m app.main --sync-enabled`。
  - `--sync-enabled` 成功，批次号 `sync_20260702_185428_805435`，仍为 `apis=5`，未执行 `continent_country_tree`。
- 阶段 3Y 已完成：
  - 已将 `continent_country_tree.enabled` 从 `false` 改为 `true`。
  - 已运行 `.\\.venv\\Scripts\\python.exe -m app.main`，dry-run 显示 enabled API 为 6 个。
  - 已运行 `.\\.venv\\Scripts\\python.exe -m app.main --sync-enabled`。
  - 验证成功，批次号 `sync_20260702_205600_866582`，`apis=6`，`rows=3347`，`requests=12`。
  - 数据库确认该批次 `total_api_count=6`、`success_api_count=6`、`failed_api_count=0`。
  - 同一批次下有六条 `sync_api_log`，六个 API 均成功。
  - `continent_country_tree` 在 enabled 批次中写入 7 条，`source_primary_key` 为空，7 条都有 `data_hash`。
  - 六个 API 的 `sync_checkpoint.last_sync_batch_no` 均已更新到该批次。
  - 已运行 `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，同步配置数为 8。
  - 数据库确认 `api_config.continent_country_tree.enabled=1`。
- 阶段 3Z 已完成：
  - 已调研“根据亚马逊店铺id查询仓库信息”，文档 id 为 `1179`，但需要店铺 ID 集合入参，暂不接入当前单次全量配置模型。
  - 已调研“根据亚马逊店铺id查询店铺名称”，文档 id 为 `1177`，但需要店铺 ID 集合入参，且响应 `data` 为字符串，暂不接入。
  - 已调研“查询仓库信息列表”，文档 id 为 `1035`，但响应字段包含联系人、电话、邮箱、地址和第三方仓 token 字段，当前阶段不作为低风险候选。
  - 已通过公开文档站只读接口 `/api/openAdmin/doc/detail?id=3059` 调研“查询物流方式列表”。
  - 已选择“查询物流方式列表”作为第七个低风险业务 API 候选。
  - 已确认文档路径为 `POST /fulfillment/ship/transport/list`，实际请求路径将是 `/api/open/fulfillment/ship/transport/list`。
  - 已确认请求头需要 `accessToken`。
  - 已确认请求体必填 `page` 和 `pagesize`，可选 `name`、`status`、`shipperCountry`。
  - 已确认响应列表字段为 `data.rows`，总数字段为 `data.total`。
  - 已确认候选主键字段为 `id`，文档未提供明确日期字段，`date_field` 暂为空。
  - 已新增 `ship_transport_list` YAML 配置，默认 `enabled: false`。
  - 本阶段未执行 `ship_transport_list` 真实 API。
- 阶段 4A 已完成：
  - 已保持 `ship_transport_list.enabled=false`。
  - 首次执行 `.\\.venv\\Scripts\\python.exe -m app.main --sync-api ship_transport_list` 时写库失败，错误为 PolarDB/MySQL `Lock wait timeout exceeded`。
  - 已确认根因候选是当前库存在一个 `Sleep` 状态但仍持有 InnoDB 事务的连接，线程号为 `3063892`。
  - 已结束该数据库线程，让未提交事务回滚。
  - 已重跑 `.\\.venv\\Scripts\\python.exe -m app.main --sync-api ship_transport_list`。
  - 验证成功，批次号 `sync_20260702_211036_562677`，请求 4 次，写入 286 条。
  - `sync_batch.status=success`，`success_api_count=1`，`failed_api_count=0`。
  - `sync_api_log.status=success`，`request_count=4`，`success_count=286`，`failed_count=0`。
  - `raw_api_data` 中 `ship_transport_list` 总计 286 条，286 条都有 `source_primary_key` 和 `data_hash`。
  - `source_primary_key` 已确认来自响应字段 `id`。
  - 文档未提供明确日期字段，因此 `data_date` 为空。
  - `sync_checkpoint.checkpoint_value` 已记录 `last_page=3`、`request_count=4`、`item_count=286`、`total_count=286`。
  - 已再次运行 `.\\.venv\\Scripts\\python.exe -m app.main --sync-enabled`。
  - `--sync-enabled` 成功，批次号 `sync_20260702_211145_801882`，仍为 `apis=6`，未执行 `ship_transport_list`。
- 阶段 4B 已完成：
  - 已将 `ship_transport_list.enabled` 从 `false` 改为 `true`。
  - 已运行 `.\\.venv\\Scripts\\python.exe -m app.main`，dry-run 显示 enabled API 为 7 个。
  - 已运行 `.\\.venv\\Scripts\\python.exe -m app.main --sync-enabled`。
  - 验证成功，批次号 `sync_20260702_211510_012826`，`apis=7`，`rows=3633`，`requests=17`。
  - 数据库确认该批次 `total_api_count=7`、`success_api_count=7`、`failed_api_count=0`。
  - 同一批次下有七条 `sync_api_log`，七个 API 均成功。
  - `ship_transport_list` 在 enabled 批次中写入 286 条，286 条都有 `source_primary_key` 和 `data_hash`。
  - `ship_transport_list` 本批次 `request_count=5`，单接口验证时为 4；本次最终无失败日志，数据量和 checkpoint 正常。
  - `sync_checkpoint.last_sync_batch_no` 已更新为 `sync_20260702_211510_012826`。
  - 已运行 `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，同步配置数为 9。
  - 数据库确认 `api_config.ship_transport_list.enabled=1`，当前 `api_config` 启用数为 7。
- 阶段 4C 已完成：
  - 已通过公开文档站只读接口 `/api/openAdmin/doc/tree` 查看文档目录。
  - 已对比基础数据、产品、库存、物流、财务、报表等模块候选。
  - 已选择“获取已授权店铺区域国家”作为第八个低风险业务 API 候选，文档 id 是 `4563`。
  - 已确认文档路径为 `GET /middle/base/countryTree/page`，实际请求路径将是 `/api/open/middle/base/countryTree/page`。
  - 已确认请求头需要 `accessToken`。
  - 已确认请求体示例为空 `{}`。
  - 已确认响应列表字段为 `data`，无分页字段。
  - 文档未展开 `data` 元素字段，因此不编造主键，第一版使用 `data_hash` 去重。
  - 已新增 `country_tree` YAML 配置，默认 `enabled: false`。
  - 本阶段未执行 `country_tree` 真实 API，避免未经单接口验证就扩大真实同步范围。
- 阶段 4D 已完成：
  - 已保持 `country_tree.enabled=false`。
  - 已运行 `.\\.venv\\Scripts\\python.exe -m app.main --sync-api country_tree`。
  - 验证成功，批次号 `sync_20260702_212537_116460`，请求 1 次，写入 4 条。
  - `sync_batch.status=success`，`success_api_count=1`，`failed_api_count=0`。
  - `sync_api_log.status=success`，`request_count=1`，`success_count=4`，`failed_count=0`。
  - 本批次 `raw_api_data` 中 `country_tree` 写入 4 条，`source_primary_key` 为空，4 条都有 `data_hash`。
  - 已确认该接口按 `api_code + data_hash` 去重。
  - 文档未提供明确日期字段，因此 `data_date` 为空。
  - `sync_checkpoint.checkpoint_value` 已记录 `last_page=1`、`request_count=1`、`item_count=4`、`total_count=null`。
  - 已再次运行 `.\\.venv\\Scripts\\python.exe -m app.main --sync-enabled`。
  - `--sync-enabled` 成功，批次号 `sync_20260702_212630_732463`，仍为 `apis=7`，未执行 `country_tree`。
- 阶段 4E 已完成：
  - 已将 `country_tree.enabled` 从 `false` 改为 `true`。
  - 已运行 `.\\.venv\\Scripts\\python.exe -m app.main`，dry-run 显示 enabled API 为 8 个。
  - 已运行 `.\\.venv\\Scripts\\python.exe -m app.main --sync-enabled`。
  - 验证成功，批次号 `sync_20260702_213009_933395`，`apis=8`，`rows=3637`，`requests=16`。
  - 数据库确认该批次 `total_api_count=8`、`success_api_count=8`、`failed_api_count=0`。
  - 同一批次下有八条 `sync_api_log`，八个 API 均成功。
  - `country_tree` 在 enabled 批次中写入 4 条，`source_primary_key` 为空，4 条都有 `data_hash`。
  - `sync_checkpoint.last_sync_batch_no` 已更新为 `sync_20260702_213009_933395`。
  - 已运行 `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，同步配置数为 10。
  - 数据库确认 `api_config.country_tree.enabled=1`，当前 `api_config` 启用数为 8。
- 阶段 4F 已完成：
  - 已通过公开文档站只读接口 `/api/openAdmin/doc/detail?id=54` 调研“查询品类信息”。
  - 已选择“查询品类信息”作为第九个低风险业务 API 候选。
  - 已确认文档路径为 `POST /purchase/goods/category/page`，实际请求路径将是 `/api/open/purchase/goods/category/page`。
  - 已确认请求头需要 `accessToken`。
  - 已确认请求体必填 `page` 和 `pagesize`，可选 `state` 和 `valueList`。
  - 已确认响应列表字段为 `data.rows`，总数字段为 `data.total`。
  - 已确认候选主键字段为 `id`，文档未提供明确日期字段，`date_field` 暂为空。
  - 已新增 `category_page` YAML 配置，默认 `enabled: false`。
  - 本阶段未执行 `category_page` 真实 API，避免未经单接口验证就扩大真实同步范围。
- 阶段 4G 已完成：
  - 已保持 `category_page.enabled=false`。
  - 已运行 `.\\.venv\\Scripts\\python.exe -m app.main --sync-api category_page`。
  - 验证成功，批次号 `sync_20260702_213741_496366`，请求 1 次，写入 42 条。
  - `sync_batch.status=success`，`success_api_count=1`，`failed_api_count=0`。
  - `sync_api_log.status=success`，`request_count=1`，`success_count=42`，`failed_count=0`。
  - 本批次 `raw_api_data` 中 `category_page` 写入 42 条，42 条都有 `source_primary_key` 和 `data_hash`。
  - `source_primary_key` 已确认来自响应字段 `id`。
  - 文档未提供明确日期字段，因此 `data_date` 为空。
  - `sync_checkpoint.checkpoint_value` 已记录 `last_page=1`、`request_count=1`、`item_count=42`、`total_count=42`。
  - 已再次运行 `.\\.venv\\Scripts\\python.exe -m app.main --sync-enabled`。
  - `--sync-enabled` 成功，批次号 `sync_20260702_213820_543116`，仍为 `apis=8`，未执行 `category_page`。
- 阶段 4H 已完成：
  - 已将 `category_page.enabled` 从 `false` 改为 `true`。
  - 已运行 `.\\.venv\\Scripts\\python.exe -m app.main`，dry-run 显示 enabled API 为 9 个。
  - 已运行 `.\\.venv\\Scripts\\python.exe -m app.main --sync-enabled`。
  - 验证成功，批次号 `sync_20260702_214124_796101`，`apis=9`，`rows=3679`，`requests=17`。
  - 数据库确认该批次 `total_api_count=9`、`success_api_count=9`、`failed_api_count=0`。
  - 同一批次下有九条 `sync_api_log`，九个 API 均成功。
  - `category_page` 在 enabled 批次中写入 42 条，42 条都有 `source_primary_key` 和 `data_hash`。
  - `sync_checkpoint.last_sync_batch_no` 已更新为 `sync_20260702_214124_796101`。
  - 已运行 `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，同步配置数为 11。
  - 数据库确认 `api_config.category_page.enabled=1`，当前 `api_config` 启用数为 9。
- 阶段 4I 已完成：
  - 已通过公开文档站只读接口 `/api/openAdmin/doc/detail?id=1752` 调研“查询品牌资料”。
  - 已选择“查询品牌资料”作为第十个低风险业务 API 候选。
  - 已确认文档路径为 `POST /purchase/goods/brand/page`，实际请求路径将是 `/api/open/purchase/goods/brand/page`。
  - 已确认请求头需要 `accessToken`。
  - 已确认请求体必填 `page` 和 `pagesize`，可选 `code`、`name`、`state`。
  - 已确认响应列表字段为 `data.rows`，总数字段为 `data.total`。
  - 已确认候选主键字段为 `id`，文档未提供明确日期字段，`date_field` 暂为空。
  - 已新增 `brand_page` YAML 配置，默认 `enabled: false`。
  - 本阶段未执行 `brand_page` 真实 API，避免未经单接口验证就扩大真实同步范围。
- 阶段 4J 已完成：
  - 已保持 `brand_page.enabled=false`。
  - 已运行 `.\\.venv\\Scripts\\python.exe -m app.main --sync-api brand_page`。
  - 验证成功，批次号 `sync_20260702_214759_731674`，请求 1 次，写入 8 条。
  - `sync_batch.status=success`，`success_api_count=1`，`failed_api_count=0`。
  - `sync_api_log.status=success`，`request_count=1`，`success_count=8`，`failed_count=0`。
  - 本批次 `raw_api_data` 中 `brand_page` 写入 8 条，8 条都有 `source_primary_key` 和 `data_hash`。
  - `source_primary_key` 已确认来自响应字段 `id`。
  - 文档未提供明确日期字段，因此 `data_date` 为空。
  - `sync_checkpoint.checkpoint_value` 已记录 `last_page=1`、`request_count=1`、`item_count=8`、`total_count=8`。
  - 已再次运行 `.\\.venv\\Scripts\\python.exe -m app.main --sync-enabled`。
  - `--sync-enabled` 成功，批次号 `sync_20260702_214840_754392`，仍为 `apis=9`，未执行 `brand_page`。
- 阶段 4K 已完成：
  - 已将 `brand_page.enabled` 从 `false` 改为 `true`。
  - 已运行 `.\\.venv\\Scripts\\python.exe -m app.main`，dry-run 显示 enabled API 为 10 个。
  - 已运行 `.\\.venv\\Scripts\\python.exe -m app.main --sync-enabled`。
  - 验证成功，批次号 `sync_20260702_234239_362350`，`apis=10`，`rows=3687`，`requests=18`。
  - 数据库确认该批次 `total_api_count=10`、`success_api_count=10`、`failed_api_count=0`。
  - 同一批次下有十条 `sync_api_log`，`brand_page` 成功写入 8 条。
  - 十个 API 的 `sync_checkpoint.last_sync_batch_no` 均已更新到该批次。
  - 已运行 `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，同步配置数为 12。
  - 数据库确认 `api_config.brand_page.enabled=1`，当前启用配置数为 10。
- 阶段 4L 已完成：
  - 已新增 `app/doc_catalog.py`，用于只读拉取积加公开文档目录和详情。
  - 已新增 `tests/test_doc_catalog.py`，覆盖接口分类规则。
  - 已生成 `config/jijia_api_catalog.generated.json`，作为公开文档 API 覆盖矩阵。
  - 覆盖矩阵来自 `/api/openAdmin/doc/tree` 和 `/api/openAdmin/doc/detail?id=...`，不读取 `.env`，不请求真实业务 API。
  - 当前公开文档 API 共 185 个，详情拉取成功 185 个，失败 0 个。
  - 当前本地真实配置 API 为 10 个，且 10 个均已 enabled。
  - 分类统计：`direct_read_candidate=58`、`requires_upstream_params=79`、`sensitive_review=23`、`write_or_mutation=24`、`unsupported_shape_review=1`。
  - 第一批未配置的直接读取候选集中在产品、库存、报表、物流等模块。
- 阶段 4M 已完成：
  - 已只读查看 `doc_id=53`、`1921`、`1956`、`4835` 的公开文档详情。
  - 已选择 `product_page` 和 `parent_product_page` 作为本轮低风险产品基础资料接口。
  - 已新增 `product_page` YAML 配置，默认 `enabled=false`，路径为 `POST /purchase/goods/product/page`。
  - 已新增 `parent_product_page` YAML 配置，默认 `enabled=false`，路径为 `POST /purchase/goods/parentProduct/page`。
  - 已新增 `tests/test_api_config_product_candidates.py`，验证两个新配置的路径、分页、主键、日期字段和禁用状态。
  - dry-run 已确认 enabled API 仍为 10 个。
  - `product_page` 首次单接口同步命中 `max_pages=20` 保护，只写入 2000 条，但文档返回 `total_count=8258`。
  - 已将 `product_page.page.max_pages` 调整为 100，并用测试约束避免再次截断当前总量。
  - 已重跑 `product_page` 单接口同步成功，批次 `sync_20260703_004233_884329`，请求 83 次，写入 8258 条。
  - 数据库确认 `product_page` 本批次 `item_count=8258`、`total_count=8258`，8258 条均有 `source_primary_key` 和 `data_date`。
  - 已运行 `parent_product_page` 单接口同步成功，批次 `sync_20260703_004505_706770`，请求 3 次，写入 124 条。
  - 数据库确认 `parent_product_page` 本批次 `item_count=124`、`total_count=124`，124 条均有 `source_primary_key` 和 `data_date`。
  - 已运行 `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，同步配置数为 14。
  - 数据库确认 `api_config.product_page.enabled=0`、`api_config.parent_product_page.enabled=0`，当前启用配置数仍为 10。
  - 已刷新 `config/jijia_api_catalog.generated.json`，覆盖矩阵中的真实配置 API 变为 12 个，enabled 仍为 10 个。
- 阶段 4N 已完成：
  - 已将 `product_page.enabled` 和 `parent_product_page.enabled` 从 `false` 改为 `true`。
  - 已运行 `.\\.venv\\Scripts\\python.exe -m app.main`，dry-run 显示 enabled API 为 12 个。
  - 已运行 `.\\.venv\\Scripts\\python.exe -m app.main --sync-enabled`。
  - 验证成功，批次号 `sync_20260703_005314_970429`，`apis=12`，`rows=12069`，`requests=105`。
  - 数据库确认该批次 `total_api_count=12`、`success_api_count=12`、`failed_api_count=0`。
  - 同一批次下有十二条 `sync_api_log`，`product_page` 写入 8258 条，`parent_product_page` 写入 124 条。
  - `product_page` checkpoint 记录 `item_count=8258`、`total_count=8258`，未发生截断。
  - `parent_product_page` checkpoint 记录 `item_count=124`、`total_count=124`。
  - 已运行 `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，同步配置数为 14。
  - 数据库确认 `api_config.product_page.enabled=1`、`api_config.parent_product_page.enabled=1`，当前启用配置数为 12。
  - 已刷新 `config/jijia_api_catalog.generated.json`，覆盖矩阵中的真实配置 API 为 12 个，enabled 为 12 个。
  - 目标模式第 1 组 3 轮子目标已完成：4L 覆盖矩阵、4M 单接口接入、4N 加入 enabled。

## Verification

- 已运行：`.\\.venv\\Scripts\\python.exe -m compileall -f app`
- 结果：通过。
- 已运行：`.\\.venv\\Scripts\\python.exe -m app.main`
- 结果：通过。
- 已运行：`.\\.venv\\Scripts\\python.exe -m app.main --help`
- 结果：已出现 `--test-api TEST_API`。
- 已运行过：`.\\.venv\\Scripts\\python.exe -m app.main --test-token`
- 结果：成功，只输出过期时间，没有输出 token；连续第二次运行命中本地缓存。
- 已运行：`.\\.venv\\Scripts\\python.exe -m app.main --test-api amazon_shop_page`
- 结果：成功，最新批次 `sync_20260702_172316_152881`，`rows=13`，`request_count=3`。
- 已运行：`.\\.venv\\Scripts\\python.exe -m app.main --sync-api amazon_shop_page`
- 结果：成功，最新批次 `sync_20260702_172316_106886`，`rows=13`，`request_count=3`。
- 已运行：`.\\.venv\\Scripts\\python.exe -m app.main --sync-enabled`
- 结果：成功，最新批次 `sync_20260702_175624_199936`，`apis=2`，`rows=14`，`request_count=3`。
- 已运行：`.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`
- 结果：连续运行两次均成功，`count=4`。
- 已运行：`.\\.venv\\Scripts\\python.exe -m app.main --sync-api org_manage_query`
- 结果：成功，批次 `sync_20260702_173136_319602`，`rows=1`，`request_count=1`。
- 已查询数据库验证：
  - `sync_enabled` 批次状态为 `success`。
  - `sync_enabled` 批次 `total_api_count=2`，`success_api_count=2`，`failed_api_count=0`。
  - `sync_enabled` 批次包含 `amazon_shop_page` 和 `org_manage_query` 两条 API 日志。
  - `sync_enabled` 本批次 `raw_api_data` 写入 14 条。
  - 两个 API 的 `sync_checkpoint` 已更新到 `sync_enabled` 批次。
- 已用临时错误路径验证失败日志：
  - 失败批次状态为 `failed`。
  - `sync_api_log.request_count=2`。
  - `failed_request_log.retry_count=1`。
  - `failed_request_log.request_params` 不包含 `accessToken`。
- 已运行：`.\\.venv\\Scripts\\python.exe -m app.main --mock-sync`
- 结果：通过。
- 阶段 3N 已运行：
  - `.\\.venv\\Scripts\\python.exe -m compileall app`，通过。
  - `.\\.venv\\Scripts\\python.exe -m app.main`，dry-run 仍只加载 2 个 enabled API。
  - `.\\.venv\\Scripts\\python.exe -m app.main --mock-sync`，通过，批次 `sync_20260702_181325_095699`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，同步配置数为 5。
  - 已查询 `api_config`，确认 `role_list.enabled=0`，启用 API 仍为 2 个。
  - `.\\.venv\\Scripts\\python.exe -m app.main --test-token`，通过且没有输出 token。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-enabled`，通过，批次 `sync_20260702_181417_988247`，`apis=2`。
- 阶段 3O 已运行：
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api role_list`，通过，批次 `sync_20260702_181544_620924`。
  - 已查询数据库摘要，确认批次、API 日志、raw 主键和 checkpoint。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-enabled`，通过，批次 `sync_20260702_181639_728324`，`apis=2`。
- 阶段 3P 已运行：
  - `.\\.venv\\Scripts\\python.exe -m app.main`，通过，enabled API 为 3 个。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-enabled`，通过，批次 `sync_20260702_181854_408493`，`apis=3`。
  - 已查询数据库摘要，确认三条 API 日志、raw 写入数和 checkpoint。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，同步配置数为 5。
  - 已查询 `api_config`，确认 `role_list.enabled=1`。
  - `.\\.venv\\Scripts\\python.exe -m compileall app`，通过。
- 阶段 3Q 已运行：
  - `.\\.venv\\Scripts\\python.exe -m compileall app`，通过。
  - `.\\.venv\\Scripts\\python.exe -m app.main`，dry-run 仍只加载 3 个 enabled API。
  - `.\\.venv\\Scripts\\python.exe -m app.main --mock-sync`，通过，批次 `sync_20260702_182312_050987`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，同步配置数为 6。
  - 已查询 `api_config`，确认 `dictionary_query.enabled=0`，启用 API 仍为 3 个。
  - `.\\.venv\\Scripts\\python.exe -m app.main --test-token`，通过且没有输出 token。
- 阶段 3R 已运行：
  - `.\\.venv\\Scripts\\python.exe -m unittest tests.test_sync_engine_bulk_insert`，先失败，确认为缺少 `_insert_raw_items`。
  - `.\\.venv\\Scripts\\python.exe -m unittest tests.test_sync_engine_bulk_insert`，实现后通过。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api dictionary_query`，通过，批次 `sync_20260702_182921_619823`。
  - 已查询数据库摘要，确认批次、API 日志、raw 主键日期和 checkpoint。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-enabled`，通过，批次 `sync_20260702_182952_860680`，`apis=3`。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过。
- 阶段 3S 已运行：
  - `.\\.venv\\Scripts\\python.exe -m app.main`，通过，enabled API 为 4 个。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-enabled`，通过，批次 `sync_20260702_183342_663394`，`apis=4`。
  - 已查询数据库摘要，确认四条 API 日志、raw 写入数和 checkpoint。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，同步配置数为 6。
  - 已查询 `api_config`，确认 `dictionary_query.enabled=1`。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过。
- 阶段 3T 已运行：
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过。
  - `.\\.venv\\Scripts\\python.exe -m app.main`，dry-run 仍只加载 4 个 enabled API。
  - `.\\.venv\\Scripts\\python.exe -m app.main --mock-sync`，通过，批次 `sync_20260702_183851_976534`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，同步配置数为 7。
  - 已查询 `api_config`，确认 `rate_page.enabled=0`，启用 API 仍为 4 个。
  - `.\\.venv\\Scripts\\python.exe -m app.main --test-token`，通过且没有输出 token。
- 阶段 3U 已运行：
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api rate_page`，首次返回 2500 条，发现 `total_count=2590`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api rate_page`，修正 `max_pages` 后通过，批次 `sync_20260702_184242_907458`。
  - 已查询数据库摘要，确认批次、API 日志、raw 主键日期和 checkpoint。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-enabled`，通过，批次 `sync_20260702_184336_640026`，`apis=4`。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过。
- 阶段 3V 已运行：
  - `.\\.venv\\Scripts\\python.exe -m app.main`，通过，enabled API 为 5 个。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-enabled`，通过，批次 `sync_20260702_184635_149384`，`apis=5`。
  - 已查询数据库摘要，确认五条 API 日志、raw 写入数和 checkpoint。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，同步配置数为 7。
  - 已查询 `api_config`，确认 `rate_page.enabled=1`。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过。
- 阶段 3W 已运行：
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过。
  - `.\\.venv\\Scripts\\python.exe -m app.main`，dry-run 仍只加载 5 个 enabled API。
  - `.\\.venv\\Scripts\\python.exe -m app.main --mock-sync`，通过，批次 `sync_20260702_185215_255044`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，同步配置数为 8。
  - 已查询 `api_config`，确认 `continent_country_tree.enabled=0`，启用 API 仍为 5 个。
  - `.\\.venv\\Scripts\\python.exe -m app.main --test-token`，通过且没有输出 token。
- 阶段 3X 已运行：
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api continent_country_tree`，通过，批次 `sync_20260702_185400_214824`。
  - 已查询数据库摘要，确认批次、API 日志、raw data_hash 和 checkpoint。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-enabled`，通过，批次 `sync_20260702_185428_805435`，`apis=5`。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过。
- 阶段 3Y 已运行：
  - `.\\.venv\\Scripts\\python.exe -m app.main`，通过，enabled API 为 6 个。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-enabled`，通过，批次 `sync_20260702_205600_866582`，`apis=6`。
  - 已查询数据库摘要，确认六条 API 日志、raw 写入数和 checkpoint。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，同步配置数为 8。
  - 已查询 `api_config`，确认 `continent_country_tree.enabled=1`。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过。
  - `.\\.venv\\Scripts\\python.exe -m app.main --test-token`，通过且没有输出 token。
  - `.\\.venv\\Scripts\\python.exe -m app.main --mock-sync`，通过，批次 `sync_20260702_205805_616907`。
- 阶段 3Z 已运行：
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过。
  - `.\\.venv\\Scripts\\python.exe -m app.main`，dry-run 仍只加载 6 个 enabled API。
  - `.\\.venv\\Scripts\\python.exe -m app.main --mock-sync`，通过，批次 `sync_20260702_210236_651459`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，同步配置数为 9。
  - 已查询 `api_config`，确认 `ship_transport_list.enabled=0`，启用 API 仍为 6 个。
  - `.\\.venv\\Scripts\\python.exe -m app.main --test-token`，通过且没有输出 token。
- 阶段 4A 已运行：
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api ship_transport_list`，首次因数据库锁等待超时失败。
  - 已查询 `information_schema.processlist` 和 `information_schema.innodb_trx`，确认存在睡眠未提交事务。
  - 已执行 `KILL 3063892` 释放该事务。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api ship_transport_list`，重试通过，批次 `sync_20260702_211036_562677`。
  - 已查询数据库摘要，确认批次、API 日志、raw 主键和 checkpoint。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-enabled`，通过，批次 `sync_20260702_211145_801882`，`apis=6`。
  - 已查询 enabled 批次日志，六个已启用 API 均成功，`failed_api_count=0`。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过。
- 阶段 4B 已运行：
  - `.\\.venv\\Scripts\\python.exe -m app.main`，通过，enabled API 为 7 个。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-enabled`，通过，批次 `sync_20260702_211510_012826`，`apis=7`。
  - 已查询数据库摘要，确认七条 API 日志、`ship_transport_list` raw 写入数和 checkpoint。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，同步配置数为 9。
  - 已查询 `api_config`，确认 `ship_transport_list.enabled=1`，启用配置数为 7。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过。
  - `.\\.venv\\Scripts\\python.exe -m app.main --test-token`，通过且没有输出 token。
  - `.\\.venv\\Scripts\\python.exe -m app.main --mock-sync`，通过，批次 `sync_20260702_211806_637915`。
- 阶段 4C 已运行：
  - `.\\.venv\\Scripts\\python.exe -m app.main`，通过，dry-run 仍显示 7 个 enabled API。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过。
  - `.\\.venv\\Scripts\\python.exe -m app.main --mock-sync`，通过，批次 `sync_20260702_212135_869237`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，同步配置数为 10。
  - 已查询 `api_config`，确认 `country_tree.enabled=0`，当前启用配置数仍为 7。
- 阶段 4D 已运行：
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api country_tree`，通过，批次 `sync_20260702_212537_116460`。
  - 已查询数据库摘要，确认批次、API 日志、raw data_hash 和 checkpoint。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-enabled`，通过，批次 `sync_20260702_212630_732463`，`apis=7`。
  - 已查询 enabled 批次日志，七个已启用 API 均成功，`failed_api_count=0`。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过。
  - `.\\.venv\\Scripts\\python.exe -m app.main`，通过，dry-run 仍显示 7 个 enabled API。
  - `.\\.venv\\Scripts\\python.exe -m app.main --mock-sync`，通过，批次 `sync_20260702_212822_422696`。
- 阶段 4E 已运行：
  - `.\\.venv\\Scripts\\python.exe -m app.main`，通过，enabled API 为 8 个。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-enabled`，通过，批次 `sync_20260702_213009_933395`，`apis=8`。
  - 已查询数据库摘要，确认八条 API 日志、`country_tree` raw 写入数和 checkpoint。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，同步配置数为 10。
  - 已查询 `api_config`，确认 `country_tree.enabled=1`，启用配置数为 8。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过。
  - `.\\.venv\\Scripts\\python.exe -m app.main --test-token`，通过且没有输出 token。
  - `.\\.venv\\Scripts\\python.exe -m app.main --mock-sync`，通过，批次 `sync_20260702_213143_864415`。
- 阶段 4F 已运行：
  - `.\\.venv\\Scripts\\python.exe -m app.main`，通过，dry-run 仍显示 8 个 enabled API。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过。
  - `.\\.venv\\Scripts\\python.exe -m app.main --mock-sync`，通过，批次 `sync_20260702_213500_018482`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，同步配置数为 11。
  - 已查询 `api_config`，确认 `category_page.enabled=0`，当前启用配置数仍为 8。
- 阶段 4G 已运行：
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api category_page`，通过，批次 `sync_20260702_213741_496366`。
  - 已查询数据库摘要，确认批次、API 日志、raw 主键和 checkpoint。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-enabled`，通过，批次 `sync_20260702_213820_543116`，`apis=8`。
  - 已查询 enabled 批次日志，八个已启用 API 均成功，`failed_api_count=0`。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过。
  - `.\\.venv\\Scripts\\python.exe -m app.main`，通过，dry-run 仍显示 8 个 enabled API。
  - `.\\.venv\\Scripts\\python.exe -m app.main --mock-sync`，通过，批次 `sync_20260702_213956_467817`。
- 阶段 4H 已运行：
  - `.\\.venv\\Scripts\\python.exe -m app.main`，通过，enabled API 为 9 个。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-enabled`，通过，批次 `sync_20260702_214124_796101`，`apis=9`。
  - 已查询数据库摘要，确认九条 API 日志、`category_page` raw 写入数和 checkpoint。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，同步配置数为 11。
  - 已查询 `api_config`，确认 `category_page.enabled=1`，启用配置数为 9。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过。
  - `.\\.venv\\Scripts\\python.exe -m app.main --test-token`，通过且没有输出 token。
  - `.\\.venv\\Scripts\\python.exe -m app.main --mock-sync`，通过，批次 `sync_20260702_214244_835820`。
- 阶段 4I 已运行：
  - `.\\.venv\\Scripts\\python.exe -m app.main`，通过，dry-run 仍显示 9 个 enabled API。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过。
  - `.\\.venv\\Scripts\\python.exe -m app.main --mock-sync`，通过，批次 `sync_20260702_214518_565707`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，同步配置数为 12。
  - 已查询 `api_config`，确认 `brand_page.enabled=0`，当前启用配置数仍为 9。
- 阶段 4J 已运行：
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api brand_page`，通过，批次 `sync_20260702_214759_731674`。
  - 已查询数据库摘要，确认批次、API 日志、raw 主键和 checkpoint。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-enabled`，通过，批次 `sync_20260702_214840_754392`，`apis=9`。
  - 已查询 enabled 批次日志，九个已启用 API 均成功，`failed_api_count=0`。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过。
  - `.\\.venv\\Scripts\\python.exe -m app.main`，通过，dry-run 仍显示 9 个 enabled API。
  - `.\\.venv\\Scripts\\python.exe -m app.main --mock-sync`，通过，批次 `sync_20260702_215027_511656`。
- 阶段 4K 已运行：
  - `.\\.venv\\Scripts\\python.exe -m app.main`，通过，dry-run 显示 10 个 enabled API。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-enabled`，通过，批次 `sync_20260702_234239_362350`，`apis=10`。
  - 已查询数据库摘要，确认十条 API 日志、raw 写入数和 checkpoint。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，同步配置数为 12。
  - 已查询 `api_config`，确认 `brand_page.enabled=1`，启用配置数为 10。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过。
- 阶段 4L 已运行：
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_doc_catalog.py" -v`，通过，4 个测试。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，生成 185 个 API 的覆盖矩阵。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，5 个测试。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --summary`，通过，确认公开文档接口数仍为 185 个。
- 阶段 4M 已运行：
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_api_config_product_candidates.py" -v`，先失败，确认为缺少 `product_page` 和 `parent_product_page` 配置。
  - 新增配置后重跑 `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_api_config_product_candidates.py" -v`，通过，2 个测试。
  - `.\\.venv\\Scripts\\python.exe -m app.main`，通过，dry-run 仍显示 10 个 enabled API。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api product_page`，首次写入 2000 条但发现 `total_count=8258`，随后调整 `max_pages`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api product_page`，重跑通过，批次 `sync_20260703_004233_884329`，`rows=8258`，`requests=83`。
  - 已查询数据库摘要，确认 `product_page` 批次、API 日志、raw 主键日期和 checkpoint。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api parent_product_page`，通过，批次 `sync_20260703_004505_706770`，`rows=124`，`requests=3`。
  - 已查询数据库摘要，确认 `parent_product_page` 批次、API 日志、raw 主键日期和 checkpoint。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，同步配置数为 14。
  - 已查询 `api_config`，确认两个新接口 `enabled=0`，启用配置数仍为 10。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，真实配置 API 变为 12 个。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，7 个测试。
- 阶段 4N 已运行：
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_api_config_product_candidates.py" -v`，先失败，确认为两个产品接口仍为 disabled。
  - 修改 YAML 后重跑 `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_api_config_product_candidates.py" -v`，通过，2 个测试。
  - `.\\.venv\\Scripts\\python.exe -m app.main`，通过，dry-run 显示 12 个 enabled API。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-enabled`，通过，批次 `sync_20260703_005314_970429`，`apis=12`，`rows=12069`，`requests=105`。
  - 已查询数据库摘要，确认十二条 API 日志、raw 写入数和 checkpoint。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，同步配置数为 14。
  - 已查询 `api_config`，确认 `product_page.enabled=1`、`parent_product_page.enabled=1`，启用配置数为 12。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，真实配置 API 为 12 个，enabled 为 12 个。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，7 个测试。
- 阶段 4O 已运行：
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_api_config_4o_candidates.py" -v`，先失败，确认为缺少 `kb_product_page` 和 `fba_warehouse_page` 配置。
  - 新增两个候选配置后重跑该测试，通过，2 个测试。
  - `.\\.venv\\Scripts\\python.exe -m app.main`，通过，dry-run 仍显示 12 个 enabled API。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api kb_product_page`，通过，批次 `sync_20260703_010426_080352`，`rows=0`，`requests=1`。
  - 已查询数据库摘要，确认 `kb_product_page` 批次成功、API 日志成功、raw 写入 0 条，checkpoint 记录 `item_count=0`、`total_count=0`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api fba_warehouse_page`，通过，批次 `sync_20260703_010654_343796`，`rows=36`，`requests=1`。
  - 已查询数据库摘要，确认 `fba_warehouse_page` 批次成功、API 日志成功、raw 写入 36 条，36 条都有 `source_primary_key` 和 `data_date`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，同步配置数为 16。
  - 已查询 `api_config`，确认 `kb_product_page.enabled=0`、`fba_warehouse_page.enabled=0`，启用配置数仍为 12。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，真实配置 API 为 14 个，enabled 为 12 个。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，9 个测试。
- 阶段 4P 已运行：
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_api_config_4o_candidates.py" -v`，先失败，确认为两个新接口仍为 disabled。
  - 修改 YAML 后重跑该测试，通过，2 个测试。
  - `.\\.venv\\Scripts\\python.exe -m app.main`，通过，dry-run 显示 14 个 enabled API。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-enabled`，通过，批次 `sync_20260703_011758_883247`，`apis=14`，`rows=12105`，`requests=105`。
  - 已查询数据库摘要，确认该批次 `total_api_count=14`、`success_api_count=14`、`failed_api_count=0`。
  - 同一批次下有十四条 `sync_api_log`，`kb_product_page` 写入 0 条，`fba_warehouse_page` 写入 36 条。
  - `kb_product_page` checkpoint 记录 `item_count=0`、`total_count=0`。
  - `fba_warehouse_page` checkpoint 记录 `item_count=36`、`total_count=36`，36 条 raw 数据都有 `source_primary_key` 和 `data_date`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，同步配置数为 16。
  - 已查询 `api_config`，确认 `kb_product_page.enabled=1`、`fba_warehouse_page.enabled=1`，启用配置数为 14。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，真实配置 API 为 14 个，enabled 为 14 个。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，9 个测试。
- 阶段 4Q 已运行：
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_api_config_4q_candidates.py" -v`，先失败，确认为缺少 `store_location_page` 和 `multi_shop_query` 配置。
  - 新增两个候选配置后重跑该测试，通过，2 个测试。
  - `.\\.venv\\Scripts\\python.exe -m app.main`，通过，dry-run 仍显示 14 个 enabled API。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api store_location_page`，通过，批次 `sync_20260703_013043_934150`，`rows=1116`，`requests=12`。
  - 已查询数据库摘要，确认 `store_location_page` 批次成功、API 日志成功、raw 写入 1116 条，1116 条都有 `source_primary_key` 和 `data_date`。
  - `store_location_page` checkpoint 记录 `item_count=1116`、`total_count=1116`，未发生截断。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api multi_shop_query`，通过，批次 `sync_20260703_013128_451336`，`rows=6`，`requests=1`。
  - 已查询数据库摘要，确认 `multi_shop_query` 批次成功、API 日志成功、raw 写入 6 条，6 条都有 `source_primary_key`；该接口无日期字段，`data_date` 为空。
  - `multi_shop_query` checkpoint 记录 `item_count=6`、`total_count=null`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，同步配置数为 18。
  - 已查询 `api_config`，确认 `store_location_page.enabled=0`、`multi_shop_query.enabled=0`，启用配置数仍为 14。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，真实配置 API 为 16 个，enabled 为 14 个。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，11 个测试。
- 阶段 4R 已运行：
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_api_config_4q_candidates.py" -v`，先失败，确认为两个新接口仍为 disabled。
  - 修改 YAML 后重跑该测试，通过，2 个测试。
  - `.\\.venv\\Scripts\\python.exe -m app.main`，通过，dry-run 显示 16 个 enabled API。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-enabled`，通过，批次 `sync_20260703_014011_709944`，`apis=16`，`rows=13227`，`requests=119`。
  - 已查询数据库摘要，确认该批次 `total_api_count=16`、`success_api_count=16`、`failed_api_count=0`。
  - 同一批次下有十六条 `sync_api_log`，`store_location_page` 写入 1116 条，`multi_shop_query` 写入 6 条。
  - `store_location_page` checkpoint 记录 `item_count=1116`、`total_count=1116`，1116 条 raw 数据都有 `source_primary_key` 和 `data_date`。
  - `multi_shop_query` checkpoint 记录 `item_count=6`、`total_count=null`，6 条 raw 数据都有 `source_primary_key`，`data_date` 为空符合配置。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，同步配置数为 18。
  - 已查询 `api_config`，确认 `store_location_page.enabled=1`、`multi_shop_query.enabled=1`，启用配置数为 16。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，真实配置 API 为 16 个，enabled 为 16 个。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，11 个测试。
- 阶段 4S 已运行：
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_api_config_4s_candidates.py" -v`，先失败，确认为缺少 `crm_tags_page` 和 `inventory_team_query` 配置。
  - 新增两个候选配置后重跑该测试，通过，2 个测试。
  - `.\\.venv\\Scripts\\python.exe -m app.main`，通过，dry-run 仍显示 16 个 enabled API。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api crm_tags_page`，通过，批次 `sync_20260703_015227_219654`，`rows=7`，`requests=1`。
  - 已查询数据库摘要，确认 `crm_tags_page` 批次成功、API 日志成功、raw 写入 7 条，7 条都有 `source_primary_key` 和 `data_date`。
  - `crm_tags_page` checkpoint 记录 `item_count=7`、`total_count=null`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api inventory_team_query`，通过，批次 `sync_20260703_015302_084824`，`rows=1`，`requests=1`。
  - 已查询数据库摘要，确认 `inventory_team_query` 批次成功、API 日志成功、raw 写入 1 条，1 条有 `source_primary_key`；该接口无日期字段，`data_date` 为空。
  - `inventory_team_query` checkpoint 记录 `item_count=1`、`total_count=null`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，同步配置数为 20。
  - 已查询 `api_config`，确认 `crm_tags_page.enabled=0`、`inventory_team_query.enabled=0`，启用配置数仍为 16。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，真实配置 API 为 18 个，enabled 为 16 个。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，13 个测试。
- 阶段 4T 已运行：
  - 已将 `crm_tags_page.enabled` 和 `inventory_team_query.enabled` 从 `false` 改为 `true`。
  - `.\\.venv\\Scripts\\python.exe -m app.main`，通过，dry-run 显示 18 个 enabled API。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-enabled`，通过，批次 `sync_20260703_020359_152948`，`apis=18`，`rows=13235`，`requests=121`。
  - 已查询数据库摘要，确认该批次 `total_api_count=18`、`success_api_count=18`、`failed_api_count=0`。
  - 同一批次下有十八条 `sync_api_log`，`crm_tags_page` 写入 7 条，`inventory_team_query` 写入 1 条。
  - `crm_tags_page` checkpoint 记录 `item_count=7`、`total_count=null`，7 条 raw 数据都有 `source_primary_key` 和 `data_date`。
  - `inventory_team_query` checkpoint 记录 `item_count=1`、`total_count=null`，1 条 raw 数据有 `source_primary_key`，`data_date` 为空符合配置。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，同步配置数为 20。
  - 已查询 `api_config`，确认 `crm_tags_page.enabled=1`、`inventory_team_query.enabled=1`，启用配置数为 18。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，真实配置 API 为 18 个，enabled 为 18 个。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，13 个测试。
- 阶段 4U 已运行：
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_api_config_4u_candidates.py" -v`，先失败，确认为缺少 `product_inventory_page` 和 `storage_inbound_page` 配置。
  - 新增两个候选配置后重跑该测试，通过，2 个测试。
  - `.\\.venv\\Scripts\\python.exe -m app.main`，通过，dry-run 仍显示 18 个 enabled API。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api product_inventory_page` 首次命中 `max_pages=100`，只写入 10000 条，但 checkpoint 显示 `total_count=118653`。
  - 已将 `product_inventory_page.page.max_pages` 调整为 1300，并用测试约束该值。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api product_inventory_page` 重跑通过，批次 `sync_20260703_022246_265049`，`rows=118653`，`requests=1187`。
  - 已查询数据库摘要，确认 `product_inventory_page` 批次成功、API 日志成功、raw 写入 118653 条，118653 条都有 `source_primary_key` 和 `data_date`。
  - `product_inventory_page` checkpoint 记录 `item_count=118653`、`total_count=118653`，未发生截断。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api storage_inbound_page` 首次命中 `max_pages=100`，只写入 10000 条，但 checkpoint 显示 `total_count=174286`。
  - 已将 `storage_inbound_page.page.max_pages` 调整为 1800，并用测试约束该值。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api storage_inbound_page` 重跑通过，批次 `sync_20260703_030024_100310`，`rows=174286`，`requests=1743`。
  - 已查询数据库摘要，确认 `storage_inbound_page` 批次成功、API 日志成功、raw 写入 174286 条，174286 条都有 `source_primary_key` 和 `data_date`。
  - `storage_inbound_page` checkpoint 记录 `item_count=174286`、`total_count=174286`，未发生截断。
  - 只读梳理依赖型接口参数来源：`product_detail` 需要 `id`，可来自 `product_page` 的 8258 个产品主键；`market_inventory_query` 需要 `sku` 和 `warehouseId`，可来自 `product_inventory_page` 的 118653 行库存 raw 数据。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，同步配置数为 22。
  - 已查询 `api_config`，确认 `product_inventory_page.enabled=0`、`storage_inbound_page.enabled=0`，启用配置数仍为 18。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，真实配置 API 为 20 个，enabled 为 18 个。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，15 个测试。
- 阶段 4V 已运行：
  - 已用测试先行把 `product_inventory_page` 和 `storage_inbound_page` 的目标状态改为 enabled；修改 YAML 前该测试按预期失败。
  - 已将 `product_inventory_page.enabled` 和 `storage_inbound_page.enabled` 从 `false` 改为 `true`。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_api_config_4u_candidates.py" -v`，修改 YAML 后通过，2 个测试。
  - `.\\.venv\\Scripts\\python.exe -m app.main`，通过，dry-run 显示 20 个 enabled API。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-enabled`，通过，批次 `sync_20260703_040353_819845`，`apis=20`，`rows=306174`，`requests=3052`。
  - 已查询数据库摘要，确认该批次 `total_api_count=20`、`success_api_count=20`、`failed_api_count=0`。
  - 同一批次下有 20 条 `sync_api_log`，全部为 `success`，合计写入 306174 条，失败数为 0。
  - `product_inventory_page` 在 enabled 批次中请求 1187 次，写入 118653 条，118653 条都有 `source_primary_key`、`data_hash` 和 `data_date`。
  - `product_inventory_page` checkpoint 更新到批次 `sync_20260703_040353_819845`，记录 `item_count=118653`、`total_count=118653`。
  - `storage_inbound_page` 在 enabled 批次中请求 1743 次，写入 174286 条，174286 条都有 `source_primary_key`、`data_hash` 和 `data_date`。
  - `storage_inbound_page` checkpoint 更新到批次 `sync_20260703_040353_819845`，记录 `item_count=174286`、`total_count=174286`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，同步配置数为 22。
  - 已查询 `api_config`，确认总配置数为 22，启用配置数为 20，`product_inventory_page.enabled=1`、`storage_inbound_page.enabled=1`，且 `config_json.enabled=true`。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 为 185 个，真实配置 API 为 20 个，enabled 为 20 个。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，15 个测试。
- 阶段 4W 已运行：
  - 已新增 `product_detail` YAML 配置，默认 `enabled=false`，文档 id=211，路径为 `GET /purchase/goods/product/detail`。
  - 已新增 `tests/test_product_detail_param_source.py`，先失败，确认缺少 `product_detail` 配置、单对象响应提取和参数来源读取。
  - 已实现最小依赖参数来源机制：从 `raw_api_data.source_primary_key` 提取上游参数，生成详情接口请求参数。
  - 已支持 `response.item_field`，用于把 `product_detail` 的 `data` 单对象包装成一条 raw 记录。
  - 已查询 `product_page` 上游 raw 数据，确认有 8258 条可用主键；小样本 ID 为 `1`、`10`、`100`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api product_detail`，当前配置下通过，批次 `sync_20260703_060306_472537`，`rows=3`，`requests=3`。
  - 已查询数据库摘要，确认该批次 `total_api_count=1`、`success_api_count=1`、`failed_api_count=0`。
  - 同一批次 `sync_api_log` 记录 `request_count=3`、`success_count=3`、`failed_count=0`。
  - 同一批次 `raw_api_data` 写入 3 条 `product_detail`，3 条都有 `source_primary_key` 和 `data_hash`，主键为 `1`、`10`、`100`。
  - 已只查询 `product_detail` raw JSON 顶层字段名，确认响应没有 `lastDate`，因此 `product_detail.date_field` 保持为空，`data_date` 为空符合当前真实响应。
  - `product_detail` checkpoint 更新到批次 `sync_20260703_060306_472537`，记录 `item_count=3`、`total_count=3`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，同步配置数为 23。
  - 已查询 `api_config`，确认总配置数为 23，启用配置数为 20，`product_detail.enabled=0`。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 为 185 个，真实配置 API 为 21 个，enabled 为 20 个。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，19 个测试。
- 阶段 4X 已运行：
  - 已只读读取公开文档详情 `id=84`，确认 `market_inventory_query` 路径为 `GET /purchase/inventory/marketInventory/query`，必填参数为 `sku` 和 `warehouseId`，响应 `data` 为数组。
  - 已只读查询 `product_inventory_page` raw JSON 顶层字段名，确认包含 `sku` 和 `warehouseId`。
  - 已查询上游参数规模：`product_inventory_page` raw 共 118653 条，其中 `sku` 非空 115018 条，`warehouseId` 非空 118653 条，去重参数对 111307 个。
  - 已新增 `tests/test_market_inventory_param_source.py`，先失败，确认缺少 `market_inventory_query` 配置和 raw_json 多字段参数来源能力。
  - 已扩展 `param_source.fields`，支持从上游 `raw_json` 顶层字段提取多个请求参数。
  - 已新增 `market_inventory_query` YAML 配置，默认 `enabled=false`，小样本 `limit=3`，响应列表字段为 `data`。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_market_inventory_param_source.py" -v`，修改后通过，2 个测试。
  - `.\\.venv\\Scripts\\python.exe -m app.main`，通过，dry-run 仍显示 20 个 enabled API。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api market_inventory_query`，通过，批次 `sync_20260703_060856_408323`，`rows=2`，`requests=4`。
  - 已查询数据库摘要，确认该批次 `total_api_count=1`、`success_api_count=1`、`failed_api_count=0`。
  - 同一批次 `sync_api_log` 记录 `request_count=4`、`success_count=2`、`failed_count=0`，`failed_request_log` 为 0 条。
  - 同一批次 `raw_api_data` 写入 2 条 `market_inventory_query`，2 条都有 `data_hash`，没有稳定 `source_primary_key` 和 `data_date`。
  - 已只查询 `market_inventory_query` raw JSON 顶层字段名，确认响应字段包括 `marketId`、`warehouseId`、`marketName`、`warehouseName`、`normalQuantity` 等；当前不拆结构化表。
  - `market_inventory_query` checkpoint 更新到批次 `sync_20260703_060856_408323`，记录 `item_count=2`、`total_count=3`，其中 `total_count` 表示本次参数对数量。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，同步配置数为 24。
  - 已查询 `api_config`，确认总配置数为 24，启用配置数为 20，`market_inventory_query.enabled=0`。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 为 185 个，真实配置 API 为 22 个，enabled 为 20 个。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，21 个测试。
- 阶段 4Y 已运行：
  - 已为 `param_source` 增加最小 `offset` 参数窗口能力，单字段 `source_primary_key` 和多字段 `raw_json` 参数来源都支持 `LIMIT + OFFSET`。
  - 已将 `market_inventory_query.param_source.offset` 设置为 3，用于跳过 4X 已验证的前三个参数对。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_market_inventory_param_source.py" -v`，先失败后通过，确认 SQL 参数包含 `offset=3` 且使用 `OFFSET :offset`。
  - 已只读确认 offset=3 对应第二批参数对为 `301 Black + 23`、`301 Black + 43`、`301 Black + 44`，不重复 4X 的前三个参数对。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api market_inventory_query`，通过，批次 `sync_20260703_062446_799475`，`rows=1`，`requests=4`。
  - 已查询数据库摘要，确认该批次 `total_api_count=1`、`success_api_count=1`、`failed_api_count=0`。
  - 同一批次 `sync_api_log` 记录 `request_count=4`、`success_count=1`、`failed_count=0`，`failed_request_log` 为 0 条。
  - 同一批次 `raw_api_data` 写入 1 条 `market_inventory_query`，该条有 `data_hash`，没有稳定 `source_primary_key` 和 `data_date`。
  - `market_inventory_query` checkpoint 更新到批次 `sync_20260703_062446_799475`，记录 `item_count=1`、`total_count=3`，其中 `total_count` 表示本次参数对数量。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，同步配置数为 24。
  - 已查询 `api_config`，确认总配置数为 24，启用配置数为 20，`market_inventory_query.enabled=0`，`param_source.limit=3`、`offset=3`。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 为 185 个，真实配置 API 为 22 个，enabled 为 20 个。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，21 个测试。
- 阶段 4Z 已运行：
  - 已为 `param_source` 增加 `auto_advance` 开关；只有显式开启时才从 `sync_checkpoint` 读取下一批参数窗口。
  - 已将 `market_inventory_query.param_source.auto_advance` 设置为 `true`，同时保持 `enabled=false`、`limit=3`、`offset=3`。
  - 已新增测试约束：旧 checkpoint 只有 `total_count=3` 时，基础 `offset=3` 会自动推进到 `offset=6`；新 checkpoint 会写入 `param_offset`、`param_limit`、`next_param_offset`。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_market_inventory_param_source.py" -v`，先失败后通过，确认 checkpoint 自动 offset 生效。
  - 已只读确认 offset=6 对应第三批参数对为 `301 Black + 45`、`301 Black + 46`、`301 Black + 47`，不重复 4X 和 4Y 的前两批参数对。
  - `.\\.venv\\Scripts\\python.exe -m app.main`，通过，dry-run 仍显示 20 个 enabled API。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api market_inventory_query`，通过，批次 `sync_20260703_063707_425797`，`rows=0`，`requests=3`。
  - 已查询数据库摘要，确认该批次 `total_api_count=1`、`success_api_count=1`、`failed_api_count=0`。
  - 同一批次 `sync_api_log` 记录 `request_count=3`、`success_count=0`、`failed_count=0`，`failed_request_log` 为 0 条。
  - 同一批次 `raw_api_data` 写入 0 条，这是第三批参数对的真实空结果，不是失败。
  - `market_inventory_query` checkpoint 更新到批次 `sync_20260703_063707_425797`，记录 `param_offset=6`、`param_limit=3`、`next_param_offset=9`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，同步配置数为 24。
  - 已查询 `api_config`，确认 `market_inventory_query.enabled=0`、`param_source.limit=3`、`offset=3`、`auto_advance=true`。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 为 185 个，真实配置 API 为 22 个，enabled 为 20 个。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，23 个测试。
- 阶段 5A 已运行：
  - 未修改 YAML offset，直接复用 `market_inventory_query` checkpoint 中的 `next_param_offset=9` 读取第四批参数窗口。
  - 已只读确认 checkpoint 为 `param_offset=6`、`param_limit=3`、`next_param_offset=9`。
  - 已只读确认 offset=9 对应第四批参数对为 `301 Black + 48`、`301 Black + 50`、`301 Black + 51`，不重复前三批参数对。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api market_inventory_query`，通过，批次 `sync_20260703_064619_937667`，`rows=1`，`requests=4`。
  - 已查询数据库摘要，确认该批次 `total_api_count=1`、`success_api_count=1`、`failed_api_count=0`。
  - 同一批次 `sync_api_log` 记录 `request_count=4`、`success_count=1`、`failed_count=0`，`failed_request_log` 为 0 条。
  - 同一批次 `raw_api_data` 写入 1 条，该条有 `data_hash`，没有稳定 `source_primary_key` 和 `data_date`。
  - `market_inventory_query` checkpoint 更新到批次 `sync_20260703_064619_937667`，记录 `param_offset=9`、`param_limit=3`、`next_param_offset=12`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，同步配置数为 24。
  - 已查询 `api_config`，确认 `market_inventory_query.enabled=0`、`param_source.limit=3`、`offset=3`、`auto_advance=true`。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 为 185 个，真实配置 API 为 22 个，enabled 为 20 个。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，23 个测试。
- 阶段 5B 已运行：
  - 已从覆盖矩阵 `requires_upstream_params` 中选择 `storage_inbound_detail`，文档 id=235，路径为 `GET /purchase/inventory/storageInbound/detail`。
  - 已读取公开文档详情，确认必填参数为 `code`，响应 `data` 为单对象，响应字段包含 `code`、`id`、`createdAt`、`inboundItemVOS` 等。
  - 已只读查询 `storage_inbound_page.raw_json`，确认 174286 条上游 raw 均有 `code`，去重 `code` 也是 174286 个。
  - 已新增 `tests/test_storage_inbound_detail_param_source.py`，先失败后通过，约束 `storage_inbound_detail` 默认 disabled，并复用 `param_source.fields` 从 `raw_json.code` 生成请求参数。
  - 已新增 `storage_inbound_detail` YAML 配置，默认 `enabled=false`，小样本 `limit=3`，`response.item_field=data`，主键字段为 `code`，日期字段为 `createdAt`。
  - `.\\.venv\\Scripts\\python.exe -m app.main`，通过，dry-run 仍显示 20 个 enabled API。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api storage_inbound_detail`，通过，批次 `sync_20260703_065554_541779`，`rows=3`，`requests=3`。
  - 已查询数据库摘要，确认该批次 `total_api_count=1`、`success_api_count=1`、`failed_api_count=0`。
  - 同一批次 `sync_api_log` 记录 `request_count=3`、`success_count=3`、`failed_count=0`，`failed_request_log` 为 0 条。
  - 同一批次 `raw_api_data` 写入 3 条，3 条都有 `source_primary_key`、`data_hash` 和 `data_date`，主键为前三个上游单据 `code`。
  - `storage_inbound_detail` checkpoint 更新到批次 `sync_20260703_065554_541779`，记录 `param_offset=0`、`param_limit=3`、`next_param_offset=3`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，同步配置数为 25。
  - 已查询 `api_config`，确认 `storage_inbound_detail.enabled=0`、`param_source.source_api_code=storage_inbound_page`、`param_source.limit=3`。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 为 185 个，真实配置 API 为 23 个，enabled 为 20 个。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，25 个测试。
- 阶段 5C 已运行：
  - 已测试先行约束 `storage_inbound_detail.param_source.auto_advance=true`；测试先失败于缺少该字段，再通过。
  - 已将 `storage_inbound_detail.param_source.auto_advance` 设置为 `true`，同时保持 `enabled=false` 和 `limit=3` 不变。
  - `.\\.venv\\Scripts\\python.exe -m app.main`，通过，dry-run 仍显示 20 个 enabled API。
  - 已只读确认 `storage_inbound_detail` checkpoint 为 `param_offset=0`、`param_limit=3`、`next_param_offset=3`。
  - 已按程序真实排序确认 offset=0 的第一批 code 为 `GIB00922092000000001`、`GIB00922092100000002`、`GIB00922092100000003`。
  - 已按程序真实排序确认 offset=3 的第二批 code 为 `GIB00922092100000004`、`GIB00922093000000005`、`GIB00922093000000006`，不重复第一批。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api storage_inbound_detail`，通过，批次 `sync_20260703_071322_698205`，`rows=3`，`requests=3`。
  - 已查询数据库摘要，确认该批次 `total_api_count=1`、`success_api_count=1`、`failed_api_count=0`。
  - 同一批次 `sync_api_log` 记录 `request_count=3`、`success_count=3`、`failed_count=0`，`failed_request_log` 为 0 条。
  - 同一批次 `raw_api_data` 写入 3 条，主键为第二批三个 code，且 3 条都有 `source_primary_key`、`data_hash` 和 `data_date`。
  - `storage_inbound_detail` checkpoint 更新到批次 `sync_20260703_071322_698205`，记录 `param_offset=3`、`param_limit=3`、`next_param_offset=6`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，同步配置数为 25。
  - 已查询 `api_config`，确认 `storage_inbound_detail.enabled=0`、`param_source.limit=3`、`param_source.auto_advance=true`，数据库配置总数 25、启用 20。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 为 185 个，真实配置 API 为 23 个，enabled 为 20 个。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，25 个测试。
- 阶段 5D 已运行：
  - 已测试先行约束 `product_detail.param_source.auto_advance=true`；测试先失败于缺少该字段，再通过。
  - 已将 `product_detail.param_source.auto_advance` 设置为 `true`，同时保持 `enabled=false` 和 `limit=3` 不变。
  - 已只读确认 `product_detail` 旧 checkpoint 为 `{"last_page":3,"request_count":3,"item_count":3,"total_count":3}`，自动推进兼容逻辑会计算 offset=3。
  - 已按程序真实排序确认 offset=0 的第一批产品 ID 为 `1`、`10`、`100`。
  - 已按程序真实排序确认 offset=3 的第二批产品 ID 为 `1000`、`1001`、`1002`，不重复第一批。
  - `.\\.venv\\Scripts\\python.exe -m app.main`，通过，dry-run 仍显示 20 个 enabled API。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api product_detail`，通过，批次 `sync_20260703_072627_252050`，`rows=3`，`requests=3`。
  - 已查询数据库摘要，确认该批次 `total_api_count=1`、`success_api_count=1`、`failed_api_count=0`。
  - 同一批次 `sync_api_log` 记录 `request_count=3`、`success_count=3`、`failed_count=0`，`failed_request_log` 为 0 条。
  - 同一批次 `raw_api_data` 写入 3 条，主键为 `1000`、`1001`、`1002`，三条都有 `source_primary_key` 和 `data_hash`；`data_date` 仍为空，符合该接口未配置日期字段的预期。
  - `product_detail` checkpoint 更新到批次 `sync_20260703_072627_252050`，记录 `param_offset=3`、`param_limit=3`、`next_param_offset=6`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，同步配置数为 25。
  - 已查询 `api_config`，确认 `product_detail.enabled=0`、`param_source.source_field=source_primary_key`、`param_source.limit=3`、`param_source.auto_advance=true`，数据库配置总数 25、启用 20。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 为 185 个，真实配置 API 为 23 个，enabled 为 20 个。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，25 个测试。
- 阶段 5E 已运行：
  - 本阶段未修改 YAML，直接复用 `product_detail` checkpoint 中的 `next_param_offset=6`。
  - 已按程序真实排序确认 offset=6 的第三批产品 ID 为 `1003`、`1004`、`1005`，不重复前两批 `1`、`10`、`100`、`1000`、`1001`、`1002`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api product_detail`，通过，批次 `sync_20260703_073351_494098`，`rows=3`，`requests=3`。
  - 已查询数据库摘要，确认该批次 `total_api_count=1`、`success_api_count=1`、`failed_api_count=0`。
  - 同一批次 `sync_api_log` 记录 `request_count=3`、`success_count=3`、`failed_count=0`，`failed_request_log` 为 0 条。
  - 同一批次 `raw_api_data` 写入 3 条，主键为 `1003`、`1004`、`1005`，三条都有 `source_primary_key` 和 `data_hash`；`data_date` 仍为空。
  - `product_detail` checkpoint 更新到批次 `sync_20260703_073351_494098`，记录 `param_offset=6`、`param_limit=3`、`next_param_offset=9`。
  - `.\\.venv\\Scripts\\python.exe -m app.main`，通过，dry-run 仍显示 20 个 enabled API。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，同步配置数为 25。
  - 已查询 `api_config`，确认 `product_detail.enabled=0`、`param_source.source_field=source_primary_key`、`param_source.limit=3`、`param_source.auto_advance=true`，数据库配置总数 25、启用 20。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 为 185 个，真实配置 API 为 23 个，enabled 为 20 个。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，25 个测试。
- 阶段 5F 已运行：
  - 已从覆盖矩阵 `requires_upstream_params` 中选择 `country_province_query`，文档 id=5066，路径为 `GET /middle/base/countryProvince/query`。
  - 已读取公开文档详情，确认必填参数为 `countryCode`，响应 `data` 为省州数组，响应字段包含 `id`、`countryCode`、`name`、`code`。
  - 已只读查询 `fba_warehouse_page.raw_json.country`，确认 36 条 FBA 仓 raw 均有国家字段，去重国家/区域码为 6 个。
  - 已新增 `tests/test_country_province_param_source.py`，先失败后通过，约束该接口默认 disabled，并复用 `param_source.fields` 从 `raw_json.country` 生成 `countryCode`。
  - 已新增 `country_province_query` YAML 配置，默认 `enabled=false`，小样本 `limit=3`，`primary_key.field=id`，`date_field` 为空。
  - `.\\.venv\\Scripts\\python.exe -m app.main --dry-run` 不存在；已用配置加载脚本确认真实配置 API 为 24 个、enabled API 仍为 20 个。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api country_province_query`，通过，批次 `sync_20260703_074515_363198`，`rows=60`，`requests=5`。
  - 已查询数据库摘要，确认该批次 `total_api_count=1`、`success_api_count=1`、`failed_api_count=0`。
  - 同一批次 `sync_api_log` 记录 `request_count=5`、`success_count=60`、`failed_count=0`，`failed_request_log` 为 0 条。
  - 同一批次 `raw_api_data` 写入 60 条，60 条都有 `source_primary_key` 和 `data_hash`；首批参数 `CA`、`EU`、`JP` 中 `CA` 和 `JP` 返回省州数据，`EU` 未返回省州数据但接口未失败。
  - `country_province_query` checkpoint 更新到批次 `sync_20260703_074515_363198`，记录 `param_offset=0`、`param_limit=3`、`next_param_offset=3`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，同步配置数为 26。
  - 已查询 `api_config`，确认 `country_province_query.enabled=0`、`param_source.source_api_code=fba_warehouse_page`、`param_source.limit=3`、`param_source.auto_advance=true`。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 为 185 个，真实配置 API 为 24 个，enabled 为 20 个。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，27 个测试。
- 阶段 5G 已运行：
  - 本阶段未修改 YAML，直接复用 `country_province_query` checkpoint 中的 `next_param_offset=3`。
  - 已只读确认 checkpoint 为 `param_offset=0`、`param_limit=3`、`next_param_offset=3`。
  - 已按程序真实排序确认 offset=3 的第二批 `countryCode` 为 `MX`、`UK`、`US`，不重复第一批 `CA`、`EU`、`JP`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api country_province_query`，通过，批次 `sync_20260703_075322_115002`，`rows=90`，`requests=5`。
  - 已查询数据库摘要，确认该批次 `total_api_count=1`、`success_api_count=1`、`failed_api_count=0`。
  - 同一批次 `sync_api_log` 记录 `request_count=5`、`success_count=90`、`failed_count=0`，`failed_request_log` 为 0 条。
  - 同一批次 `raw_api_data` 写入 90 条，90 条都有 `source_primary_key` 和 `data_hash`；第二批参数中 `MX` 和 `US` 返回省州数据，`UK` 未返回省州数据但接口未失败。
  - `country_province_query` checkpoint 更新到批次 `sync_20260703_075322_115002`，记录 `param_offset=3`、`param_limit=3`、`next_param_offset=6`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，同步配置数为 26。
  - 已查询 `api_config`，确认 `country_province_query.enabled=0`、`param_source.source_api_code=fba_warehouse_page`、`param_source.limit=3`、`param_source.auto_advance=true`。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 为 185 个，真实配置 API 为 24 个，enabled 为 20 个。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，27 个测试。
- 阶段 5H 已运行：
  - 已从覆盖矩阵 `requires_upstream_params` 中选择 `transfer_detail`，文档 id=1021，路径为 `POST /fulfillment/inventory/transfer/detail`。
  - 已读取公开文档详情，确认必填参数为 `code`，响应 `data` 为单对象，响应字段包含 `code`、`createDate`、`updateTime`、`items` 等。
  - 已只读查询 `storage_inbound_page.raw_json`，确认 `opType=TFOutbound` 有 6481 条 raw，且 6481 个去重 `fcode` 可作为调拨单号候选。
  - 已新增 `tests/test_transfer_detail_param_source.py`，先失败后通过，约束 `transfer_detail` 默认 disabled，并使用 `raw_json.fcode -> code`、`raw_json.opType=TFOutbound` 过滤生成请求参数。
  - 已为 `param_source.fields` 增加最小 `filters` 能力，仅支持 `raw_json.<field> == 固定值`，用于避免把非调拨单 `fcode` 作为调拨单号。
  - 已新增 `transfer_detail` YAML 配置，默认 `enabled=false`，小样本 `limit=3`，`response.item_field=data`，主键字段为 `code`，日期字段为 `createDate`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api transfer_detail`，通过，批次 `sync_20260703_081028_425736`，`rows=3`，`requests=3`。
  - 已查询数据库摘要，确认该批次 `total_api_count=1`、`success_api_count=1`、`failed_api_count=0`。
  - 同一批次 `sync_api_log` 记录 `request_count=3`、`success_count=3`、`failed_count=0`，`failed_request_log` 为 0 条。
  - 同一批次 `raw_api_data` 写入 3 条，主键为 `TF20230616000001`、`TF20230616000002`、`TF20230616000003`，三条都有 `source_primary_key`、`data_hash` 和 `data_date`。
  - `transfer_detail` checkpoint 更新到批次 `sync_20260703_081028_425736`，记录 `param_offset=0`、`param_limit=3`、`next_param_offset=3`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，同步配置数为 27。
  - 已查询 `api_config`，确认 `transfer_detail.enabled=0`、`param_source.source_api_code=storage_inbound_page`、`param_source.limit=3`、`param_source.auto_advance=true`、过滤值为 `TFOutbound`。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 为 185 个，真实配置 API 为 25 个，enabled 为 20 个。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，29 个测试。
- 阶段 5I 已运行：
  - 本阶段未修改 YAML，直接复用 `transfer_detail` checkpoint 中的 `next_param_offset=3`。
  - 已只读确认 checkpoint 为 `param_offset=0`、`param_limit=3`、`next_param_offset=3`。
  - 已按程序真实排序确认 offset=3 的第二批调拨单号为 `TF20230616000004`、`TF20230617000005`、`TF20230617000006`，不重复第一批。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api transfer_detail`，通过，批次 `sync_20260703_081910_520250`，`rows=3`，`requests=3`。
  - 已查询数据库摘要，确认该批次 `total_api_count=1`、`success_api_count=1`、`failed_api_count=0`。
  - 同一批次 `sync_api_log` 记录 `request_count=3`、`success_count=3`、`failed_count=0`，`failed_request_log` 为 0 条。
  - 同一批次 `raw_api_data` 写入 3 条，主键为 `TF20230616000004`、`TF20230617000005`、`TF20230617000006`，三条都有 `source_primary_key`、`data_hash` 和 `data_date`。
  - `transfer_detail` checkpoint 更新到批次 `sync_20260703_081910_520250`，记录 `param_offset=3`、`param_limit=3`、`next_param_offset=6`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，同步配置数为 27。
  - 已查询 `api_config`，确认 `transfer_detail.enabled=0`、`param_source.source_api_code=storage_inbound_page`、`param_source.limit=3`、`param_source.auto_advance=true`、过滤值为 `TFOutbound`。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 为 185 个，真实配置 API 为 25 个，enabled 为 20 个。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，29 个测试。
- 阶段 5J 已运行：
  - 已从覆盖矩阵 `requires_upstream_params` 中选择 `lot_no_detail`，文档 id=1026，路径为 `GET /purchase/srm/lotNo/detail`。
  - 本地覆盖矩阵确认 `lot_no_detail` 必填参数为 `code`，响应非分页、非敏感；本轮公网文档详情查询出现 DNS 解析失败，因此以已生成 catalog 和真实接口调用结果交叉验证。
  - 已只读查询 `storage_inbound_page.raw_json`，确认 `opType=LNInbound` 有 8781 条 raw，且 8243 个去重 `fcode` 可作为交货单号候选。
  - 已新增 `tests/test_lot_no_detail_param_source.py`，先失败后通过，约束 `lot_no_detail` 默认 disabled，并使用 `raw_json.fcode -> code`、`raw_json.opType=LNInbound` 过滤生成请求参数。
  - 已新增 `lot_no_detail` YAML 配置，默认 `enabled=false`，小样本 `limit=3`，`response.item_field=data`，主键字段为 `code`，日期字段为 `createdAt`。
  - 已按程序真实排序确认第一批交货单号为 `LN2209200001`、`LN2209210002`、`LN2209220003`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api lot_no_detail`，通过，批次 `sync_20260703_083033_387237`，`rows=3`，`requests=3`。
  - 已查询数据库摘要，确认该批次 `total_api_count=1`、`success_api_count=1`、`failed_api_count=0`。
  - 同一批次 `sync_api_log` 记录 `request_count=3`、`success_count=3`、`failed_count=0`，`failed_request_log` 为 0 条。
  - 同一批次 `raw_api_data` 写入 3 条，主键为 `LN2209200001`、`LN2209210002`、`LN2209220003`，三条都有 `source_primary_key`、`data_hash` 和 `data_date`。
  - `lot_no_detail` checkpoint 更新到批次 `sync_20260703_083033_387237`，记录 `param_offset=0`、`param_limit=3`、`next_param_offset=3`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，同步配置数为 28。
  - 已查询 `api_config`，确认 `lot_no_detail.enabled=0`、`param_source.source_api_code=storage_inbound_page`、`param_source.limit=3`、`param_source.auto_advance=true`、过滤值为 `LNInbound`。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 为 185 个，真实配置 API 为 26 个，enabled 为 20 个。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，31 个测试。
- 阶段 5K 已运行：
  - 本阶段未修改 YAML，直接复用 `lot_no_detail` checkpoint 中的 `next_param_offset=3`。
  - 已只读确认 checkpoint 为 `param_offset=0`、`param_limit=3`、`next_param_offset=3`。
  - 已按程序真实排序确认 offset=3 的第二批交货单号为 `LN2209220004`、`LN2209220005`、`LN2209270006`，不重复第一批。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api lot_no_detail`，通过，批次 `sync_20260703_083838_430764`，`rows=3`，`requests=3`。
  - 已查询数据库摘要，确认该批次 `total_api_count=1`、`success_api_count=1`、`failed_api_count=0`。
  - 同一批次 `sync_api_log` 记录 `request_count=3`、`success_count=3`、`failed_count=0`，`failed_request_log` 为 0 条。
  - 同一批次 `raw_api_data` 写入 3 条，主键为 `LN2209220004`、`LN2209220005`、`LN2209270006`，三条都有 `source_primary_key`、`data_hash` 和 `data_date`。
  - `lot_no_detail` checkpoint 更新到批次 `sync_20260703_083838_430764`，记录 `param_offset=3`、`param_limit=3`、`next_param_offset=6`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，同步配置数为 28。
  - 已查询 `api_config`，确认 `lot_no_detail.enabled=0`、`param_source.source_api_code=storage_inbound_page`、`param_source.limit=3`、`param_source.auto_advance=true`、过滤值为 `LNInbound`。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，第一次 124 秒超时；用 300 秒超时重跑通过，公开文档 API 为 185 个，真实配置 API 为 26 个，enabled 为 20 个。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，31 个测试。
- 阶段 5L 已运行：
  - 已从覆盖矩阵 `requires_upstream_params` 中选择 `delivery_fee_query`，文档 id=1032，路径为 `GET /fulfillment/ship/deliveryFee/query`。
  - 公开文档详情本轮 DNS 解析失败；已用本地覆盖矩阵确认该接口必填参数为 `code`，响应非分页、非敏感，并用真实接口探测确认响应字段包含 `code`、`createdAt`、`dlCode` 等费用对象字段。
  - 已只读查询 `storage_inbound_page.raw_json`，确认 `opType=OROutbound` 有 142281 条 raw，且 142281 个去重 `fcode` 可作为发货单号候选。
  - 探索阶段发现前三个发货单号返回的是字段齐全但主键为空的费用对象；已清理探索批次 `sync_20260703_085106_741075` 的 `delivery_fee_query` 相关 raw、log、checkpoint 和 batch 记录。
  - 已新增 `tests/test_delivery_fee_param_source.py`，先失败后通过，约束 `delivery_fee_query` 默认 disabled，并使用 `raw_json.fcode -> code`、`raw_json.opType=OROutbound` 过滤生成请求参数。
  - 已为 `primary_key.required=true` 增加最小过滤能力：当响应对象缺少必填主键时不写入 raw，避免出现 `source_primary_key="None"` 的脏记录；未声明必填主键的历史接口不受影响。
  - 已新增 `delivery_fee_query` YAML 配置，默认 `enabled=false`，小样本 `limit=3`，`response.item_field=data`，主键字段为 `code` 且 `required=true`，日期字段为 `createdAt`。
  - 已按程序真实排序确认第一批发货单号为 `FO2409200112422392484582`、`FO2409200242871875383389`、`FO2409200442555715758134`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api delivery_fee_query`，通过，批次 `sync_20260703_085804_349693`，`rows=0`，`requests=3`。
  - 已查询数据库摘要，确认该批次 `total_api_count=1`、`success_api_count=1`、`failed_api_count=0`。
  - 同一批次 `sync_api_log` 记录 `request_count=3`、`success_count=0`、`failed_count=0`，`failed_request_log` 为 0 条。
  - 同一批次 `raw_api_data` 写入 0 条，且 `delivery_fee_query` 当前无 `source_primary_key="None"` 的脏 raw。
  - `delivery_fee_query` checkpoint 更新到批次 `sync_20260703_085804_349693`，记录 `param_offset=0`、`param_limit=3`、`next_param_offset=3`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，同步配置数为 29。
  - 已查询 `api_config`，确认 `delivery_fee_query.enabled=0`、`param_source.source_api_code=storage_inbound_page`、`param_source.limit=3`、`param_source.auto_advance=true`、过滤值为 `OROutbound`、`primary_key.required=true`。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 为 185 个，真实配置 API 为 27 个，enabled 为 20 个。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，34 个测试。

## Review 4L-4N

- 已完成第一组目标模式闭环：
  - 4L 建立公开文档覆盖矩阵，确认公开文档 API 为 185 个。
  - 4M 从未配置直接读取候选中接入并单接口验证 2 个产品基础资料接口。
  - 4N 将这 2 个接口加入 enabled 批量同步，并完成同批次验证。
- 当前覆盖状态：
  - 公开文档 API：185 个。
  - 已配置真实 API：12 个。
  - enabled API：12 个。
  - 未配置直接读取候选仍有 46 个。
  - 依赖上游参数接口有 79 个，后续需要依赖调度或参数来源设计，不能简单复制当前 YAML 模式。
- 本组三轮发现的问题：
  - `product_page` 单接口验证暴露 `max_pages` 截断风险，已通过 `max_pages=100` 修正并加测试约束。
  - enabled 批量同步耗时随大接口明显增加，当前 12 个 API 批次请求数已到 105 次。
  - 部分接口没有稳定单字段主键，例如 `amazon_msku_page`，后续需要明确 data_hash 或复合主键策略。
- 下一组三轮建议：
  - 先继续接入少量低风险、分页清晰、有稳定主键的直接读取接口。
  - 同时开始准备依赖型接口策略，例如从已同步的店铺、SKU、仓库、产品数据生成请求参数。
  - 每轮仍保持“默认禁用 -> 单接口验证 -> 加入 enabled”的节奏。

## Review 4O-4Q

- 已完成第二组目标模式闭环：
  - 4O 从未配置 direct_read_candidate 中接入并单接口验证 `kb_product_page` 和 `fba_warehouse_page`。
  - 4P 将这 2 个接口加入 enabled 批量同步，并完成 14 个 API 同批次验证。
  - 4Q 继续接入并单接口验证 `store_location_page` 和 `multi_shop_query`。
- 当前覆盖状态：
  - 公开文档 API：185 个。
  - 已配置真实 API：16 个。
  - enabled API：14 个。
  - 新增候选中 `store_location_page` 和 `multi_shop_query` 已验证但仍保持 disabled。
  - 依赖上游参数接口仍有 79 个，后续需要单独设计参数来源和批次粒度。
- 本组三轮发现的问题：
  - `kb_product_page` 当前账号返回 0 条，但请求、日志和 checkpoint 链路正常，仍可作为 enabled 空集接口运行。
  - `store_location_page` 当前总量为 1116 条，请求 12 页，说明中等分页接口可以继续沿用现有模型，但加入 enabled 后会进一步拉长批量同步。
  - `multi_shop_query` 是多平台店铺基础维度，可为后续多平台依赖型接口提供参数来源。
- 下一组三轮建议：
  - 先将 `store_location_page` 和 `multi_shop_query` 加入 enabled 并验证 16 个 API 同批次同步。
  - 然后继续新增少量低风险直接读取接口。
  - 同时开始为依赖型接口梳理“从已同步 raw 数据提取请求参数”的最小机制。

## Review 4R-4T

- 已完成第三组目标模式闭环：
  - 4R 将 `store_location_page` 和 `multi_shop_query` 加入 enabled，并完成 16 个 API 同批次验证。
  - 4S 继续接入并单接口验证 `crm_tags_page` 和 `inventory_team_query`。
  - 4T 将这 2 个接口加入 enabled，并完成 18 个 API 同批次验证。
- 当前覆盖状态：
  - 公开文档 API：185 个。
  - 已配置真实 API：18 个。
  - enabled API：18 个。
  - direct_read_candidate 分类仍为 58 个，其中已配置 18 个真实 API。
  - 依赖上游参数接口仍有 79 个，下一阶段需要开始把参数来源机制纳入主线。
- 本组三轮发现的问题：
  - `crm_tags_page` 和 `inventory_team_query` 都是小接口，加入 enabled 后总请求数从 119 增至 121，对批量耗时影响很小。
  - 当前 enabled 批量同步主要耗时仍来自 `product_page` 这类大分页接口。
  - 单纯继续接低风险直读接口能增加覆盖面，但不能解决 79 个依赖型接口的数据拉取问题。
- 下一组三轮建议：
  - 继续少量接入低风险直读接口，保持覆盖面增长。
  - 同时启动依赖型接口的最小参数来源机制，例如先从已同步的 raw 数据提取店铺、仓库、产品或团队参数。
  - 依赖型接口先做单接口、小参数集验证，再决定是否进入 enabled。

## Review 4U-4W

- 已完成第四组目标模式闭环：
  - 4U 单接口完整验证 `product_inventory_page` 和 `storage_inbound_page` 两个大库存接口。
  - 4V 将这两个大接口加入 enabled，并完成 20 个 API 同批次验证。
  - 4W 启动依赖型接口最小参数来源机制，并用 `product_detail` 做 3 个产品 ID 小样本验证。
- 当前覆盖状态：
  - 公开文档 API：185 个。
  - 已配置真实 API：21 个。
  - enabled API：20 个。
  - `product_detail` 已验证但保持 disabled。
  - 依赖上游参数接口仍有 79 个，当前只打通了最小 `source_primary_key` 参数来源。
- 本组三轮发现的问题：
  - 两个库存大接口加入 enabled 后，20 个 API 批量同步达到 3052 次请求，生产定时窗口必须按长任务处理。
  - `product_detail` 文档属于依赖型接口，不能用普通静态 YAML 全量跑；需要从已同步的 `product_page` 取产品 ID。
  - `product_detail` 真实响应顶层没有 `lastDate`，因此不能沿用产品列表的日期字段，`data_date` 目前为空。
- 下一组三轮建议：
  - 继续扩展依赖参数来源机制，优先支持从 `raw_json` 提取多个字段组成请求参数。
  - 下一轮可从 `market_inventory_query` 开始，因为它需要 `sku` 和 `warehouseId`，参数可来自已同步的 `product_inventory_page`。
  - 依赖型接口仍先小样本验证，默认保持 disabled，确认请求量和失败粒度后再讨论是否进入 enabled。

## Review 4X-4Z

- 已完成第五组目标模式闭环：
  - 4X 接入 `market_inventory_query`，打通从上游 `raw_json.sku` 和 `raw_json.warehouseId` 生成多字段请求参数。
  - 4Y 增加手动 `offset` 参数窗口，完成第二批小样本验证。
  - 4Z 增加 checkpoint 驱动的自动窗口推进，完成第三批小样本验证。
- 当前覆盖状态：
  - 公开文档 API：185 个。
  - 已配置真实 API：22 个。
  - enabled API：20 个。
  - `product_detail` 和 `market_inventory_query` 已验证但保持 disabled。
  - `market_inventory_query` 的上游去重参数对约 111307 个，当前只完成前三个小窗口。
- 本组三轮发现的问题：
  - 依赖型接口不能直接加入 enabled 批量同步；即使单接口可调用，也必须先控制参数窗口和 checkpoint 续跑边界。
  - `market_inventory_query` 第三批参数请求成功但返回 0 条，说明“参数窗口成功”和“响应有数据”需要分开判断。
  - 当前 checkpoint 自动推进只解决单接口连续小窗口，尚未解决依赖型接口的生产级调度频率、窗口大小和失败重跑策略。
- 下一组三轮建议：
  - 先连续再跑一次 `market_inventory_query`，验证 `next_param_offset=9` 能不改 YAML 自动推进到第四批。
  - 复核依赖参数接口的 checkpoint 语义，明确空结果窗口是否继续推进。
  - 再选择一个依赖型接口复用同一机制，避免只为一个接口定制。

## Review 5A-5C

- 已完成第六组目标模式闭环：
  - 5A 验证 `market_inventory_query` 不改 YAML 即可从 checkpoint 自动推进到第四批参数窗口。
  - 5B 接入第二个依赖型接口 `storage_inbound_detail`，复用 `raw_json.code` 参数来源完成第一批小样本。
  - 5C 为 `storage_inbound_detail` 开启 `auto_advance`，完成第二批 code 小样本，并把 checkpoint 推进到 `next_param_offset=6`。
- 当前覆盖状态：
  - 公开文档 API：185 个。
  - 已配置真实 API：23 个。
  - enabled API：20 个。
  - `product_detail`、`market_inventory_query` 和 `storage_inbound_detail` 已验证但保持 disabled。
  - 当前已验证两类 raw_json 参数来源：多字段 `sku + warehouseId` 和单字段 `code`。
- 本组三轮发现的问题：
  - 依赖型接口的小窗口推进链路成立，但仍不应直接加入 enabled 批量同步，否则会把 111307 个库存参数对或 174286 个入库单据 code 带入一次日常批次。
  - 参数窗口的真实排序必须按程序 SQL 理解；`raw_json` 字段来源当前按提取字段 `GROUP BY/ORDER BY`，不是按 raw 表插入时间。
  - `storage_inbound_detail` 的详情响应包含 `inboundItemVOS` 明细数组，目前仍作为完整 raw JSON 保存，暂不拆子表。
- 下一组三轮建议：
  - 先为 `product_detail` 开启 `param_source.auto_advance`，验证 `source_primary_key` 参数来源分支也能从 checkpoint 连续推进。
  - 继续保持依赖型接口 disabled，用 `--sync-api` 做小窗口验证。
  - 之后再选择新的依赖型接口，或开始设计依赖型窗口接口的生产级调度策略。

## Review 5D-5F

- 已完成第七组目标模式闭环：
  - 5D 为 `product_detail` 开启 `auto_advance`，验证 `source_primary_key` 参数来源可从旧 checkpoint 推进到第二批。
  - 5E 不改 YAML 继续验证 `product_detail` 第三批，确认 `source_primary_key` 分支可连续自动推进。
  - 5F 新增 `country_province_query`，复用 `raw_json.country -> countryCode` 完成基础数据依赖接口小样本。
- 当前覆盖状态：
  - 公开文档 API：185 个。
  - 已配置真实 API：24 个。
  - enabled API：20 个。
  - `product_detail`、`market_inventory_query`、`storage_inbound_detail`、`country_province_query` 已验证但保持 disabled。
  - 当前依赖参数来源已覆盖 `source_primary_key`、单字段 `raw_json`、多字段 `raw_json` 三类小窗口。
- 本组三轮发现的问题：
  - `product_detail` 无日期字段，`data_date` 为空是事实，不应为了统一而编造日期。
  - `country_province_query` 的上游 `fba_warehouse_page.country` 包含 `EU` 这类区域码，接口可成功但不会产生省州 raw；参数窗口成功与返回数据多少仍要分开判断。
  - 依赖型接口继续保持 disabled 是正确边界；它们需要独立窗口调度，不应混进 20 个 enabled 日常全量批次。
- 下一组三轮建议：
  - 先不改 YAML，继续运行 `country_province_query`，验证 `next_param_offset=3` 自动推进到第二批国家码。
  - 之后选择另一个参数来源更干净的依赖型接口，或者开始为依赖型接口设计独立的批量窗口命令。
  - 继续每轮用数据库查询证明参数来源、批次日志、raw、checkpoint，而不是只看命令返回成功。

## Review 5G-5I

- 已完成第八组目标模式闭环：
  - 5G 验证 `country_province_query` 不改 YAML 自动推进到第二批国家码。
  - 5H 新增 `transfer_detail`，并为 raw_json 参数来源增加最小固定等值过滤能力。
  - 5I 验证 `transfer_detail` 不改 YAML 自动推进到第二批调拨单号。
- 当前覆盖状态：
  - 公开文档 API：185 个。
  - 已配置真实 API：25 个。
  - enabled API：20 个。
  - `product_detail`、`market_inventory_query`、`storage_inbound_detail`、`country_province_query`、`transfer_detail` 已验证但保持 disabled。
  - 当前依赖参数来源支持 `source_primary_key`、单字段 `raw_json`、多字段 `raw_json`、raw_json 固定等值过滤和 checkpoint 小窗口推进。
- 本组三轮发现的问题：
  - 基础数据类接口可能出现参数窗口成功但部分参数无返回数据，例如 `country_province_query` 的 `EU`、`UK`。
  - `transfer_detail` 必须过滤 `opType=TFOutbound`，否则 `storage_inbound_page.raw_json.fcode` 会混入其他业务单据。
  - `param_source.filters` 只解决固定等值过滤，不解决数组入参、嵌套数组、范围条件或复杂依赖调度。
- 下一组三轮建议：
  - 回到覆盖矩阵继续选择新的依赖型接口，优先选择可复用已有 `source_primary_key`、`fields` 或 `filters` 的低风险接口。
  - 对需要数组入参的 `marketNames/query`、`warehouseIds/query` 暂不强行接入，除非先设计清楚数组参数编码。
  - 依赖型接口继续保持 disabled，用 `--sync-api` 做小窗口验证。

## Review 5J-5L

- 已完成第九组目标模式闭环：
  - 5J 新增 `lot_no_detail`，复用 `raw_json.fcode` 加 `opType=LNInbound` 过滤完成第一批交货单明细验证。
  - 5K 不改 YAML 验证 `lot_no_detail` 从 checkpoint 自动推进到第二批交货单号。
  - 5L 新增 `delivery_fee_query`，复用 `raw_json.fcode` 加 `opType=OROutbound` 过滤完成第一批发货单预估费用窗口验证，并补上必填主键过滤，避免空费用对象污染 raw。
- 当前覆盖状态：
  - 公开文档 API：185 个。
  - 已配置真实 API：27 个。
  - enabled API：20 个。
  - `product_detail`、`market_inventory_query`、`storage_inbound_detail`、`country_province_query`、`transfer_detail`、`lot_no_detail` 和 `delivery_fee_query` 已验证但保持 disabled。
  - 当前依赖参数来源支持 `source_primary_key`、单字段 `raw_json`、多字段 `raw_json`、raw_json 固定等值过滤、checkpoint 小窗口推进，以及按 `primary_key.required=true` 过滤缺主键响应对象。
- 本组三轮发现的问题：
  - `storage_inbound_page.raw_json.fcode` 是多业务单据共用字段，必须用 `opType` 过滤后才能作为不同详情接口的参数来源。
  - 部分接口会返回字段齐全但关键字段全为空的对象；这类响应不应写入 raw，否则会形成 `source_primary_key="None"` 的脏数据。
  - 物流费用接口可能有更严格限流，本轮只验证 3 个参数窗口，不应直接进入 enabled 或大窗口同步。
- 下一组三轮建议：
  - 继续回到覆盖矩阵，但优先处理不需要高频探测、不需要数组编码猜测的接口。
  - 对数组入参接口，例如 `marketNames/query`、`warehouseIds/query`，需要先确认真实请求编码，再考虑扩展参数来源机制。
  - 对会返回空对象的接口，新增配置时优先把稳定主键标记为 `required=true`，让同步引擎跳过缺主键对象。

## Stage 5M

- 阶段目标：回到覆盖矩阵，选择一个不需要数组编码、不涉及写操作、非敏感的低风险接口扩大覆盖。
- 已完成：
  - 从未配置 `direct_read_candidate` 中选择 `base_currency_query`，文档 id 为 `66`，路径为 `GET /middle/base/baseCurrency/query`。
  - 公开矩阵显示该接口无必填入参、非分页、非敏感响应；真实探测确认响应 `code=200` 且 `data` 为字符串标量。
  - 已新增 `tests/test_base_currency_scalar_response.py`，先失败后通过，约束 `base_currency_query` 默认 disabled，并约束标量 `data` 包装为单条 raw。
  - 已为同步引擎增加最小 `response.scalar_field` 能力：把 `data` 这类标量响应包装成 `{data: <value>}` 后复用现有主键、hash 和 raw 入库链路。
  - 已新增 `base_currency_query` YAML 配置，默认 `enabled=false`，`response.scalar_field=data`，`primary_key.field=data` 且 `required=true`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api base_currency_query`，通过，批次 `sync_20260703_090810_838473`，`rows=1`，`requests=1`。
  - 数据库已确认该批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`。
  - 同批次 `sync_api_log` 为 `request_count=1`、`success_count=1`、`failed_count=0`、`error_message=NULL`。
  - 同批次 `raw_api_data` 写入 1 条，`source_primary_key=CNY`，`raw_json.data=CNY`，`data_hash` 已生成。
  - `base_currency_query` checkpoint 指向批次 `sync_20260703_090810_838473`，`checkpoint_value` 记录 `last_page=1`、`request_count=1`、`item_count=1`。
  - `failed_request_log` 中该批次该接口为 0 条。
  - `.\\.venv\\Scripts\\python.exe -m app.main`，通过，dry-run 显示 20 个 enabled API。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，同步配置数为 30；其中 2 个是占位示例，真实接口为 28 个。
  - 已查询 `api_config`，确认 `base_currency_query.enabled=0`、`config_json.enabled=false`、`response.scalar_field=data`、`primary_key.field=data`，数据库配置总数 30、启用 20。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 为 185 个，真实配置 API 为 28 个，enabled 为 20 个。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，37 个测试。
- 当前结论：
  - 标量响应是公开文档中的真实形态，不能强行套列表或对象模型；包装为单条 raw 是最小可维护方案。
  - `base_currency_query` 是低频基础配置接口，已完成真实同步验证，但本轮仍保持 disabled，避免扩大 enabled 日常批次前缺少连续运行观察。
  - 当前仍不支持数组入参、嵌套数组来源或复杂过滤表达式。

## Stage 5N

- 阶段目标：继续回到覆盖矩阵，优先选择普通分页直读接口扩大覆盖，同时避开订单、物流费用、写操作和数组编码未知接口。
- 已完成：
  - 从未配置 `direct_read_candidate` 中选择 `amazon_msku_page`，文档 id 为 `1921`，路径为 `POST /purchase/goods/amazonMsku/page`。
  - 选择依据：该接口属于产品域，公开矩阵显示无必填入参、普通分页、非敏感响应；风险低于订单、物流费用、包裹费用和入库确认候选。
  - 真实探测确认响应 `code=200`，`data` 为分页对象，包含 `page`、`pagesize`、`rows`、`total`；首批 `total=18430`，`rows` 字段为列表。
  - 首条记录字段包含 `sku`、`msku`、`warehouseId`、`recordDate`、`memo`；未发现单一稳定业务主键，本轮不编造主键，沿用 `data_hash` 去重。
  - 已新增 `tests/test_amazon_msku_page_config.py`，先失败后通过，约束 `amazon_msku_page` 默认 disabled、分页字段、`max_pages=3`、空主键和 `recordDate` 日期字段。
  - 已新增 `amazon_msku_page` YAML 配置，默认 `enabled=false`，`page.list_field=data.rows`、`page.total_field=data.total`、`max_pages=3`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api amazon_msku_page`，通过，批次 `sync_20260703_091918_162958`，`rows=300`，`requests=3`。
  - 数据库已确认该批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`。
  - 同批次 `sync_api_log` 为 `request_count=3`、`success_count=300`、`failed_count=0`、`error_message=NULL`。
  - 同批次 `raw_api_data` 写入 300 条，300 条都有 `data_hash`，`data_date` 范围为 `2026-05-22` 到 `2026-07-02`。
  - 同批次 raw 示例字段已确认 `sku`、`msku`、`warehouseId` 和 `data_date` 可从原始 JSON 与 `recordDate` 提取。
  - `amazon_msku_page` checkpoint 指向批次 `sync_20260703_091918_162958`，`checkpoint_value` 记录 `last_page=3`、`request_count=3`、`item_count=300`、`total_count=18430`。
  - `failed_request_log` 中该批次该接口为 0 条。
  - `.\\.venv\\Scripts\\python.exe -m app.main`，通过，dry-run 显示 20 个 enabled API。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，同步配置数为 31；其中 2 个是占位示例，真实接口为 29 个。
  - 已查询 `api_config`，确认 `amazon_msku_page.enabled=0`、`config_json.enabled=false`、`page.max_pages=3`、`primary_key.field=""`、`date_field=recordDate`，数据库配置总数 31、启用 20。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 为 185 个，真实配置 API 为 29 个，enabled 为 20 个。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，38 个测试。
- 当前结论：
  - 普通分页直读接口仍可复用现有同步机制；接入阶段必须用 `max_pages` 控制窗口，避免一次拉完整 18430 条。
  - 对没有单一稳定业务主键的映射类接口，空 `primary_key.field` 加 `data_hash` 去重比强行使用 `sku` 或 `msku` 更符合事实。
  - `amazon_msku_page` 已完成真实小窗口验证，但仍保持 disabled，后续是否进入日常 enabled 批量同步需评估全量 185 页的运行窗口。

## Stage 5O

- 阶段目标：继续在剩余候选中选择低风险接口，优先避开订单、物流费用、写操作、数组编码未知和强限流接口。
- 已完成：
  - 从未配置 `direct_read_candidate` 中选择 `platform_msku_page`，文档 id 为 `2898`，路径为 `POST /platform/base/platformMsku/page`。
  - 选择依据：该接口是多平台 SKU/MSKU 映射，公开矩阵显示普通分页、非敏感响应；风险低于订单、物流费用、包裹费用和疑似写操作候选。
  - 真实探测确认响应 `code=200`，`data` 为分页对象，包含 `page`、`pagesize`、`rows`、`total`；首批 `total=1707`，`rows` 字段为列表。
  - 首条记录字段包含 `sku`、`msku`、`platformId`、`platformName`、`shopId`、`country`、`recordDate`、`memo`；未发现单一稳定业务主键，本轮不编造主键，沿用 `data_hash` 去重。
  - 已新增 `tests/test_platform_msku_page_config.py`，先失败后通过，约束 `platform_msku_page` 默认 disabled、分页字段、`max_pages=3`、空主键和 `recordDate` 日期字段。
  - 已新增 `platform_msku_page` YAML 配置，默认 `enabled=false`，`page.list_field=data.rows`、`page.total_field=data.total`、`max_pages=3`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api platform_msku_page`，通过，批次 `sync_20260703_092856_887088`，`rows=300`，`requests=3`。
  - 数据库已确认该批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`。
  - 同批次 `sync_api_log` 为 `request_count=3`、`success_count=300`、`failed_count=0`、`error_message=NULL`。
  - 同批次 `raw_api_data` 写入 300 条，300 条都有 `data_hash`，`data_date` 范围为 `2025-06-25` 到 `2025-12-22`。
  - 同批次 raw 示例字段已确认 `sku`、`msku`、`platformId`、`shopId` 和 `data_date` 可从原始 JSON 与 `recordDate` 提取。
  - `platform_msku_page` checkpoint 指向批次 `sync_20260703_092856_887088`，`checkpoint_value` 记录 `last_page=3`、`request_count=3`、`item_count=300`、`total_count=1707`。
  - `failed_request_log` 中该批次该接口为 0 条。
  - `.\\.venv\\Scripts\\python.exe -m app.main`，通过，dry-run 显示 20 个 enabled API。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，同步配置数为 32；其中 2 个是占位示例，真实接口为 30 个。
  - 已查询 `api_config`，确认 `platform_msku_page.enabled=0`、`config_json.enabled=false`、`page.max_pages=3`、`primary_key.field=""`、`date_field=recordDate`，数据库配置总数 32、启用 20。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 为 185 个，真实配置 API 为 30 个，enabled 为 20 个。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，39 个测试。
- 当前结论：
  - SKU/MSKU 映射类接口没有单一稳定主键时，继续用空 `primary_key.field` 加 `data_hash` 去重是当前最小可靠方案。
  - `platform_msku_page` 全量约 18 页，比 `amazon_msku_page` 小，但仍先保持 disabled，避免未复盘前扩大 enabled 日常批量。
  - 剩余直读候选开始明显偏向订单、物流、财务和库存报表；后续每轮更需要先判断业务风险和运行窗口。

## Review 5M-5O

- 已完成第十组目标模式闭环：
  - 5M 新增 `base_currency_query`，补齐标量响应包装能力。
  - 5N 新增 `amazon_msku_page`，验证亚马逊 SKU/MSKU 映射分页接口。
  - 5O 新增 `platform_msku_page`，验证多平台 SKU/MSKU 映射分页接口。
- 当前覆盖状态：
  - 公开文档 API：185 个。
  - 已配置真实 API：30 个。
  - enabled API：20 个。
  - `product_detail`、`market_inventory_query`、`storage_inbound_detail`、`country_province_query`、`transfer_detail`、`lot_no_detail`、`delivery_fee_query`、`base_currency_query`、`amazon_msku_page` 和 `platform_msku_page` 已验证但保持 disabled。
  - 当前响应提取机制支持列表、单对象和标量包装；依赖参数来源支持 `source_primary_key`、`raw_json` 字段、多字段、固定等值过滤和 checkpoint 小窗口推进。
- 本组三轮发现的问题：
  - 公开文档中的基础配置接口可能返回标量，不能强行假设所有接口都是列表或对象。
  - SKU/MSKU 映射类接口缺少单一稳定主键，当前应优先用 `data_hash` 去重，不应随意选 `sku`、`msku` 或 `shopId` 当主键。
  - 剩余低风险直读候选减少，后续接口更多涉及库存报表、财务、订单、物流或采购，需要更严格控制 `max_pages` 和业务风险。
- 下一组三轮建议：
  - 继续回到覆盖矩阵，优先选择普通分页且业务风险可控的库存/基础/产品周边接口。
  - 对订单、财务、物流费用接口先保持谨慎，除非本轮明确要进入这些高价值但高风险接口。
  - 不要在未确认数组编码前接入 `marketNames/query`、`warehouseIds/query` 等数组参数接口。

## Stage 5P

- 阶段目标：继续从低风险直读候选中扩大覆盖，优先选择普通分页、响应形态清晰、默认不进入日常 enabled 批量的接口。
- 已完成：
  - 从未配置 `direct_read_candidate` 中选择 `fba_inventory_v2_page`，文档 id 为 `5136`，路径为 `POST /purchase/store/fbaInventory/page/V2`。
  - 选择依据：该接口属于库存域普通分页直读，响应非敏感，业务风险低于订单、财务、物流费用和疑似写操作候选。
  - 真实探测确认响应 `code=200`，`data` 为分页对象，包含 `page`、`pagesize`、`rows`、`total`；当前账号 `total=30759`，首批 `rows` 为 100 条。
  - 首条记录字段包含 `id`、`sku`、`warehouseId`、`asin`、`updateTime`；本轮使用 `id` 作为主键，使用 `updateTime` 作为 `data_date` 来源。
  - 已新增 `tests/test_fba_inventory_v2_page_config.py`，先失败后通过，约束 `fba_inventory_v2_page` 默认 disabled、分页字段、`max_pages=3`、主键 `id` 和日期字段 `updateTime`。
  - 已新增 `fba_inventory_v2_page` YAML 配置，默认 `enabled=false`，`page.list_field=data.rows`、`page.total_field=data.total`、`page.max_pages=3`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api fba_inventory_v2_page`，通过，批次 `sync_20260703_094024_225221`，`rows=300`，`requests=3`。
  - 数据库已确认该批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`。
  - 同批次 `sync_api_log` 为 `request_count=3`、`success_count=300`、`failed_count=0`、`error_message=NULL`。
  - 同批次 `raw_api_data` 写入 300 条，0 条缺少 `source_primary_key`，300 条都有 `data_hash`，300 条都有 `data_date`，日期范围为 `2026-03-02` 到 `2026-07-03`。
  - 同批次 raw 示例字段已确认 `source_primary_key`、`sku`、`warehouseId`、`asin` 和 `data_date` 可从原始 JSON 与 `updateTime` 提取。
  - `fba_inventory_v2_page` checkpoint 指向批次 `sync_20260703_094024_225221`，`checkpoint_value` 记录 `last_page=3`、`request_count=3`、`item_count=300`、`total_count=30759`。
  - `failed_request_log` 中该批次该接口为 0 条。
  - `.\\.venv\\Scripts\\python.exe -m app.main`，通过，dry-run 显示 20 个 enabled API。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，同步配置数为 33；其中 2 个是占位示例，真实接口为 31 个。
  - 已查询 `api_config`，确认 `fba_inventory_v2_page.enabled=0`、`page.max_pages=3`、`page.page_size=100`、`primary_key.field=id`、`date_field=updateTime`，数据库配置总数 33、启用 20。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 为 185 个，真实配置 API 为 31 个，enabled 为 20 个。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，40 个测试。
- 当前结论：
  - FBA 库存 V2 具备稳定 `id`，比 SKU/MSKU 映射类接口更适合使用业务主键幂等。
  - 该接口当前总量 30759 条，约 308 页；本轮只验证 3 页窗口，保持 disabled 是合理边界。
  - 后续如果要把大库存类接口加入日常 enabled，需要先评估运行窗口和 cron 执行时长。

## Stage 5Q

- 阶段目标：继续扩大库存域低风险覆盖，避开订单、财务、物流费用、数组编码未知和强限流接口。
- 已完成：
  - 从未配置 `direct_read_candidate` 中选择 `inventory_adjustments_page`，文档 id 为 `20`，路径为 `POST /purchase/store/inventoryAdjustments/page`。
  - 选择依据：该接口属于库存域 FBA 盘库列表，普通分页、响应非敏感，业务风险低于订单、财务、物流费用和疑似写操作候选。
  - 同轮探测过多个库存候选：`inventory_event_page` 当前总量过大，`inventory_receipts_page` 当前总量过大，`inventory_age_page` 30 秒超时；因此本轮优先接入体量较可控且字段清晰的 `inventory_adjustments_page`。
  - 真实探测确认响应 `code=200`，`data` 为分页对象，包含 `total`、`pagesize`、`page`、`rows`；当前账号 `total=58239`，首批 `rows` 为 100 条。
  - 首条记录字段包含 `id`、`msku`、`warehouseId`、`marketTimeZone`、`zeroTimeZone`、`reason`、`quantity`；本轮使用 `id` 作为主键，使用 `marketTimeZone` 作为 `data_date` 来源。
  - 已新增 `tests/test_inventory_adjustments_page_config.py`，先失败后通过，约束 `inventory_adjustments_page` 默认 disabled、分页字段、`max_pages=3`、主键 `id` 和日期字段 `marketTimeZone`。
  - 已新增 `inventory_adjustments_page` YAML 配置，默认 `enabled=false`，`page.list_field=data.rows`、`page.total_field=data.total`、`page.max_pages=3`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api inventory_adjustments_page`，通过，批次 `sync_20260703_095134_364973`，`rows=300`，`requests=3`。
  - 数据库已确认该批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`。
  - 同批次 `sync_api_log` 为 `request_count=3`、`success_count=300`、`failed_count=0`、`error_message=NULL`。
  - 同批次 `raw_api_data` 写入 300 条，0 条缺少 `source_primary_key`，300 条都有 `data_hash`，300 条都有 `data_date`，日期范围为 `2022-07-30` 到 `2022-08-28`。
  - 同批次 raw 示例字段已确认 `source_primary_key`、`msku`、`warehouseId`、`marketTimeZone` 和 `data_date` 可从原始 JSON 提取。
  - `inventory_adjustments_page` checkpoint 指向批次 `sync_20260703_095134_364973`，`checkpoint_value` 记录 `last_page=3`、`request_count=3`、`item_count=300`、`total_count=58239`。
  - `failed_request_log` 中该批次该接口为 0 条。
  - `.\\.venv\\Scripts\\python.exe -m app.main`，通过，dry-run 显示 20 个 enabled API。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，同步配置数为 34；其中 2 个是占位示例，真实接口为 32 个。
  - 已查询 `api_config`，确认 `inventory_adjustments_page.enabled=0`、`page.max_pages=3`、`page.page_size=100`、`primary_key.field=id`、`date_field=marketTimeZone`，数据库配置总数 34、启用 20。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 为 185 个，真实配置 API 为 32 个，enabled 为 20 个。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，41 个测试。
- 当前结论：
  - `inventory_adjustments_page` 有稳定 `id` 和可解析业务日期，适合复用现有普通分页入库链路。
  - 该接口当前总量 58239 条，约 583 页；本轮只验证 3 页窗口，继续保持 disabled。
  - 后续库存域仍有大体量接口，不能仅因探测成功就加入 daily enabled 批量。

## Stage 5R

- 阶段目标：完成本组三轮的第三个低风险接口接入，并在结束后复盘 5P-5R。
- 已完成：
  - 从未配置 `direct_read_candidate` 中选择 `transfer_page`，文档 id 为 `1020`，路径为 `POST /fulfillment/inventory/transfer/page`。
  - 选择依据：该接口是调拨单列表，普通分页、响应非敏感，当前总量明显小于多个库存大表；风险低于订单、财务、物流费用和疑似写操作候选。
  - 同轮探测确认 `purchase_plan_page` 当前无数据，`purchase_sale_storage_fba_page` 和 `purchase_sale_storage_self_page` 体量较大；`lot_no_page` 可后续考虑，但本轮优先接入能支撑调拨链路的 `transfer_page`。
  - 真实探测确认响应 `code=200`，`data` 为分页对象，包含 `total`、`pagesize`、`page`、`rows`；当前账号 `total=6755`，首批 `rows` 为 100 条。
  - 首条记录字段包含 `id`、`code`、`warehouseId`、`arrivalWarehouseId`、`createDate`、`auditTime`、`deliveryDate`、`updateTime`；本轮使用业务单号 `code` 作为主键，使用 `createDate` 作为 `data_date` 来源。
  - 已新增 `tests/test_transfer_page_config.py`，先失败后通过，约束 `transfer_page` 默认 disabled、分页字段、`max_pages=3`、主键 `code` 和日期字段 `createDate`。
  - 已新增 `transfer_page` YAML 配置，默认 `enabled=false`，`page.list_field=data.rows`、`page.total_field=data.total`、`page.max_pages=3`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，同步配置数为 35；其中 2 个是占位示例，真实接口为 33 个。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api transfer_page`，通过，批次 `sync_20260703_100202_100619`，`rows=300`，`requests=3`。
  - 数据库已确认该批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`。
  - 同批次 `sync_api_log` 为 `request_count=3`、`success_count=300`、`failed_count=0`、`error_message=NULL`。
  - 同批次 `raw_api_data` 写入 300 条，0 条缺少 `source_primary_key`，300 条都有 `data_hash`，300 条都有 `data_date`，日期范围为 `2022-09-20` 到 `2022-12-19`。
  - 同批次 raw 示例字段已确认 `source_primary_key`、`id`、`code`、`warehouseId`、`arrivalWarehouseId`、`createDate` 和 `data_date` 可从原始 JSON 提取。
  - `transfer_page` checkpoint 指向批次 `sync_20260703_100202_100619`，`checkpoint_value` 记录 `last_page=3`、`request_count=3`、`item_count=300`、`total_count=6755`。
  - `failed_request_log` 中该批次该接口为 0 条。
  - `.\\.venv\\Scripts\\python.exe -m app.main`，通过，dry-run 显示 20 个 enabled API。
  - 已查询 `api_config`，确认 `transfer_page.enabled=0`、`page.max_pages=3`、`page.page_size=100`、`primary_key.field=code`、`date_field=createDate`，数据库配置总数 35、启用 20。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 为 185 个，真实配置 API 为 33 个，enabled 为 20 个。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，42 个测试。
- 当前结论：
  - `transfer_page` 用业务单号 `code` 做幂等主键更贴近后续详情链路，比单纯使用数字 `id` 更容易排查。
  - 该接口当前总量 6755 条，约 68 页；比库存大表更可控，但本轮仍保持 disabled，避免扩大日常批量。
  - 已完成 5P-5R 三轮，需要在本轮记录复盘后再进入下一组。

## Review 5P-5R

- 已完成第十一组目标模式闭环：
  - 5P 新增 `fba_inventory_v2_page`，验证 FBA 库存 V2 分页接口。
  - 5Q 新增 `inventory_adjustments_page`，验证 FBA 盘库列表。
  - 5R 新增 `transfer_page`，验证调拨单列表。
- 当前覆盖状态：
  - 公开文档 API：185 个。
  - 已配置真实 API：33 个。
  - enabled API：20 个。
  - `product_detail`、`market_inventory_query`、`storage_inbound_detail`、`country_province_query`、`transfer_detail`、`lot_no_detail`、`delivery_fee_query`、`base_currency_query`、`amazon_msku_page`、`platform_msku_page`、`fba_inventory_v2_page`、`inventory_adjustments_page` 和 `transfer_page` 已验证但保持 disabled。
  - 本组三轮均未新增同步机制，只复用普通分页、主键幂等、`data_hash`、checkpoint、批次日志和失败日志链路。
- 本组三轮发现的问题：
  - 库存域可访问接口很多，但体量分化明显；`inventory_event_page`、`inventory_receipts_page` 等接口不适合贸然加入 enabled。
  - 可稳定使用业务主键时应优先使用真实业务字段，例如 `transfer_page.code`；没有明确主键时才回落到 `data_hash`。
  - `app.doc_catalog` 刷新公开文档详情耗时已接近 2-3 分钟，后续需要继续用较长超时运行，不应误判为代码失败。
- 下一组三轮建议：
  - 继续从未配置直读候选中选择一个接口一轮验证，优先考虑体量适中、字段清晰、可独立解释的列表或基础业务接口。
  - 对财务、订单、物流费用、批量详情和疑似确认入库接口继续保持谨慎，先做小窗口或只读探测。
  - 如果开始接入更高价值但更敏感的接口，应先明确风险边界和数据用途，再进入 enabled 评估。

## Stage 5S

- 阶段目标：进入新一组三轮，继续从体量适中、字段清晰的低风险候选中扩大覆盖。
- 已完成：
  - 从未配置 `direct_read_candidate` 中选择 `lot_no_page`，文档 id 为 `1025`，路径为 `POST /purchase/srm/lotno/page`。
  - 选择依据：该接口是交货单列表，普通分页、响应非敏感，当前总量适中；它能补齐交货单列表对象，并与已验证的 `lot_no_detail` 形成更清晰的列表/详情链路。
  - 真实探测确认响应 `code=200`，`data` 为分页对象，包含 `total`、`pagesize`、`page`、`rows`；当前账号 `total=8602`，首批 `rows` 为 100 条。
  - 首条记录字段包含 `id`、`code`、`deliveryCode`、`deliveryDate`、`createdAt`、`updateTime`、`warehouseType`、`supplierName`；本轮使用业务单号 `code` 作为主键，使用 `createdAt` 作为 `data_date` 来源。
  - 已新增 `tests/test_lot_no_page_config.py`，先失败后通过，约束 `lot_no_page` 默认 disabled、分页字段、`max_pages=3`、主键 `code` 和日期字段 `createdAt`。
  - 已新增 `lot_no_page` YAML 配置，默认 `enabled=false`，`page.list_field=data.rows`、`page.total_field=data.total`、`page.max_pages=3`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，同步配置数为 36；其中 2 个是占位示例，真实接口为 34 个。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api lot_no_page`，通过，批次 `sync_20260703_101146_180687`，`rows=300`，`requests=3`。
  - 数据库已确认该批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`。
  - 同批次 `sync_api_log` 为 `request_count=3`、`success_count=300`、`failed_count=0`、`error_message=NULL`。
  - 同批次 `raw_api_data` 写入 300 条，0 条缺少 `source_primary_key`，300 条都有 `data_hash`，300 条都有 `data_date`，日期范围为 `2022-09-20` 到 `2023-04-19`。
  - 同批次 raw 示例字段已确认 `source_primary_key`、`id`、`code`、`deliveryDate`、`createdAt` 和 `data_date` 可从原始 JSON 提取。
  - `lot_no_page` checkpoint 指向批次 `sync_20260703_101146_180687`，`checkpoint_value` 记录 `last_page=3`、`request_count=3`、`item_count=300`、`total_count=8602`。
  - `failed_request_log` 中该批次该接口为 0 条。
  - `.\\.venv\\Scripts\\python.exe -m app.main`，通过，dry-run 显示 20 个 enabled API。
  - 已查询 `api_config`，确认 `lot_no_page.enabled=0`、`page.max_pages=3`、`page.page_size=100`、`primary_key.field=code`、`date_field=createdAt`，数据库配置总数 36、启用 20。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 为 185 个，真实配置 API 为 34 个，enabled 为 20 个。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，43 个测试。
- 当前结论：
  - `lot_no_page` 用业务单号 `code` 做幂等主键，与既有 `lot_no_detail` 的 `code` 主键一致，便于后续链路排查。
  - 该接口当前总量 8602 条，约 87 页；比库存大表更可控，但本轮仍保持 disabled。
  - 当前已进入 5S-5U 新三轮，复盘应在 5U 完成后进行。

## Stage 5T

- 阶段目标：继续扩大低风险真实接口覆盖，并优先选择体量小、字段清晰、能独立解释的普通分页接口。
- 已完成：
  - 从未配置 `direct_read_candidate` 中选择 `storage_return_page`，文档 id 为 `152`，路径为 `POST /fulfillment/store/storageReturn/page`。
  - 选择依据：该接口是采购退货单列表V2，普通分页、当前账号仅 1 条数据，风险明显低于订单、财务、物流费用和大体量库存接口。
  - 同轮只读探测对比了 `purchase_sale_storage_fba_page`、`purchase_sale_storage_self_page` 和 `shipment_data_page`；这些接口当前体量分别约 58955、87284、380469 条，暂不适合直接纳入本轮小窗口。
  - 真实探测确认 `storage_return_page` 响应 `code=200`，`data` 包含 `total` 和 `rows`；当前账号 `total=1`。
  - 首条记录字段包含 `id`、`code`、`fcode`、`purchaseCode`、`supplierName`、`warehouseName`、`returnNum`、`createTime`、`status`、`refundStatus`、`items`；本轮使用业务单号 `code` 作为主键，使用 `createTime` 作为 `data_date` 来源。
  - 已新增 `tests/test_storage_return_page_config.py`，先失败后通过，约束该接口默认 disabled、分页字段、`max_pages=3`、主键 `code` 和日期字段 `createTime`。
  - 已新增 `storage_return_page` YAML 配置，默认 `enabled=false`，`page.list_field=data.rows`、`page.total_field=data.total`、`page.max_pages=3`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，同步配置数为 37；其中 2 个是占位示例，真实接口为 35 个。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api storage_return_page`，通过，批次 `sync_20260703_102300_276491`，`rows=1`，`requests=1`。
  - 数据库已确认该批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`。
  - 同批次 `sync_api_log` 为 `request_count=1`、`success_count=1`、`failed_count=0`、`error_message=NULL`。
  - 同批次 `raw_api_data` 写入 1 条，0 条缺少 `source_primary_key`，1 条有 `data_hash`，1 条有 `data_date`，日期为 `2026-05-13`。
  - 同批次 raw 示例确认 `source_primary_key=RG2605130085`、`id=85`、`code=RG2605130085`、`fcode=PO2603201215`、`createTime=2026-05-13 14:17:54`。
  - `storage_return_page` checkpoint 指向批次 `sync_20260703_102300_276491`，`checkpoint_value` 记录 `last_page=1`、`request_count=1`、`item_count=1`、`total_count=1`。
  - `failed_request_log` 中该批次该接口为 0 条。
  - `.\\.venv\\Scripts\\python.exe -m app.main`，通过，dry-run 显示 20 个 enabled API。
  - 已查询 `api_config`，确认 `storage_return_page.enabled=0`、`page.max_pages=3`、`page.page_size=100`、`primary_key.field=code`、`date_field=createTime`，数据库配置总数 37、启用 20。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 为 185 个，真实配置 API 为 35 个，enabled 为 20 个。
- 当前结论：
  - `storage_return_page` 当前数据量很小，主键和日期字段清晰，适合作为低风险补充覆盖接口。
  - 该接口默认保持 disabled，不改变日常 enabled 同步面。
  - 5S-5U 三轮复盘仍应放在 5U 完成后进行。

## Stage 5U

- 阶段目标：完成 5S-5U 三轮中的最后一轮扩容，优先选择体量小、字段清晰、风险低于订单/财务/物流费用的直读接口。
- 已完成：
  - 从未配置 `direct_read_candidate` 中选择 `strategy_template_page`，文档 id 为 `102`，路径为 `POST /operation/ads/strategyTemplate/page`。
  - 选择依据：该接口是广告分时策略模板列表，当前账号仅 19 条数据，响应字段清晰；风险低于订单、财务、物流费用和大体量库存接口。
  - 同轮只读对比了 `purchase_plan_page`、`strategy_template_page`、`inventory_receipts_page` 和 `customer_voice_page`；其中 `purchase_plan_page` 当前 `total=0`，`inventory_receipts_page.total=493411`，`customer_voice_page` 含订单编号、买家备注和评论文本，本轮不选。
  - 真实探测确认 `strategy_template_page` 响应 `code=200`，`data` 包含 `total` 和 `records`；当前账号 `total=19`，首批 `records` 为 19 条。
  - 首条记录字段包含 `id`、`templateName`、`strategyType`、`templateExpression`、`countryIds`、`countryNames`、`createTime`、`updateTime`、`status`、`useNum`；本轮使用 `id` 作为主键，使用 `updateTime` 作为 `data_date` 来源。
  - 已新增 `tests/test_strategy_template_page_config.py`，先失败后通过，约束该接口默认 disabled、分页字段、`list_field=data.records`、`max_pages=3`、主键 `id` 和日期字段 `updateTime`。
  - 已新增 `strategy_template_page` YAML 配置，默认 `enabled=false`，`page.list_field=data.records`、`page.total_field=data.total`、`page.max_pages=3`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，同步配置数为 38；其中 2 个是占位示例，真实接口为 36 个。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api strategy_template_page`，通过，批次 `sync_20260703_103557_599935`，`rows=19`，`requests=1`。
  - 数据库已确认该批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`。
  - 同批次 `sync_api_log` 为 `request_count=1`、`success_count=19`、`failed_count=0`、`error_message=NULL`。
  - 同批次 `raw_api_data` 写入 19 条，0 条缺少 `source_primary_key`，19 条都有 `data_hash`，19 条都有 `data_date`，日期范围为 `2022-12-06` 到 `2025-12-02`。
  - 同批次 raw 示例确认 `source_primary_key`、`id`、`templateName`、`strategyType`、`updateTime` 和 `data_date` 可从原始 JSON 提取。
  - `strategy_template_page` checkpoint 指向批次 `sync_20260703_103557_599935`，`checkpoint_value` 记录 `last_page=1`、`request_count=1`、`item_count=19`、`total_count=19`。
  - `failed_request_log` 中该批次该接口为 0 条。
  - `.\\.venv\\Scripts\\python.exe -m app.main`，通过，dry-run 显示 20 个 enabled API。
  - 已查询 `api_config`，确认 `strategy_template_page.enabled=0`、`page.max_pages=3`、`page.page_size=100`、`page.list_field=data.records`、`primary_key.field=id`、`date_field=updateTime`，数据库配置总数 38、启用 20。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 为 185 个，真实配置 API 为 36 个，enabled 为 20 个。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，45 个测试。
- 当前结论：
  - `strategy_template_page` 是低体量、字段清晰的配置类列表接口，适合作为 5U 补充覆盖。
  - 该接口默认保持 disabled，不改变日常 enabled 同步面。
  - 5S-5U 三轮已完成，需要进入下一组目标前先记录复盘。

## Review 5S-5U

- 已完成第十二组目标模式闭环：
  - 5S 新增 `lot_no_page`，验证交货单列表，批次 `sync_20260703_101146_180687`，写入 300 条。
  - 5T 新增 `storage_return_page`，验证采购退货单列表V2，批次 `sync_20260703_102300_276491`，写入 1 条。
  - 5U 新增 `strategy_template_page`，验证广告分时策略模板列表，批次 `sync_20260703_103557_599935`，写入 19 条。
- 当前覆盖状态：
  - 公开文档 API：185 个。
  - 已配置真实 API：36 个。
  - enabled API：20 个。
  - 本组三个新增接口均完成真实小样本同步、DB 配置同步、checkpoint 验证和覆盖矩阵刷新，但都保持 disabled。
- 本组三轮发现的问题：
  - 低风险直读候选继续减少，剩余候选更集中在订单、财务、物流费用、大体量库存报表、客服文本和销售售后对象。
  - 小体量接口也不能因为当前数据少就直接 enabled；日常批量应统一评估运行窗口、业务敏感度和全量覆盖策略。
  - `data.records` 形态已经用 `strategy_template_page` 验证，现有 `page.list_field` 点路径能力足够，不需要新增同步机制。
  - 当前已验证但 disabled 的接口越来越多，后续需要单独评估哪些能安全进入 enabled，不能只继续堆候选数量。
- 下一组三轮建议：
  - 5V 开始应继续扩大覆盖，但优先选择能证明业务价值且风险可控的接口；如果候选开始涉及订单、财务、客服文本或物流费用，先明确数据敏感边界。
  - 大体量接口仍使用 `max_pages=3` 小窗口接入，不直接加入 enabled。
  - 可以开始安排一个专门阶段评估 disabled 接口分组：低风险可启用、需窗口评估、需脱敏/敏感审查、依赖调度未完成。

## Stage 5V

- 阶段目标：进入新一组三轮，先评估已验证 disabled 接口的低风险启用条件，而不是继续只堆新增候选。
- 已完成：
  - 只读评估 `base_currency_query`、`storage_return_page` 和 `strategy_template_page`：三者最近单接口验证均成功，失败数为 0，主键不空，当前总请求量很小。
  - 选择依据：`base_currency_query` 是标量基础配置接口，当前 1 条；`storage_return_page` 是采购退货单列表V2，当前 1 条；`strategy_template_page` 是广告策略模板配置列表，当前 19 条。三者都不涉及订单、财务、客服文本、物流费用或依赖型批量调度。
  - 已新增 `tests/test_5v_low_risk_enabled_configs.py`，先失败于 enabled 数量仍为 20，再通过，约束这 3 个接口进入 daily enabled，同步后 enabled 数量为 23。
  - 已更新 `tests/test_base_currency_scalar_response.py`、`tests/test_storage_return_page_config.py`、`tests/test_strategy_template_page_config.py`，把旧的 disabled 断言改为 enabled，同时保留主键、分页、标量包装和日期字段约束。
  - 已将 `base_currency_query`、`storage_return_page` 和 `strategy_template_page` 的 YAML `enabled` 改为 `true`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，同步配置数为 38。
  - 数据库已确认 `api_config` 总数 38、启用 23；三个目标接口的 `enabled=1` 且 `config_json.enabled=true`。
  - `.\\.venv\\Scripts\\python.exe -m app.main`，通过，dry-run 显示 23 个 enabled API。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-enabled` 已完成，批次 `sync_20260703_104718_888820`，状态 `success`，`total_api_count=23`、`success_api_count=23`、`failed_api_count=0`。
  - 该批次运行时间为 5735 秒，`sync_api_log` 共 23 条，全部 success；总请求数 3053，总写入行数 306199，失败行数 0。
  - 同批次新增 enabled 接口验证：`base_currency_query` 请求 1 次、写入 1 条；`storage_return_page` 请求 1 次、写入 1 条；`strategy_template_page` 请求 1 次、写入 19 条；三者 `failed_count=0`、`error_message=NULL`。
  - 同批次 raw 验证：三者均无空主键，均有 `data_hash`；`storage_return_page` 和 `strategy_template_page` 的 `data_date` 正常，`base_currency_query` 为标量本位币，无日期字段是预期行为。
  - 三个目标接口 checkpoint 均已更新到批次 `sync_20260703_104718_888820`。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 为 185 个，真实配置 API 为 36 个，enabled 为 23 个。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，46 个测试。
- 当前结论：
  - 三个小体量、已验证、低敏感接口可以进入 enabled，推动项目从“验证候选”向“日常完整拉取”前进。
  - `--sync-enabled` 当前已经接近 96 分钟，长耗时根因是大批量接口在一个事务内执行，提交前外部看不到新 batch；后续需要单独评估批次事务边界或运行窗口，但本轮不改架构。
  - 下一阶段仍应谨慎处理大体量 disabled 接口，不能把 `transfer_page`、`lot_no_page`、库存盘点和库存报表直接加入 enabled。

## Stage 5W

- 阶段目标：先处理 5V 暴露出的 `--sync-enabled` 长事务可见性和故障恢复风险，再继续扩大 enabled 或新增接口。
- 已完成：
  - 已定位 5V 现象：23 个 enabled API 批次 `sync_20260703_104718_888820` 耗时 5735 秒，运行期间外部连接长时间看不到新 batch、API log 和 raw 写入，根因是整个 enabled 批量共用一个数据库事务。
  - 已新增 `tests/test_sync_enabled_transaction_scope.py`，先失败于实际只有 `tx-1` 一个事务，再通过，约束 enabled 批量必须拆成批次头事务、每个 API 独立事务、最终汇总事务。
  - 已调整 `SyncEngine.sync_enabled_apis()`：先提交 `sync_batch` 批次头；每个 enabled API 用独立事务执行 raw、log、checkpoint 写入；全部结束后再用独立事务更新批次最终状态。
  - 同步逻辑未改变分页、重试、raw 幂等、失败日志和 checkpoint 的业务行为。
  - 已运行聚焦测试 `.\\.venv\\Scripts\\python.exe -m unittest tests.test_sync_enabled_transaction_scope`，通过。
  - 已运行相关回归 `.\\.venv\\Scripts\\python.exe -m unittest tests.test_sync_engine_bulk_insert tests.test_base_currency_scalar_response tests.test_5v_low_risk_enabled_configs`，通过，5 个测试。
  - 已用 3 个低风险 enabled API 做真实轻量回归，批次 `sync_20260703_123218_791772`，结果 `api_count=3`、`item_count=21`、`request_count=3`、`failed_count=0`。
  - 数据库确认该批次 `sync_batch.status=success`，`total_api_count=3`、`success_api_count=3`、`failed_api_count=0`、耗时 14 秒。
  - 同批次 `sync_api_log` 确认 `base_currency_query`、`storage_return_page`、`strategy_template_page` 全部 success，分别写入 1、1、19 条，失败均为 0。
  - 同批次 `raw_api_data` 确认三者均无空主键，均有 `data_hash`；三个 checkpoint 均已更新到 `sync_20260703_123218_791772`。
  - `.\\.venv\\Scripts\\python.exe -m app.main`，通过，dry-run 显示 23 个 enabled API。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，47 个测试。
- 当前结论：
  - `--sync-enabled` 不再把整个长批量压在一个事务里，已完成 API 的 raw、log 和 checkpoint 可以随 API 完成后提交并对外可见。
  - 本轮没有重跑完整 23 API 批量，因为 5V 已证明完整批次耗时 5735 秒；5W 用测试约束和 3 API 真实子集验证事务边界即可。
  - 事务可见性风险已降低，但总请求量和总运行时长没有消失，后续启用大体量接口仍必须按长窗口评估。

## Stage 5X

- 阶段目标：继续扩大真实配置覆盖，在剩余候选风险整体升高的情况下，选择一个无业务必填入参、普通分页、默认 disabled 的低风险候选。
- 已完成：
  - 从未配置 `direct_read_candidate` 中选择 `purchase_plan_page`，文档 id 为 `87`，路径为 `POST /purchase/srm/plan/page`。
  - 选择依据：该接口是采购计划列表，只有 `page` 和 `pagesize` 为技术分页必填，无业务必填字段；普通分页、非写操作，风险低于订单、财务、物流费用、客服文本和大体量库存报表。
  - 公开文档确认响应为 `data.total` 和 `data.rows`；`rows` 字段包含 `id`、`code`、`arrivalWarehouseId`、`invoicesState`、`totalQuantity`、`createdAt`、`updateTime` 等。
  - 本轮使用业务单号 `code` 作为主键，使用 `createdAt` 作为 `data_date` 来源。
  - 已新增 `tests/test_purchase_plan_page_config.py`，先失败于 YAML 中缺少 `purchase_plan_page`，再通过，约束该接口默认 disabled、分页字段、`max_pages=3`、主键 `code` 和日期字段 `createdAt`。
  - 已新增 `purchase_plan_page` YAML 配置，默认 `enabled=false`，`page.list_field=data.rows`、`page.total_field=data.total`、`page.max_pages=3`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，同步配置数为 39；其中 2 个是占位示例，真实接口为 37 个。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api purchase_plan_page`，通过，批次 `sync_20260703_124115_334136`，`rows=0`，`requests=1`。
  - 数据库已确认该批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`、耗时 4 秒。
  - 同批次 `sync_api_log` 为 `request_count=1`、`success_count=0`、`failed_count=0`、`error_message=NULL`。
  - 同批次 `raw_api_data` 为 0 条，这是当前账号该接口 `total_count=0` 的预期结果。
  - `purchase_plan_page` checkpoint 指向批次 `sync_20260703_124115_334136`，`checkpoint_value` 记录 `last_page=1`、`request_count=1`、`item_count=0`、`total_count=0`。
  - 已查询 `api_config`，确认 `purchase_plan_page.enabled=0`、`page.max_pages=3`、`primary_key.field=code`、`date_field=createdAt`，数据库配置总数 39、启用 23。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 为 185 个，真实配置 API 为 37 个，enabled 为 23 个。
  - `.\\.venv\\Scripts\\python.exe -m app.main`，通过，dry-run 显示 23 个 enabled API。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，48 个测试。
- 当前结论：
  - `purchase_plan_page` 当前账号无数据，但接口形态、分页、日志和 checkpoint 已完成真实验证；未来出现采购计划数据时可复用该配置拉取。
  - 该接口默认保持 disabled，不增加 daily enabled 的长任务窗口。
  - 剩余未配置候选继续集中在订单、财务、物流、客服和库存报表，后续更需要逐个说明业务风险边界。

## Review 5V-5X

- 已完成第十三组目标模式闭环：
  - 5V 将 `base_currency_query`、`storage_return_page`、`strategy_template_page` 三个低体量已验证接口加入 enabled，完整 enabled 批次 `sync_20260703_104718_888820`，23 个 API 全部成功。
  - 5W 修复 `--sync-enabled` 长事务可见性问题，把批次头、每个 API 和最终汇总拆成独立事务，并用批次 `sync_20260703_123218_791772` 做 3 API 真实回归。
  - 5X 新增 `purchase_plan_page`，验证采购计划列表，批次 `sync_20260703_124115_334136`，当前账号 0 条数据但 checkpoint 正常。
- 当前覆盖状态：
  - 公开文档 API：185 个。
  - 已配置真实 API：37 个。
  - enabled API：23 个。
  - 本组三轮同时推进了 enabled 覆盖、运行可靠性和新增接口覆盖。
- 本组三轮发现的问题：
  - 当前 23 个 enabled API 完整同步已达到约 3053 次请求、5735 秒，后续启用大体量接口不能只看单接口成功。
  - 事务拆分解决的是可见性和恢复风险，不解决总请求量和总写入耗时。
  - 剩余候选的业务风险明显上升，新增接口很可能落在订单、财务、物流、客服文本、采购或库存报表，需要更严格的默认 disabled 和小窗口策略。
  - 0 数据接口也可以接入覆盖，但必须明确它只能证明接口可访问、分页和 checkpoint 正常，不能证明 raw 字段样本。
- 下一组三轮建议：
  - 5Y 开始继续扩大覆盖时，优先找无敏感字段、无业务必填参数、普通分页且体量可控的候选。
  - 如继续评估 enabled，只能选择已验证、小体量、非敏感、非依赖型接口；暂不要启用 `transfer_page`、`lot_no_page`、库存大表、订单、财务、客服文本和物流费用接口。
  - 如果候选只返回 0 条，也可以作为覆盖候选，但不要把它作为进入 enabled 的充分证据。

## Stage 5Y

- 阶段目标：进入新一组三轮，继续扩大真实配置覆盖，优先选择可复用普通分页且不涉及订单、财务、客服文本或物流费用的候选。
- 已完成：
  - 从未配置 `direct_read_candidate` 中选择 `fba_inventory_page`，文档 id 为 `172`，路径为 `POST /purchase/store/fbaInventory/page`。
  - 选择依据：该接口是旧版 FBA 库存列表，无业务必填字段，普通分页，非写操作；可与已配置的 `fba_inventory_v2_page` 形成新旧接口覆盖对照。
  - 公开文档确认响应为 `data.total` 和 `data.rows`；`rows` 字段包含 `id`、`sku`、`msku`、`warehouseId`、`asin`、`availableQuantity`、`updateTime` 等。
  - 本轮使用 `id` 作为主键，使用 `updateTime` 作为 `data_date` 来源。
  - 已新增 `tests/test_fba_inventory_page_config.py`，先失败于 YAML 中缺少 `fba_inventory_page`，再通过，约束该接口默认 disabled、分页字段、`max_pages=3`、主键 `id` 和日期字段 `updateTime`。
  - 已新增 `fba_inventory_page` YAML 配置，默认 `enabled=false`，`page.list_field=data.rows`、`page.total_field=data.total`、`page.max_pages=3`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，同步配置数为 40；其中 2 个是占位示例，真实接口为 38 个。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api fba_inventory_page`，通过，批次 `sync_20260703_125157_022009`，`rows=300`，`requests=3`。
  - 数据库已确认该批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`、耗时 13 秒。
  - 同批次 `sync_api_log` 为 `request_count=3`、`success_count=300`、`failed_count=0`、`error_message=NULL`。
  - 同批次 `raw_api_data` 写入 300 条，0 条缺少 `source_primary_key`，300 条都有 `data_hash`，300 条都有 `data_date`，日期范围为 `2026-07-03` 到 `2026-07-03`。
  - 同批次 raw 示例确认 `source_primary_key=131601`、`id=131601`、`sku=RG810 Black XL`、`msku=RG810-Test-Black XL`、`warehouseId=27`、`updateTime=2026-07-03 12:44:16`。
  - `fba_inventory_page` checkpoint 指向批次 `sync_20260703_125157_022009`，`checkpoint_value` 记录 `last_page=3`、`request_count=3`、`item_count=300`、`total_count=30759`。
  - 已查询 `api_config`，确认 `fba_inventory_page.enabled=0`、`page.max_pages=3`、`primary_key.field=id`、`date_field=updateTime`，数据库配置总数 40、启用 23。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 为 185 个，真实配置 API 为 38 个，enabled 为 23 个。
  - `.\\.venv\\Scripts\\python.exe -m app.main`，通过，dry-run 显示 23 个 enabled API。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，49 个测试。
- 当前结论：
  - `fba_inventory_page` 旧版接口已完成小窗口真实验证，可作为 FBA 库存旧版数据源候选保留。
  - 当前总量约 30759 条，约 308 页；本轮保持 disabled，不进入 daily enabled。
  - 后续如果要启用库存类大表，必须先统一评估运行窗口、重复数据价值和与 V2 接口的关系。

## Stage 5Z

- 阶段目标：继续扩大真实配置覆盖，选择字段清晰、可复用普通分页机制的库存报表候选，但保持 disabled 小窗口验证。
- 已完成：
  - 从未配置 `direct_read_candidate` 中选择 `inventory_event_page`，文档 id 为 `1036`，路径为 `POST /purchase/store/inventoryEvent/page`。
  - 选择依据：该接口是库存动作列表，无业务必填字段，普通分页，非写操作；字段包含动作类型、SKU、仓库和更新时间，可补充库存变动视角。
  - 同轮对比了 `inventory_event_page` 和 `inventory_age_page`；`inventory_event_page` 有明确 `id` 和 `updateTime`，配置风险更低。
  - 公开文档确认响应为 `data.total` 和 `data.rows`；`rows` 字段包含 `id`、`product`、`sku`、`warehouseId`、`transactionType`、`quantity`、`updateTime` 等。
  - 本轮使用 `id` 作为主键，使用 `updateTime` 作为 `data_date` 来源。
  - 已新增 `tests/test_inventory_event_page_config.py`，先失败于 YAML 中缺少 `inventory_event_page`，再通过，约束该接口默认 disabled、分页字段、`max_pages=3`、主键 `id` 和日期字段 `updateTime`。
  - 已新增 `inventory_event_page` YAML 配置，默认 `enabled=false`，`page.list_field=data.rows`、`page.total_field=data.total`、`page.max_pages=3`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，同步配置数为 41；其中 2 个是占位示例，真实接口为 39 个。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api inventory_event_page`，通过，批次 `sync_20260703_130058_411267`，`rows=300`，`requests=3`。
  - 数据库已确认该批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`、耗时 13 秒。
  - 同批次 `sync_api_log` 为 `request_count=3`、`success_count=300`、`failed_count=0`、`error_message=NULL`。
  - 同批次 `raw_api_data` 写入 300 条，0 条缺少 `source_primary_key`，300 条都有 `data_hash`，300 条都有 `data_date`，日期范围为 `2023-02-16` 到 `2023-02-16`。
  - 同批次 raw 示例确认 `source_primary_key=4987218`、`id=4987218`、`product=WP005-BA001 All Black 38`、`sku=WP005-BA001 All Black 38`、`warehouseId=35`、`transactionType=WhseTransfers`、`updateTime=2023-02-16T23:46:51`。
  - `inventory_event_page` checkpoint 指向批次 `sync_20260703_130058_411267`，`checkpoint_value` 记录 `last_page=3`、`request_count=3`、`item_count=300`、`total_count=2669068`。
  - 已查询 `api_config`，确认 `inventory_event_page.enabled=0`、`page.max_pages=3`、`primary_key.field=id`、`date_field=updateTime`，数据库配置总数 41、启用 23。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 为 185 个，真实配置 API 为 39 个，enabled 为 23 个。
  - `.\\.venv\\Scripts\\python.exe -m app.main`，通过，dry-run 显示 23 个 enabled API。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，50 个测试。
- 当前结论：
  - `inventory_event_page` 已完成小窗口真实验证，可作为库存动作历史数据源候选保留。
  - 该接口当前总量约 2669068 条，远大于现有 enabled 大表；本轮必须保持 disabled，不能进入 daily enabled。
  - 后续若要处理该类超大表，需要先设计增量窗口、时间过滤或分批调度策略，不能靠当前全量分页直接纳入日常同步。

## Stage 6A

- 阶段目标：完成 5Y-6A 三轮中的第三轮，继续扩大库存报表覆盖，但继续保持默认 disabled 和小窗口验证。
- 已完成：
  - 从未配置 `direct_read_candidate` 中选择 `inventory_age_page`，文档 id 为 `2542`，路径为 `POST /fulfillment/inventory/inventoryAge/page`。
  - 选择依据：该接口是 FBA 库龄列表，无业务必填字段，普通分页，非写操作；字段包含 SKU、FNSKU、ASIN、仓库、库龄数量和更新时间，可补充库存库龄视角。
  - 公开文档确认请求必填字段只有 `page`、`pagesize`，响应为 `data.total` 和 `data.rows`；`rows` 字段包含 `id`、`sku`、`fnsku`、`asin`、`warehouseId`、`warehouseName`、`snapshotDate`、`updateDate` 等。
  - 首次按 `pagesize=100` 运行 `.\\.venv\\Scripts\\python.exe -m app.main --sync-api inventory_age_page` 失败，批次 `sync_20260703_131143_529682`，原因是 `Read timed out. (read timeout=30)`，未写入 raw。
  - 只读探测确认 `pagesize=10` 第 1 页可返回，耗时约 50 秒，`total=6597161`，说明接口可访问但单页响应很慢。
  - 已新增 `tests/test_api_client_timeout.py`，先失败于客户端仍使用默认 30 秒，再通过；`JijiaApiClient.request()` 现在支持从单个 API 配置读取 `timeout_seconds`，未配置时仍使用默认超时。
  - 已新增 `tests/test_inventory_age_page_config.py`，先失败于 YAML 中缺少 `inventory_age_page`，再通过，约束该接口默认 disabled、`timeout_seconds=90`、`page_size=10`、`max_pages=3`、主键 `id` 和日期字段 `updateDate`。
  - 已新增 `inventory_age_page` YAML 配置，默认 `enabled=false`，`page.list_field=data.rows`、`page.total_field=data.total`、`page.page_size=10`、`page.max_pages=3`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，同步配置数为 42；其中 2 个是占位示例，真实接口为 40 个。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api inventory_age_page`，通过，批次 `sync_20260703_131645_314835`，`rows=30`，`requests=3`。
  - 数据库已确认该批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`、耗时 176 秒。
  - 同批次 `sync_api_log` 为 `request_count=3`、`success_count=30`、`failed_count=0`、`error_message=NULL`、耗时 171 秒。
  - 同批次 `raw_api_data` 写入 30 条，0 条缺少 `source_primary_key`，30 条都有 `data_hash`，30 条都有 `data_date`，日期范围为 `2026-07-03` 到 `2026-07-03`。
  - 同批次 raw 示例确认 `source_primary_key=39726369`、`id=39726369`、`sku=SK002-Stripe White 704 44-45`、`fnsku=X002CYHRB3`、`asin=B07ZQF975J`、`warehouseId=14`、`updateDate=2026-07-03 12:17:13`。
  - `inventory_age_page` checkpoint 指向批次 `sync_20260703_131645_314835`，`checkpoint_value` 记录 `last_page=3`、`request_count=3`、`item_count=30`、`total_count=6597161`。
  - 已查询 `api_config`，确认 `inventory_age_page.enabled=0`、`timeout_seconds=90`、`page.page_size=10`、`page.max_pages=3`、`primary_key.field=id`、`date_field=updateDate`，数据库配置总数 42、启用 23。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 为 185 个，真实配置 API 为 40 个，enabled 为 23 个。
  - `.\\.venv\\Scripts\\python.exe -m app.main`，通过，dry-run 显示 23 个 enabled API。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，52 个测试。
- 当前结论：
  - `inventory_age_page` 已完成小窗口真实验证，可作为 FBA 库龄历史数据源候选保留。
  - 该接口当前总量约 6597161 条，且 10 条单页响应约 50 秒；本轮必须保持 disabled，不能进入 daily enabled。
  - 后续若要处理该类超慢大表，必须先设计时间窗口、增量过滤或独立离线任务，不能靠当前全量分页直接纳入日常同步。

## Review 5Y-6A

- 已完成第十四组目标模式闭环：
  - 5Y 新增 `fba_inventory_page`，批次 `sync_20260703_125157_022009`，3 次请求写入 300 条，总量 `30759`。
  - 5Z 新增 `inventory_event_page`，批次 `sync_20260703_130058_411267`，3 次请求写入 300 条，总量 `2669068`。
  - 6A 新增 `inventory_age_page`，批次 `sync_20260703_131645_314835`，3 次请求写入 30 条，总量 `6597161`。
- 当前覆盖状态：
  - 公开文档 API：185 个。
  - 已配置真实 API：40 个。
  - enabled API：23 个。
  - 本组三轮继续扩大库存域覆盖，但新增接口全部保持 disabled。
- 本组三轮发现的问题：
  - 库存域普通分页接口虽然容易接入，但数据量已从 3 万级快速上升到 266 万和 659 万级。
  - `inventory_age_page` 证明“页数少”不等于“运行轻”，该接口单页响应很慢，需要 API 级超时配置才能完成小窗口验证。
  - 默认 disabled 小窗口策略有效，能验证访问权限、响应结构、主键、日期字段、raw 入库和 checkpoint，但不能代表可直接进入 daily enabled。
  - 后续要追求“完整拉取全部数据”，必须把超大表的时间窗口、增量过滤、独立调度和失败恢复作为单独目标，而不是继续简单扩大 `max_pages`。
- 下一组三轮建议：
  - 6B 起优先在剩余候选中寻找低风险、低体量或依赖样本明确的接口；订单、财务、客服文本、物流费用和销售售后仍需先说明风险边界。
  - 如果继续库存域，建议优先设计超大接口的运行窗口和增量策略，而不是继续新增全量大分页候选。
  - 启用任何新接口前，必须先证明真实体量、运行耗时和业务风险都适合 daily enabled。

## Stage 6B

- 阶段目标：不继续简单新增大分页候选，先补齐超大表按日期窗口拆分同步所需的最小参数模板能力。
- 已完成：
  - 只读校准后确认当前剩余 `direct_read_candidate` 已集中在多平台订单、客服文本、库存报表、物流、财务、采购和销售售后；直接新增候选会继续增加高风险 disabled 接口，但不能解决完整拉取超大表的问题。
  - 本轮决定优先处理 5Y-6A 复盘暴露的共性缺口：现有分页同步只能使用静态 `params`，不能把 daily 窗口参数按运行日期展开。
  - 已新增 `tests/test_sync_engine_param_templates.py`，先失败于 `SyncEngine` 缺少 `_resolve_param_templates()`，再通过。
  - `SyncEngine` 现在会在发起非分页、分页和依赖参数请求前解析 YAML `params` 中的日期模板。
  - 当前支持 `{{ today }}`、`{{ yesterday }}`、`{{ days_ago:N }}` 三类日期占位符，统一展开为 `YYYY-MM-DD`；未知占位符保持原样，避免影响历史占位示例和未来 checkpoint 模板设计。
  - 该能力是后续接入统计、广告、财务、库存分类账和超大库存接口时的基础能力，可把接口请求限制在小日期窗口内，而不是直接全量分页。
  - 本轮不新增 API，不改变 `api_config` 和覆盖矩阵数量；真实配置 API 仍为 40 个，enabled 仍为 23 个。
  - `.\\.venv\\Scripts\\python.exe -m app.main`，通过，dry-run 显示 23 个 enabled API。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，53 个测试。
- 当前结论：
  - 6B 是完整拉取能力的基础改造，不是接口数量扩容；它降低后续高体量 API 的接入风险。
  - 该能力还不是完整增量系统：当前只支持按运行日期展开静态窗口，尚未实现按 checkpoint 自动推进历史窗口。
  - 6C 可以选择一个需要日期窗口的低风险统计/报表接口做 disabled 小窗口验证，或继续实现 checkpoint 驱动的日期窗口推进。

## Stage 6C

- 阶段目标：继续补齐超大表完整拉取能力，让日期窗口可以基于 checkpoint 自动推进历史范围。
- 已完成：
  - 只读确认 6B 的 `{{ today }}`、`{{ yesterday }}`、`{{ days_ago:N }}` 只能表达滚动窗口，不能自动补齐历史日期范围。
  - 本轮继续选择基础能力建设，不新增真实 API，不改变 enabled 数量；原因是没有 checkpoint 推进时，接入日期接口仍只能同步固定窗口。
  - 已扩展 `tests/test_sync_engine_param_templates.py`，先失败于 `_request_params()` 不支持 `connection` 和 checkpoint，再通过。
  - 新增 `date_window` 配置语义：`enabled=true`、`start_field`、`end_field`、`default_start`、`days`。
  - 首次运行时，`date_window` 从 `default_start` 生成本次日期窗口；已有 checkpoint 时，从 `checkpoint_value.next_window_start` 继续生成下一窗口。
  - 同步成功后 checkpoint 会额外记录 `window_start`、`window_end`、`next_window_start` 和 `window_days`。
  - 该逻辑已接入普通分页、非分页和依赖参数请求路径；原有静态日期模板仍可继续使用。
  - 本轮不新增 API，不改变 `api_config` 和覆盖矩阵数量；真实配置 API 仍为 40 个，enabled 仍为 23 个。
  - `.\\.venv\\Scripts\\python.exe -m app.main`，通过，dry-run 显示 23 个 enabled API。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，55 个测试。
- 当前结论：
  - 6C 把日期窗口从“静态滚动日期”推进到“可按 checkpoint 补历史窗口”，更接近完整拉取超大表所需的运行模型。
  - 当前能力仍需要通过一个真实日期窗口接口验证请求字段、响应形态、checkpoint 推进和 raw 入库。
  - 6D 建议选择一个低风险、日期字段清晰、能用 `date_window` 控制体量的接口做 disabled 小窗口真实验证；6D 完成后需要做 6B-6D 三轮复盘。

## Stage 6D

- 阶段目标：用一个真实日期窗口接口验证 6C 的 `date_window` 能力，继续默认 disabled，不扩大 daily enabled 面。
- 已完成：
  - 从统计域选择 `traffic_analysis_page`，文档 id 为 `1018`，路径为 `POST /operation/sts/trafficAnalysis/page`，接口名称为“流量数据-ASIN”。
  - 选择依据：该接口是统计查询，必填参数为 `currency`、`beginDate`、`endDate`、`page`、`pagesize`，能直接验证 `date_window` 的请求字段和 checkpoint 推进；业务风险低于订单、财务明细、客服文本和物流费用。
  - 公开文档确认响应为 `data.total` 和 `data.rows`。
  - 真实探测使用 `currency=CNY`、`beginDate=2026-07-02`、`endDate=2026-07-02`、`page=1`、`pagesize=20`，成功返回 `total=528`、`rows=20`，样本包含 `marketId`、`marketName`、`asin`、`parentAsin`、`sku`、`recordDate` 等字段。
  - 真实样本中的 `id` 为 `None`，本轮不把 `id` 作为主键，配置 `primary_key.field=""`，使用 `data_hash` 做幂等。
  - 已新增 `tests/test_traffic_analysis_page_config.py`，先失败于 YAML 中缺少 `traffic_analysis_page`，再通过，约束默认 disabled、分页字段、`max_pages=1`、空主键、`date_field=recordDate` 和 `date_window` 参数。
  - 已新增 `traffic_analysis_page` YAML 配置，默认 `enabled=false`，`date_window.start_field=beginDate`、`date_window.end_field=endDate`、`date_window.default_start=2026-07-02`、`date_window.days=1`。
  - 首次按 `max_pages=3` 运行单接口同步时，批次 `sync_20260703_134216_245008` 在第 2 页触发 509，错误为“接口调用次数已超过限制次数”；第 1 页已返回 100 条。根因是该接口限流较严，不是 `date_window` 生成参数错误。
  - 已把 `traffic_analysis_page.page.max_pages` 调整为 `1`，用单页单日窗口完成验证，避免短时间连续请求触发限流。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，同步配置数为 43；其中 2 个是占位示例，真实接口为 41 个。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api traffic_analysis_page`，通过，批次 `sync_20260703_134351_398121`，`rows=100`，`requests=1`。
  - 数据库已确认该批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`、耗时 8 秒。
  - 同批次 `sync_api_log` 为 `request_count=1`、`success_count=100`、`failed_count=0`、`error_message=NULL`。
  - 同批次 `raw_api_data` 写入 100 条，100 条使用空业务主键并依赖 `data_hash`，100 条都有 `data_hash`，100 条都有 `data_date`，日期范围为 `2026-07-02` 到 `2026-07-02`。
  - 同批次 raw 示例确认 `marketId=4`、`asin=B07B9S4XWC`、`parentAsin=B07BFR4758`、`sku=CHG002-Red L`、`recordDate=2026-07-02`。
  - `traffic_analysis_page` checkpoint 指向批次 `sync_20260703_134351_398121`，`checkpoint_value` 记录 `last_page=1`、`request_count=1`、`item_count=100`、`total_count=528`、`window_start=2026-07-02`、`window_end=2026-07-02`、`next_window_start=2026-07-03`、`window_days=1`。
  - 已查询 `api_config`，确认 `traffic_analysis_page.enabled=0`、`page.max_pages=1`、`primary_key.field=""`、`date_field=recordDate`、`date_window.default_start=2026-07-02`、`date_window.days=1`，数据库配置总数 43、启用 23。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 为 185 个，真实配置 API 为 41 个，enabled 为 23 个。
  - `.\\.venv\\Scripts\\python.exe -m app.main`，通过，dry-run 显示 23 个 enabled API。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，56 个测试。
- 当前结论：
  - `date_window` 已完成真实接口端到端验证：请求参数生成、分页请求、raw 入库、API 日志和 checkpoint 推进都可追踪。
  - `traffic_analysis_page` 当前单日总量为 528 条，但接口限流严格，本轮保持 disabled 且 `max_pages=1`。
  - 文档中存在 `id` 字段不代表真实响应一定可用；真实样本为 `None` 时应回落到 `data_hash`，不要编造主键。

## Review 6B-6D

- 已完成第十五组目标模式闭环：
  - 6B 新增请求参数日期模板，支持 `{{ today }}`、`{{ yesterday }}`、`{{ days_ago:N }}`，不改变 API 数量。
  - 6C 新增 checkpoint 驱动 `date_window`，同步成功后记录窗口起止和下一窗口，不改变 API 数量。
  - 6D 新增 `traffic_analysis_page`，用真实单日单页同步验证 `date_window`，批次 `sync_20260703_134351_398121` 成功写入 100 条。
- 当前覆盖状态：
  - 公开文档 API：185 个。
  - 已配置真实 API：41 个。
  - enabled API：23 个。
  - 本组三轮重点不是扩大 enabled，而是补齐超大表按日期窗口推进的基础能力。
- 本组三轮发现的问题：
  - 日期窗口能力已可运行，但仍需要逐个接口确认真实请求字段、响应字段、限流和主键可靠性。
  - `traffic_analysis_page` 证明严格限流接口不能用连续多页小窗口验证，必要时要先降到单页单日。
  - 上游响应字段可能与文档存在可用性差异，主键必须以真实样本为准。
  - 当前 `date_window` 会推进历史窗口，但还没有“窗口已追到当前日期后自动跳过”的调度策略。
- 下一组三轮建议：
  - 6E 起进入新一组三轮，优先评估另一个日期窗口候选，或先补“追平当前日期后的跳过/停止策略”。
  - 继续避免直接进入订单、财务敏感明细、客服文本、物流费用和销售售后。
  - 对限流严格的接口，默认使用更小 `max_pages`、更长 `rate_limit.sleep_seconds` 或独立调度，不要直接加入 daily enabled。

## Stage 6E

- 阶段目标：进入新一组三轮，先补齐 `date_window` 追平当前日期后的跳过策略，避免严格限流接口在已追平时继续空请求。
- 已完成：
  - 只读确认 6B-6D 的缺口：`date_window` 已能从 checkpoint 推进历史窗口，但当 `next_window_start` 已晚于当天时，旧逻辑可能生成无效窗口或继续发起不必要请求。
  - 已扩展 `tests/test_sync_engine_param_templates.py`，先失败于 `_paged_payloads()` 仍会请求未来窗口，再通过。
  - 新增 `_date_window_caught_up()`，当启用 `date_window` 且下一窗口起点晚于当天时，判断该接口当前已追平。
  - `_paged_payloads()` 在追平时不再产出请求，避免进入真实 HTTP 调用。
  - `_sync_api_in_batch()` 和依赖参数同步路径在追平时写入成功日志和 checkpoint，`request_count=0`、`item_count=0`，并保留 `next_window_start`、`window_days` 和 `skipped_reason=date_window_caught_up`。
  - `_date_window_params()` 在窗口起点晚于当天时返回空窗口，避免生成 `beginDate > endDate` 这种无效参数。
  - 本轮不新增 API，不改变 YAML、数据库 `api_config` 或覆盖矩阵数量；真实配置 API 仍为 41 个，enabled 仍为 23 个。
  - `.\\.venv\\Scripts\\python.exe -m app.main`，通过，dry-run 显示 23 个 enabled API。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，57 个测试。
- 当前结论：
  - 日期窗口链路现在具备三段能力：日期模板、checkpoint 推进、追平后跳过。
  - 本轮是完整拉取的调度安全能力改造，不是 API 数量扩容。
  - 后续仍需要逐个真实日期窗口接口验证请求字段、限流和主键可靠性。

## Stage 6F

- 阶段目标：继续验证 `date_window` 在第二个真实接口上的效果，新增一个默认 disabled 的低风险日期窗口候选。
- 已完成：
  - 从未配置候选中选择 `shipment_data_page`，文档 id 为 `1034`，路径为 `POST /fulfillment/ship/shipmentData/page`，接口名称为“查询FBA货件看板”。
  - 选择依据：公开矩阵标记为普通分页直读候选，非费用明细、非写操作、非敏感响应；请求字段包含顶层 `receivingDateBegin` 和 `receivingDateEnd`，可直接复用现有 `date_window`。
  - 公开文档确认必填参数为 `page` 和 `pagesize`，可选日期参数为 `receivingDateBegin`、`receivingDateEnd`，响应为 `data.rows` 和 `data.total`。
  - 真实探测使用 `receivingDateBegin=2026-07-02`、`receivingDateEnd=2026-07-02`、`page=1`、`pagesize=20`，成功返回 `total=943`、`rows=20`；样本包含 `shipmentId`、`receivingAt`、`recordAt`、`updatedAt`、`product`、`sellerSku`、`warehouseId` 和 `status`。
  - 已新增 `tests/test_shipment_data_page_config.py`，先失败于 YAML 中缺少 `shipment_data_page`，再通过，约束默认 disabled、分页字段、`max_pages=1`、空主键、`date_field=receivingAt` 和 `date_window` 参数。
  - 首次配置时曾用 `shipmentId` 作为主键，真实批次 `sync_20260703_140406_982666` 暴露出 100 个 item 只落 6 条 raw；原因是同一货件下存在多个 SKU 行，`shipmentId` 不是行级主键。
  - 已按事实把 `primary_key.field` 改为空字符串，改用 `data_hash` 做幂等，避免丢失同一货件下的多 SKU 行。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，同步配置数为 44；其中 2 个是占位示例，真实接口为 42 个。
  - 修正后运行 `.\\.venv\\Scripts\\python.exe -m app.main --sync-api shipment_data_page`，通过，批次 `sync_20260703_140547_384755`，`rows=58`，`requests=1`。
  - 数据库已确认该批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`、耗时 7 秒。
  - 同批次 `sync_api_log` 为 `request_count=1`、`success_count=58`、`failed_count=0`、`error_message=NULL`。
  - 同批次 `raw_api_data` 写入 58 条，58 条使用空业务主键并依赖 `data_hash`，58 条都有 `data_hash`，58 条都有 `data_date`，日期范围为 `2026-07-03` 到 `2026-07-03`。
  - 同批次 raw 示例确认 `shipmentId=FBA15GCSS0C3`、`receivingAt=2026-07-03`、`recordAt=2026-07-02 11:14:40`、`updatedAt=2026-07-03 04:28:12`、`product=WP002-224 Rose 38`。
  - `shipment_data_page` checkpoint 指向批次 `sync_20260703_140547_384755`，`checkpoint_value` 记录 `last_page=1`、`request_count=1`、`item_count=58`、`total_count=58`、`window_start=2026-07-03`、`window_end=2026-07-03`、`next_window_start=2026-07-04`、`window_days=1`。
  - 已查询 `api_config`，确认 `shipment_data_page.enabled=0`、`page.max_pages=1`、`primary_key.field=""`、`date_field=receivingAt`、`date_window.default_start=2026-07-02`、`date_window.days=1`，数据库配置总数 44、启用 23。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 为 185 个，真实配置 API 为 42 个，enabled 为 23 个。
  - `.\\.venv\\Scripts\\python.exe -m app.main`，通过，dry-run 显示 23 个 enabled API。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，58 个测试。
- 当前结论：
  - `shipment_data_page` 已完成真实日期窗口同步验证，可作为 FBA 货件看板数据源候选保留。
  - 该接口在 `2026-07-02` 单日窗口总量为 943 条，在 `2026-07-03` 单日窗口总量为 58 条；本轮只做单页小窗口验证，保持 disabled。
  - 主键必须以行级唯一性为准；`shipmentId` 是货件级字段，不能用于该接口 raw 行幂等。

## Stage 6G

- 阶段目标：完成 6E-6G 三轮中的第三轮，补齐 `date_window` 对嵌套请求字段的支持，并用真实报表接口验证。
- 已完成：
  - 只读确认多个库存/报表接口的日期字段位于 `model` 对象内，旧版 `date_window` 只能写顶层字段，无法直接生成 `model.reportStartDate` 这类请求参数。
  - 已扩展 `tests/test_sync_engine_param_templates.py`，先失败于 `_request_params()` 不能把 `model.reportStartDate` 写入 `params.model`，再通过。
  - 新增 `_set_by_path()`，`date_window.start_field` 和 `end_field` 现在支持点路径，例如 `model.reportStartDate`、`model.reportEndDate`。
  - `_date_window_checkpoint_extra()` 改为按点路径读取窗口字段，保证嵌套 date_window 仍能写入 `window_start`、`window_end` 和 `next_window_start`。
  - 从未配置候选中选择 `storage_ledger_page`，文档 id 为 `1436`，路径为 `POST /fulfillment/inventory/storageLedger/page`，接口名称为“FBA库存分类账-一览视图-按日维度列表查询”。
  - 选择依据：该接口是 FBA 库存分类账日报一览，字段位于 `model.reportStartDate` 和 `model.reportEndDate`，能验证嵌套 date_window；业务风险低于订单、财务明细、客服文本和物流费用。
  - 公开文档确认必填参数为 `model`、`page` 和 `pagesize`，响应为 `data.rows` 和 `data.total`；响应行包含 `warehouseId`、`reportDate`、`sku`、`fnsku`、`msku`、`asin`、`disposition`、`createTime` 和 `updateTime`。
  - 真实探测使用 `model.reportStartDate=2026-07-02`、`model.reportEndDate=2026-07-02`、`page=1`、`pagesize=20`，成功返回 `total=710`、`rows=20`。
  - 已新增 `tests/test_storage_ledger_page_config.py`，先失败于 YAML 中缺少 `storage_ledger_page`，再通过，约束默认 disabled、分页字段、`max_pages=1`、空主键、`date_field=reportDate` 和嵌套 `date_window` 参数。
  - 已新增 `storage_ledger_page` YAML 配置，默认 `enabled=false`，使用 `model.reportStartDate` 和 `model.reportEndDate` 做日期窗口，`primary_key.field=""`，依赖 `data_hash` 幂等。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，同步配置数为 45；其中 2 个是占位示例，真实接口为 43 个。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api storage_ledger_page`，通过，批次 `sync_20260703_141606_982745`，`rows=100`，`requests=1`。
  - 数据库已确认该批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`、耗时 9 秒。
  - 同批次 `sync_api_log` 为 `request_count=1`、`success_count=100`、`failed_count=0`、`error_message=NULL`。
  - 同批次 `raw_api_data` 写入 100 条，100 条使用空业务主键并依赖 `data_hash`，100 条都有 `data_hash`，100 条都有 `data_date`，日期范围为 `2026-07-02` 到 `2026-07-02`。
  - 同批次 raw 示例确认 `warehouseId=18`、`reportDate=2026-07-02`、`sku=WP002-214 White 40`、`fnsku=X000ZJP4P7`、`msku=wp002-214 White 40`、`asin=B09NNQK5PM`、`disposition=SELLABLE`、`updateTime=2026-07-03 10:31:01`。
  - `storage_ledger_page` checkpoint 指向批次 `sync_20260703_141606_982745`，`checkpoint_value` 记录 `last_page=1`、`request_count=1`、`item_count=100`、`total_count=710`、`window_start=2026-07-02`、`window_end=2026-07-02`、`next_window_start=2026-07-03`、`window_days=1`。
  - 已查询 `api_config`，确认 `storage_ledger_page.enabled=0`、`page.max_pages=1`、`primary_key.field=""`、`date_field=reportDate`、`date_window.start_field=model.reportStartDate`、`date_window.end_field=model.reportEndDate`，数据库配置总数 45、启用 23。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 为 185 个，真实配置 API 为 43 个，enabled 为 23 个。
  - `.\\.venv\\Scripts\\python.exe -m app.main`，通过，dry-run 显示 23 个 enabled API。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，60 个测试。
- 当前结论：
  - `date_window` 已支持顶层字段和一层/多层嵌套字段，能覆盖更多报表类接口。
  - `storage_ledger_page` 已完成真实小窗口验证，可作为 FBA 库存分类账日报数据源候选保留。
  - 该接口 `2026-07-02` 单日总量为 710 条，本轮只验证单页 100 条，保持 disabled。

## Review 6E-6G

- 已完成第十六组目标模式闭环：
  - 6E 补齐 `date_window` 追平当前日期后的跳过策略，避免已追平接口继续空请求。
  - 6F 新增 `shipment_data_page`，批次 `sync_20260703_140547_384755`，1 次请求写入 58 条，验证顶层日期窗口和主键回退。
  - 6G 新增嵌套 date_window 能力和 `storage_ledger_page`，批次 `sync_20260703_141606_982745`，1 次请求写入 100 条。
- 当前覆盖状态：
  - 公开文档 API：185 个。
  - 已配置真实 API：43 个。
  - enabled API：23 个。
  - 本组三轮重点是让日期窗口能力覆盖更多报表形态，而不是扩大 daily enabled。
- 本组三轮发现的问题：
  - 严格限流或高体量接口必须先用单日单页验证，不能直接进入 daily enabled。
  - 主键必须按真实响应的行级唯一性判断；`shipmentId` 这类业务字段可能是父级对象标识，不能直接用于 raw 行幂等。
  - 很多报表接口把查询条件放在 `model` 内，完整拉取需要支持嵌套请求参数。
- 下一组三轮建议：
  - 6H 起可以继续接一个嵌套 `model` 日期窗口接口，或开始评估哪些已验证 disabled 接口具备进入 enabled 的条件。
  - 若评估 enabled，优先选择低体量、非敏感、非依赖型、非严格限流接口；暂不要把库存大表、日期窗口回填接口、订单、财务、客服文本或物流费用直接加入 enabled。
  - 对已接入的日期窗口接口，后续需要设计完整回填计划，而不是只靠 daily enabled 从当前日期往后跑。

## Stage 6H

- 阶段目标：进入新一组三轮，继续用默认 disabled 小窗口方式扩展可完整拉取的报表类 API 覆盖。
- 已完成：
  - 从未配置候选中选择 `inventory_receipts_page`，文档 id 为 `21`，路径为 `POST /purchase/store/inventoryReceipts/page`，接口名称为“查询已接收库存列表”。
  - 选择依据：该接口属于报表域，普通分页直读，非订单、财务敏感明细、客服文本或物流费用；请求字段包含 `marketDateBegin` 和 `marketDateEnd`，可复用现有 `date_window` 控制单日窗口。
  - 公开文档确认必填参数为 `page` 和 `pagesize`，可选日期参数为 `marketDateBegin`、`marketDateEnd`、`zeroZoneDateBegin`、`zeroZoneDateEnd`，响应为 `data.rows` 和 `data.total`。
  - 真实探测使用 `marketDateBegin=2026-07-02`、`marketDateEnd=2026-07-02`、`page=1`、`pagesize=20`，成功返回 `total=735`、`rows=20`；样本包含 `id`、`marketTimeZone`、`createDate`、`fbaShipmentId`、`product` 和 `warehouseName`。
  - 已新增 `tests/test_inventory_receipts_page_config.py`，先失败于 YAML 中缺少 `inventory_receipts_page`，再通过，约束默认 disabled、分页字段、`max_pages=1`、主键 `id`、`date_field=marketTimeZone` 和 `date_window` 参数。
  - 已新增 `inventory_receipts_page` YAML 配置，默认 `enabled=false`，使用 `marketDateBegin` 和 `marketDateEnd` 做日期窗口，`primary_key.field=id`，`date_field=marketTimeZone`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，同步配置数为 46；其中 2 个是占位示例，真实接口为 44 个。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api inventory_receipts_page`，通过，批次 `sync_20260703_143224_591261`，`rows=100`，`requests=1`。
  - 数据库已确认该批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`、耗时 14 秒。
  - 同批次 `sync_api_log` 为 `request_count=1`、`success_count=100`、`failed_count=0`、`error_message=NULL`。
  - 同批次 `raw_api_data` 写入 100 条，100 条都有不同 `source_primary_key`，100 条都有 `data_hash`，100 条都有 `data_date`，日期范围为 `2026-07-02` 到 `2026-07-02`。
  - 同批次 raw 示例确认 `source_primary_key=492465`、`marketTimeZone=2026-07-02 00:00`、`fbaShipmentId=FBA15GCS4WX9`、`product=SP001-408 Purple 38`、`warehouseName=SEEKWAY:JP_FBA`。
  - `inventory_receipts_page` checkpoint 指向批次 `sync_20260703_143224_591261`，`checkpoint_value` 记录 `last_page=1`、`request_count=1`、`item_count=100`、`total_count=735`、`window_start=2026-07-02`、`window_end=2026-07-02`、`next_window_start=2026-07-03`、`window_days=1`。
  - 已查询 `api_config`，确认 `inventory_receipts_page.enabled=0`、`page.max_pages=1`、`primary_key.field=id`、`date_field=marketTimeZone`、`date_window.start_field=marketDateBegin`、`date_window.end_field=marketDateEnd`，数据库配置总数 46、启用 23。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 为 185 个，真实配置 API 为 44 个，enabled 为 23 个。
  - `.\\.venv\\Scripts\\python.exe -m app.main`，通过，dry-run 显示 23 个 enabled API。
- 当前结论：
  - `inventory_receipts_page` 已完成真实日期窗口同步验证，可作为已接收库存报表数据源候选保留。
  - 该接口 `2026-07-02` 单日总量为 735 条，本轮只验证单页 100 条，保持 disabled。
  - 与 `shipment_data_page` 不同，该接口真实样本中 `id` 可作为行级主键，本轮不需要回退到空主键。

## Stage 6I

- 阶段目标：继续扩展报表/库存类 API 覆盖，接入一个真实可访问、可幂等入库的默认 disabled 候选。
- 已完成：
  - 只读评估多个候选并排除不适合本轮的接口：`purchaseSaleStorageSelf/page` 的 `dateType=DAY` 真实请求返回 400；`trafficSkuAnalysis/page` 触发 509；`multiTypeWarehouse/page` 响应包含联系人、电话、邮箱和地址；`quickInbound/query` 涉及数组入参且真实请求不稳定。
  - 从剩余候选中选择 `purchase_sale_storage_fba_page`，文档 id 为 `232`，路径为 `POST /purchase/inventory/purchaseSaleStorageFba/page`，接口名称为“查询FBA进销存列表”。
  - 选择依据：该接口是 FBA 进销存报表，普通分页直读，响应包含 `id`、`month`、`sku`、`msku`、`warehouseName` 和 `updateTime`，可用真实 `id` 做主键；业务风险低于订单、客服文本、物流费用和联系人地址类接口。
  - 真实探测确认 `type=MSKU`、`valueType=QUANTITY` 时返回 `total=58955`；样本包含 `id=71810`、`month=2023-03`、`sku=RBK037-Pink Pink Mirrored Lens`、`msku=RBK037-pink mirror lens`、`warehouseName=rivbos:JP_FBA`、`updateTime=2023-04-06 16:02:11`。
  - 已新增 `tests/test_purchase_sale_storage_fba_page_config.py`，先失败于 YAML 中缺少 `purchase_sale_storage_fba_page`，再通过，约束默认 disabled、分页字段、`max_pages=1`、主键 `id`、`date_field=updateTime` 和请求参数。
  - 已新增 `purchase_sale_storage_fba_page` YAML 配置，默认 `enabled=false`，使用 `type=MSKU` 和 `valueType=QUANTITY`，`primary_key.field=id`，`date_field=updateTime`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，同步配置数为 47；其中 2 个是占位示例，真实接口为 45 个。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api purchase_sale_storage_fba_page`，通过，批次 `sync_20260703_144417_365162`，`rows=100`，`requests=1`。
  - 数据库已确认该批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`、耗时 8 秒。
  - 同批次 `sync_api_log` 为 `request_count=1`、`success_count=100`、`failed_count=0`、`error_message=NULL`。
  - 同批次 `raw_api_data` 写入 100 条，100 条都有不同 `source_primary_key`，100 条都有 `data_hash`，100 条都有 `data_date`，日期范围为 `2023-04-06` 到 `2023-04-06`。
  - 同批次 raw 示例确认 `source_primary_key=71711`、`month=2023-03`、`dimension=JP`、`sku=CHG002-Black M`、`msku=CHG002-black-M`、`warehouseName=rivbos:JP_FBA`、`updateTime=2023-04-06 16:02:11`。
  - `purchase_sale_storage_fba_page` checkpoint 指向批次 `sync_20260703_144417_365162`，`checkpoint_value` 记录 `last_page=1`、`request_count=1`、`item_count=100`、`total_count=58955`。
  - 已查询 `api_config`，确认 `purchase_sale_storage_fba_page.enabled=0`、`page.max_pages=1`、`primary_key.field=id`、`date_field=updateTime`、`params.type=MSKU`、`params.valueType=QUANTITY`，数据库配置总数 47、启用 23。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 为 185 个，真实配置 API 为 45 个，enabled 为 23 个。
  - `.\\.venv\\Scripts\\python.exe -m app.main`，通过，dry-run 显示 23 个 enabled API。
- 当前结论：
  - `purchase_sale_storage_fba_page` 已完成真实单页同步验证，可作为 FBA 进销存月报数据源候选保留。
  - 该接口总量为 58955 条，本轮只验证单页 100 条，保持 disabled。
  - 该接口不是日窗口接口；后续若要完整回填，需要设计月度参数推进或独立批量计划，不能直接加入 daily enabled。

## Stage 6J

- 阶段目标：完成 6H-6J 三轮中的第三轮，评估一个低体量已验证接口进入 enabled，并完成三轮复盘。
- 已完成：
  - 只读筛选未配置 `direct_read_candidate` 后，确认剩余候选主要落在订单、财务、客服、物流费用、销售售后，或是 6I 已排除的不稳定接口；本轮不为了新增数量强行接入高风险接口。
  - 选择 `platform_msku_page` 作为启用候选；依据是它已在 5O 完成真实小窗口验证，属于多平台 SKU/MSKU 映射，非敏感、非依赖、非严格限流，当前总量约 1707 条，约 18 页。
  - 先修改 `tests/test_platform_msku_page_config.py` 和 `tests/test_5v_low_risk_enabled_configs.py`，验证它们先失败于 `platform_msku_page.enabled=false` 和 enabled 数量仍为 23。
  - 已将 `platform_msku_page.enabled` 改为 `true`，并把 `page.max_pages` 从 3 提升到 30；分页引擎会按 `total` 自动停止，30 页只是保护上限。
  - `.\\.venv\\Scripts\\python.exe -m unittest tests.test_platform_msku_page_config tests.test_5v_low_risk_enabled_configs`，通过，确认 TDD 红绿闭环。
  - `.\\.venv\\Scripts\\python.exe -m app.main`，通过，dry-run 显示 24 个 enabled API。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，同步配置数为 47；数据库确认 `platform_msku_page.enabled=1`、`config_json.enabled=true`、`page.max_pages=30`、`primary_key.field=""`、`date_field=recordDate`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api platform_msku_page`，通过，批次 `sync_20260703_145814_052711`，`rows=1707`，`requests=18`。
  - 数据库已确认该单接口批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`、耗时 20 秒。
  - 同批次 `sync_api_log` 为 `request_count=18`、`success_count=1707`、`failed_count=0`、`error_message=NULL`。
  - 同批次 `raw_api_data` 写入 1707 条，1707 条都有 `data_hash`，1707 条都有 `data_date`，日期范围为 `2024-09-07` 到 `2025-12-22`。
  - `platform_msku_page` checkpoint 指向批次 `sync_20260703_145814_052711`，`checkpoint_value` 记录 `last_page=18`、`request_count=18`、`item_count=1707`、`total_count=1707`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-enabled`，通过，完整批次 `sync_20260703_145933_782443`，24 个 API 全部成功，失败 0。
  - 数据库确认该完整批次 `total_api_count=24`、`success_api_count=24`、`failed_api_count=0`、`sync_api_log` 共 24 条且全部 success；总请求数 3072，总写入行数 307906，耗时 5655 秒。
  - 同完整批次中 `platform_msku_page` 为 `request_count=18`、`success_count=1707`、`failed_count=0`；checkpoint 已更新到 `sync_20260703_145933_782443`。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 为 185 个，真实配置 API 为 45 个，enabled 为 24 个。
- 当前结论：
  - `platform_msku_page` 已从 disabled 候选提升为 daily enabled，且完整 enabled 批次证明 24 个 API 同批次可成功。
  - 本轮没有新增真实 API，但把一个低体量映射接口从“已验证候选”推进到“日常同步范围”，更接近完整拉取当前账号可访问数据。
  - 24 个 enabled API 批量仍是长任务，最新实测耗时 5655 秒。

## Review 6H-6J

- 已完成第十七组目标模式闭环：
  - 6H 新增 `inventory_receipts_page`，验证已接收库存日期窗口接口，批次 `sync_20260703_143224_591261` 写入 100 条。
  - 6I 新增 `purchase_sale_storage_fba_page`，验证 FBA 进销存报表单页接口，批次 `sync_20260703_144417_365162` 写入 100 条。
  - 6J 将 `platform_msku_page` 提升到 enabled，单接口批次写入 1707 条，完整 enabled 批次 `sync_20260703_145933_782443` 验证 24 个 API 全部成功。
- 当前覆盖状态：
  - 公开文档 API：185 个。
  - 已配置真实 API：45 个。
  - enabled API：24 个。
  - 6H-6J 的重点是低风险覆盖和 enabled 推进并重，而不是盲目接入订单、财务、物流费用或销售售后接口。
- 本组三轮发现的问题：
  - 剩余未配置直读候选的风险明显升高，不能继续按早期“低风险直读优先”机械新增。
  - 已验证 disabled 接口进入 enabled 前，必须把接入窗口 `max_pages` 调整到能覆盖当前全量，否则只是把小窗口纳入 daily，并不等于完整拉取。
  - 完整 enabled 批次仍接近 1.5 小时，后续新增 enabled 必须继续评估 cron 窗口和数据库写入压力。
- 下一组三轮建议：
  - 6K 起优先做一次“剩余 API 分层执行计划”，把未配置 direct/read、requires_upstream_params、sensitive、write_or_mutation 分成可接入、需参数源、需脱敏审查、禁止或暂缓四类。
  - 可以继续评估小体量、非敏感、非依赖型 disabled 接口进入 enabled；暂不要把 `traffic_analysis_page`、大库存表、订单、财务、客服文本或物流费用直接加入 daily enabled。
  - 对日期窗口接口和月度报表接口，需要单独设计历史回填策略，避免只完成当天或单页样本。

## Stage 6K

- 阶段目标：进入新一组三轮，先把剩余 API 的下一步执行路径写入覆盖矩阵，避免继续靠人工在文档里筛选。
- 已完成：
  - 已为 `app.doc_catalog` 增加 `execution_plan_for_api()`，每个公开文档 API 都会生成 `execution_bucket`、`execution_stage` 和 `execution_reason`。
  - 执行分层规则：
    - 已配置接口分为 `configured_enabled` 和 `configured_disabled`。
    - 需要业务必填参数的接口进入 `needs_param_source`。
    - 含敏感字段或敏感域的接口进入 `needs_sensitive_review`。
    - 写入、创建、确认、更新、上传等接口进入 `defer_write_or_mutation`。
    - 订单、财务、客服、物流、销售等高风险直读接口进入 `risk_review_before_probe`。
    - 已有真实探测风险记录的接口进入 `known_risk_review`。
  - 已把 `confirm` 加入写操作识别，避免 `quickInbound/confirm/V2` 这类确认接口被误判为普通直读候选。
  - 已把 `/purchase/inventory/purchaseSaleStorageSelf/page`、`/purchase/srm/quickInbound/query` 等前序已知风险路径纳入 `known_risk_review`。
  - 已扩展 `tests/test_doc_catalog.py`，先失败于缺少 `execution_plan_for_api` 和已知风险路径误判，再通过。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 185 个，真实配置 API 45 个，enabled 24 个。
  - 新的执行分层摘要为：`configured=45`、`needs_upstream_params=68`、`needs_sensitive_review=22`、`defer_or_review=50`。
  - 新的执行阶段摘要为：`configured_enabled=24`、`configured_disabled=21`、`needs_param_source=68`、`needs_sensitive_review=22`、`risk_review_before_probe=20`、`known_risk_review=2`、`defer_write_or_mutation=28`。
  - 未配置且可直接普通探测的候选当前为 0 个；下一步不能继续沿用“未配置 direct_read_candidate 里随便挑一个”的早期策略。
- 当前结论：
  - 6K 没有新增或启用 API，但把剩余 140 个未配置公开接口的执行路径固化到覆盖矩阵，推进了“完整 API 覆盖清单”目标。
  - 后续真正能继续推进完整拉取的主路径，已经从“找低风险直读”转为“构建参数源、敏感审查和历史回填策略”。

## Stage 6L

- 阶段目标：从 `needs_param_source` 中选择一个能证明真实参数来源的接口，默认 disabled 接入并完成小样本真实同步。
- 已完成：
  - 只读筛选 68 个 `needs_param_source` 候选后，先排除 `attribute/detail` 和 `multiShopWarehouse/query`：`product_page` 中无可用 `attributeName`，`multi_shop_query` 中无 `platformCode`，不猜测字段。
  - 选择 `procure_detail`，文档 id 为 `1024`，路径为 `GET /purchase/srm/procure/detail`，必填参数为 `poCode`，响应为单对象 `data`。
  - 只读数据库确认 `lot_no_page` 有 300 条 raw，其中 300 条都有 `poCode`，去重后 168 个采购单号，可作为真实参数来源。
  - 已新增 `tests/test_procure_detail_param_source.py`，先失败于缺少 `procure_detail` 配置，再通过；本轮未修改同步引擎。
  - 已新增 `procure_detail` YAML 配置，默认 `enabled=false`，从 `lot_no_page.raw_json.poCode` 取 3 个参数，响应用 `response.item_field=data` 包装；公开文档未给出 `data.code` 或 `data.createdAt` 顶层稳定字段，因此不编造主键和日期字段，使用 `data_hash` 幂等。
  - `.\\.venv\\Scripts\\python.exe -m app.main`，通过，dry-run 仍显示 24 个 enabled API。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，同步配置数为 48，数据库配置总数 48、启用 24。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api procure_detail`，通过，批次 `sync_20260703_170038_518908`，`rows=3`，`requests=3`。
  - 数据库已确认该批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`、耗时 12 秒。
  - 同批次 `sync_api_log` 为 `request_count=3`、`success_count=3`、`failed_count=0`、`error_message=NULL`。
  - 同批次 `raw_api_data` 写入 3 条，3 条都有 `data_hash`，因没有稳定顶层主键，`source_primary_key` 为空是当前预期行为。
  - `procure_detail` checkpoint 指向批次 `sync_20260703_170038_518908`，记录 `param_offset=0`、`param_limit=3`、`next_param_offset=3`。
  - 已查询 `api_config`，确认 `procure_detail.enabled=0`、`param_source.source_api_code=lot_no_page`、`source_field=raw_json.poCode`、`target_field=poCode`。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 185 个，真实配置 API 46 个，enabled 24 个。
  - 新的执行分层摘要为：`configured=46`、`needs_upstream_params=67`、`needs_sensitive_review=22`、`defer_or_review=50`。
- 当前结论：
  - `procure_detail` 已完成参数源证明和真实小样本同步，可作为采购订单详情候选保留，但因响应含采购明细和金额信息，默认保持 disabled。
  - 本轮证明了 6K 后的 `needs_param_source` 路径能继续推进覆盖，但不能跳过字段来源证明；字段不存在时必须放弃候选，而不是猜测。

## Stage 6M

- 阶段目标：继续基于 6K 执行分层推进一个 `needs_param_source` 候选，优先复用现有 `date_window` 能力，避免新增复杂参数源。
- 已完成：
  - 选择 `storage_ledger_detail_page`，文档 id 为 `773`，路径为 `POST /purchase/inventory/storageLedgerDetail/page`，接口名称为“FBA库存分类账-详细视图列表查询”。
  - 选择依据：该接口与已验证的 `storage_ledger_page` 同属 FBA 库存分类账域，公开文档必填 `model` 查询对象，但内部日期字段 `model.beginReportDate`、`model.endReportDate` 可用现有嵌套 `date_window` 填充；风险低于订单、财务明细、客服文本和物流费用。
  - 公开文档确认响应列表字段为 `data.rows`，总数字段为 `data.total`；样本字段包括 `warehouseId`、`reportDate`、`sku`、`fnsku`、`msku`、`asin`、`eventType`、`quantity`、`referenceId` 和 `updateTime`。
  - 只读数据库确认 `storage_ledger_page` 已有 `2026-07-02` 单日窗口数据，可作为同域日期窗口存在性的证据。
  - 已新增 `tests/test_storage_ledger_detail_page_config.py`，先失败于 YAML 缺少 `storage_ledger_detail_page`，再通过。
  - 已新增 `storage_ledger_detail_page` YAML 配置，默认 `enabled=false`，`page.max_pages=1`，`page.page_size=100`，`date_window.start_field=model.beginReportDate`，`date_window.end_field=model.endReportDate`，`default_start=2026-07-02`。
  - 公开文档未给出稳定单字段主键，本轮配置空 `primary_key.field`，依赖 `data_hash` 幂等；`date_field` 使用 `reportDate`。
  - `.\\.venv\\Scripts\\python.exe -m app.main`，通过，dry-run 仍显示 24 个 enabled API。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，同步配置数为 49，数据库配置总数 49、启用 24。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api storage_ledger_detail_page`，通过，批次 `sync_20260703_171410_856072`，`rows=100`，`requests=1`。
  - 数据库已确认该批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`、耗时 7 秒。
  - 同批次 `sync_api_log` 为 `request_count=1`、`success_count=100`、`failed_count=0`、`error_message=NULL`。
  - 同批次 `raw_api_data` 写入 100 条，100 条都有不同 `data_hash`，100 条都有 `data_date=2026-07-02`。
  - 同批次 raw 示例确认字段包含 `reportDate=2026-07-02`、`eventType=Shipments/VendorReturns/Receipts`、`sku`、`warehouseId` 和 `referenceId`。
  - `storage_ledger_detail_page` checkpoint 指向批次 `sync_20260703_171410_856072`，记录 `last_page=1`、`request_count=1`、`item_count=100`、`total_count=27104`、`window_start=2026-07-02`、`window_end=2026-07-02`、`next_window_start=2026-07-03`、`window_days=1`。
  - 已查询 `api_config`，确认 `storage_ledger_detail_page.enabled=0`、`date_window.start_field=model.beginReportDate`、`date_window.end_field=model.endReportDate`、`page.max_pages=1`。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 185 个，真实配置 API 47 个，enabled 24 个。
  - 新的执行分层摘要为：`configured=47`、`needs_upstream_params=66`、`needs_sensitive_review=22`、`defer_or_review=50`。
- 当前结论：
  - `storage_ledger_detail_page` 已完成真实单日单页同步，可作为 FBA 库存分类账明细数据源候选保留。
  - 该接口 `2026-07-02` 单日总量为 27104 条，本轮只验证单页 100 条，保持 disabled；后续如要完整回填，应继续依赖日期窗口分批推进，不能直接加入 daily enabled。

## Review 6K-6M

- 覆盖推进结果：
  - 6K 把覆盖矩阵从单纯分类推进到可执行分层，后续选择接口不再依赖早期的 `direct_read_candidate` 口径。
  - 6L 证明了 `needs_param_source` 可以通过真实 raw 字段继续推进，新增 `procure_detail`，但严格保持小样本和 disabled。
  - 6M 证明了另一个 `needs_param_source` 可以通过已有嵌套 `date_window` 能力推进，新增 `storage_ledger_detail_page`，同样保持 disabled。
- 当前有效边界：
  - 已配置真实 API 从 45 个推进到 47 个，enabled 仍为 24 个，说明覆盖扩展没有扩大 daily 批量风险。
  - 新增的两个接口分别代表“参数源详情接口”和“日期窗口明细接口”，都能真实入库、写 log、写 checkpoint。
  - 剩余普通直读候选仍为 0 个，后续必须继续按参数来源、敏感字段、限流风险和写接口风险分层推进。
- 风险复盘：
  - 不能把小样本验证当作完整拉取；`storage_ledger_detail_page` 单日总量 27104 条，`procure_detail` 也可能随采购单范围扩大而快速增加请求量。
  - 参数来源必须继续由数据库只读查询证明，不能用字段名猜测；6L 已排除过无法证明来源的候选。
  - 严格限流接口仍要减少手工扫参，优先用小窗口、低页数和 checkpoint 推进。
- 下一步方向：
  - 6N 可继续找第三个参数源候选，也可以先为日期窗口类大表设计回填节奏。
  - 若要推动 disabled 接口进入 enabled，必须先把 `max_pages`、窗口、调度时长和限流风险讲清楚，再运行真实批量验证。

## Stage 6N

- 阶段目标：继续基于 6K 执行分层推进一个低风险 `needs_param_source` 候选，优先复用现有配置能力，不新增同步引擎复杂度。
- 已完成：
  - 先评估广告促销类 `marketId` 候选，但只读查询发现 `amazon_shop_page`、`multi_shop_query` 和 `platform_msku_page` 没有顶层 `marketId`；真实值涉及 `amazon_shop_page.marketListVos` 嵌套数组，当前不适合贸然扩展。
  - 选择 `storage_ledger_month_page`，文档 id 为 `2658`，路径为 `POST /fulfillment/inventory/storageLedgerMonth/page`，接口名称为“FBA库存分类账-一览视图-按月维度列表查询”。
  - 官方文档确认必填参数为 `monthList`、`page`、`pagesize`；响应列表字段为 `data.rows`，总数字段为 `data.total`，样本字段包括 `id`、`marketId`、`warehouseId`、`reportDate`、`sku`、`fnsku`、`msku`、`asin` 和 `updateTime`。
  - 先用 `2026-07` 验证时接口可访问但 `total_count=0`；随后用不落库直接请求确认 `2026-06` 返回 `total=6044`、第一页 100 条，样本有 `id`、`updateTime` 和 `reportDate=2026-06`。
  - 已新增 `tests/test_storage_ledger_month_page_config.py`，先失败于 YAML 缺少 `storage_ledger_month_page`，再通过。
  - 已新增 `storage_ledger_month_page` YAML 配置，默认 `enabled=false`，`page.max_pages=1`，`page.page_size=100`，`params.monthList=["2026-06"]`。
  - 公开文档和真实样本均支持行级 `id`，本轮配置 `primary_key.field=id`、`primary_key.required=true`；`date_field` 使用 `updateTime`。
  - `.\\.venv\\Scripts\\python.exe -m app.main`，通过，dry-run 仍显示 24 个 enabled API。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，同步配置数为 50，数据库配置总数 50、启用 24。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api storage_ledger_month_page`，通过，批次 `sync_20260703_173133_727406`，`rows=100`，`requests=1`。
  - 数据库已确认该批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`。
  - 同批次 `sync_api_log` 为 `request_count=1`、`success_count=100`、`failed_count=0`、`error_message=NULL`。
  - 同批次 `raw_api_data` 写入 100 条，100 个不同 `source_primary_key`，100 个不同 `data_hash`，100 条都有 `raw_json`；`reportDate` 均为 `2026-06`。
  - `storage_ledger_month_page` checkpoint 指向批次 `sync_20260703_173133_727406`，记录 `last_page=1`、`request_count=1`、`item_count=100`、`total_count=6044`。
  - 已查询 `api_config`，确认 `storage_ledger_month_page.enabled=0`、`params.monthList=["2026-06"]`、`primary_key.field=id`、`date_field=updateTime`、`page.max_pages=1`。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 185 个，真实配置 API 48 个，enabled 24 个。
  - 新的执行分层摘要为：`configured=48`、`needs_upstream_params=65`、`needs_sensitive_review=22`、`defer_or_review=50`。
- 当前结论：
  - `storage_ledger_month_page` 已完成真实非空月维度小窗口同步，可作为 FBA 库存分类账月维度数据源候选保留。
  - 该接口 `2026-06` 月总量为 6044 条，本轮只验证单页 100 条，保持 disabled；后续如要完整回填，需要设计按月推进和运行窗口，不能直接加入 daily enabled。

## Stage 6O

- 阶段目标：继续基于 6K 执行分层推进覆盖，同时补一个能帮助后续参数型接口的最小能力缺口。
- 已完成：
  - 只读筛选剩余 `needs_param_source` 后发现广告类接口大量依赖 `marketId`，而 `marketId` 存在于 `amazon_shop_page.raw_json.marketListVos` 嵌套数组中。
  - 新增 `tests/test_nested_array_param_source.py`，先失败于 `raw_json.marketListVos[].marketId` 被判非法，再实现最小数组展开能力并通过。
  - `param_source.fields` 现在支持单个 `raw_json.someArray[].field` 来源，按 Python 侧展开、去重、排序，再应用 `limit/offset`；暂不支持数组过滤、多字段同位绑定或复杂 join。
  - 已用真实 DB 只读确认 `amazon_shop_page.raw_json.marketListVos[].marketId` 可生成站点参数，例如 `marketId=1/10/11/12/13`。
  - 小范围探测 `openPrimeDiscount/query`、`openManagePromotion/query`、`coupon/query` 和 `deal/query` 时出现 400/509，因此本轮不新增这些广告促销接口。
  - 转向统计域，选择 `traffic_sku_page`，文档 id 为 `123`，路径为 `POST /operation/sts/trafficSku/page`，接口名称为“流量统计-msku”。
  - 官方文档确认必填参数为 `currency`、`beginDate`、`endDate`、`page`、`pagesize`、`viewType`；响应列表字段为 `data.rows`，总数字段为 `data.total`。
  - 不落库探测确认 `2026-07-02` 单日 `CNY/day` 返回 `total=170`，第一页 100 条。
  - 已新增 `tests/test_traffic_sku_page_config.py`，先失败于 YAML 缺少 `traffic_sku_page`，再通过。
  - 首次将 `primary_key.required=true` 作为配置验证时，同步批次 `sync_20260703_174353_519246` 请求成功但写入 0 条；系统化排查确认真实响应的 `id` 不适合作为必填主键，已改为空主键，依赖 `data_hash` 幂等。
  - 已新增 `traffic_sku_page` YAML 配置，默认 `enabled=false`，`page.max_pages=1`，`date_window.start_field=beginDate`，`date_window.end_field=endDate`，`default_start=2026-07-02`，`params.currency=CNY`，`params.viewType=day`。
  - `.\\.venv\\Scripts\\python.exe -m app.main`，通过，dry-run 仍显示 24 个 enabled API。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，同步配置数为 51，数据库配置总数 51、启用 24。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api traffic_sku_page`，通过，正式批次 `sync_20260703_174553_317496`，`rows=100`，`requests=1`。
  - 数据库已确认该批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`。
  - 同批次 `sync_api_log` 为 `request_count=1`、`success_count=100`、`failed_count=0`、`error_message=NULL`。
  - 同批次 `raw_api_data` 写入 100 条，100 个不同 `data_hash`，100 条都有 `raw_json` 和 `data_date=2026-07-02`。
  - `traffic_sku_page` checkpoint 指向批次 `sync_20260703_174553_317496`，记录 `last_page=1`、`request_count=1`、`item_count=100`、`total_count=170`、`window_start=2026-07-02`、`window_end=2026-07-02`、`next_window_start=2026-07-03`。
  - 已查询 `api_config`，确认 `traffic_sku_page.enabled=0`、`primary_key.field=""`、`date_field=recordDate`、`page.max_pages=1`。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 185 个，真实配置 API 49 个，enabled 24 个。
  - 新的执行分层摘要为：`configured=49`、`needs_upstream_params=64`、`needs_sensitive_review=22`、`defer_or_review=50`。
- 当前结论：
  - 单层 raw_json 数组参数源能力已经具备，可为后续 `marketId` 类接口做参数来源证明，但广告促销类接口当前调用不稳定，不能直接接入。
  - `traffic_sku_page` 已完成真实非空单日窗口同步，可作为流量统计 msku 数据源候选保留；该接口本轮只验证单页 100 条，保持 disabled。

## Stage 6P

- 阶段目标：继续基于 6K 执行分层推进覆盖，优先选择现有 `date_window` 能直接验证的低风险统计域接口。
- 已完成：
  - 只读筛选覆盖矩阵后，从统计域选择 `traffic_page`，文档 id 为 `122`，路径为 `POST /operation/sts/traffic/page`，接口名称为“流量统计-ASIN”。
  - 选择依据：该接口与 6O 的 `traffic_sku_page` 同属流量统计域，必填 `currency`、`beginDate`、`endDate`、`page`、`pagesize`、`viewType` 可复用现有 `date_window`，风险低于订单、财务明细、客服文本和物流费用。
  - 官方文档确认响应列表字段为 `data.rows`，总数字段为 `data.total`；样本字段包含 `recordDate`、`asin`、`parentAsin`、`sku`、`marketId` 等。
  - 已新增 `tests/test_traffic_page_config.py`，先失败于 YAML 缺少 `traffic_page`，再通过。
  - 已新增 `traffic_page` YAML 配置，默认 `enabled=false`，`page.max_pages=1`，`date_window.start_field=beginDate`，`date_window.end_field=endDate`，`default_start=2026-07-02`，`params.currency=CNY`，`params.viewType=day`。
  - 本轮不强行使用不可靠行级 `id`，配置 `primary_key.field=""`，依靠 `data_hash` 幂等；`date_field` 使用 `recordDate`。
  - `.\\.venv\\Scripts\\python.exe -m app.main`，通过，dry-run 仍显示 24 个 enabled API。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，同步配置数为 52，数据库配置总数 52、启用 24。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api traffic_page`，通过，正式批次 `sync_20260703_175618_116241`，`rows=100`，`requests=1`。
  - 数据库已确认该批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`。
  - 同批次 `sync_api_log` 为 `request_count=1`、`success_count=100`、`failed_count=0`、`error_message=NULL`。
  - 同批次 `raw_api_data` 写入 100 条，100 个不同 `data_hash`，100 条都有 `raw_json` 和 `data_date=2026-07-02`。
  - `traffic_page` checkpoint 指向批次 `sync_20260703_175618_116241`，记录 `last_page=1`、`request_count=1`、`item_count=100`、`total_count=583`、`window_start=2026-07-02`、`window_end=2026-07-02`、`next_window_start=2026-07-03`。
  - 已查询 `api_config`，确认 `traffic_page.enabled=0`、`primary_key.field=""`、`date_field=recordDate`、`page.max_pages=1`。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 185 个，真实配置 API 50 个，enabled 24 个。
  - 新的执行分层摘要为：`configured=50`、`needs_upstream_params=63`、`needs_sensitive_review=22`、`defer_or_review=50`。
- 当前结论：
  - `traffic_page` 已完成真实非空单日窗口同步，可作为流量统计 ASIN 数据源候选保留；该接口本轮只验证单页 100 条，保持 disabled。
  - 统计域当前已有 `traffic_analysis_page`、`traffic_page`、`traffic_sku_page` 三个单日窗口候选，后续重点应从“继续增加小窗口候选”转向“设计完整回填和调度窗口”。

## Review 6N-6P

- 覆盖推进结果：
  - 6N 新增 FBA 库存分类账月维度候选，证明静态月份数组参数可以完成非空小窗口验证。
  - 6O 增加单层 raw_json 数组参数源能力，并新增流量统计 MSKU 候选；同时证明广告促销类 `marketId` 接口当前不适合作为低风险新增对象。
  - 6P 新增流量统计 ASIN 候选，复用现有 `date_window`，没有扩大同步引擎复杂度。
- 当前有效边界：
  - 已配置真实 API 从 48 个推进到 50 个，enabled 仍为 24 个；覆盖增加没有扩大 daily 批量风险。
  - 新增接口都能写入 `sync_batch`、`sync_api_log`、`raw_api_data` 和 `sync_checkpoint`，证据来自真实请求和数据库查询。
  - `marketId` 单层数组来源已经可用，但广告促销、财务、订单、客服文本和物流费用仍不能跳过风险审查。
- 风险复盘：
  - 这三轮仍主要是小窗口接入，不等同于完整拉取；`storage_ledger_month_page` 月总量 6044，`traffic_page` 单日总量 583，`traffic_sku_page` 单日总量 170，后续都需要明确回填节奏。
  - 严格限流接口要继续使用单页、单日或更长 sleep 验证；不能用连续多页手工探测去冲限流。
  - 目前 daily enabled 批次已经约 1.5 小时，新增大表进入 enabled 前必须证明完整窗口和 cron 时长仍可接受。
- 下一步方向：
  - 6Q 优先不要再盲目新增统计小窗口；应在已验证 disabled 接口中选一类，制定“完整回填候选评估”或选择一个体量可控的 disabled 接口推进到完整单接口验证。
  - 如继续新增 API，仍按公开文档、真实参数来源、默认 disabled、小样本同步、DB 证据、覆盖矩阵刷新闭环推进。

## Stage 6Q

- 阶段目标：不新增 API，选择一个已验证 disabled 且体量可控的接口，从接入小窗口推进到完整单接口窗口验证。
- 已完成：
  - 选择 `traffic_sku_page`；原因是它在 6O 已完成非空验证，`2026-07-02` 单日总量为 170 条，低于 200，适合验证完整窗口策略。
  - 先用 TDD 将 `traffic_sku_page.page.max_pages` 从 1 调到 2，测试先失败于旧配置，再通过。
  - 同步 DB 配置后运行 `.\\.venv\\Scripts\\python.exe -m app.main --sync-api traffic_sku_page`，批次 `sync_20260703_180508_797691` 跑到 `2026-07-03` 窗口，`total_count=0`、写入 0 条；该结果证明 checkpoint 已推进，不是 7 月 2 日完整验证。
  - 为重新验证 7 月 2 日，已只删除 `sync_checkpoint` 中 `traffic_sku_page` 的 1 行 checkpoint，未删除 raw 数据。
  - 随后运行 2 页策略，批次 `sync_20260703_180601_694776` 在第 2 页触发 509 限流，失败日志显示请求参数为 `page=2`、`beginDate=2026-07-02`、`endDate=2026-07-02`，错误信息为“接口调用次数已超过限制次数”。
  - 系统化排查结论：该接口不适合用连续翻页完成完整窗口；应改为单请求覆盖窗口，减少触发 509 的机会。
  - 已将策略改为 `page.page_size=200`、`params.pagesize=200`、`page.max_pages=1`，并用测试约束该配置；`traffic_analysis_page` 和 `traffic_page` 仍保持 `max_pages=1`。
  - `.\\.venv\\Scripts\\python.exe -m app.main`，通过，dry-run 仍显示 24 个 enabled API。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，同步配置数为 52，数据库配置总数 52、启用 24。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api traffic_sku_page`，通过，正式完整窗口批次 `sync_20260703_180803_993141`，`rows=170`，`requests=1`。
  - 数据库已确认该批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`。
  - 同批次 `sync_api_log` 为 `request_count=1`、`success_count=170`、`failed_count=0`、`error_message=NULL`。
  - 同批次 `raw_api_data` 写入 170 条，170 个不同 `data_hash`，170 条都有 `raw_json` 和 `data_date=2026-07-02`。
  - `traffic_sku_page` checkpoint 指向批次 `sync_20260703_180803_993141`，记录 `last_page=1`、`request_count=1`、`item_count=170`、`total_count=170`、`window_start=2026-07-02`、`window_end=2026-07-02`、`next_window_start=2026-07-03`。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 185 个，真实配置 API 50 个，enabled 24 个。
  - 执行分层摘要不变：`configured=50`、`needs_upstream_params=63`、`needs_sensitive_review=22`、`defer_or_review=50`。
- 当前结论：
  - `traffic_sku_page` 已从单页小窗口推进为单日完整窗口验证；对总量低于页大小的严格限流接口，优先增大 `pagesize`，不要用连续翻页冲 509。
  - 该接口仍保持 disabled；是否进入 daily enabled 还需要评估每日窗口、限流稳定性和完整 enabled 批次耗时。

## Stage 6R

- 阶段目标：不新增 API，继续选择一个已验证 disabled 接口，从接入小窗口推进到完整单接口窗口验证。
- 已完成：
  - 选择 `traffic_page`；原因是它在 6P 已完成非空验证，`2026-07-02` 单日总量为 583 条，但当时只写入 100 条。
  - 先用 TDD 将 `traffic_page.page.page_size` 和 `params.pagesize` 调到 600，测试先失败于旧配置，再通过。
  - 同步 DB 配置后运行 `.\\.venv\\Scripts\\python.exe -m app.main --sync-api traffic_page`，批次 `sync_20260703_181754_561672` 触发 509，错误为“接口调用次数已超过限制次数”；随后将该接口验证配置改为 `retry.retries=1`，避免限流失败被同批次重复请求。
  - 第二次真实请求批次 `sync_20260703_182010_431018` 返回 40004，错误信息为“参数大小不合规：pagesize<=500”，确认 `traffic_page` 的页大小上限为 500。
  - 最终策略改为 `page.page_size=500`、`params.pagesize=500`、`page.max_pages=2`、`rate_limit.sleep_seconds=65`、`retry.retries=1`，并用测试约束该配置。
  - 为重新验证 7 月 2 日，已只删除 `sync_checkpoint` 中 `traffic_page` 的 1 行 checkpoint，未删除 raw 数据。
  - `.\\.venv\\Scripts\\python.exe -m app.main`，通过，dry-run 仍显示 24 个 enabled API。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，同步配置数为 52，数据库配置总数 52、启用 24。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api traffic_page`，通过，正式完整窗口批次 `sync_20260703_182130_693272`，`rows=583`，`requests=2`。
  - 数据库已确认该批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`。
  - 同批次 `sync_api_log` 为 `request_count=2`、`success_count=583`、`failed_count=0`、`error_message=NULL`。
  - 同批次 `raw_api_data` 写入 583 条，583 个不同 `data_hash`，583 条都有 `raw_json` 和 `data_date=2026-07-02`。
  - `traffic_page` checkpoint 指向批次 `sync_20260703_182130_693272`，记录 `last_page=2`、`request_count=2`、`item_count=583`、`total_count=583`、`window_start=2026-07-02`、`window_end=2026-07-02`、`next_window_start=2026-07-03`。
  - 已查询 `api_config`，确认 `traffic_page.enabled=0`、`page_size=500`、`params.pagesize=500`、`page.max_pages=2`、`rate_limit.sleep_seconds=65`、`retry.retries=1`。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 185 个，真实配置 API 50 个，enabled 24 个。
  - 执行分层摘要不变：`configured=50`、`needs_upstream_params=63`、`needs_sensitive_review=22`、`defer_or_review=50`。
- 当前结论：
  - `traffic_page` 已从单页小窗口推进为单日完整窗口验证；该接口页大小上限为 500，完整 583 条需要 2 页和较长页间等待。
  - 该接口仍保持 disabled；是否进入 daily enabled 还需要评估每日窗口、限流稳定性和完整 enabled 批次耗时。

## Stage 6S

- 阶段目标：不新增 API，继续选择一个已验证 disabled 接口，从接入小窗口推进到完整单接口窗口验证；本阶段完成后对 6Q-6S 做三轮复盘。
- 已完成：
  - 选择 `storage_ledger_page`；原因是它是 FBA 库存分类账日报一览，6G 已完成真实小窗口验证，业务风险低于订单、财务明细、客服文本和物流费用。
  - 只读 DB 起点显示旧 checkpoint 为 `item_count=100`、`total_count=710`、`window_start=2026-07-02`、`window_end=2026-07-02`。
  - 先用 TDD 将 `storage_ledger_page.page.page_size` 和 `params.pagesize` 调到 500、`page.max_pages` 调到 2、`rate_limit.sleep_seconds` 调到 65、`retry.retries` 调到 1，测试先失败于旧配置，再通过。
  - 同步 DB 配置后运行 `.\\.venv\\Scripts\\python.exe -m app.main --sync-api storage_ledger_page`，批次 `sync_20260703_183130_464206` 写入 1000 条、请求 2 次，但 checkpoint 显示 `total_count=1163`，因此 2 页未覆盖完整窗口。
  - 系统化排查结论：该接口当前账号的 `2026-07-02` 总量已从旧证据 710 变化为 1163；命令成功不等于完整窗口成功，必须继续以 checkpoint 的 `item_count == total_count` 为准。
  - 再用 TDD 将 `page.max_pages` 调到 3；曾误改到 `traffic_page.max_pages`，随后通过目标片段和 `traffic_page` 测试纠正，确认 6R 配置保持 `max_pages=2`。
  - 为重新验证 7 月 2 日，两次都只删除 `sync_checkpoint` 中 `storage_ledger_page` 的 1 行 checkpoint，未删除 raw 数据。
  - `.\\.venv\\Scripts\\python.exe -m app.main`，通过，dry-run 仍显示 24 个 enabled API。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，同步配置数为 52，数据库配置总数 52、启用 24。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api storage_ledger_page`，通过，正式完整窗口批次 `sync_20260703_183551_315212`，`rows=1163`，`requests=3`。
  - 数据库已确认该批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`。
  - 同批次 `sync_api_log` 为 `request_count=3`、`success_count=1163`、`failed_count=0`、`error_message=NULL`。
  - 同批次 `raw_api_data` 写入 1163 条，1163 个不同 `data_hash`，1163 条都有 `raw_json` 和 `data_date=2026-07-02`。
  - `storage_ledger_page` checkpoint 指向批次 `sync_20260703_183551_315212`，记录 `last_page=3`、`request_count=3`、`item_count=1163`、`total_count=1163`、`window_start=2026-07-02`、`window_end=2026-07-02`、`next_window_start=2026-07-03`。
  - 已查询 `api_config`，确认 `storage_ledger_page.enabled=0`、`page_size=500`、`params.pagesize=500`、`page.max_pages=3`、`rate_limit.sleep_seconds=65`、`retry.retries=1`。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 185 个，真实配置 API 50 个，enabled 24 个。
  - 执行分层摘要不变：`configured=50`、`needs_upstream_params=63`、`needs_sensitive_review=22`、`defer_or_review=50`。
- 当前结论：
  - `storage_ledger_page` 已从单页小窗口推进为单日完整窗口验证；当前完整窗口为 1163 条，需要 3 页。
  - 该接口仍保持 disabled；是否进入 daily enabled 还需要评估每日窗口、限流稳定性、历史回填节奏和完整 enabled 批次耗时。
- 6Q-6S 三轮复盘：
  - 6Q 完成 `traffic_sku_page` 完整窗口，`2026-07-02` 为 170 条，单请求覆盖。
  - 6R 完成 `traffic_page` 完整窗口，`2026-07-02` 为 583 条，页大小上限 500，需要 2 页和较长页间等待。
  - 6S 完成 `storage_ledger_page` 完整窗口，`2026-07-02` 当前为 1163 条，需要 3 页和较长页间等待。
  - 本组三轮证明：完整拉取不能只看单接口命令成功，必须用 `sync_checkpoint.item_count == total_count`、raw 行数、日期窗口和失败日志一起证明。
  - 下一组应继续从已验证 disabled 接口中选择体量可控者推进完整窗口，或开始评估已完成完整窗口的接口是否具备进入 daily enabled 的条件；进入 enabled 前必须测算 cron 窗口。

## Stage 6T

- 阶段目标：进入新一组三轮，评估一个已完成完整窗口的接口是否可以进入 daily enabled。
- 已完成：
  - 选择 `traffic_sku_page`；依据是该接口已完成 `2026-07-02` 单日完整窗口验证，完整窗口只需 1 次请求、170 条，增量请求量远低于 `traffic_page` 和 `storage_ledger_page`。
  - 只读 DB 起点显示 `traffic_sku_page.enabled=0`、`page_size=200`、`max_pages=1`，checkpoint 为 `item_count=170`、`total_count=170`、`next_window_start=2026-07-03`。
  - 24 个 enabled API 最近完整批次为 `sync_20260703_145933_782443`，状态成功，运行约 94 分钟；启用 `traffic_sku_page` 预计只新增 1 次请求。
  - 已用 TDD 将 `traffic_sku_page.enabled` 从 false 调为 true，并将 enabled 基线测试从 24 调整为 25；测试先失败于旧配置，再通过。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，同步配置数为 52。
  - `.\\.venv\\Scripts\\python.exe -m app.main`，通过，dry-run 显示 25 个 enabled API，并包含 `traffic_sku_page`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-enabled`，通过，批次 `sync_20260703_184641_020339`，25 个 API 全部成功，失败 0；总请求 3074 次，写入 307943 条，运行约 76 分钟。
  - 数据库已确认该批次 `sync_batch.status=success`、`total_api_count=25`、`success_api_count=25`、`failed_api_count=0`。
  - 同批次 `sync_api_log` 共 25 条，25 条成功、0 条失败，`request_count=3074`、`success_count=307943`、`failed_count=0`。
  - `traffic_sku_page` 在该批次内请求 1 次，`2026-07-03` 窗口返回 0 条，失败 0；checkpoint 记录 `item_count=0`、`total_count=0`、`window_start=2026-07-03`、`window_end=2026-07-03`、`next_window_start=2026-07-04`。
  - 已查询 `api_config`，确认数据库总配置 52 条、启用 25 条，`traffic_sku_page.enabled=1`。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 185 个，真实配置 API 50 个，enabled 25 个。
  - 执行分层摘要为：`configured=50`、`needs_upstream_params=63`、`needs_sensitive_review=22`、`defer_or_review=50`。
- 当前结论：
  - `traffic_sku_page` 已进入 daily enabled；即使当天窗口无数据，也能通过 enabled 批次写入成功日志并推进 checkpoint。
  - `traffic_page` 和 `storage_ledger_page` 虽已完成完整窗口，但需要多页和较长页间等待，暂不进入 daily enabled。

## Stage 6U

- 阶段目标：继续评估一个已完成完整窗口的接口是否可以进入 daily enabled。
- 已完成：
  - 选择 `traffic_page`；依据是该接口已完成 `2026-07-02` 单日完整窗口验证，完整窗口为 583 条、2 次请求，页大小上限已确认是 500。
  - 只读 DB 起点显示 `traffic_page.enabled=0`、`page_size=500`、`max_pages=2`、`sleep_seconds=65`、`retries=1`，checkpoint 为 `item_count=583`、`total_count=583`、`next_window_start=2026-07-03`。
  - 最近 25 个 enabled API 完整批次为 `sync_20260703_184641_020339`，状态成功，运行约 76 分钟；启用 `traffic_page` 预计最多新增 2 次请求和 1 次页间等待。
  - 已用 TDD 将 `traffic_page.enabled` 从 false 调为 true，并将 enabled 基线测试从 25 调整为 26；测试先失败于旧配置，再通过。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，同步配置数为 52。
  - `.\\.venv\\Scripts\\python.exe -m app.main`，通过，dry-run 显示 26 个 enabled API，并包含 `traffic_page`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-enabled`，通过，批次 `sync_20260703_201550_762153`，26 个 API 全部成功，失败 0；总请求 3075 次，写入 307943 条，运行约 81 分钟。
  - 数据库已确认该批次 `sync_batch.status=success`、`total_api_count=26`、`success_api_count=26`、`failed_api_count=0`。
  - 同批次 `sync_api_log` 共 26 条，26 条成功、0 条失败，`request_count=3075`、`success_count=307943`、`failed_count=0`。
  - `traffic_page` 在该批次内状态成功，请求 1 次，`2026-07-03` 窗口返回 `item_count=0`、`total_count=0`，checkpoint 推进到 `next_window_start=2026-07-04`。
  - `traffic_sku_page` 在该批次内已追平到 `2026-07-04`，因此按 `date_window` 跳过，未发起真实请求。
  - 已查询 `api_config`，确认数据库总配置 52 条、启用 26 条，`traffic_page.enabled=1`。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 185 个，真实配置 API 50 个，enabled 26 个。
  - 执行分层摘要为：`configured=50`、`needs_upstream_params=63`、`needs_sensitive_review=22`、`defer_or_review=50`。
- 当前结论：
  - `traffic_page` 已进入 daily enabled；即使当天窗口无数据，也能通过 enabled 批次写入成功日志并推进 checkpoint。
  - `storage_ledger_page` 虽已完成完整窗口，但需要 3 页和较长页间等待，暂不进入 daily enabled。

## Stage 6V

- 阶段目标：继续评估一个已完成完整窗口的接口是否可以进入 daily enabled。
- 已完成：
  - 选择 `storage_ledger_page`；依据是该接口已完成 `2026-07-02` 单日完整窗口验证，完整窗口为 1163 条、3 次请求，属于 FBA 库存分类账日报直读数据，风险低于订单、财务明细、客服文本和物流费用。
  - 只读 DB 起点显示 `storage_ledger_page.enabled=0`、`page_size=500`、`max_pages=3`、`sleep_seconds=65`、`retries=1`，checkpoint 为 `item_count=1163`、`total_count=1163`、`next_window_start=2026-07-03`。
  - 最近 26 个 enabled API 完整批次为 `sync_20260703_201550_762153`，状态成功，运行约 81 分钟；启用 `storage_ledger_page` 预计最多新增 3 次请求和 2 次页间等待。
  - 已用 TDD 将 `storage_ledger_page.enabled` 从 false 调为 true，并将 enabled 基线测试从 26 调整为 27；测试先失败于旧配置，再通过。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，同步配置数为 52。
  - `.\\.venv\\Scripts\\python.exe -m app.main`，通过，dry-run 显示 27 个 enabled API，并包含 `storage_ledger_page`。
  - 数据库已确认 `api_config` 总配置 52 条、启用 27 条，`storage_ledger_page.enabled=1`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-enabled`，通过，批次 `sync_20260703_214704_241675`，27 个 API 全部成功，失败 0；总请求 3075 次，写入 307943 条，运行约 77 分钟。
  - 数据库已确认该批次 `sync_batch.status=success`、`total_api_count=27`、`success_api_count=27`、`failed_api_count=0`。
  - 同批次 `sync_api_log` 共 27 条，27 条成功、0 条失败，`request_count=3075`、`success_count=307943`、`failed_count=0`。
  - `storage_ledger_page` 在该批次内状态成功，请求 1 次，`2026-07-03` 窗口返回 `item_count=0`、`total_count=0`，checkpoint 推进到 `next_window_start=2026-07-04`。
  - `traffic_page` 和 `traffic_sku_page` 在该批次内已追平到 `2026-07-04`，因此按 `date_window` 跳过，未发起真实请求。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 185 个，真实配置 API 50 个，enabled 27 个。
  - 执行分层摘要为：`configured=50`、`needs_upstream_params=63`、`needs_sensitive_review=22`、`defer_or_review=50`。
- 当前结论：
  - `storage_ledger_page` 已进入 daily enabled；即使当天窗口无数据，也能通过 enabled 批次写入成功日志并推进 checkpoint。
  - 6T-6V 已连续将 3 个完整窗口候选提升到 daily enabled，当前 27 enabled 的完整批次仍在约 77-81 分钟区间。
- 6T-6V 三轮复盘：
  - 6T 启用 `traffic_sku_page`，完整历史窗口 170 条、1 次请求；进入 enabled 后当天空窗口可追踪并推进 checkpoint。
  - 6U 启用 `traffic_page`，完整历史窗口 583 条、2 次请求；进入 enabled 后当天空窗口可追踪并推进 checkpoint。
  - 6V 启用 `storage_ledger_page`，完整历史窗口 1163 条、3 次请求；进入 enabled 后当天空窗口可追踪并推进 checkpoint。
  - 本组三轮证明：完成完整窗口验证的低风险日期窗口接口，可以按单个接口逐步进入 enabled；但 enabled 批次主体耗时仍由既有大分页接口和数据库写入决定，而不是这 3 个新日期窗口接口。
  - 后续不应无限制继续启用多页接口；每次启用前仍必须先看 `next_window_start`、真实完整窗口页数、页间等待、最近 enabled 批次耗时和 cron 窗口。

## Stage 6W

- 阶段目标：不新增 API，不扩大 enabled；从已验证 disabled 的日期窗口接口中选择一个低风险候选推进到完整单接口窗口。
- 已完成：
  - 选择 `inventory_receipts_page`；依据是该接口是已接收库存列表，已有真实行级主键 `id`，使用 `marketDateBegin` 和 `marketDateEnd` 做日期窗口，风险低于订单、财务敏感明细、客服文本、物流费用和库存分类账明细大表。
  - 只读 DB 起点显示 `inventory_receipts_page.enabled=0`、`page_size=100`、`max_pages=1`，checkpoint 为 `item_count=100`、`total_count=735`、`window_start=2026-07-02`、`next_window_start=2026-07-03`。
  - 候选对比后放弃本轮推进 `traffic_analysis_page`、`storage_ledger_detail_page`、`storage_ledger_month_page` 和 `purchase_sale_storage_fba_page`；原因分别是限流严格、单日总量 27104、月总量 6044、无日期窗口且总量 58955。
  - 已用 TDD 将 `inventory_receipts_page.page.max_pages` 从 1 调整到 10；测试先失败于旧配置，再通过。
  - 本轮不提高 `page_size`，避免在未确认页大小上限前触发参数错误；使用 `page_size=100`、`max_pages=10` 覆盖历史 735 条窗口。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，同步配置数为 52。
  - `.\\.venv\\Scripts\\python.exe -m app.main`，通过，dry-run 仍显示 27 个 enabled API，确认 `inventory_receipts_page` 没有误启用。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api inventory_receipts_page`，通过，批次 `sync_20260703_231344_896620`，`rows=157`，`requests=2`。
  - 数据库已确认该批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`。
  - 同批次 `sync_api_log` 为 `request_count=2`、`success_count=157`、`failed_count=0`、`error_message=NULL`。
  - 同批次 `raw_api_data` 写入 157 条，157 个不同 `source_primary_key`，无缺失主键，`data_date=2026-07-03`。
  - `inventory_receipts_page` checkpoint 指向批次 `sync_20260703_231344_896620`，记录 `last_page=2`、`request_count=2`、`item_count=157`、`total_count=157`、`window_start=2026-07-03`、`window_end=2026-07-03`、`next_window_start=2026-07-04`。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 185 个，真实配置 API 50 个，enabled 27 个。
  - 执行分层摘要仍为：`configured=50`、`needs_upstream_params=63`、`needs_sensitive_review=22`、`defer_or_review=50`。
- 当前结论：
  - `inventory_receipts_page` 已从单页小窗口推进为完整单日窗口；`2026-07-03` 窗口实际总量 157 条，2 页完整覆盖。
  - 该接口仍保持 disabled；是否进入 daily enabled 需要后续结合历史窗口波动、enabled 批次耗时和 cron 窗口评估。

## Stage 6X

- 阶段目标：评估 6W 已完成完整窗口的 `inventory_receipts_page` 是否可以进入 daily enabled。
- 已完成：
  - 选择 `inventory_receipts_page`；依据是它已完成 `2026-07-03` 单日完整窗口验证，完整窗口为 157 条、2 次请求，且响应行有稳定 `id` 主键。
  - 只读 DB 起点显示 `inventory_receipts_page.enabled=0`、`page_size=100`、`max_pages=10`，checkpoint 为 `item_count=157`、`total_count=157`、`next_window_start=2026-07-04`。
  - 最近 27 个 enabled API 完整批次为 `sync_20260703_214704_241675`，状态成功，运行约 77 分钟；启用 `inventory_receipts_page` 预计新增请求量可控。
  - 已用 TDD 将 `inventory_receipts_page.enabled` 从 false 调为 true，并将 enabled 基线测试从 27 调整为 28；测试先失败于旧配置，再通过。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，同步配置数为 52。
  - `.\\.venv\\Scripts\\python.exe -m app.main`，通过，dry-run 显示 28 个 enabled API，并包含 `inventory_receipts_page`。
  - 数据库已确认 `api_config` 总配置 52 条、启用 28 条，`inventory_receipts_page.enabled=1`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-enabled`，通过，批次 `sync_20260703_232214_043129`，28 个 API 全部成功，失败 0；总请求 3078 次，写入 307943 条，运行约 83 分钟。
  - 数据库已确认该批次 `sync_batch.status=success`、`total_api_count=28`、`success_api_count=28`、`failed_api_count=0`。
  - 同批次 `sync_api_log` 共 28 条，28 条成功、0 条失败，`request_count=3078`、`success_count=307943`、`failed_count=0`。
  - 本批次从 `2026-07-03 23:22:14` 运行到 `2026-07-04 00:45:01`，跨过自然日；`inventory_receipts_page` 在 `2026-07-04` 执行当天窗口，请求 1 次，返回 `item_count=0`、`total_count=0`，checkpoint 推进到 `next_window_start=2026-07-05`。
  - 同批次 `traffic_page`、`traffic_sku_page`、`storage_ledger_page` 也在 `2026-07-04` 窗口请求 1 次并返回 0 条，属于跨日后继续推进 date_window 的预期行为。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 185 个，真实配置 API 50 个，enabled 28 个。
  - 执行分层摘要为：`configured=50`、`needs_upstream_params=63`、`needs_sensitive_review=22`、`defer_or_review=50`。
- 当前结论：
  - `inventory_receipts_page` 已进入 daily enabled；跨日批次证明该接口能在日常批次中继续推进日期窗口。
  - 当前 28 enabled 批次运行约 83 分钟，仍必须按长耗时任务安排 cron 窗口。

## Stage 6Y

- 阶段目标：推进一个剩余 disabled 日期窗口接口到完整单日窗口，并对 6W-6Y 做三轮复盘。
- 已完成：
  - 选择 `shipment_data_page`；依据是它属于 FBA 货件看板普通分页直读接口，已有 `receivingDateBegin/receivingDateEnd` 日期窗口和空主键 `data_hash` 幂等策略，风险低于订单、财务敏感明细、客服文本和物流费用。
  - 只读 DB 起点显示 `shipment_data_page.enabled=0`、`page_size=100`、`max_pages=1`，checkpoint 已到 `next_window_start=2026-07-04`；历史 raw 中 `2026-07-02` 仅 6 条，原因是早期曾误用货件级 `shipmentId` 做行级主键。
  - 已用 TDD 将 `shipment_data_page.page.max_pages` 从 1 推进到完整窗口所需页数；首次按 10 页运行时发现接口当前 `total_count=1191`，不是历史记录中的 943，因此继续修正为 12 页。
  - 新增日期窗口分页截断保护：当本次实际请求后 `item_count < total_count` 时，该 API 记为 failed，不更新 checkpoint，避免 `page.max_pages` 太小导致未拉满当天数据却推进到下一天。
  - 截断保护测试先失败于旧逻辑 `failed_count=0`，再通过；相关测试为 `tests.test_sync_engine_param_templates`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，同步配置数为 52。
  - `.\\.venv\\Scripts\\python.exe -m app.main`，通过，dry-run 仍显示 28 个 enabled API，说明 `shipment_data_page` 没有误进入 daily enabled。
  - 已删除 `shipment_data_page` 单条 checkpoint，未删除 raw；目的是从 `date_window.default_start=2026-07-02` 重新补完整窗口。
  - 第一次 10 页验证批次 `sync_20260704_005610_532465` 状态成功但被判定为不完整：`request_count=10`、`item_count=1000`、`total_count=1191`。该结果用于发现并修复截断推进风险。
  - 修正为 12 页后运行 `.\\.venv\\Scripts\\python.exe -m app.main --sync-api shipment_data_page`，通过，批次 `sync_20260704_010012_591837`，请求 12 次，写入 1191 条，失败 0。
  - DB 核验显示该批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`。
  - 同批次 `sync_api_log` 显示 `status=success`、`request_count=12`、`success_count=1191`、`failed_count=0`、`error_message=NULL`。
  - 同批次 raw 显示 `data_date=2026-07-02`、`rows_count=1191`、`distinct_hashes=1191`、`distinct_source_pk=6`；保留空主键配置，用 `data_hash` 保证行级幂等。
  - checkpoint 指向批次 `sync_20260704_010012_591837`，记录 `last_page=12`、`request_count=12`、`item_count=1191`、`total_count=1191`、`window_start=2026-07-02`、`window_end=2026-07-02`、`next_window_start=2026-07-03`。
  - DB 配置仍为 52 条、启用 28 条；`shipment_data_page.enabled=0`、`page_size=100`、`page.max_pages=12`。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 185 个，真实配置 API 50 个，enabled 28 个；本次命令耗时超过 120 秒，后续应预留 300 秒。
- 6W-6Y 三轮复盘：
  - 6W 证明 `inventory_receipts_page` 可从单页小窗口升级为完整单日窗口；验收核心是 `item_count == total_count`，不是只看批次成功。
  - 6X 证明完整窗口接口进入 enabled 前必须跑完整 enabled 批次；28 个 enabled API 同批次成功，但耗时约 83 分钟，cron 窗口仍是硬约束。
  - 6Y 证明历史小窗口和旧 checkpoint 可能掩盖未拉满数据；日期窗口接口必须防止分页截断后推进 checkpoint。
- 当前结论：
  - `shipment_data_page` 已完成 `2026-07-02` 单日完整窗口验证，但仍保持 disabled。
  - 后续推进完整拉取时，必须把 `item_count < total_count` 视为同步失败，而不是成功小样本。

## Stage 6Z

- 阶段目标：评估 6Y 已完成完整窗口的 `shipment_data_page` 是否可以进入 daily enabled。
- 已完成：
  - 选择 `shipment_data_page`；依据是它已完成 `2026-07-02` 单日完整窗口验证，完整窗口为 1191 条、12 次请求，且属于 FBA 货件看板直读数据，风险低于订单、财务敏感明细、客服文本和物流费用。
  - 启用前 DB 起点显示 `shipment_data_page.enabled=0`、`page_size=100`、`page.max_pages=12`、checkpoint 为 `next_window_start=2026-07-03`；历史 `2026-07-03` 窗口预计较小。
  - 最近 28 个 enabled API 完整批次为 `sync_20260703_232214_043129`，状态成功，运行 4966 秒；启用 `shipment_data_page` 的新增请求量可控。
  - 已用 TDD 将 `shipment_data_page.enabled` 从 false 调为 true，并将 enabled 基线测试从 28 调整到 29；测试先失败于旧配置，再通过。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，同步配置数为 52。
  - `.\\.venv\\Scripts\\python.exe -m app.main`，通过，dry-run 显示 29 个 enabled API，并包含 `shipment_data_page`。
  - 数据库已确认 `api_config` 总配置 52 条、启用 29 条，`shipment_data_page.enabled=1`、`page_size=100`、`page.max_pages=12`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-enabled`，通过，批次 `sync_20260704_012039_532253`，29 个 API 全部成功，失败 0；总请求 3077 次，写入 308187 条，运行 4959 秒。
  - 数据库已确认该批次 `sync_batch.status=success`、`total_api_count=29`、`success_api_count=29`、`failed_api_count=0`。
  - 同批次 `sync_api_log` 共 29 条，29 条成功、0 条失败，`request_count=3077`、`success_count=308187`、`failed_count=0`。
  - `shipment_data_page` 在同批次内状态成功，请求 3 次，写入 241 条，失败 0；`raw_api_data` 显示 `data_date=2026-07-03`、`rows_count=241`、`distinct_hashes=241`。
  - `shipment_data_page` checkpoint 指向批次 `sync_20260704_012039_532253`，记录 `last_page=3`、`request_count=3`、`item_count=241`、`total_count=241`、`window_start=2026-07-03`、`window_end=2026-07-03`、`next_window_start=2026-07-04`。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 185 个，真实配置 API 50 个，enabled 29 个。
- 当前结论：
  - `shipment_data_page` 已进入 daily enabled；enabled 批次耗时仍约 83 分钟，新增该接口没有显著拉长总耗时。
  - 6Z 是新一组三轮的第 1 轮；下一次全面复盘应在 7B 完成后覆盖 6Z-7B。

## Stage 7A

- 阶段目标：从剩余 disabled 中选择一个低风险依赖参数接口推进到 daily enabled。
- 已完成：
  - 选择 `country_province_query`；依据是它属于基础数据接口，依赖 `fba_warehouse_page.raw_json.country`，已在 5F/5G 覆盖当前全部 6 个国家/区域码，风险低于订单、财务敏感明细、客服文本和物流费用。
  - 启用前 DB 起点显示上游 `fba_warehouse_page` 有 36 条带 `country` 的 raw，去重国家/区域码为 6 个：`CA`、`EU`、`JP`、`MX`、`UK`、`US`。
  - `country_province_query` checkpoint 已在 5G 推进到 `next_param_offset=6`，等于当前上游去重国家/区域码数量；历史两批验证共写入 150 条 raw，失败 0。
  - 已用 TDD 将 `country_province_query.enabled` 从 false 调为 true，并将 enabled 基线测试从 29 调整到 30；测试先失败于旧配置，再通过。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，同步配置数为 52。
  - `.\\.venv\\Scripts\\python.exe -m app.main`，通过，dry-run 显示 30 个 enabled API，并包含 `country_province_query`。
  - 数据库已确认 `api_config` 总配置 52 条、启用 30 条，`country_province_query.enabled=1`，`param_source.auto_advance=true`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-enabled`，通过，批次 `sync_20260704_025256_508240`，30 个 API 全部成功，失败 0；总请求 3074 次，写入 307946 条，运行 4825 秒。
  - 数据库已确认该批次 `sync_batch.status=success`、`total_api_count=30`、`success_api_count=30`、`failed_api_count=0`。
  - 同批次 `sync_api_log` 共 30 条，30 条成功、0 条失败，`request_count=3074`、`success_count=307946`、`failed_count=0`。
  - `country_province_query` 在同批次内状态成功，请求 0 次，写入 0 条，失败 0；这是因为当前参数窗口已追平，不是接口失败。
  - `country_province_query` checkpoint 指向批次 `sync_20260704_025256_508240`，记录 `param_offset=6`、`param_limit=3`、`next_param_offset=6`、`request_count=0`、`item_count=0`。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 185 个，真实配置 API 50 个，enabled 30 个。
- 当前结论：
  - `country_province_query` 已进入 daily enabled；追平状态下会写成功日志并保留 `next_param_offset=6`。
  - 7A 是 6Z-7B 三轮中的第 2 轮；下一轮 7B 完成后需要做三轮复盘。

## Stage 7B

- 阶段目标：继续推进完整拉取；从剩余 disabled 中选择一个低风险依赖参数接口扩大参数窗口。
- 已完成：
  - 选择 `product_detail`；依据是它属于产品主数据详情，依赖已同步的 `product_page.source_primary_key`，风险低于订单、财务敏感明细、客服文本、物流费用和库存超大表。
  - 只读 DB 起点显示 `product_page` 已有 8258 条 raw，8258 个不同 `source_primary_key`，`product_detail` 当前 checkpoint 为 `param_offset=6`、`param_limit=3`、`next_param_offset=9`。
  - 只读候选对比显示 `traffic_analysis_page` 限流严格、`storage_ledger_detail_page` 单日 27104 条、`purchase_sale_storage_fba_page` 当前 58955 条；本轮不推进这些高成本或高风险候选。
  - 已用 TDD 将 `product_detail.param_source.limit` 从 3 调整为 10；测试先失败于旧配置，再通过。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，同步配置数为 52。
  - `.\\.venv\\Scripts\\python.exe -m app.main`，通过，dry-run 仍显示 30 个 enabled API，确认 `product_detail` 没有误进入 daily enabled。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api product_detail`，通过，批次 `sync_20260704_042403_551628`，请求 10 次，写入 10 条。
  - DB 核验显示该批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`。
  - 同批次 `sync_api_log` 为 `status=success`、`request_count=10`、`success_count=10`、`failed_count=0`、`error_message=NULL`。
  - 同批次 `raw_api_data` 写入 10 条 `product_detail`，10 个不同 `source_primary_key`，无缺失主键。
  - `product_detail` checkpoint 指向批次 `sync_20260704_042403_551628`，记录 `param_offset=9`、`param_limit=10`、`next_param_offset=19`、`item_count=10`、`total_count=10`。
  - 数据库 `api_config` 已确认 `product_detail.enabled=0`、`param_source.limit=10`、`param_source.auto_advance=true`。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 185 个，真实配置 API 50 个，enabled 30 个。
- 6Z-7B 三轮复盘：
  - 6Z 将 `shipment_data_page` 加入 daily enabled，证明完成完整窗口后再启用能保持 29 个 API 同批次成功。
  - 7A 将已追平参数窗口的 `country_province_query` 加入 daily enabled，证明参数型基础数据接口在追平状态下可以写成功日志但请求数为 0。
  - 7B 没有继续扩大 enabled，而是回到 `product_detail` 这类大参数源详情接口，先把窗口从 3 扩到 10；完整拉取不能只靠启用低成本接口，还要持续推进剩余详情参数空间。
  - 本组三轮结论：daily enabled 的稳定性和剩余 disabled 的覆盖推进要分开验收；enabled 批次证明日常任务稳定，单接口参数窗口证明真实覆盖面在扩大。
- 当前结论：
  - `product_detail` 仍保持 disabled，但已从 9 个产品详情推进到 19 个产品详情。
  - 下一轮可以继续推进低风险参数型详情接口，或评估 `purchase_plan_page` 这类低成本空结果接口是否适合进入 enabled；不要直接冲击超大分页、费用或严格限流接口。

## Stage 7C

- 阶段目标：继续推进完整拉取；优先扩大 `product_detail` 的参数窗口，提升产品主数据详情覆盖面。
- 已完成：
  - 选择继续推进 `product_detail`；依据是 `product_page` 上游已有 8258 个稳定产品主键，`product_detail` 当前只覆盖 19 个，继续扩大该接口比切换到另一个 3 条小样本更接近完整拉取目标。
  - 只读 DB 起点显示 `product_detail.enabled=0`、`param_source.limit=10`，checkpoint 为 `param_offset=9`、`param_limit=10`、`next_param_offset=19`。
  - 最近一次 `product_detail` 10 请求批次耗时约 9 秒，失败 0；本轮选择把窗口提升到 100，仍保持单接口 disabled 路径。
  - 已用 TDD 将 `product_detail.param_source.limit` 从 10 调整为 100；测试先失败于旧配置，再通过。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，同步配置数为 52。
  - `.\\.venv\\Scripts\\python.exe -m app.main`，通过，dry-run 仍显示 30 个 enabled API，确认 `product_detail` 没有误进入 daily enabled。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api product_detail`，通过，批次 `sync_20260704_043249_880338`，请求 100 次，写入 100 条。
  - DB 核验显示该批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`。
  - 同批次 `sync_api_log` 为 `status=success`、`request_count=100`、`success_count=100`、`failed_count=0`、`error_message=NULL`。
  - 同批次 `raw_api_data` 写入 100 条 `product_detail`，100 个不同 `source_primary_key`，100 个不同 `data_hash`，无缺失主键。
  - `product_detail` checkpoint 指向批次 `sync_20260704_043249_880338`，记录 `param_offset=19`、`param_limit=100`、`next_param_offset=119`、`item_count=100`、`total_count=100`。
  - 数据库 `api_config` 已确认 `product_detail.enabled=0`、`param_source.limit=100`、`param_source.auto_advance=true`。
  - `product_detail` 当前累计 raw 覆盖 119 条，119 个不同产品主键。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 185 个，真实配置 API 50 个，enabled 30 个。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，76 个测试全部通过。
  - README 已同步当前 30 个 enabled API 清单和最近 30 接口 enabled 批次约 4825 秒的运行事实。
- 当前结论：
  - `product_detail` 仍保持 disabled，但已从 19 个产品详情推进到 119 个产品详情。
  - 100 请求窗口真实耗时约 110 秒，下一轮可以继续评估是否维持 100 作为稳定批量窗口，或在确认无 429/509 后再谨慎上调。

## Stage 7D

- 阶段目标：继续推进完整拉取；在 7C 证明 100 请求窗口稳定后，将 `product_detail` 参数窗口提升到更接近生产回填节奏的 500。
- 已完成：
  - 选择继续推进 `product_detail`；依据是 7C 后该接口仍只覆盖 119/8258 个产品详情，且 100 请求窗口无 429/509、无 DB 写入异常。
  - 只读 DB 起点显示 `product_detail.enabled=0`、`param_source.limit=100`，checkpoint 为 `param_offset=19`、`param_limit=100`、`next_param_offset=119`。
  - 已用 TDD 将 `product_detail.param_source.limit` 从 100 调整为 500；测试先失败于旧配置，再通过。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，同步配置数为 52。
  - `.\\.venv\\Scripts\\python.exe -m app.main`，通过，dry-run 仍显示 30 个 enabled API，确认 `product_detail` 没有误进入 daily enabled。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api product_detail`，通过，批次 `sync_20260704_044315_780073`，请求 500 次，写入 500 条。
  - DB 核验显示该批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`。
  - 同批次 `sync_api_log` 为 `status=success`、`request_count=500`、`success_count=500`、`failed_count=0`、`error_message=NULL`。
  - 同批次 `raw_api_data` 写入 500 条 `product_detail`，500 个不同 `source_primary_key`，500 个不同 `data_hash`，无缺失主键。
  - `product_detail` checkpoint 指向批次 `sync_20260704_044315_780073`，记录 `param_offset=119`、`param_limit=500`、`next_param_offset=619`、`item_count=500`、`total_count=500`。
  - 数据库 `api_config` 已确认 `product_detail.enabled=0`、`param_source.limit=500`、`param_source.auto_advance=true`。
  - `product_detail` 当前累计 raw 覆盖 619 条，619 个不同产品主键。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 185 个，真实配置 API 50 个，enabled 30 个。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，76 个测试全部通过。
- 当前结论：
  - `product_detail` 仍保持 disabled，但已从 119 个产品详情推进到 619 个产品详情。
  - 500 请求窗口真实耗时约 492 秒；下一轮如果继续推进，应优先复用 500 窗口再跑一段，确认稳定后再考虑是否上调，而不是直接跳到全量。

## Stage 7E

- 阶段目标：继续推进完整拉取；复用 `product_detail.limit=500` 再跑一段，验证 500 请求窗口能否稳定重复运行，并对 7C-7E 做三轮复盘。
- 已完成：
  - 选择继续推进 `product_detail`；依据是 7D 后该接口覆盖 619/8258，仍有大量产品详情未拉取，且第一次 500 请求窗口无失败。
  - 只读 DB 起点显示 `product_detail.enabled=0`、`param_source.limit=500`，checkpoint 为 `param_offset=119`、`param_limit=500`、`next_param_offset=619`。
  - 本轮未改 YAML 配置，直接复用 7D 已验证的 500 窗口。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api product_detail`，通过，批次 `sync_20260704_045713_578045`，请求 500 次，写入 500 条。
  - DB 核验显示该批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`。
  - 同批次 `sync_api_log` 为 `status=success`、`request_count=500`、`success_count=500`、`failed_count=0`、`error_message=NULL`。
  - 同批次 `raw_api_data` 写入 500 条 `product_detail`，500 个不同 `source_primary_key`，500 个不同 `data_hash`，无缺失主键。
  - `product_detail` checkpoint 指向批次 `sync_20260704_045713_578045`，记录 `param_offset=619`、`param_limit=500`、`next_param_offset=1119`、`item_count=500`、`total_count=500`。
  - 数据库 `api_config` 已确认 `product_detail.enabled=0`、`param_source.limit=500`、`param_source.auto_advance=true`。
  - `product_detail` 当前累计 raw 覆盖 1119 条，1119 个不同产品主键。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 185 个，真实配置 API 50 个，enabled 30 个。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，76 个测试全部通过。
- 7C-7E 三轮复盘：
  - 7C 将 `product_detail` 从 10 请求窗口提升到 100 请求窗口，证明产品详情参数源可以稳定扩大到分钟级单接口回填。
  - 7D 将窗口提升到 500 请求，证明单次 500 产品详情可完整写入，checkpoint 从 119 推进到 619，失败 0。
  - 7E 复用 500 窗口再次推进，证明该窗口不是一次性成功，checkpoint 从 619 推进到 1119，失败 0。
  - 本组三轮结论：`product_detail` 可以用 500 请求窗口作为当前安全回填粒度；继续推进完整产品详情时，优先多跑 500 窗口，而不是直接全量一次跑完。
  - 本组三轮也说明 daily enabled 和历史回填是两条验收线：`product_detail` 仍不应进入 daily enabled，除非后续明确每日增量策略和调度窗口。
- 当前结论：
  - `product_detail` 仍保持 disabled，但已从 619 个产品详情推进到 1119 个产品详情。
  - 下一阶段可以继续用 500 窗口推进产品详情，或开始评估另一个低风险参数型接口的更大窗口；不建议直接上调到全量。

## Stage 7F

- 阶段目标：继续推进完整拉取；复用 `product_detail.limit=500` 从 `next_param_offset=1119` 再跑一段，验证 500 请求窗口在第三段仍能稳定推进。
- 已完成：
  - 选择继续推进 `product_detail`；依据是 7E 后该接口覆盖 1119/8258，仍有大量产品详情未拉取，且 500 请求窗口已连续两次成功。
  - 只读 DB 起点显示 `product_detail.enabled=0`、`param_source.limit=500`、`param_source.auto_advance=true`，checkpoint 为 `param_offset=619`、`param_limit=500`、`next_param_offset=1119`。
  - 本轮未改 YAML 配置，直接复用已验证的 500 窗口。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api product_detail`，通过，批次 `sync_20260704_051615_422492`，请求 500 次，写入 500 条。
  - DB 核验显示该批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`，批次时间从 `2026-07-04 05:16:15` 到 `2026-07-04 05:26:40`。
  - 同批次 `sync_api_log` 为 `status=success`、`request_count=500`、`success_count=500`、`failed_count=0`、`error_message=NULL`。
  - 同批次 `raw_api_data` 写入 500 条 `product_detail`，500 个不同 `source_primary_key`，500 个不同 `data_hash`，无缺失主键。
  - `product_detail` checkpoint 指向批次 `sync_20260704_051615_422492`，记录 `param_offset=1119`、`param_limit=500`、`next_param_offset=1619`、`item_count=500`、`total_count=500`。
  - `product_detail` 当前累计 raw 覆盖 1619 条，1619 个不同产品主键；上游 `product_page` 当前有 8258 个不同产品主键。
  - `.\\.venv\\Scripts\\python.exe -m app.main`，通过，dry-run 显示 loaded 30 enabled API config(s)，说明 `product_detail` 没有误进入 enabled。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 185 个，真实配置 API 50 个，enabled 30 个。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，76 个测试全部通过。
- 当前结论：
  - `product_detail` 仍保持 disabled，但已从 1119 个产品详情推进到 1619 个产品详情。
  - 500 请求窗口已连续三段成功，仍可作为下一阶段优先回填粒度；但剩余产品详情仍多，不建议直接切换到全量或 daily enabled。

## Stage 7G

- 阶段目标：继续推进完整拉取；复用 `product_detail.limit=500` 从 `next_param_offset=1619` 再跑一段，验证 500 请求窗口在第四段仍能稳定推进。
- 已完成：
  - 选择继续推进 `product_detail`；依据是 7F 后该接口覆盖 1619/8258，仍有大量产品详情未拉取，且 500 请求窗口已连续三段成功。
  - 只读 DB 起点显示 `product_detail.enabled=0`、`param_source.limit=500`、`param_source.auto_advance=true`，checkpoint 为 `param_offset=1119`、`param_limit=500`、`next_param_offset=1619`。
  - 本轮未改 YAML 配置，直接复用已验证的 500 窗口。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api product_detail`，通过，批次 `sync_20260704_053423_651624`，请求 500 次，写入 500 条。
  - DB 核验显示该批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`，批次时间从 `2026-07-04 05:34:24` 到 `2026-07-04 05:42:31`。
  - 同批次 `sync_api_log` 为 `status=success`、`request_count=500`、`success_count=500`、`failed_count=0`、`error_message=NULL`。
  - 同批次 `raw_api_data` 写入 500 条 `product_detail`，500 个不同 `source_primary_key`，500 个不同 `data_hash`，无缺失主键。
  - `product_detail` checkpoint 指向批次 `sync_20260704_053423_651624`，记录 `param_offset=1619`、`param_limit=500`、`next_param_offset=2119`、`item_count=500`、`total_count=500`。
  - `product_detail` 当前累计 raw 覆盖 2119 条，2119 个不同产品主键；上游 `product_page` 当前有 8258 个不同产品主键。
  - `.\\.venv\\Scripts\\python.exe -m app.main`，通过，dry-run 显示 loaded 30 enabled API config(s)，说明 `product_detail` 没有误进入 enabled。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 185 个，真实配置 API 50 个，enabled 30 个。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，76 个测试全部通过。
- 当前结论：
  - `product_detail` 仍保持 disabled，但已从 1619 个产品详情推进到 2119 个产品详情。
  - 7G 是 7F-7H 三轮中的第 2 轮；下一阶段如果继续推进 `product_detail`，完成后应对 7F-7H 做三轮复盘。

## Stage 7H

- 阶段目标：继续推进完整拉取；复用 `product_detail.limit=500` 从 `next_param_offset=2119` 再跑一段，并对 7F-7H 做三轮复盘。
- 已完成：
  - 选择继续推进 `product_detail`；依据是 7G 后该接口覆盖 2119/8258，仍有大量产品详情未拉取，且 500 请求窗口已连续四段成功。
  - 只读 DB 起点显示 `product_detail.enabled=0`、`param_source.limit=500`、`param_source.auto_advance=true`，checkpoint 为 `param_offset=1619`、`param_limit=500`、`next_param_offset=2119`。
  - 本轮未改 YAML 配置，直接复用已验证的 500 窗口。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api product_detail`，通过，批次 `sync_20260704_054820_592161`，请求 500 次，写入 500 条。
  - DB 核验显示该批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`，批次时间从 `2026-07-04 05:48:21` 到 `2026-07-04 05:56:45`。
  - 同批次 `sync_api_log` 为 `status=success`、`request_count=500`、`success_count=500`、`failed_count=0`、`error_message=NULL`。
  - 同批次 `raw_api_data` 写入 500 条 `product_detail`，500 个不同 `source_primary_key`，500 个不同 `data_hash`，无缺失主键。
  - `product_detail` checkpoint 指向批次 `sync_20260704_054820_592161`，记录 `param_offset=2119`、`param_limit=500`、`next_param_offset=2619`、`item_count=500`、`total_count=500`。
  - `product_detail` 当前累计 raw 覆盖 2619 条，2619 个不同产品主键；上游 `product_page` 当前有 8258 个不同产品主键。
  - `.\\.venv\\Scripts\\python.exe -m app.main`，通过，dry-run 显示 loaded 30 enabled API config(s)，说明 `product_detail` 没有误进入 enabled。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 185 个，真实配置 API 50 个，enabled 30 个。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，76 个测试全部通过。
- 7F-7H 三轮复盘：
  - 7F 复用 500 窗口从 `next_param_offset=1619` 前的 1119 起点推进到 1619，失败 0。
  - 7G 继续 500 窗口从 1619 推进到 2119，失败 0。
  - 7H 继续 500 窗口从 2119 推进到 2619，失败 0。
  - 本组三轮结论：`product_detail` 500 请求窗口已经连续 5 段成功，其中 7F-7H 三段稳定推进 1500 个产品详情；该粒度仍适合作为下一阶段历史回填单位。
  - 本组三轮也说明 `product_detail` 的当前瓶颈不是机制可用性，而是剩余覆盖量和调度策略；它仍应保持 disabled，进入 daily enabled 前必须另行设计增量策略和调度窗口。
- 当前结论：
  - `product_detail` 仍保持 disabled，但已从 2119 个产品详情推进到 2619 个产品详情。
  - 下一阶段可继续按 500 窗口回填，或开始评估另一个低风险参数型接口；不建议直接把 `product_detail` 切换到全量或 daily enabled。

## Stage 7I

- 阶段目标：继续推进完整拉取；复用 `product_detail.limit=500` 从 `next_param_offset=2619` 再跑一段，继续扩大产品详情历史覆盖。
- 已完成：
  - 选择继续推进 `product_detail`；依据是 7H 后该接口覆盖 2619/8258，仍有大量产品详情未拉取，且 500 请求窗口已经多轮稳定。
  - 只读 DB 起点显示 `product_detail.enabled=0`、`param_source.limit=500`、`param_source.auto_advance=true`，checkpoint 为 `param_offset=2119`、`param_limit=500`、`next_param_offset=2619`。
  - 本轮未改 YAML 配置，直接复用已验证的 500 窗口。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api product_detail`，通过，批次 `sync_20260704_060234_897240`，请求 500 次，写入 500 条。
  - DB 核验显示该批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`，批次时间从 `2026-07-04 06:02:35` 到 `2026-07-04 06:11:58`。
  - 同批次 `sync_api_log` 为 `status=success`、`request_count=500`、`success_count=500`、`failed_count=0`、`error_message=NULL`。
  - 同批次 `raw_api_data` 写入 500 条 `product_detail`，500 个不同 `source_primary_key`，500 个不同 `data_hash`，无缺失主键。
  - `product_detail` checkpoint 指向批次 `sync_20260704_060234_897240`，记录 `param_offset=2619`、`param_limit=500`、`next_param_offset=3119`、`item_count=500`、`total_count=500`。
  - `product_detail` 当前累计 raw 覆盖 3119 条，3119 个不同产品主键；上游 `product_page` 当前有 8258 个不同产品主键。
  - `.\\.venv\\Scripts\\python.exe -m app.main`，通过，dry-run 显示 loaded 30 enabled API config(s)，说明 `product_detail` 没有误进入 enabled。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 185 个，真实配置 API 50 个，enabled 30 个。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，76 个测试全部通过。
- 当前结论：
  - `product_detail` 仍保持 disabled，但已从 2619 个产品详情推进到 3119 个产品详情。
  - 继续按 500 窗口回填仍然有效；下一阶段可以继续推进，或开始评估另一个低风险参数型接口。

## Stage 7J

- 阶段目标：继续推进完整拉取；复用 `product_detail.limit=500` 从 `next_param_offset=3119` 再跑一段，继续扩大产品详情历史覆盖。
- 已完成：
  - 选择继续推进 `product_detail`；依据是 7I 后该接口覆盖 3119/8258，500 请求窗口已多轮稳定，继续回填比切换到新 3 条样本更接近完整拉取目标。
  - 只读 DB 起点显示 `api_config` 总配置 52 条、enabled 30 条；`product_detail.enabled=0`、`param_source.limit=500`、`param_source.auto_advance=true`，checkpoint 为 `param_offset=2619`、`param_limit=500`、`next_param_offset=3119`。
  - 本轮未改 YAML 配置，直接复用已验证的 500 窗口。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api product_detail`，通过，批次 `sync_20260704_061856_293467`，请求 500 次，写入 500 条。
  - DB 核验显示该批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`，批次时间从 `2026-07-04 06:18:56` 到 `2026-07-04 06:26:44`，耗时 468 秒。
  - 同批次 `sync_api_log` 为 `status=success`、`request_count=500`、`success_count=500`、`failed_count=0`、`error_message=NULL`。
  - 同批次 `raw_api_data` 写入 500 条 `product_detail`，500 个不同 `source_primary_key`，500 个不同 `data_hash`，无缺失主键。
  - 同批次 `failed_request_log` 为 0 条。
  - `product_detail` checkpoint 指向批次 `sync_20260704_061856_293467`，记录 `param_offset=3119`、`param_limit=500`、`next_param_offset=3619`、`item_count=500`、`total_count=500`。
  - `product_detail` 当前累计 raw 覆盖 3619 条，3619 个不同产品主键；上游 `product_page` 当前有 8258 个不同产品主键。
  - `.\\.venv\\Scripts\\python.exe -m app.main`，通过，dry-run 显示 loaded 30 enabled API config(s)，说明 `product_detail` 没有误进入 enabled。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 185 个，真实配置 API 50 个，enabled 30 个。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，76 个测试全部通过。
- 当前结论：
  - `product_detail` 仍保持 disabled，但已从 3119 个产品详情推进到 3619 个产品详情。
  - 7J 是 7I-7K 三轮中的第 2 轮；下一阶段如果继续推进 `product_detail`，完成后应对 7I-7K 做三轮复盘。

## Stage 7K

- 阶段目标：继续推进完整拉取；复用 `product_detail.limit=500` 从 `next_param_offset=3619` 再跑一段，并对 7I-7K 做三轮复盘。
- 已完成：
  - 选择继续推进 `product_detail`；依据是 7J 后该接口覆盖 3619/8258，500 请求窗口仍稳定，继续回填比切换到新 3 条样本更接近完整拉取目标。
  - 只读 DB 起点显示 `api_config` 总配置 52 条、enabled 30 条；`product_detail.enabled=0`、`param_source.limit=500`、`param_source.auto_advance=true`，checkpoint 为 `param_offset=3119`、`param_limit=500`、`next_param_offset=3619`。
  - 本轮未改 YAML 配置，直接复用已验证的 500 窗口。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api product_detail`，通过，批次 `sync_20260704_063302_771269`，请求 500 次，写入 500 条。
  - DB 核验显示该批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`，批次时间从 `2026-07-04 06:33:03` 到 `2026-07-04 06:40:17`，耗时 434 秒。
  - 同批次 `sync_api_log` 为 `status=success`、`request_count=500`、`success_count=500`、`failed_count=0`、`error_message=NULL`。
  - 同批次 `raw_api_data` 写入 500 条 `product_detail`，500 个不同 `source_primary_key`，500 个不同 `data_hash`，无缺失主键。
  - 同批次 `failed_request_log` 为 0 条。
  - `product_detail` checkpoint 指向批次 `sync_20260704_063302_771269`，记录 `param_offset=3619`、`param_limit=500`、`next_param_offset=4119`、`item_count=500`、`total_count=500`。
  - `product_detail` 当前累计 raw 覆盖 4119 条，4119 个不同产品主键；上游 `product_page` 当前有 8258 个不同产品主键。
  - `.\\.venv\\Scripts\\python.exe -m app.main`，通过，dry-run 显示 loaded 30 enabled API config(s)，说明 `product_detail` 没有误进入 enabled。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 185 个，真实配置 API 50 个，enabled 30 个。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，76 个测试全部通过。
- 7I-7K 三轮复盘：
  - 7I 复用 500 窗口从 2619 推进到 3119，失败 0。
  - 7J 复用 500 窗口从 3119 推进到 3619，失败 0。
  - 7K 复用 500 窗口从 3619 推进到 4119，失败 0。
  - 本组三轮结论：`product_detail` 500 请求窗口继续稳定，三轮累计推进 1500 个产品详情；当前覆盖已接近半数，但仍未完成全量。
  - 本组三轮也说明 `product_detail` 仍应作为历史回填任务推进，不应直接进入 daily enabled；进入 daily enabled 前仍需要单独设计每日增量策略和调度窗口。
- 当前结论：
  - `product_detail` 仍保持 disabled，但已从 3619 个产品详情推进到 4119 个产品详情。
  - 下一阶段可继续按 500 窗口回填剩余产品详情，或开始评估另一个低风险参数型接口；不建议直接把 `product_detail` 切换到全量或 daily enabled。

## Stage 7L

- 阶段目标：继续推进完整拉取；复用 `product_detail.limit=500` 从 `next_param_offset=4119` 再跑一段，继续扩大产品详情历史覆盖。
- 已完成：
  - 选择继续推进 `product_detail`；依据是 7K 后该接口覆盖 4119/8258，500 请求窗口仍稳定，继续回填可以直接提升完整拉取程度。
  - 只读 DB 起点显示 `api_config` 总配置 52 条、enabled 30 条；`product_detail.enabled=0`、`param_source.limit=500`、`param_source.auto_advance=true`，checkpoint 为 `param_offset=3619`、`param_limit=500`、`next_param_offset=4119`。
  - 本轮未改 YAML 配置，直接复用已验证的 500 窗口。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api product_detail`，通过，批次 `sync_20260704_064721_051652`，请求 500 次，写入 500 条。
  - DB 核验显示该批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`，批次时间从 `2026-07-04 06:47:21` 到 `2026-07-04 06:54:45`，耗时 444 秒。
  - 同批次 `sync_api_log` 为 `status=success`、`request_count=500`、`success_count=500`、`failed_count=0`、`error_message=NULL`。
  - 同批次 `raw_api_data` 写入 500 条 `product_detail`，500 个不同 `source_primary_key`，500 个不同 `data_hash`，无缺失主键。
  - 同批次 `failed_request_log` 为 0 条。
  - `product_detail` checkpoint 指向批次 `sync_20260704_064721_051652`，记录 `param_offset=4119`、`param_limit=500`、`next_param_offset=4619`、`item_count=500`、`total_count=500`。
  - `product_detail` 当前累计 raw 覆盖 4619 条，4619 个不同产品主键；上游 `product_page` 当前有 8258 个不同产品主键。
  - `.\\.venv\\Scripts\\python.exe -m app.main`，通过，dry-run 显示 loaded 30 enabled API config(s)，说明 `product_detail` 没有误进入 enabled。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 185 个，真实配置 API 50 个，enabled 30 个。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，76 个测试全部通过。
- 当前结论：
  - `product_detail` 仍保持 disabled，但已从 4119 个产品详情推进到 4619 个产品详情。
  - 7L 是 7L-7N 三轮中的第 1 轮；下一阶段可继续按 500 窗口回填剩余产品详情。

## Stage 7M

- 阶段目标：继续推进完整拉取；复用 `product_detail.limit=500` 从 `next_param_offset=4619` 再跑一段，继续扩大产品详情历史覆盖。
- 已完成：
  - 选择继续推进 `product_detail`；依据是 7L 后该接口覆盖 4619/8258，500 请求窗口仍稳定，继续回填可以直接提升完整拉取程度。
  - 只读 DB 起点显示 `api_config` 总配置 52 条、enabled 30 条；`product_detail.enabled=0`、`param_source.limit=500`、`param_source.auto_advance=true`，checkpoint 为 `param_offset=4119`、`param_limit=500`、`next_param_offset=4619`。
  - 本轮未改 YAML 配置，直接复用已验证的 500 窗口。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api product_detail`，通过，批次 `sync_20260704_070159_388076`，请求 500 次，写入 500 条。
  - DB 核验显示该批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`，批次时间从 `2026-07-04 07:01:59` 到 `2026-07-04 07:11:32`，耗时 573 秒。
  - 同批次 `sync_api_log` 为 `status=success`、`request_count=500`、`success_count=500`、`failed_count=0`、`error_message=NULL`。
  - 同批次 `raw_api_data` 写入 500 条 `product_detail`，500 个不同 `source_primary_key`，500 个不同 `data_hash`，无缺失主键。
  - 同批次 `failed_request_log` 为 0 条。
  - `product_detail` checkpoint 指向批次 `sync_20260704_070159_388076`，记录 `param_offset=4619`、`param_limit=500`、`next_param_offset=5119`、`item_count=500`、`total_count=500`。
  - `product_detail` 当前累计 raw 覆盖 5119 条，5119 个不同产品主键；上游 `product_page` 当前有 8258 个不同产品主键。
  - `.\\.venv\\Scripts\\python.exe -m app.main`，通过，dry-run 显示 loaded 30 enabled API config(s)，说明 `product_detail` 没有误进入 enabled。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 185 个，真实配置 API 50 个，enabled 30 个。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，76 个测试全部通过。
- 当前结论：
  - `product_detail` 仍保持 disabled，但已从 4619 个产品详情推进到 5119 个产品详情。
  - 7M 是 7L-7N 三轮中的第 2 轮；下一阶段如果继续推进 `product_detail`，完成后应对 7L-7N 做三轮复盘。

## Stage 7N

- 阶段目标：继续推进完整拉取；复用 `product_detail.limit=500` 从 `next_param_offset=5119` 再跑一段，并对 7L-7N 做三轮复盘。
- 已完成：
  - 选择继续推进 `product_detail`；依据是 7M 后该接口覆盖 5119/8258，500 请求窗口仍稳定，继续回填仍直接提升完整拉取程度。
  - 只读 DB 起点显示 `api_config` 总配置 52 条、enabled 30 条；`product_detail.enabled=0`、`param_source.limit=500`、`param_source.auto_advance=true`，checkpoint 为 `param_offset=4619`、`param_limit=500`、`next_param_offset=5119`。
  - 本轮未改 YAML 配置，直接复用已验证的 500 窗口。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api product_detail`，通过，批次 `sync_20260704_072319_841894`，请求 500 次，写入 500 条。
  - DB 核验显示该批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`，批次时间从 `2026-07-04 07:23:20` 到 `2026-07-04 07:29:31`，耗时 371 秒。
  - 同批次 `sync_api_log` 为 `status=success`、`request_count=500`、`success_count=500`、`failed_count=0`、`error_message=NULL`。
  - 同批次 `raw_api_data` 写入 500 条 `product_detail`，500 个不同 `source_primary_key`，500 个不同 `data_hash`，无缺失主键。
  - 同批次 `failed_request_log` 为 0 条。
  - `product_detail` checkpoint 指向批次 `sync_20260704_072319_841894`，记录 `param_offset=5119`、`param_limit=500`、`next_param_offset=5619`、`item_count=500`、`total_count=500`。
  - `product_detail` 当前累计 raw 覆盖 5619 条，5619 个不同产品主键；上游 `product_page` 当前有 8258 个不同产品主键。
  - `.\\.venv\\Scripts\\python.exe -m app.main`，通过，dry-run 显示 loaded 30 enabled API config(s)，说明 `product_detail` 没有误进入 enabled。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 185 个，真实配置 API 50 个，enabled 30 个。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，76 个测试全部通过。
- 7L-7N 三轮复盘：
  - 7L 复用 500 窗口从 4119 推进到 4619，失败 0。
  - 7M 复用 500 窗口从 4619 推进到 5119，失败 0。
  - 7N 复用 500 窗口从 5119 推进到 5619，失败 0。
  - 本组三轮结论：`product_detail` 500 请求窗口继续稳定，三轮累计推进 1500 个产品详情，当前覆盖从 4119 增加到 5619。
  - 本组三轮也说明 `product_detail` 仍是历史回填任务，不应直接进入 daily enabled；进入 daily enabled 前仍需要单独设计每日增量策略和调度窗口。
- 当前结论：
  - `product_detail` 仍保持 disabled，但已从 5119 个产品详情推进到 5619 个产品详情。
  - 下一阶段可继续按 500 窗口回填剩余产品详情，或开始评估另一个低风险参数型接口；不建议直接把 `product_detail` 切换到全量或 daily enabled。

## Stage 7O

- 阶段目标：继续推进完整拉取；复用 `product_detail.limit=500` 从 `next_param_offset=5619` 再跑一段，继续扩大产品详情历史覆盖。
- 已完成：
  - 选择继续推进 `product_detail`；依据是 7N 后该接口覆盖 5619/8258，500 请求窗口仍稳定，继续回填仍直接提升完整拉取程度。
  - 只读 DB 起点显示 `api_config` 总配置 52 条、enabled 30 条；`product_detail.enabled=0`、`param_source.limit=500`、`param_source.auto_advance=true`，checkpoint 为 `param_offset=5119`、`param_limit=500`、`next_param_offset=5619`。
  - 本轮未改 YAML 配置，直接复用已验证的 500 窗口。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api product_detail`，通过，批次 `sync_20260704_073757_096789`，请求 500 次，写入 500 条。
  - DB 核验显示该批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`，批次时间从 `2026-07-04 07:37:57` 到 `2026-07-04 07:44:18`，耗时 381 秒。
  - 同批次 `sync_api_log` 为 `status=success`、`request_count=500`、`success_count=500`、`failed_count=0`、`error_message=NULL`。
  - 同批次 `raw_api_data` 写入 500 条 `product_detail`，500 个不同 `source_primary_key`，500 个不同 `data_hash`，无缺失主键。
  - 同批次 `failed_request_log` 为 0 条。
  - `product_detail` checkpoint 指向批次 `sync_20260704_073757_096789`，记录 `param_offset=5619`、`param_limit=500`、`next_param_offset=6119`、`item_count=500`、`total_count=500`。
  - `product_detail` 当前累计 raw 覆盖 6119 条，6119 个不同产品主键；上游 `product_page` 当前有 8258 个不同产品主键。
  - `.\\.venv\\Scripts\\python.exe -m app.main`，通过，dry-run 显示 loaded 30 enabled API config(s)，说明 `product_detail` 没有误进入 enabled。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 185 个，真实配置 API 50 个，enabled 30 个。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，76 个测试全部通过。
- 当前结论：
  - `product_detail` 仍保持 disabled，但已从 5619 个产品详情推进到 6119 个产品详情。
  - 7O 是 7O-7Q 三轮中的第 1 轮；下一阶段可继续按 500 窗口回填剩余产品详情。

## Stage 7P

- 阶段目标：继续推进完整拉取；复用 `product_detail.limit=500` 从 `next_param_offset=6119` 再跑一段，继续扩大产品详情历史覆盖。
- 已完成：
  - 选择继续推进 `product_detail`；依据是 7O 后该接口覆盖 6119/8258，500 请求窗口仍稳定，继续回填仍直接提升完整拉取程度。
  - 只读 DB 起点显示 `api_config` 总配置 52 条、enabled 30 条；`product_detail.enabled=0`、`param_source.limit=500`、`param_source.auto_advance=true`，checkpoint 为 `param_offset=5619`、`param_limit=500`、`next_param_offset=6119`。
  - 本轮未改 YAML 配置，直接复用已验证的 500 窗口。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api product_detail`，通过，批次 `sync_20260704_075152_244424`，请求 500 次，写入 500 条。
  - DB 核验显示该批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`，批次时间从 `2026-07-04 07:51:52` 到 `2026-07-04 07:57:36`，耗时 344 秒。
  - 同批次 `sync_api_log` 为 `status=success`、`request_count=500`、`success_count=500`、`failed_count=0`、`error_message=NULL`。
  - 同批次 `raw_api_data` 写入 500 条 `product_detail`，500 个不同 `source_primary_key`，500 个不同 `data_hash`，无缺失主键。
  - 同批次 `failed_request_log` 为 0 条。
  - `product_detail` checkpoint 指向批次 `sync_20260704_075152_244424`，记录 `param_offset=6119`、`param_limit=500`、`next_param_offset=6619`、`item_count=500`、`total_count=500`。
  - `product_detail` 当前累计 raw 覆盖 6619 条，6619 个不同产品主键；上游 `product_page` 当前有 8258 个不同产品主键。
  - `.\\.venv\\Scripts\\python.exe -m app.main`，通过，dry-run 显示 loaded 30 enabled API config(s)，说明 `product_detail` 没有误进入 enabled。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 185 个，真实配置 API 50 个，enabled 30 个。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，76 个测试全部通过。
- 当前结论：
  - `product_detail` 仍保持 disabled，但已从 6119 个产品详情推进到 6619 个产品详情。
  - 7P 是 7O-7Q 三轮中的第 2 轮；下一阶段如果继续推进 `product_detail`，完成后应对 7O-7Q 做三轮复盘。

## Stage 7Q

- 阶段目标：继续推进完整拉取；复用 `product_detail.limit=500` 从 `next_param_offset=6619` 再跑一段，并对 7O-7Q 做三轮复盘。
- 已完成：
  - 选择继续推进 `product_detail`；依据是 7P 后该接口覆盖 6619/8258，500 请求窗口仍稳定，继续回填仍直接提升完整拉取程度。
  - 只读 DB 起点显示 `api_config` 总配置 52 条、enabled 30 条；`product_detail.enabled=0`、`param_source.limit=500`、`param_source.auto_advance=true`，checkpoint 为 `param_offset=6119`、`param_limit=500`、`next_param_offset=6619`。
  - 本轮未改 YAML 配置，直接复用已验证的 500 窗口。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api product_detail`，通过，批次 `sync_20260704_080349_281614`，请求 500 次，写入 500 条。
  - DB 核验显示该批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`，批次时间从 `2026-07-04 08:03:49` 到 `2026-07-04 08:13:23`，耗时 574 秒。
  - 同批次 `sync_api_log` 为 `status=success`、`request_count=500`、`success_count=500`、`failed_count=0`、`error_message=NULL`。
  - 同批次 `raw_api_data` 写入 500 条 `product_detail`，500 个不同 `source_primary_key`，500 个不同 `data_hash`，无缺失主键。
  - 同批次 `failed_request_log` 为 0 条。
  - `product_detail` checkpoint 指向批次 `sync_20260704_080349_281614`，记录 `param_offset=6619`、`param_limit=500`、`next_param_offset=7119`、`item_count=500`、`total_count=500`。
  - `product_detail` 当前累计 raw 覆盖 7119 条，7119 个不同产品主键；上游 `product_page` 当前有 8258 个不同产品主键。
  - `.\\.venv\\Scripts\\python.exe -m app.main`，通过，dry-run 显示 loaded 30 enabled API config(s)，说明 `product_detail` 没有误进入 enabled。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 185 个，真实配置 API 50 个，enabled 30 个。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，76 个测试全部通过。
- 7O-7Q 三轮复盘：
  - 7O 复用 500 窗口从 5619 推进到 6119，失败 0。
  - 7P 复用 500 窗口从 6119 推进到 6619，失败 0。
  - 7Q 复用 500 窗口从 6619 推进到 7119，失败 0。
  - 本组三轮结论：`product_detail` 500 请求窗口继续稳定，三轮累计推进 1500 个产品详情，当前覆盖从 5619 增加到 7119。
  - 本组三轮也说明 `product_detail` 已接近完成历史回填，但仍应保持 disabled；进入 daily enabled 前仍要单独设计每日增量策略和调度窗口。
- 当前结论：
  - `product_detail` 仍保持 disabled，但已从 6619 个产品详情推进到 7119 个产品详情。
  - 下一阶段可继续按 500 窗口回填剩余产品详情，预计还需少量窗口才能追平当前 `product_page` 上游主键。

## Stage 7R

- 阶段目标：继续推进完整拉取；复用 `product_detail.limit=500` 从 `next_param_offset=7119` 再跑一段，继续扩大产品详情历史覆盖。
- 已完成：
  - 选择继续推进 `product_detail`；依据是 7Q 后该接口覆盖 7119/8258，500 请求窗口仍稳定，继续回填仍直接提升完整拉取程度。
  - 只读 DB 起点显示 `api_config` 总配置 52 条、enabled 30 条；`product_detail.enabled=0`、`param_source.limit=500`、`param_source.auto_advance=true`，checkpoint 为 `param_offset=6619`、`param_limit=500`、`next_param_offset=7119`。
  - 本轮未改 YAML 配置，直接复用已验证的 500 窗口。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api product_detail`，通过，批次 `sync_20260704_082510_760132`，请求 500 次，写入 500 条。
  - DB 核验显示该批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`，批次时间从 `2026-07-04 08:25:11` 到 `2026-07-04 08:31:45`，耗时 394 秒。
  - 同批次 `sync_api_log` 为 `status=success`、`request_count=500`、`success_count=500`、`failed_count=0`、`error_message=NULL`。
  - 同批次 `raw_api_data` 写入 500 条 `product_detail`，500 个不同 `source_primary_key`，500 个不同 `data_hash`，无缺失主键。
  - 同批次 `failed_request_log` 为 0 条。
  - `product_detail` checkpoint 指向批次 `sync_20260704_082510_760132`，记录 `param_offset=7119`、`param_limit=500`、`next_param_offset=7619`、`item_count=500`、`total_count=500`。
  - `product_detail` 当前累计 raw 覆盖 7619 条，7619 个不同产品主键；上游 `product_page` 当前有 8258 个不同产品主键。
  - `.\\.venv\\Scripts\\python.exe -m app.main`，通过，dry-run 显示 loaded 30 enabled API config(s)，说明 `product_detail` 没有误进入 enabled。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 185 个，真实配置 API 50 个，enabled 30 个。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，76 个测试全部通过。
- 当前结论：
  - `product_detail` 仍保持 disabled，但已从 7119 个产品详情推进到 7619 个产品详情。
  - 下一阶段可继续按 500 窗口回填剩余产品详情；追平当前 `product_page` 8258 个上游主键后，再单独设计 daily 增量策略。

## Stage 7S

- 阶段目标：继续推进完整拉取；复用 `product_detail.limit=500` 从 `next_param_offset=7619` 再跑一段，继续扩大产品详情历史覆盖。
- 已完成：
  - 选择继续推进 `product_detail`；依据是 7R 后该接口覆盖 7619/8258，继续回填仍直接提升完整拉取程度。
  - 只读 DB 起点显示 `api_config` 总配置 52 条、enabled 30 条；`product_detail.enabled=0`、`param_source.limit=500`、`param_source.auto_advance=true`，checkpoint 为 `param_offset=7119`、`param_limit=500`、`next_param_offset=7619`。
  - 本轮未改 YAML 配置，直接复用已验证的 500 窗口。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api product_detail`，通过，批次 `sync_20260704_083800_953357`，请求 500 次，写入 500 条。
  - DB 核验显示该批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`，批次时间从 `2026-07-04 08:38:01` 到 `2026-07-04 08:45:22`，耗时 441 秒。
  - 同批次 `sync_api_log` 为 `status=success`、`request_count=500`、`success_count=500`、`failed_count=0`、`error_message=NULL`。
  - 同批次 `raw_api_data` 写入 500 条 `product_detail`，500 个不同 `source_primary_key`，500 个不同 `data_hash`，无缺失主键。
  - 同批次 `failed_request_log` 为 0 条。
  - `product_detail` checkpoint 指向批次 `sync_20260704_083800_953357`，记录 `param_offset=7619`、`param_limit=500`、`next_param_offset=8119`、`item_count=500`、`total_count=500`。
  - `product_detail` 当前累计 raw 覆盖 8119 条，8119 个不同产品主键；上游 `product_page` 当前有 8258 个不同产品主键。
  - `.\\.venv\\Scripts\\python.exe -m app.main`，通过，dry-run 显示 loaded 30 enabled API config(s)，说明 `product_detail` 没有误进入 enabled。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 185 个，真实配置 API 50 个，enabled 30 个。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，76 个测试全部通过。
- 当前结论：
  - `product_detail` 仍保持 disabled，但已从 7619 个产品详情推进到 8119 个产品详情，距离当前 `product_page` 上游 8258 个主键还差 139 个。
  - 7S 是 7R-7T 三轮中的第 2 轮；下一阶段如果继续推进 `product_detail`，完成后应对 7R-7T 做三轮复盘。

## Stage 7T

- 阶段目标：继续推进完整拉取；复用 `product_detail.limit=500` 从 `next_param_offset=8119` 跑尾段，并对 7R-7T 做三轮复盘。
- 已完成：
  - 选择继续推进 `product_detail`；依据是 7S 后该接口覆盖 8119/8258，尾段只剩 139 个产品主键，直接完成产品详情历史回填。
  - 只读 DB 起点显示 `api_config` 总配置 52 条、enabled 30 条；`product_detail.enabled=0`、`param_source.limit=500`、`param_source.auto_advance=true`，checkpoint 为 `param_offset=7619`、`param_limit=500`、`next_param_offset=8119`。
  - 本轮未改 YAML 配置，直接复用已验证的 500 窗口；由于上游剩余主键只有 139 个，本轮实际请求 139 次。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api product_detail`，通过，批次 `sync_20260704_085210_504745`，请求 139 次，写入 139 条。
  - DB 核验显示该批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`，批次时间从 `2026-07-04 08:52:11` 到 `2026-07-04 08:54:03`，耗时 112 秒。
  - 同批次 `sync_api_log` 为 `status=success`、`request_count=139`、`success_count=139`、`failed_count=0`、`error_message=NULL`。
  - 同批次 `raw_api_data` 写入 139 条 `product_detail`，139 个不同 `source_primary_key`，139 个不同 `data_hash`，无缺失主键。
  - 同批次 `failed_request_log` 为 0 条。
  - `product_detail` checkpoint 指向批次 `sync_20260704_085210_504745`，记录 `param_offset=8119`、`param_limit=500`、`next_param_offset=8258`、`item_count=139`、`total_count=139`。
  - `product_detail` 当前累计 raw 覆盖 8258 条，8258 个不同产品主键；上游 `product_page` 当前有 8258 个不同产品主键，历史回填已追平。
  - `.\\.venv\\Scripts\\python.exe -m app.main`，通过，dry-run 显示 loaded 30 enabled API config(s)，说明 `product_detail` 没有误进入 enabled。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 185 个，真实配置 API 50 个，enabled 30 个。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，76 个测试全部通过。
- 7R-7T 三轮复盘：
  - 7R 复用 500 窗口从 7119 推进到 7619，失败 0。
  - 7S 复用 500 窗口从 7619 推进到 8119，失败 0。
  - 7T 跑完尾段 139 个产品详情，从 8119 推进到 8258，失败 0。
  - 本组三轮结论：`product_detail` 历史回填已追平当前 `product_page` 上游主键，覆盖从 7119 增加到 8258，三轮累计推进 1139 个产品详情。
  - 本组三轮也说明 500 请求窗口可以自然处理尾段不足 500 的情况；但 `product_detail` 仍应保持 disabled，进入 daily enabled 前必须先验证追平后的空窗口行为、新增产品 ID 的增量拾取方式和完整 enabled 批次耗时。
- 当前结论：
  - `product_detail` 仍保持 disabled，但历史回填已追平当前 `product_page`。
  - 下一阶段不应继续盲跑 `product_detail` 历史窗口，应优先验证追平后的增量策略，或转向下一个低风险参数型接口。

## Stage 7U

- 阶段目标：继续推进完整拉取；先验证 `product_detail` 追平后的空窗口行为，判断它是否具备进入 daily enabled 评估的基础。
- 已完成：
  - 只读 DB 起点确认 `api_config` 总配置 52 条、enabled 30 条；`product_detail.enabled=0`、`param_source.limit=500`、`param_source.auto_advance=true`。
  - 起点 checkpoint 为批次 `sync_20260704_085210_504745`，记录 `param_offset=8119`、`param_limit=500`、`next_param_offset=8258`。
  - 起点覆盖量为 `product_detail` 8258 个不同产品主键，`product_page` 8258 个不同产品主键，剩余 0。
  - 代码机制核对显示：`param_source.auto_advance=true` 时会从 checkpoint 的 `next_param_offset` 作为下一次读取上游参数的 offset；如果上游参数为空，会写入成功日志和 checkpoint，但不会请求外部 API。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api product_detail`，通过，批次 `sync_20260704_090119_560431`，请求 0 次，写入 0 条，失败 0。
  - DB 核验显示该批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`，批次时间从 `2026-07-04 09:01:20` 到 `2026-07-04 09:01:24`。
  - 同批次 `sync_api_log` 为 `status=success`、`request_count=0`、`success_count=0`、`failed_count=0`、`error_message=NULL`。
  - 同批次 `raw_api_data` 写入 0 条 `product_detail`，`failed_request_log` 为 0 条。
  - `product_detail` checkpoint 指向批次 `sync_20260704_090119_560431`，记录 `param_offset=8258`、`param_limit=500`、`next_param_offset=8258`、`item_count=0`、`total_count=0`。
  - `product_detail` 当前累计 raw 覆盖仍为 8258 条，8258 个不同产品主键；上游 `product_page` 当前仍为 8258 个不同产品主键。
  - `.\\.venv\\Scripts\\python.exe -m app.main`，通过，dry-run 显示 loaded 30 enabled API config(s)，说明 `product_detail` 没有误进入 enabled。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 185 个，真实配置 API 50 个，enabled 30 个。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，76 个测试全部通过。
- 当前结论：
  - `product_detail` 追平后的空窗口行为已验证：不会产生外部请求，不会写入空数据，会留下成功批次、接口日志和 checkpoint。
  - 这只证明“没有新上游产品时”的日常运行是可追踪的；仍不能直接进入 enabled，因为还没有验证新产品 ID 出现在上游 `product_page` 后是否能被 `next_param_offset=8258` 正确拾取。
  - 下一阶段应继续评估 `product_detail` 新增产品 ID 的增量拾取方式和完整 enabled 批次新增成本；如不适合启用，则转向下一个低风险参数型接口。

## Stage 7V

- 阶段目标：继续推进完整拉取；验证并修正 `product_detail` 新增产品 ID 的增量拾取方式。
- 已完成：
  - 只读 DB 起点确认 `product_page` 有 8258 个不同产品主键，`product_detail` 有 8258 个不同产品主键，缺失详情数为 0。
  - 只读 DB 同时确认 `product_page.source_primary_key` 是字符串形态：lexicographic 最大值为 `999`，数值最大值为 `8459`。这说明旧的 `ORDER BY source_primary_key LIMIT/OFFSET` 不能证明新增数值 ID 会排在 `OFFSET 8258` 之后。
  - 用 TDD 增加 `tests/test_product_detail_param_source.py` 覆盖：`product_detail` 配置必须声明 `exclude_existing_target=true`；开启后参数来源 SQL 必须排除目标 API 已存在主键；开启后 `_param_source_offset()` 必须忽略旧 checkpoint offset。
  - RED 验证通过：新增测试先失败，失败点分别是配置缺少 `exclude_existing_target`、offset 仍返回 8258、SQL 未携带 `target_api_code`。
  - 最小实现：`config/api_config.example.yaml` 的 `product_detail.param_source` 增加 `exclude_existing_target: true`；`app/sync_engine.py` 在 `source_primary_key` 参数来源下支持反连接目标 API，只取 `product_page` 中存在但 `product_detail` 中不存在的主键。
  - `.\\.venv\\Scripts\\python.exe -m unittest tests.test_product_detail_param_source`，通过，6 个测试全部通过。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，输出 `api configs synced: count=52`。
  - DB 核验显示 `api_config.product_detail.enabled=0`，`config_json.param_source.exclude_existing_target=true`，`auto_advance=true`，`limit=500`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api product_detail`，通过，批次 `sync_20260704_091054_370330`，请求 0 次，写入 0 条，失败 0。
  - DB 核验显示该批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`。
  - 同批次 `sync_api_log` 为 `status=success`、`request_count=0`、`success_count=0`、`failed_count=0`。
  - 同批次 `raw_api_data` 写入 0 条 `product_detail`，`failed_request_log` 为 0 条。
  - `product_detail` checkpoint 指向新批次，记录 `param_offset=0`、`param_limit=500`、`next_param_offset=0`、`item_count=0`、`total_count=0`；这是缺失主键扫描的新语义，不再依赖历史 offset。
  - 当前 DB 缺失详情数仍为 0，`product_detail` 与 `product_page` 均为 8258 个不同产品主键。
  - `.\\.venv\\Scripts\\python.exe -m app.main`，通过，dry-run 显示 loaded 30 enabled API config(s)，说明本轮没有启用 `product_detail`。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 185 个，真实配置 API 50 个，enabled 30 个。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，78 个测试全部通过。
- 当前结论：
  - 旧的 checkpoint offset 机制不适合作为 `product_detail` daily 增量边界，因为产品 ID 字符串排序会让新增数值 ID 不一定落在旧 offset 后。
  - `product_detail` 已改为按目标表缺失主键增量拾取：只要 `product_page` 出现新 `source_primary_key` 且 `product_detail` 尚无同主键，下一次单接口或 enabled 同步就会请求它。
  - 本轮仍保持 `product_detail.enabled=false`；下一阶段可以评估启用，但必须运行完整 `--sync-enabled` 证明 31 个 enabled API 同批次成功，并核验新增耗时。

## Stage 7W

- 阶段目标：继续推进完整拉取；将 `product_detail` 纳入 daily enabled，并用完整 enabled 批次验证 31 个 API 同批次成功。
- 已完成：
  - 只读 DB 起点确认 `api_config` 总配置 52 条、enabled 30 条；`product_detail.enabled=0`、`exclude_existing_target=true`、`param_limit=500`。
  - 起点缺失详情数为 0，`product_page` 与 `product_detail` 均为 8258 个不同产品主键。
  - 将 `config/api_config.example.yaml` 中 `product_detail.enabled` 从 `false` 改为 `true`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，输出 `api configs synced: count=52`。
  - DB 核验显示 `api_config` 总配置 52 条、enabled 31 条，`product_detail.enabled=1`，`config_json.param_source.exclude_existing_target=true`。
  - `.\\.venv\\Scripts\\python.exe -m app.main`，通过，dry-run 显示 loaded 31 enabled API config(s)，且列表包含 `product_detail`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-enabled`，通过，批次 `sync_20260704_091906_407404`，31 个 API，请求 3075 次，写入 307946 条。
  - DB 核验显示该 enabled 批次 `sync_batch.status=success`、`total_api_count=31`、`success_api_count=31`、`failed_api_count=0`，批次时间从 `2026-07-04 09:19:06` 到 `2026-07-04 10:29:56`，耗时 4250 秒。
  - 同批次 `sync_api_log` 共 31 条，31 条 `status=success`，0 条 failed；合计 `request_count=3075`、`success_count=307946`、`failed_count=0`。
  - 同批次 `failed_request_log` 为 0 条。
  - 同批次 `product_detail` 日志为 `status=success`、`request_count=0`、`success_count=0`、`failed_count=0`、`error_message=NULL`，符合当前缺失详情数为 0 的预期。
  - 同批次 `product_detail` raw 写入 0 条；checkpoint 指向批次 `sync_20260704_091906_407404`，记录 `param_offset=0`、`param_limit=500`、`next_param_offset=0`、`item_count=0`、`total_count=0`。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 185 个，真实配置 API 50 个，enabled 31 个。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - 初次运行 `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"` 发现 2 个阶段性断言仍按旧基线要求 enabled 30、`product_detail` disabled；已更新为 enabled 31、`product_detail` enabled。
  - `.\\.venv\\Scripts\\python.exe -m unittest tests.test_5v_low_risk_enabled_configs tests.test_product_detail_param_source`，通过，7 个测试全部通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，78 个测试全部通过。
- 7U-7W 三轮复盘：
  - 7U 验证 `product_detail` 追平后的空窗口行为，确认 0 请求、0 写入、0 失败可追踪。
  - 7V 发现旧 offset 增量机制不可靠，并改为 `exclude_existing_target=true` 的目标表缺失主键扫描。
  - 7W 将 `product_detail` 纳入 enabled，完整 enabled 批次 31 个 API 同批次成功。
  - 本组三轮结论：`product_detail` 已从历史回填任务转为 daily enabled 任务；当前没有缺失详情时不增加外部请求，但后续 `product_page` 出现新主键时会按缺失主键扫描进入详情同步。
  - 本组三轮也说明 enabled 批次请求数从 3074 增到 3075，主要不是 `product_detail` 增量成本，而是本轮 `storage_inbound_page` 上游数据从 174286 增到 174330 后多 1 页请求。
- 当前结论：
  - 当前 enabled API 已从 30 个增加到 31 个，`product_detail` 已进入 daily enabled。
  - 下一阶段应继续完整拉取目标，转向下一个低风险参数型接口或低成本 disabled 接口；如果继续按参数型接口推进，优先避免 3 条样本节奏，选择可验证的中等窗口。

## Stage 7X

- 阶段目标：继续推进完整拉取；将当前已验证但为空结果的 `purchase_plan_page` 纳入 daily enabled，并用完整 enabled 批次验证 32 个 API 同批次成功。
- 已完成：
  - 只读 DB 起点确认 `api_config` 总配置 52 条、enabled 31 条；`purchase_plan_page.enabled=0`、`page_size=100`、`max_pages=3`。
  - 起点 `purchase_plan_page` checkpoint 指向历史批次 `sync_20260703_124115_334136`，记录 `last_page=1`、`request_count=1`、`item_count=0`、`total_count=0`；历史 raw 为 0 条。
  - 重新运行 `.\\.venv\\Scripts\\python.exe -m app.main --sync-api purchase_plan_page`，通过，批次 `sync_20260704_103916_762942`，请求 1 次，写入 0 条。
  - DB 核验显示该单接口批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`。
  - 同批次 `sync_api_log` 为 `status=success`、`request_count=1`、`success_count=0`、`failed_count=0`、`error_message=NULL`；`raw_api_data` 写入 0 条，`failed_request_log` 为 0 条。
  - `purchase_plan_page` checkpoint 指向批次 `sync_20260704_103916_762942`，记录 `last_page=1`、`request_count=1`、`item_count=0`、`total_count=0`。
  - 将 `config/api_config.example.yaml` 中 `purchase_plan_page.enabled` 从 `false` 改为 `true`，并更新阶段性测试断言。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，输出 `api configs synced: count=52`。
  - DB 核验显示 `api_config` 总配置 52 条、enabled 32 条，`purchase_plan_page.enabled=1`，`config_json.enabled=true`。
  - `.\\.venv\\Scripts\\python.exe -m app.main`，通过，dry-run 显示 loaded 32 enabled API config(s)，且列表包含 `purchase_plan_page`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-enabled`，通过，批次 `sync_20260704_104132_951900`，32 个 API，请求 3075 次，写入 307946 条。
  - DB 核验显示该 enabled 批次 `sync_batch.status=success`、`total_api_count=32`、`success_api_count=32`、`failed_api_count=0`，批次时间从 `2026-07-04 10:41:33` 到 `2026-07-04 11:52:17`，耗时 4244 秒。
  - 同批次 `sync_api_log` 共 32 条，32 条 `status=success`，0 条 failed；合计 `request_count=3075`、`success_count=307946`、`failed_count=0`。
  - 同批次 `purchase_plan_page` 为 `status=success`、`request_count=1`、`success_count=0`、`failed_count=0`，raw 写入 0 条，`failed_request_log` 为 0 条。
  - `purchase_plan_page` checkpoint 指向批次 `sync_20260704_104132_951900`，记录 `last_page=1`、`request_count=1`、`item_count=0`、`total_count=0`。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 185 个，真实配置 API 50 个，enabled 32 个。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，78 个测试全部通过。
- 当前结论：
  - `purchase_plan_page` 当前总量为 0 是业务数据现状：当前账号没有可返回的采购计划列表数据，不是接口失败。
  - 该接口已经进入 daily enabled；未来出现采购计划数据时会随日常同步自动拉取。
  - 32 个 enabled API 的完整批次已成功，新增 `purchase_plan_page` 没有增加明显批量成本；本轮请求总数仍为 3075。

## Stage 7Y

- 阶段目标：继续推进完整拉取；选择 `transfer_detail` 从 3 条样本升级为 200 条中等窗口回填，验证依赖型详情接口可稳定推进。
- 已完成：
  - 只读 DB 起点确认 `transfer_detail.enabled=0`、`param_source.limit=3`、`auto_advance=true`，checkpoint 为 `param_offset=3`、`param_limit=3`、`next_param_offset=6`。
  - 只读 DB 确认上游 `storage_inbound_page` 中 `opType=TFOutbound` 的不同调拨单号为 6499 个；`transfer_detail` 起点已有 6 条 raw、6 个不同主键。
  - 选择 `transfer_detail` 的原因：它的参数来源和 `opType=TFOutbound` 过滤已在 5H、5I 连续验证，当前体量小于 `market_inventory_query` 和 `storage_inbound_detail`，比继续 3 条样本更能证明真实窗口能力。
  - 先将 `tests/test_transfer_detail_param_source.py` 的窗口断言从 3 改为 200，并运行 `.\\.venv\\Scripts\\python.exe -m unittest tests.test_transfer_detail_param_source`；RED 阶段按预期失败于 `3 != 200`。
  - 将 `config/api_config.example.yaml` 中 `transfer_detail.param_source.limit` 从 3 改为 200；`transfer_detail` 仍保持 `enabled=false`。
  - 再次运行 `.\\.venv\\Scripts\\python.exe -m unittest tests.test_transfer_detail_param_source`，通过，2 个测试全部通过。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，输出 `api configs synced: count=52`。
  - DB 核验显示 `transfer_detail.enabled=0`、`config_json.enabled=false`、`param_source.limit=200`、`auto_advance=true`。
  - `.\\.venv\\Scripts\\python.exe -m app.main`，通过，dry-run 仍显示 loaded 32 enabled API config(s)，说明 `transfer_detail` 没有误进入 daily enabled。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api transfer_detail`，通过，批次 `sync_20260704_120115_022944`，请求 200 次，写入 200 条。
  - DB 核验显示该批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`，耗时 441 秒。
  - 同批次 `sync_api_log` 为 `status=success`、`request_count=200`、`success_count=200`、`failed_count=0`、`error_message=NULL`。
  - 同批次 `raw_api_data` 写入 200 条，200 个不同 `source_primary_key`，200 个不同 `data_hash`，`data_date` 范围为 `2022-09-20` 到 `2023-07-15`。
  - 同批次 `failed_request_log` 为 0 条；样本确认 `source_primary_key` 与 `raw_json.code` 一致。
  - `transfer_detail` 当前累计 raw 为 206 条、206 个不同调拨单号；checkpoint 指向批次 `sync_20260704_120115_022944`，记录 `param_offset=6`、`param_limit=200`、`next_param_offset=206`、`item_count=200`、`total_count=200`。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 185 个，真实配置 API 50 个，enabled 32 个。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，78 个测试全部通过。
- 当前结论：
  - `transfer_detail` 已从 3 条样本推进到 200 条中等窗口，依赖参数过滤、真实请求、原始 JSON 入库和 checkpoint 推进都正常。
  - 本轮仍不启用 `transfer_detail`；原因是历史回填仍只覆盖 206/6499，且当前 daily 增量边界还依赖 checkpoint offset，不适合直接进入 enabled。
  - 下一阶段可继续复用 200 条窗口推进 `transfer_detail`，或转向 `lot_no_detail` 做同样的中等窗口验证；如果继续 `transfer_detail`，完成后应复盘 7X-7Z。

## Stage 7Z

- 阶段目标：继续推进完整拉取；不改 YAML，复用 `transfer_detail` 的 200 条中等窗口，把 checkpoint 从 206 推进到 406，并完成 7X-7Z 三轮复盘。
- 已完成：
  - 只读 DB 起点确认 `transfer_detail.enabled=0`、`config_json.enabled=false`、`param_source.limit=200`、`auto_advance=true`。
  - 起点 checkpoint 指向批次 `sync_20260704_120115_022944`，记录 `param_offset=6`、`param_limit=200`、`next_param_offset=206`、`item_count=200`、`total_count=200`。
  - 起点上游 `storage_inbound_page` 中 `opType=TFOutbound` 的不同调拨单号为 6499 个；`transfer_detail` 已有 206 条 raw、206 个不同主键。
  - `.\\.venv\\Scripts\\python.exe -m app.main`，通过，dry-run 仍显示 loaded 32 enabled API config(s)，说明本轮没有启用 `transfer_detail`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api transfer_detail`，通过，批次 `sync_20260704_121501_289184`，请求 200 次，写入 200 条。
  - DB 核验显示该批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`，耗时 387 秒。
  - 同批次 `sync_api_log` 为 `status=success`、`request_count=200`、`success_count=200`、`failed_count=0`、`error_message=NULL`。
  - 同批次 `raw_api_data` 写入 200 条，200 个不同 `source_primary_key`，200 个不同 `data_hash`，`data_date` 范围为 `2022-11-12` 到 `2022-12-24`。
  - 同批次 `failed_request_log` 为 0 条；样本确认 `source_primary_key` 与 `raw_json.code` 一致。
  - `transfer_detail` 当前累计 raw 为 406 条、406 个不同调拨单号；checkpoint 指向批次 `sync_20260704_121501_289184`，记录 `param_offset=206`、`param_limit=200`、`next_param_offset=406`、`item_count=200`、`total_count=200`。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 185 个，真实配置 API 50 个，enabled 32 个。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，78 个测试全部通过。
- 7X-7Z 三轮复盘：
  - 7X 将当前空结果但已验证可访问的 `purchase_plan_page` 纳入 daily enabled，并用完整 enabled 批次证明 32 个 API 同批次成功。
  - 7Y 将 `transfer_detail` 从 3 条样本窗口升级到 200 条中等窗口，累计覆盖从 6 增到 206。
  - 7Z 继续同一窗口不改配置推进，累计覆盖从 206 增到 406，验证 checkpoint 自动推进稳定。
  - 本组三轮结论：低成本空结果接口可以在完整 enabled 批次验证后进入 daily；依赖型详情接口在进入 daily enabled 前，应先完成足够历史回填并重新设计 daily 增量边界，不能只依赖 checkpoint offset。
  - 本组三轮结论：`transfer_detail` 中等窗口每 200 请求约 6 到 8 分钟，适合继续分批回填；但距离 6499 个上游调拨单号仍有明显缺口，不应直接加入 enabled。
- 当前结论：
  - `transfer_detail` 已完成 406/6499 个调拨单详情回填，失败 0，下一批可继续复用 `next_param_offset=406`。
  - 下一阶段建议进入 8A，继续 `transfer_detail` 的 200 条窗口，或切到 `lot_no_detail` 做同等中等窗口验证。

## Stage 8A

- 阶段目标：继续推进完整拉取；不改 YAML，复用 `transfer_detail` 的 200 条中等窗口，把 checkpoint 从 406 推进到 606。
- 已完成：
  - 只读 DB 起点确认 `transfer_detail.enabled=0`、`config_json.enabled=false`、`param_source.limit=200`、`auto_advance=true`。
  - 起点 checkpoint 指向批次 `sync_20260704_121501_289184`，记录 `param_offset=206`、`param_limit=200`、`next_param_offset=406`、`item_count=200`、`total_count=200`。
  - 起点上游 `storage_inbound_page` 中 `opType=TFOutbound` 的不同调拨单号为 6499 个；`transfer_detail` 已有 406 条 raw、406 个不同主键。
  - `.\\.venv\\Scripts\\python.exe -m app.main`，通过，dry-run 仍显示 loaded 32 enabled API config(s)，说明本轮没有启用 `transfer_detail`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api transfer_detail`，通过，批次 `sync_20260704_122721_709651`，请求 200 次，写入 200 条。
  - DB 核验显示该批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`，耗时 396 秒。
  - 同批次 `sync_api_log` 为 `status=success`、`request_count=200`、`success_count=200`、`failed_count=0`、`error_message=NULL`。
  - 同批次 `raw_api_data` 写入 200 条，200 个不同 `source_primary_key`，200 个不同 `data_hash`，`data_date` 范围为 `2022-12-26` 到 `2023-02-17`。
  - 同批次 `failed_request_log` 为 0 条；样本确认 `source_primary_key` 与 `raw_json.code` 一致。
  - `transfer_detail` 当前累计 raw 为 606 条、606 个不同调拨单号；checkpoint 指向批次 `sync_20260704_122721_709651`，记录 `param_offset=406`、`param_limit=200`、`next_param_offset=606`、`item_count=200`、`total_count=200`。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 185 个，真实配置 API 50 个，enabled 32 个。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，78 个测试全部通过。
- 当前结论：
  - `transfer_detail` 已完成 606/6499 个调拨单详情回填，连续三个 200 条中等窗口均成功，失败 0。
  - 本轮仍不启用 `transfer_detail`；原因是历史回填仍只覆盖约 9.3%，daily 增量边界仍需后续设计。
  - 下一阶段可继续复用 `next_param_offset=606` 推进下一批 200 条，或切到 `lot_no_detail` 做同等中等窗口验证。

## Stage 8B

- 阶段目标：继续推进完整拉取；不改 YAML，复用 `transfer_detail` 的 200 条中等窗口，把 checkpoint 从 606 推进到 806。
- 已完成：
  - 只读 DB 起点确认 `transfer_detail.enabled=0`、`config_json.enabled=false`、`param_source.limit=200`、`auto_advance=true`。
  - 起点 checkpoint 指向批次 `sync_20260704_122721_709651`，记录 `param_offset=406`、`param_limit=200`、`next_param_offset=606`、`item_count=200`、`total_count=200`。
  - 起点上游 `storage_inbound_page` 中 `opType=TFOutbound` 的不同调拨单号为 6499 个；`transfer_detail` 已有 606 条 raw、606 个不同主键。
  - `.\\.venv\\Scripts\\python.exe -m app.main`，通过，dry-run 仍显示 loaded 32 enabled API config(s)，说明本轮没有启用 `transfer_detail`。
  - 首次核验发现最新 `transfer_detail` 批次仍为 8A 批次，未误判为本轮结果；随后重新运行单接口同步。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api transfer_detail`，通过，批次 `sync_20260704_124032_403949`，请求 200 次，写入 200 条。
  - DB 核验显示该批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`，耗时 400 秒。
  - 同批次 `sync_api_log` 为 `status=success`、`request_count=200`、`success_count=200`、`failed_count=0`。
  - 同批次 `raw_api_data` 写入 200 条，200 个不同 `source_primary_key`，200 个不同 `data_hash`，`data_date` 范围为 `2023-02-17` 到 `2023-03-30`。
  - 同批次 `failed_request_log` 为 0 条；样本确认 `source_primary_key` 与 `raw_json.code` 一致。
  - `transfer_detail` 当前累计 raw 为 806 条、806 个不同调拨单号；checkpoint 指向批次 `sync_20260704_124032_403949`，记录 `param_offset=606`、`param_limit=200`、`next_param_offset=806`、`item_count=200`、`total_count=200`。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 185 个，真实配置 API 50 个，enabled 32 个。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，78 个测试全部通过。
- 当前结论：
  - `transfer_detail` 已完成 806/6499 个调拨单详情回填，连续四个 200 条中等窗口均成功，失败 0。
  - 本轮仍不启用 `transfer_detail`；原因是历史回填仍只覆盖约 12.4%，daily 增量边界仍需后续设计。
  - 下一阶段可继续复用 `next_param_offset=806` 推进下一批 200 条，或切到 `lot_no_detail` 做同等中等窗口验证；8C 完成后应复盘 8A-8C。

## Stage 8C

- 阶段目标：继续推进完整拉取；不改 YAML，复用 `transfer_detail` 的 200 条中等窗口，把 checkpoint 从 806 推进到 1006，并完成 8A-8C 三轮复盘。
- 已完成：
  - 只读 DB 起点确认 `api_config` 总配置 52 条、enabled 32 条；`transfer_detail.enabled=0`、`config_json.enabled=false`、`param_source.limit=200`、`auto_advance=true`。
  - 起点 checkpoint 指向批次 `sync_20260704_124032_403949`，记录 `param_offset=606`、`param_limit=200`、`next_param_offset=806`、`item_count=200`、`total_count=200`。
  - 起点上游 `storage_inbound_page` 中 `opType=TFOutbound` 的不同调拨单号为 6499 个；`transfer_detail` 已有 806 条 raw、806 个不同主键。
  - `.\\.venv\\Scripts\\python.exe -m app.main`，通过，dry-run 仍显示 loaded 32 enabled API config(s)，说明本轮没有启用 `transfer_detail`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api transfer_detail`，通过，批次 `sync_20260704_125350_565432`，请求 200 次，写入 200 条。
  - DB 核验显示该批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`，耗时 424 秒。
  - 同批次 `sync_api_log` 为 `status=success`、`request_count=200`、`success_count=200`、`failed_count=0`。
  - 同批次 `raw_api_data` 写入 200 条，200 个不同 `source_primary_key`，200 个不同 `data_hash`，`data_date` 范围为 `2023-03-30` 到 `2023-05-12`。
  - 同批次 `failed_request_log` 为 0 条；样本确认 `source_primary_key` 与 `raw_json.code` 一致。
  - `transfer_detail` 当前累计 raw 为 1006 条、1006 个不同调拨单号；checkpoint 指向批次 `sync_20260704_125350_565432`，记录 `param_offset=806`、`param_limit=200`、`next_param_offset=1006`、`item_count=200`、`total_count=200`。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 185 个，真实配置 API 50 个，enabled 32 个。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，78 个测试全部通过。
- 8A-8C 三轮复盘：
  - 8A 从 406 推进到 606，8B 从 606 推进到 806，8C 从 806 推进到 1006；三轮累计推进 600 个调拨单详情。
  - 三个 200 条窗口均为 200 请求、200 写入、0 失败，说明 `transfer_detail` 的参数来源、过滤条件、真实请求、raw 入库和 checkpoint 推进稳定。
  - 三轮耗时分别约 396 秒、400 秒、424 秒，200 请求窗口适合作为当前历史回填粒度。
  - `transfer_detail` 仍只覆盖 1006/6499，尚未完成历史回填；在 daily 增量边界重新设计前，不应直接加入 enabled。
- 当前结论：
  - `transfer_detail` 已完成 1006/6499 个调拨单详情回填，连续五个 200 条中等窗口均成功，失败 0。
  - 下一阶段可继续复用 `next_param_offset=1006` 推进下一批 200 条，或切到 `lot_no_detail` 做同等中等窗口验证。

## Stage 8D

- 阶段目标：继续推进完整拉取；不改 YAML，复用 `transfer_detail` 的 200 条中等窗口，把 checkpoint 从 1006 推进到 1206。
- 已完成：
  - 只读 DB 起点确认 `api_config` 总配置 52 条、enabled 32 条；`transfer_detail.enabled=0`、`config_json.enabled=false`、`param_source.limit=200`、`auto_advance=true`。
  - 起点 checkpoint 指向批次 `sync_20260704_125350_565432`，记录 `param_offset=806`、`param_limit=200`、`next_param_offset=1006`、`item_count=200`、`total_count=200`。
  - 起点上游 `storage_inbound_page` 中 `opType=TFOutbound` 的不同调拨单号为 6499 个；`transfer_detail` 已有 1006 条 raw、1006 个不同主键。
  - `.\\.venv\\Scripts\\python.exe -m app.main`，通过，dry-run 仍显示 loaded 32 enabled API config(s)，说明本轮没有启用 `transfer_detail`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api transfer_detail`，通过，批次 `sync_20260704_130749_645066`，请求 200 次，写入 200 条。
  - DB 核验显示该批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`，耗时 447 秒。
  - 同批次 `sync_api_log` 为 `status=success`、`request_count=200`、`success_count=200`、`failed_count=0`。
  - 同批次 `raw_api_data` 写入 200 条，200 个不同 `source_primary_key`，200 个不同 `data_hash`，`data_date` 范围为 `2023-05-17` 到 `2023-08-12`。
  - 同批次 `failed_request_log` 为 0 条；样本确认 `source_primary_key` 与 `raw_json.code` 一致。
  - `transfer_detail` 当前累计 raw 为 1206 条、1206 个不同调拨单号；checkpoint 指向批次 `sync_20260704_130749_645066`，记录 `param_offset=1006`、`param_limit=200`、`next_param_offset=1206`、`item_count=200`、`total_count=200`。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 185 个，真实配置 API 50 个，enabled 32 个。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，78 个测试全部通过。
- 当前结论：
  - `transfer_detail` 已完成 1206/6499 个调拨单详情回填，连续六个 200 条中等窗口均成功，失败 0。
  - 本轮仍不启用 `transfer_detail`；原因是历史回填仍只覆盖约 18.6%，daily 增量边界仍需后续设计。
  - 下一阶段可继续复用 `next_param_offset=1206` 推进下一批 200 条，或切到 `lot_no_detail` 做同等中等窗口验证。

## Stage 8E

- 阶段目标：继续推进完整拉取；不改 YAML，复用 `transfer_detail` 的 200 条中等窗口，把 checkpoint 从 1206 推进到 1406。
- 已完成：
  - 只读 DB 起点确认 `api_config` 总配置 52 条、enabled 32 条；`transfer_detail.enabled=0`、`config_json.enabled=false`、`param_source.limit=200`、`auto_advance=true`。
  - 起点 checkpoint 指向批次 `sync_20260704_130749_645066`，记录 `param_offset=1006`、`param_limit=200`、`next_param_offset=1206`、`item_count=200`、`total_count=200`。
  - 起点上游 `storage_inbound_page` 中 `opType=TFOutbound` 的不同调拨单号为 6499 个；`transfer_detail` 已有 1206 条 raw、1206 个不同主键。
  - `.\\.venv\\Scripts\\python.exe -m app.main`，通过，dry-run 仍显示 loaded 32 enabled API config(s)，说明本轮没有启用 `transfer_detail`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api transfer_detail`，通过，批次 `sync_20260704_132121_442510`，请求 200 次，写入 200 条。
  - DB 核验显示该批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`，耗时 384 秒。
  - 同批次 `sync_api_log` 为 `status=success`、`request_count=200`、`success_count=200`、`failed_count=0`。
  - 同批次 `raw_api_data` 写入 200 条，200 个不同 `source_primary_key`，200 个不同 `data_hash`，`data_date` 范围为 `2023-08-12` 到 `2023-10-17`。
  - 同批次 `failed_request_log` 为 0 条；样本确认 `source_primary_key` 与 `raw_json.code` 一致。
  - `transfer_detail` 当前累计 raw 为 1406 条、1406 个不同调拨单号；checkpoint 指向批次 `sync_20260704_132121_442510`，记录 `param_offset=1206`、`param_limit=200`、`next_param_offset=1406`、`item_count=200`、`total_count=200`。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 185 个，真实配置 API 50 个，enabled 32 个。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，78 个测试全部通过。
- 当前结论：
  - `transfer_detail` 已完成 1406/6499 个调拨单详情回填，连续七个 200 条中等窗口均成功，失败 0。
  - 本轮仍不启用 `transfer_detail`；原因是历史回填仍只覆盖约 21.6%，daily 增量边界仍需后续设计。
  - 下一阶段可继续复用 `next_param_offset=1406` 推进下一批 200 条，或切到 `lot_no_detail` 做同等中等窗口验证；8F 完成后应复盘 8D-8F。

## Stage 8F

- 阶段目标：继续推进完整拉取；不改 YAML，复用 `transfer_detail` 的 200 条中等窗口，把 checkpoint 从 1406 推进到 1606，并完成 8D-8F 三轮复盘。
- 已完成：
  - 只读 DB 起点确认 `api_config` 总配置 52 条、enabled 32 条；`transfer_detail.enabled=0`、`config_json.enabled=false`、`param_source.limit=200`、`auto_advance=true`。
  - 起点 checkpoint 指向批次 `sync_20260704_132121_442510`，记录 `param_offset=1206`、`param_limit=200`、`next_param_offset=1406`、`item_count=200`、`total_count=200`。
  - 起点上游 `storage_inbound_page` 中 `opType=TFOutbound` 的不同调拨单号为 6499 个；`transfer_detail` 已有 1406 条 raw、1406 个不同主键。
  - `.\\.venv\\Scripts\\python.exe -m app.main`，通过，dry-run 仍显示 loaded 32 enabled API config(s)，说明本轮没有启用 `transfer_detail`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api transfer_detail`，通过，批次 `sync_20260704_133340_001052`，请求 200 次，写入 200 条。
  - DB 核验显示该批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`，耗时 374 秒。
  - 同批次 `sync_api_log` 为 `status=success`、`request_count=200`、`success_count=200`、`failed_count=0`。
  - 同批次 `raw_api_data` 写入 200 条，200 个不同 `source_primary_key`，200 个不同 `data_hash`，`data_date` 范围为 `2023-10-17` 到 `2023-11-27`。
  - 同批次 `failed_request_log` 为 0 条；样本确认 `source_primary_key` 与 `raw_json.code` 一致。
  - `transfer_detail` 当前累计 raw 为 1606 条、1606 个不同调拨单号；checkpoint 指向批次 `sync_20260704_133340_001052`，记录 `param_offset=1406`、`param_limit=200`、`next_param_offset=1606`、`item_count=200`、`total_count=200`。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 185 个，真实配置 API 50 个，enabled 32 个。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，78 个测试全部通过。
- 8D-8F 三轮复盘：
  - 8D 从 1006 推进到 1206，8E 从 1206 推进到 1406，8F 从 1406 推进到 1606；三轮累计推进 600 个调拨单详情。
  - 三个 200 条窗口均为 200 请求、200 写入、0 失败，说明 `transfer_detail` 的中等窗口回填仍稳定。
  - 三轮耗时分别约 447 秒、384 秒、374 秒，当前窗口粒度没有暴露新的限流或写入瓶颈。
  - `transfer_detail` 当前覆盖 1606/6499，仍未完成历史回填；进入 daily enabled 前仍需要完成更多历史覆盖并重新设计 daily 增量边界。
- 当前结论：
  - `transfer_detail` 已完成 1606/6499 个调拨单详情回填，连续八个 200 条中等窗口均成功，失败 0。
  - 下一阶段可继续复用 `next_param_offset=1606` 推进下一批 200 条，或切到 `lot_no_detail` 做同等中等窗口验证。

## Stage 8G

- 阶段目标：继续推进完整拉取；不改 YAML，复用 `transfer_detail` 的 200 条中等窗口，把 checkpoint 从 1606 推进到 1806。
- 已完成：
  - 只读 DB 起点确认 `api_config` 总配置 52 条、enabled 32 条；`transfer_detail.enabled=0`、`config_json.enabled=false`、`param_source.limit=200`、`auto_advance=true`。
  - 起点 checkpoint 指向批次 `sync_20260704_133340_001052`，记录 `next_param_offset=1606`；起点 `transfer_detail` 已有 1606 条 raw、1606 个不同主键。
  - 起点上游 `storage_inbound_page` 中 `opType=TFOutbound` 的不同调拨单号为 6499 个。
  - `.\\.venv\\Scripts\\python.exe -m app.main`，通过，dry-run 仍显示 loaded 32 enabled API config(s)，说明本轮没有启用 `transfer_detail`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api transfer_detail`，通过，批次 `sync_20260704_134721_866083`，请求 200 次，写入 200 条。
  - DB 核验显示该批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`，耗时 391 秒。
  - 同批次 `sync_api_log` 为 `status=success`、`request_count=200`、`success_count=200`、`failed_count=0`。
  - 同批次 raw 为 200 条，200 个不同 `source_primary_key`，200 个不同 `data_hash`，`data_date` 范围为 `2023-11-27` 到 `2024-01-12`；样本确认 `source_primary_key` 与 `raw_json.code` 一致。
  - 同批次 `failed_request_log` 为 0 条。
  - `transfer_detail` 当前累计 raw 为 1806 条、1806 个不同调拨单号；checkpoint 指向批次 `sync_20260704_134721_866083`，记录 `param_offset=1606`、`param_limit=200`、`next_param_offset=1806`、`item_count=200`、`total_count=200`。
  - 覆盖矩阵刷新仍为公开文档 API 185 个、真实配置 API 50 个、enabled 32 个；执行分层摘要为 `configured=50`、`needs_upstream_params=63`、`needs_sensitive_review=22`、`defer_or_review=50`。
  - 已运行 `.\\.venv\\Scripts\\python.exe -m compileall app tests` 和 `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，78 个测试通过。
- 结论：
  - `transfer_detail` 已完成 1806/6499 个调拨单详情回填，连续九个 200 条中等窗口均成功，失败 0。
  - 本轮仍不启用 `transfer_detail`；原因是历史回填仍只覆盖约 27.8%，daily 增量边界仍需后续设计。
  - 下一阶段可继续复用 `next_param_offset=1806` 推进下一批 200 条，或切到 `lot_no_detail` 做同等中等窗口验证；8G-8I 三轮完成后需要复盘。

## Stage 8H

- 阶段目标：继续推进完整拉取；不改 YAML，复用 `transfer_detail` 的 200 条中等窗口，把 checkpoint 从 1806 推进到 2006。
- 已完成：
  - 只读 DB 起点确认 `api_config` 总配置 52 条、enabled 32 条；`transfer_detail.enabled=0`、`config_json.enabled=false`、`param_source.limit=200`、`auto_advance=true`。
  - 起点 checkpoint 指向批次 `sync_20260704_134721_866083`，记录 `param_offset=1606`、`param_limit=200`、`next_param_offset=1806`、`item_count=200`、`total_count=200`。
  - 起点上游 `storage_inbound_page` 中 `opType=TFOutbound` 的不同调拨单号为 6499 个；`transfer_detail` 已有 1806 条 raw、1806 个不同主键。
  - `.\\.venv\\Scripts\\python.exe -m app.main`，通过，dry-run 仍显示 loaded 32 enabled API config(s)，说明本轮没有启用 `transfer_detail`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api transfer_detail`，通过，批次 `sync_20260704_135959_959711`，请求 200 次，写入 200 条。
  - DB 核验显示该批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`，耗时 463 秒。
  - 同批次 `sync_api_log` 为 `status=success`、`request_count=200`、`success_count=200`、`failed_count=0`。
  - 同批次 raw 为 200 条，200 个不同 `source_primary_key`，200 个不同 `data_hash`，`data_date` 范围为 `2024-01-12` 到 `2024-02-26`；样本确认 `source_primary_key` 与 `raw_json.code` 一致。
  - 同批次 `failed_request_log` 为 0 条。
  - `transfer_detail` 当前累计 raw 为 2006 条、2006 个不同调拨单号；checkpoint 指向批次 `sync_20260704_135959_959711`，记录 `param_offset=1806`、`param_limit=200`、`next_param_offset=2006`、`item_count=200`、`total_count=200`。
  - 覆盖矩阵刷新仍为公开文档 API 185 个、真实配置 API 50 个、enabled 32 个；执行分层摘要为 `configured=50`、`needs_upstream_params=63`、`needs_sensitive_review=22`、`defer_or_review=50`。
  - 已运行 `.\\.venv\\Scripts\\python.exe -m compileall app tests` 和 `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，78 个测试通过。
- 结论：
  - `transfer_detail` 已完成 2006/6499 个调拨单详情回填，连续十个 200 条中等窗口均成功，失败 0。
  - 本轮仍不启用 `transfer_detail`；原因是历史回填仍只覆盖约 30.9%，daily 增量边界仍需后续设计。
  - 下一阶段可继续复用 `next_param_offset=2006` 推进下一批 200 条，或切到 `lot_no_detail` 做同等中等窗口验证；8I 完成后需要复盘 8G-8I。

## Stage 8I

- 阶段目标：继续推进完整拉取；不改 YAML，复用 `transfer_detail` 的 200 条中等窗口，把 checkpoint 从 2006 推进到 2206，并完成 8G-8I 三轮复盘。
- 已完成：
  - 只读 DB 起点确认 `api_config` 总配置 52 条、enabled 32 条；`transfer_detail.enabled=0`、`config_json.enabled=false`、`param_source.limit=200`、`auto_advance=true`。
  - 起点 checkpoint 指向批次 `sync_20260704_135959_959711`，记录 `param_offset=1806`、`param_limit=200`、`next_param_offset=2006`、`item_count=200`、`total_count=200`。
  - 起点上游 `storage_inbound_page` 中 `opType=TFOutbound` 的不同调拨单号为 6499 个；`transfer_detail` 已有 2006 条 raw、2006 个不同主键。
  - `.\\.venv\\Scripts\\python.exe -m app.main`，通过，dry-run 仍显示 loaded 32 enabled API config(s)，说明本轮没有启用 `transfer_detail`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api transfer_detail`，通过，批次 `sync_20260704_141408_538510`，请求 200 次，写入 200 条。
  - DB 核验显示该批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`，耗时 403 秒。
  - 同批次 `sync_api_log` 为 `status=success`、`request_count=200`、`success_count=200`、`failed_count=0`。
  - 同批次 raw 为 200 条，200 个不同 `source_primary_key`，200 个不同 `data_hash`，`data_date` 范围为 `2024-02-26` 到 `2024-04-15`；样本确认 `source_primary_key` 与 `raw_json.code` 一致。
  - 同批次 `failed_request_log` 为 0 条。
  - `transfer_detail` 当前累计 raw 为 2206 条、2206 个不同调拨单号；checkpoint 指向批次 `sync_20260704_141408_538510`，记录 `param_offset=2006`、`param_limit=200`、`next_param_offset=2206`、`item_count=200`、`total_count=200`。
  - 覆盖矩阵刷新仍为公开文档 API 185 个、真实配置 API 50 个、enabled 32 个；执行分层摘要为 `configured=50`、`needs_upstream_params=63`、`needs_sensitive_review=22`、`defer_or_review=50`。
  - 已运行 `.\\.venv\\Scripts\\python.exe -m compileall app tests` 和 `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，78 个测试通过。
- 8G-8I 三轮复盘：
  - 8G 从 1606 推进到 1806，8H 从 1806 推进到 2006，8I 从 2006 推进到 2206；三轮累计推进 600 个调拨单详情。
  - 三个 200 条窗口均为 200 请求、200 写入、0 失败，说明 `transfer_detail` 的参数来源、固定过滤、真实请求、raw 入库和 checkpoint 推进仍稳定。
  - 三轮耗时分别约 391 秒、463 秒、403 秒，仍处在可接受的中等窗口范围内。
  - `transfer_detail` 当前覆盖 2206/6499，仍未完成历史回填；进入 daily enabled 前仍需要继续补历史并重新设计 daily 增量边界。
- 当前结论：
  - `transfer_detail` 已完成 2206/6499 个调拨单详情回填，连续十一个 200 条中等窗口均成功，失败 0。
  - 下一阶段可继续复用 `next_param_offset=2206` 推进下一批 200 条，或切到 `lot_no_detail` 做同等中等窗口验证。

## Stage 8J

- 阶段目标：继续推进完整拉取；不改 YAML，复用 `transfer_detail` 的 200 条中等窗口，把 checkpoint 从 2206 推进到 2406。
- 已完成：
  - 只读 DB 起点确认 `api_config` 总配置 52 条、enabled 32 条；`transfer_detail.enabled=0`、`config_json.enabled=false`、`param_source.limit=200`、`auto_advance=true`。
  - 起点 checkpoint 指向批次 `sync_20260704_141408_538510`，记录 `param_offset=2006`、`param_limit=200`、`next_param_offset=2206`、`item_count=200`、`total_count=200`。
  - 起点上游 `storage_inbound_page` 中 `opType=TFOutbound` 的不同调拨单号为 6499 个；`transfer_detail` 已有 2206 条 raw、2206 个不同主键。
  - `.\\.venv\\Scripts\\python.exe -m app.main`，通过，dry-run 仍显示 loaded 32 enabled API config(s)，说明本轮没有启用 `transfer_detail`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api transfer_detail`，通过，批次 `sync_20260704_142737_979252`，请求 200 次，写入 200 条。
  - DB 核验显示该批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`，耗时 408 秒。
  - 同批次 `sync_api_log` 为 `status=success`、`request_count=200`、`success_count=200`、`failed_count=0`。
  - 同批次 raw 为 200 条，200 个不同 `source_primary_key`，200 个不同 `data_hash`，`data_date` 范围为 `2024-04-15` 到 `2024-05-22`；样本确认 `source_primary_key` 与 `raw_json.code` 一致。
  - 同批次 `failed_request_log` 为 0 条。
  - `transfer_detail` 当前累计 raw 为 2406 条、2406 个不同调拨单号；checkpoint 指向批次 `sync_20260704_142737_979252`，记录 `param_offset=2206`、`param_limit=200`、`next_param_offset=2406`、`item_count=200`、`total_count=200`。
  - 覆盖矩阵刷新仍为公开文档 API 185 个、真实配置 API 50 个、enabled 32 个；执行分层摘要为 `configured=50`、`needs_upstream_params=63`、`needs_sensitive_review=22`、`defer_or_review=50`。
  - 已运行 `.\\.venv\\Scripts\\python.exe -m compileall app tests` 和 `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，78 个测试通过。
- 结论：
  - `transfer_detail` 已完成 2406/6499 个调拨单详情回填，连续十二个 200 条中等窗口均成功，失败 0。
  - 本轮仍不启用 `transfer_detail`；原因是历史回填仍只覆盖约 37.0%，daily 增量边界仍需后续设计。
  - 下一阶段可继续复用 `next_param_offset=2406` 推进下一批 200 条，或切到 `lot_no_detail` 做同等中等窗口验证；8K-8M 三轮完成后需要复盘。

## Stage 8K

- 阶段目标：继续推进完整拉取；不改 YAML，复用 `transfer_detail` 的 200 条中等窗口，把 checkpoint 从 2406 推进到 2606。
- 已完成：
  - 只读 DB 起点确认 `api_config` 总配置 52 条、enabled 32 条；`transfer_detail.enabled=0`、`config_json.enabled=false`、`param_source.limit=200`、`auto_advance=true`。
  - 起点 checkpoint 指向批次 `sync_20260704_142737_979252`，记录 `param_offset=2206`、`param_limit=200`、`next_param_offset=2406`、`item_count=200`、`total_count=200`。
  - 起点上游 `storage_inbound_page` 中 `opType=TFOutbound` 的不同调拨单号为 6499 个；`transfer_detail` 已有 2406 条 raw、2406 个不同主键。
  - `.\\.venv\\Scripts\\python.exe -m app.main`，通过，dry-run 仍显示 loaded 32 enabled API config(s)，说明本轮没有启用 `transfer_detail`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api transfer_detail`，通过，批次 `sync_20260704_144300_355669`，请求 200 次，写入 200 条。
  - DB 核验显示该批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`，耗时 398 秒。
  - 同批次 `sync_api_log` 为 `status=success`、`request_count=200`、`success_count=200`、`failed_count=0`。
  - 同批次 raw 为 200 条，200 个不同 `source_primary_key`，200 个不同 `data_hash`，`data_date` 范围为 `2024-05-23` 到 `2024-06-21`；样本确认 `source_primary_key` 与 `raw_json.code` 一致。
  - 同批次 `failed_request_log` 为 0 条。
  - `transfer_detail` 当前累计 raw 为 2606 条、2606 个不同调拨单号；checkpoint 指向批次 `sync_20260704_144300_355669`，记录 `param_offset=2406`、`param_limit=200`、`next_param_offset=2606`、`item_count=200`、`total_count=200`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，DB 同步 API 配置 52 条。
  - 覆盖矩阵刷新仍为公开文档 API 185 个、真实配置 API 50 个、enabled 32 个；执行分层摘要为 `configured=50`、`needs_upstream_params=63`、`needs_sensitive_review=22`、`defer_or_review=50`。
  - 已运行 `.\\.venv\\Scripts\\python.exe -m compileall app tests` 和 `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，78 个测试通过。
- 结论：
  - `transfer_detail` 已完成 2606/6499 个调拨单详情回填，连续十三个 200 条中等窗口均成功，失败 0。
  - 本轮仍不启用 `transfer_detail`；原因是历史回填仍只覆盖约 40.1%，daily 增量边界仍需后续设计。
  - 下一阶段可继续复用 `next_param_offset=2606` 推进下一批 200 条，或切到 `lot_no_detail` 做同等中等窗口验证；8K-8M 三轮完成后需要复盘。

## Stage 8L

- 阶段目标：继续推进完整拉取；不改 YAML，复用 `transfer_detail` 的 200 条中等窗口，把 checkpoint 从 2606 推进到 2806。
- 已完成：
  - 只读 DB 起点确认 `api_config` 总配置 52 条、enabled 32 条；`transfer_detail.enabled=0`、`config_json.enabled=false`、`param_source.limit=200`、`auto_advance=true`。
  - 起点 checkpoint 指向批次 `sync_20260704_144300_355669`，记录 `param_offset=2406`、`param_limit=200`、`next_param_offset=2606`、`item_count=200`、`total_count=200`。
  - 起点上游 `storage_inbound_page` 中 `opType=TFOutbound` 的不同调拨单号为 6499 个；`transfer_detail` 已有 2606 条 raw、2606 个不同主键。
  - `.\\.venv\\Scripts\\python.exe -m app.main`，通过，dry-run 仍显示 loaded 32 enabled API config(s)，说明本轮没有启用 `transfer_detail`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api transfer_detail`，通过，批次 `sync_20260704_145547_307944`，请求 200 次，写入 200 条。
  - DB 核验显示该批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`，耗时 430 秒。
  - 同批次 `sync_api_log` 为 `status=success`、`request_count=200`、`success_count=200`、`failed_count=0`。
  - 同批次 raw 为 200 条，200 个不同 `source_primary_key`，200 个不同 `data_hash`，`data_date` 范围为 `2024-06-24` 到 `2024-08-07`；样本确认 `source_primary_key` 与 `raw_json.code` 一致。
  - 同批次 `failed_request_log` 为 0 条。
  - `transfer_detail` 当前累计 raw 为 2806 条、2806 个不同调拨单号；checkpoint 指向批次 `sync_20260704_145547_307944`，记录 `param_offset=2606`、`param_limit=200`、`next_param_offset=2806`、`item_count=200`、`total_count=200`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，DB 同步 API 配置 52 条。
  - 覆盖矩阵刷新仍为公开文档 API 185 个、真实配置 API 50 个、enabled 32 个；执行分层摘要为 `configured=50`、`needs_upstream_params=63`、`needs_sensitive_review=22`、`defer_or_review=50`。
  - 已运行 `.\\.venv\\Scripts\\python.exe -m compileall app tests` 和 `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，78 个测试通过。
- 结论：
  - `transfer_detail` 已完成 2806/6499 个调拨单详情回填，连续十四个 200 条中等窗口均成功，失败 0。
  - 本轮仍不启用 `transfer_detail`；原因是历史回填仍只覆盖约 43.2%，daily 增量边界仍需后续设计。
  - 下一阶段可继续复用 `next_param_offset=2806` 推进下一批 200 条，或切到 `lot_no_detail` 做同等中等窗口验证；8M 完成后需要复盘 8K-8M。

## Stage 8M

- 阶段目标：继续推进完整拉取；不改 YAML，复用 `transfer_detail` 的 200 条中等窗口，把 checkpoint 从 2806 推进到 3006，并完成 8K-8M 三轮复盘。
- 已完成：
  - 只读 DB 起点确认 `api_config` 总配置 52 条、enabled 32 条；`transfer_detail.enabled=0`、`config_json.enabled=false`、`param_source.limit=200`、`auto_advance=true`。
  - 起点 checkpoint 指向批次 `sync_20260704_145547_307944`，记录 `param_offset=2606`、`param_limit=200`、`next_param_offset=2806`、`item_count=200`、`total_count=200`。
  - 起点上游 `storage_inbound_page` 中 `opType=TFOutbound` 的不同调拨单号为 6499 个；`transfer_detail` 已有 2806 条 raw、2806 个不同主键。
  - `.\\.venv\\Scripts\\python.exe -m app.main`，通过，dry-run 仍显示 loaded 32 enabled API config(s)，说明本轮没有启用 `transfer_detail`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api transfer_detail`，通过，批次 `sync_20260704_151048_289646`，请求 200 次，写入 200 条。
  - DB 核验显示该批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`，耗时 461 秒。
  - 同批次 `sync_api_log` 为 `status=success`、`request_count=200`、`success_count=200`、`failed_count=0`。
  - 同批次 raw 为 200 条，200 个不同 `source_primary_key`，200 个不同 `data_hash`，`data_date` 范围为 `2024-08-07` 到 `2024-09-14`；样本确认 `source_primary_key` 与 `raw_json.code` 一致。
  - 同批次 `failed_request_log` 为 0 条。
  - `transfer_detail` 当前累计 raw 为 3006 条、3006 个不同调拨单号；checkpoint 指向批次 `sync_20260704_151048_289646`，记录 `param_offset=2806`、`param_limit=200`、`next_param_offset=3006`、`item_count=200`、`total_count=200`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，DB 同步 API 配置 52 条。
  - 覆盖矩阵刷新仍为公开文档 API 185 个、真实配置 API 50 个、enabled 32 个；执行分层摘要为 `configured=50`、`needs_upstream_params=63`、`needs_sensitive_review=22`、`defer_or_review=50`。
  - 已运行 `.\\.venv\\Scripts\\python.exe -m compileall app tests` 和 `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，78 个测试通过。
- 8K-8M 三轮复盘：
  - 8K 从 2406 推进到 2606，8L 从 2606 推进到 2806，8M 从 2806 推进到 3006；三轮累计推进 600 个调拨单详情。
  - 三个 200 条窗口均为 200 请求、200 写入、0 失败，说明 `transfer_detail` 的参数来源、固定过滤、真实请求、raw 入库和 checkpoint 推进仍稳定。
  - 三轮耗时分别约 398 秒、430 秒、461 秒，仍处在可接受的中等窗口范围内。
  - `transfer_detail` 当前覆盖 3006/6499，仍未完成历史回填；进入 daily enabled 前仍需要继续补历史并重新设计 daily 增量边界。
- 当前结论：
  - `transfer_detail` 已完成 3006/6499 个调拨单详情回填，连续十五个 200 条中等窗口均成功，失败 0。
  - 下一阶段可继续复用 `next_param_offset=3006` 推进下一批 200 条，或切到 `lot_no_detail` 做同等中等窗口验证。

## Stage 8N

- 阶段目标：继续推进完整拉取；不改 YAML，复用 `transfer_detail` 的 200 条中等窗口，把 checkpoint 从 3006 推进到 3206。
- 已完成：
  - 只读 DB 起点确认 `api_config` 总配置 52 条、enabled 32 条；`transfer_detail.enabled=0`、`config_json.enabled=false`、`param_source.limit=200`、`auto_advance=true`。
  - 起点 checkpoint 指向批次 `sync_20260704_151048_289646`，记录 `param_offset=2806`、`param_limit=200`、`next_param_offset=3006`、`item_count=200`、`total_count=200`。
  - 起点上游 `storage_inbound_page` 中 `opType=TFOutbound` 的不同调拨单号为 6499 个；`transfer_detail` 已有 3006 条 raw、3006 个不同主键。
  - `.\\.venv\\Scripts\\python.exe -m app.main`，通过，dry-run 仍显示 loaded 32 enabled API config(s)，说明本轮没有启用 `transfer_detail`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api transfer_detail`，通过，批次 `sync_20260704_152532_109853`，请求 200 次，写入 200 条。
  - DB 核验显示该批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`，耗时 371 秒。
  - 同批次 `sync_api_log` 为 `status=success`、`request_count=200`、`success_count=200`、`failed_count=0`。
  - 同批次 raw 为 200 条，200 个不同 `source_primary_key`，200 个不同 `data_hash`，`data_date` 范围为 `2024-09-14` 到 `2024-10-25`；样本确认 `source_primary_key` 与 `raw_json.code` 一致。
  - 同批次 `failed_request_log` 为 0 条。
  - `transfer_detail` 当前累计 raw 为 3206 条、3206 个不同调拨单号；checkpoint 指向批次 `sync_20260704_152532_109853`，记录 `param_offset=3006`、`param_limit=200`、`next_param_offset=3206`、`item_count=200`、`total_count=200`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，DB 同步 API 配置 52 条。
  - 覆盖矩阵刷新仍为公开文档 API 185 个、真实配置 API 50 个、enabled 32 个；执行分层摘要为 `configured=50`、`needs_upstream_params=63`、`needs_sensitive_review=22`、`defer_or_review=50`。
  - 已运行 `.\\.venv\\Scripts\\python.exe -m compileall app tests` 和 `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，78 个测试通过。
- 结论：
  - `transfer_detail` 已完成 3206/6499 个调拨单详情回填，连续十六个 200 条中等窗口均成功，失败 0。
  - 本轮仍不启用 `transfer_detail`；原因是历史回填仍只覆盖约 49.3%，daily 增量边界仍需后续设计。
  - 下一阶段可继续复用 `next_param_offset=3206` 推进下一批 200 条，或切到 `lot_no_detail` 做同等中等窗口验证；8N-8P 三轮完成后需要复盘。

## Stage 8O

- 阶段目标：继续推进完整拉取；不改 YAML，复用 `transfer_detail` 的 200 条中等窗口，把 checkpoint 从 3206 推进到 3406。
- 已完成：
  - 只读 DB 起点确认 `api_config` 总配置 52 条、enabled 32 条；`transfer_detail.enabled=0`、`config_json.enabled=false`、`param_source.limit=200`、`auto_advance=true`。
  - 起点 checkpoint 指向批次 `sync_20260704_152532_109853`，记录 `param_offset=3006`、`param_limit=200`、`next_param_offset=3206`、`item_count=200`、`total_count=200`。
  - 起点上游 `storage_inbound_page` 中 `opType=TFOutbound` 的不同调拨单号为 6499 个；`transfer_detail` 已有 3206 条 raw、3206 个不同主键。
  - `.\\.venv\\Scripts\\python.exe -m app.main`，通过，dry-run 仍显示 loaded 32 enabled API config(s)，说明本轮没有启用 `transfer_detail`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api transfer_detail`，通过，批次 `sync_20260704_153742_490230`，请求 200 次，写入 200 条。
  - DB 核验显示该批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`，耗时 363 秒。
  - 同批次 `sync_api_log` 为 `status=success`、`request_count=200`、`success_count=200`、`failed_count=0`。
  - 同批次 raw 为 200 条，200 个不同 `source_primary_key`，200 个不同 `data_hash`，`data_date` 范围为 `2024-10-25` 到 `2024-11-22`；样本确认 `source_primary_key` 与 `raw_json.code` 一致。
  - 同批次 `failed_request_log` 为 0 条。
  - `transfer_detail` 当前累计 raw 为 3406 条、3406 个不同调拨单号；checkpoint 指向批次 `sync_20260704_153742_490230`，记录 `param_offset=3206`、`param_limit=200`、`next_param_offset=3406`、`item_count=200`、`total_count=200`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，DB 同步 API 配置 52 条。
  - 覆盖矩阵刷新仍为公开文档 API 185 个、真实配置 API 50 个、enabled 32 个；执行分层摘要为 `configured=50`、`needs_upstream_params=63`、`needs_sensitive_review=22`、`defer_or_review=50`。
  - 已运行 `.\\.venv\\Scripts\\python.exe -m compileall app tests` 和 `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，78 个测试通过。
- 结论：
  - `transfer_detail` 已完成 3406/6499 个调拨单详情回填，连续十七个 200 条中等窗口均成功，失败 0。
  - 本轮仍不启用 `transfer_detail`；原因是历史回填仍只覆盖约 52.4%，daily 增量边界仍需后续设计。
  - 下一阶段可继续复用 `next_param_offset=3406` 推进下一批 200 条，或切到 `lot_no_detail` 做同等中等窗口验证；8P 完成后需要复盘 8N-8P。

## Stage 8P

- 阶段目标：继续推进完整拉取；不改 YAML，复用 `transfer_detail` 的 200 条中等窗口，把 checkpoint 从 3406 推进到 3606，并完成 8N-8P 三轮复盘。
- 已完成：
  - 只读 DB 起点确认 `api_config` 总配置 52 条、enabled 32 条；`transfer_detail.enabled=0`、`config_json.enabled=false`、`param_source.limit=200`、`auto_advance=true`。
  - 起点 checkpoint 指向批次 `sync_20260704_153742_490230`，记录 `param_offset=3206`、`param_limit=200`、`next_param_offset=3406`、`item_count=200`、`total_count=200`。
  - 起点上游 `storage_inbound_page` 中 `opType=TFOutbound` 的不同调拨单号为 6499 个；`transfer_detail` 已有 3406 条 raw、3406 个不同主键。
  - `.\\.venv\\Scripts\\python.exe -m app.main`，通过，dry-run 仍显示 loaded 32 enabled API config(s)，说明本轮没有启用 `transfer_detail`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api transfer_detail`，通过，批次 `sync_20260704_154930_402868`，请求 200 次，写入 200 条。
  - DB 核验显示该批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`，耗时 367 秒。
  - 同批次 `sync_api_log` 为 `status=success`、`request_count=200`、`success_count=200`、`failed_count=0`。
  - 同批次 raw 为 200 条，200 个不同 `source_primary_key`，200 个不同 `data_hash`，`data_date` 范围为 `2024-11-22` 到 `2024-12-20`；样本确认 `source_primary_key` 与 `raw_json.code` 一致。
  - 同批次 `failed_request_log` 为 0 条。
  - `transfer_detail` 当前累计 raw 为 3606 条、3606 个不同调拨单号；checkpoint 指向批次 `sync_20260704_154930_402868`，记录 `param_offset=3406`、`param_limit=200`、`next_param_offset=3606`、`item_count=200`、`total_count=200`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，DB 同步 API 配置 52 条。
  - 覆盖矩阵刷新仍为公开文档 API 185 个、真实配置 API 50 个、enabled 32 个；执行分层摘要为 `configured=50`、`needs_upstream_params=63`、`needs_sensitive_review=22`、`defer_or_review=50`。
  - 已运行 `.\\.venv\\Scripts\\python.exe -m compileall app tests` 和 `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，78 个测试通过。
- 8N-8P 三轮复盘：
  - 8N 从 3006 推进到 3206，8O 从 3206 推进到 3406，8P 从 3406 推进到 3606；三轮累计推进 600 个调拨单详情。
  - 三个 200 条窗口均为 200 请求、200 写入、0 失败，说明 `transfer_detail` 的参数来源、固定过滤、真实请求、raw 入库和 checkpoint 推进仍稳定。
  - 三轮耗时分别约 371 秒、363 秒、367 秒，窗口耗时比 8K-8M 更稳定，仍适合继续分批回填。
  - `transfer_detail` 当前覆盖 3606/6499，仍未完成历史回填；进入 daily enabled 前仍需要继续补历史并重新设计 daily 增量边界。
- 当前结论：
  - `transfer_detail` 已完成 3606/6499 个调拨单详情回填，连续十八个 200 条中等窗口均成功，失败 0。
  - 下一阶段可继续复用 `next_param_offset=3606` 推进下一批 200 条，或切到 `lot_no_detail` 做同等中等窗口验证。

## Stage 8Q

- 阶段目标：继续推进完整拉取；不改 YAML，复用 `transfer_detail` 的 200 条中等窗口，把 checkpoint 从 3606 推进到 3806。
- 已完成：
  - 只读 DB 起点确认 `api_config` 总配置 52 条、enabled 32 条；`transfer_detail.enabled=0`、`config_json.enabled=false`、`param_source.limit=200`、`auto_advance=true`。
  - 起点 checkpoint 指向批次 `sync_20260704_154930_402868`，记录 `param_offset=3406`、`param_limit=200`、`next_param_offset=3606`、`item_count=200`、`total_count=200`。
  - 起点上游 `storage_inbound_page` 中 `opType=TFOutbound` 的不同调拨单号为 6499 个；`transfer_detail` 已有 3606 条 raw、3606 个不同主键。
  - `.\\.venv\\Scripts\\python.exe -m app.main`，通过，dry-run 仍显示 loaded 32 enabled API config(s)，说明本轮没有启用 `transfer_detail`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api transfer_detail`，通过，批次 `sync_20260704_160143_245707`，请求 200 次，写入 200 条。
  - DB 核验显示该批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`，耗时 458 秒。
  - 同批次 `sync_api_log` 为 `status=success`、`request_count=200`、`success_count=200`、`failed_count=0`。
  - 同批次 raw 为 200 条，200 个不同 `source_primary_key`，200 个不同 `data_hash`，`data_date` 范围为 `2024-12-20` 到 `2025-01-24`；样本确认 `source_primary_key` 与 `raw_json.code` 一致。
  - 同批次 `failed_request_log` 为 0 条。
  - `transfer_detail` 当前累计 raw 为 3806 条、3806 个不同调拨单号；checkpoint 指向批次 `sync_20260704_160143_245707`，记录 `param_offset=3606`、`param_limit=200`、`next_param_offset=3806`、`item_count=200`、`total_count=200`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，DB 同步 API 配置 52 条。
  - 覆盖矩阵刷新仍为公开文档 API 185 个、真实配置 API 50 个、enabled 32 个；执行分层摘要为 `configured=50`、`needs_upstream_params=63`、`needs_sensitive_review=22`、`defer_or_review=50`。
  - 已运行 `.\\.venv\\Scripts\\python.exe -m compileall app tests` 和 `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，78 个测试通过。
- 结论：
  - `transfer_detail` 已完成 3806/6499 个调拨单详情回填，连续十九个 200 条中等窗口均成功，失败 0。
  - 本轮仍不启用 `transfer_detail`；原因是历史回填仍只覆盖约 58.6%，daily 增量边界仍需后续设计。
  - 下一阶段可继续复用 `next_param_offset=3806` 推进下一批 200 条，或切到 `lot_no_detail` 做同等中等窗口验证；8Q-8S 三轮完成后需要复盘。

## Stage 8R

- 阶段目标：继续推进完整拉取；不改 YAML，复用 `transfer_detail` 的 200 条中等窗口，把 checkpoint 从 3806 推进到 4006。
- 已完成：
  - 只读 DB 起点确认 `api_config` 总配置 52 条、enabled 32 条；`transfer_detail.enabled=0`、`config_json.enabled=false`、`param_source.limit=200`、`auto_advance=true`。
  - 起点 checkpoint 指向批次 `sync_20260704_160143_245707`，记录 `param_offset=3606`、`param_limit=200`、`next_param_offset=3806`、`item_count=200`、`total_count=200`。
  - 起点上游 `storage_inbound_page` 中 `opType=TFOutbound` 的不同调拨单号为 6499 个；`transfer_detail` 已有 3806 条 raw、3806 个不同主键。
  - `.\\.venv\\Scripts\\python.exe -m app.main`，通过，dry-run 仍显示 loaded 32 enabled API config(s)，说明本轮没有启用 `transfer_detail`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api transfer_detail`，通过，批次 `sync_20260704_161901_332949`，请求 200 次，写入 200 条。
  - DB 核验显示该批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`，从 `2026-07-04 16:19:01` 到 `2026-07-04 16:26:23`，耗时 442 秒。
  - 同批次 `sync_api_log` 为 `status=success`、`request_count=200`、`success_count=200`、`failed_count=0`。
  - 同批次 raw 为 200 条，200 个不同 `source_primary_key`，200 个不同 `data_hash`，`data_date` 范围为 `2025-01-24` 到 `2025-03-14`；样本确认 `source_primary_key` 与 `raw_json.code` 一致。
  - 同批次 `failed_request_log` 为 0 条。
  - `transfer_detail` 当前累计 raw 为 4006 条、4006 个不同调拨单号；checkpoint 指向批次 `sync_20260704_161901_332949`，记录 `param_offset=3806`、`param_limit=200`、`next_param_offset=4006`、`item_count=200`、`total_count=200`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，DB 同步 API 配置 52 条。
  - 覆盖矩阵刷新仍为公开文档 API 185 个、真实配置 API 50 个、enabled 32 个；执行分层摘要为 `configured=50`、`needs_upstream_params=63`、`needs_sensitive_review=22`、`defer_or_review=50`。
  - 已运行 `.\\.venv\\Scripts\\python.exe -m compileall app tests` 和 `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，78 个测试通过。
- 结论：
  - `transfer_detail` 已完成 4006/6499 个调拨单详情回填，连续二十个 200 条中等窗口均成功，失败 0。
  - 本轮仍不启用 `transfer_detail`；原因是历史回填仍只覆盖约 61.6%，daily 增量边界仍需后续设计。
  - 下一阶段可继续复用 `next_param_offset=4006` 推进下一批 200 条，或切到 `lot_no_detail` 做同等中等窗口验证；8S 完成后需要复盘 8Q-8S。

## Stage 8S

- 阶段目标：继续推进完整拉取；不改 YAML，复用 `transfer_detail` 的 200 条中等窗口，把 checkpoint 从 4006 推进到 4206，并完成 8Q-8S 三轮复盘。
- 已完成：
  - 只读 DB 起点确认 `api_config` 总配置 52 条、enabled 32 条；`transfer_detail.enabled=0`、`config_json.enabled=false`、`param_source.limit=200`、`auto_advance=true`。
  - 起点 checkpoint 指向批次 `sync_20260704_161901_332949`，记录 `param_offset=3806`、`param_limit=200`、`next_param_offset=4006`、`item_count=200`、`total_count=200`。
  - 起点上游 `storage_inbound_page` 中 `opType=TFOutbound` 的不同调拨单号为 6499 个；`transfer_detail` 已有 4006 条 raw、4006 个不同主键。
  - `.\\.venv\\Scripts\\python.exe -m app.main`，通过，dry-run 仍显示 loaded 32 enabled API config(s)，说明本轮没有启用 `transfer_detail`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api transfer_detail`，通过，批次 `sync_20260704_163241_732118`，请求 200 次，写入 200 条。
  - DB 核验显示该批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`，从 `2026-07-04 16:32:42` 到 `2026-07-04 16:40:10`，耗时 448 秒。
  - 同批次 `sync_api_log` 为 `status=success`、`request_count=200`、`success_count=200`、`failed_count=0`。
  - 同批次 raw 为 200 条，200 个不同 `source_primary_key`，200 个不同 `data_hash`，`data_date` 范围为 `2025-03-14` 到 `2025-04-27`；样本确认 `source_primary_key` 与 `raw_json.code` 一致。
  - 同批次 `failed_request_log` 为 0 条。
  - `transfer_detail` 当前累计 raw 为 4206 条、4206 个不同调拨单号；checkpoint 指向批次 `sync_20260704_163241_732118`，记录 `param_offset=4006`、`param_limit=200`、`next_param_offset=4206`、`item_count=200`、`total_count=200`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，DB 同步 API 配置 52 条。
  - 覆盖矩阵刷新仍为公开文档 API 185 个、真实配置 API 50 个、enabled 32 个；执行分层摘要为 `configured=50`、`needs_upstream_params=63`、`needs_sensitive_review=22`、`defer_or_review=50`。
  - 已运行 `.\\.venv\\Scripts\\python.exe -m compileall app tests` 和 `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，78 个测试通过。
- 8Q-8S 三轮复盘：
  - 8Q 从 3606 推进到 3806，8R 从 3806 推进到 4006，8S 从 4006 推进到 4206；三轮累计推进 600 个调拨单详情。
  - 三个 200 条窗口均为 200 请求、200 写入、0 失败，说明 `transfer_detail` 的参数来源、固定过滤、真实请求、raw 入库和 checkpoint 推进仍稳定。
  - 三轮耗时分别约 458 秒、442 秒、448 秒，仍处在可接受的中等窗口范围内。
  - `transfer_detail` 当前覆盖 4206/6499，仍未完成历史回填；进入 daily enabled 前仍需要继续补历史并重新设计 daily 增量边界。
- 当前结论：
  - `transfer_detail` 已完成 4206/6499 个调拨单详情回填，连续二十一个 200 条中等窗口均成功，失败 0。
  - 本轮仍不启用 `transfer_detail`；原因是历史回填仍只覆盖约 64.7%，daily 增量边界仍需后续设计。
  - 下一阶段可继续复用 `next_param_offset=4206` 推进下一批 200 条，或切到 `lot_no_detail` 做同等中等窗口验证。

## Stage 8T

- 阶段目标：继续推进完整拉取；不改 YAML，复用 `transfer_detail` 的 200 条中等窗口，把 checkpoint 从 4206 推进到 4406。
- 已完成：
  - 只读 DB 起点确认 `api_config` 总配置 52 条、enabled 32 条；`transfer_detail.enabled=0`、`config_json.enabled=false`、`param_source.limit=200`、`auto_advance=true`。
  - 起点 checkpoint 指向批次 `sync_20260704_163241_732118`，记录 `param_offset=4006`、`param_limit=200`、`next_param_offset=4206`、`item_count=200`、`total_count=200`。
  - 起点上游 `storage_inbound_page` 中 `opType=TFOutbound` 的不同调拨单号为 6499 个；`transfer_detail` 已有 4206 条 raw、4206 个不同主键。
  - `.\\.venv\\Scripts\\python.exe -m app.main`，通过，dry-run 仍显示 loaded 32 enabled API config(s)，说明本轮没有启用 `transfer_detail`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api transfer_detail`，通过，批次 `sync_20260704_164600_551797`，请求 200 次，写入 200 条。
  - DB 核验显示该批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`，从 `2026-07-04 16:46:01` 到 `2026-07-04 16:52:45`，耗时 404 秒。
  - 同批次 `sync_api_log` 为 `status=success`、`request_count=200`、`success_count=200`、`failed_count=0`。
  - 同批次 raw 为 200 条，200 个不同 `source_primary_key`，200 个不同 `data_hash`，`data_date` 范围为 `2025-04-27` 到 `2025-06-09`；样本确认 `source_primary_key` 与 `raw_json.code` 一致。
  - 同批次 `failed_request_log` 为 0 条。
  - `transfer_detail` 当前累计 raw 为 4406 条、4406 个不同调拨单号；checkpoint 指向批次 `sync_20260704_164600_551797`，记录 `param_offset=4206`、`param_limit=200`、`next_param_offset=4406`、`item_count=200`、`total_count=200`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，DB 同步 API 配置 52 条。
  - 覆盖矩阵刷新仍为公开文档 API 185 个、真实配置 API 50 个、enabled 32 个；执行分层摘要为 `configured=50`、`needs_upstream_params=63`、`needs_sensitive_review=22`、`defer_or_review=50`。
  - 已运行 `.\\.venv\\Scripts\\python.exe -m compileall app tests` 和 `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，78 个测试通过。
- 结论：
  - `transfer_detail` 已完成 4406/6499 个调拨单详情回填，连续二十二个 200 条中等窗口均成功，失败 0。
  - 本轮仍不启用 `transfer_detail`；原因是历史回填仍只覆盖约 67.8%，daily 增量边界仍需后续设计。
  - 下一阶段可继续复用 `next_param_offset=4406` 推进下一批 200 条，或切到 `lot_no_detail` 做同等中等窗口验证；8T-8V 三轮完成后需要复盘。

## Stage 8U

- 阶段目标：继续推进完整拉取；不改 YAML，复用 `transfer_detail` 的 200 条中等窗口，把 checkpoint 从 4406 推进到 4606。
- 已完成：
  - 只读 DB 起点确认 `api_config` 总配置 52 条、enabled 32 条；`transfer_detail.enabled=0`、`config_json.enabled=false`、`param_source.limit=200`、`auto_advance=true`。
  - 起点 checkpoint 指向批次 `sync_20260704_164600_551797`，记录 `param_offset=4206`、`param_limit=200`、`next_param_offset=4406`、`item_count=200`、`total_count=200`。
  - 起点上游 `storage_inbound_page` 中 `opType=TFOutbound` 的不同调拨单号为 6499 个；`transfer_detail` 已有 4406 条 raw、4406 个不同主键。
  - `.\\.venv\\Scripts\\python.exe -m app.main`，通过，dry-run 仍显示 loaded 32 enabled API config(s)，说明本轮没有启用 `transfer_detail`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api transfer_detail`，通过，批次 `sync_20260704_165807_611563`，请求 200 次，写入 200 条。
  - DB 核验显示该批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`，从 `2026-07-04 16:58:08` 到 `2026-07-04 17:07:34`，耗时 566 秒。
  - 同批次 `sync_api_log` 为 `status=success`、`request_count=200`、`success_count=200`、`failed_count=0`。
  - 同批次 raw 为 200 条，200 个不同 `source_primary_key`，200 个不同 `data_hash`，`data_date` 范围为 `2025-06-09` 到 `2025-07-14`；样本确认 `source_primary_key` 与 `raw_json.code` 一致。
  - 同批次 `failed_request_log` 为 0 条。
  - `transfer_detail` 当前累计 raw 为 4606 条、4606 个不同调拨单号；checkpoint 指向批次 `sync_20260704_165807_611563`，记录 `param_offset=4406`、`param_limit=200`、`next_param_offset=4606`、`item_count=200`、`total_count=200`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，DB 同步 API 配置 52 条。
  - 覆盖矩阵刷新仍为公开文档 API 185 个、真实配置 API 50 个、enabled 32 个；执行分层摘要为 `configured=50`、`needs_upstream_params=63`、`needs_sensitive_review=22`、`defer_or_review=50`。
  - 已运行 `.\\.venv\\Scripts\\python.exe -m compileall app tests` 和 `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，78 个测试通过。
- 结论：
  - `transfer_detail` 已完成 4606/6499 个调拨单详情回填，连续二十三个 200 条中等窗口均成功，失败 0。
  - 本轮仍不启用 `transfer_detail`；原因是历史回填仍只覆盖约 70.9%，daily 增量边界仍需后续设计。
  - 下一阶段可继续复用 `next_param_offset=4606` 推进下一批 200 条，或切到 `lot_no_detail` 做同等中等窗口验证；8T-8V 三轮完成后需要复盘。

## Stage 8V

- 阶段目标：继续推进完整拉取；不改 YAML，复用 `transfer_detail` 的 200 条中等窗口，把 checkpoint 从 4606 推进到 4806，并完成 8T-8V 三轮复盘。
- 已完成：
  - 只读 DB 起点确认 `api_config` 总配置 52 条、enabled 32 条；`transfer_detail.enabled=0`、`config_json.enabled=false`、`param_source.limit=200`、`auto_advance=true`。
  - 起点 checkpoint 指向批次 `sync_20260704_165807_611563`，记录 `param_offset=4406`、`param_limit=200`、`next_param_offset=4606`、`item_count=200`、`total_count=200`。
  - 起点上游 `storage_inbound_page` 中 `opType=TFOutbound` 的不同调拨单号为 6499 个；`transfer_detail` 已有 4606 条 raw、4606 个不同主键。
  - `.\\.venv\\Scripts\\python.exe -m app.main`，通过，dry-run 仍显示 loaded 32 enabled API config(s)，说明本轮没有启用 `transfer_detail`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api transfer_detail`，通过，批次 `sync_20260704_171710_864374`，请求 200 次，写入 200 条。
  - DB 核验显示该批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`，从 `2026-07-04 17:17:11` 到 `2026-07-04 17:23:48`，耗时 397 秒。
  - 同批次 `sync_api_log` 为 `status=success`、`request_count=200`、`success_count=200`、`failed_count=0`，耗时 394 秒。
  - 同批次 raw 为 200 条，200 个不同 `source_primary_key`，200 个不同 `data_hash`，`data_date` 范围为 `2025-07-14` 到 `2025-08-25`；样本确认 `source_primary_key` 与 `raw_json.code` 一致。
  - 同批次 `failed_request_log` 为 0 条。
  - `transfer_detail` 当前累计 raw 为 4806 条、4806 个不同调拨单号；checkpoint 指向批次 `sync_20260704_171710_864374`，记录 `param_offset=4606`、`param_limit=200`、`next_param_offset=4806`、`item_count=200`、`total_count=200`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，DB 同步 API 配置 52 条。
  - 覆盖矩阵刷新仍为公开文档 API 185 个、真实配置 API 50 个、enabled 32 个；执行分层摘要为 `configured=50`、`needs_upstream_params=63`、`needs_sensitive_review=22`、`defer_or_review=50`。
  - 已运行 `.\\.venv\\Scripts\\python.exe -m compileall app tests` 和 `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，78 个测试通过。
- 8T-8V 三轮复盘：
  - 8T 从 4206 推进到 4406，8U 从 4406 推进到 4606，8V 从 4606 推进到 4806；三轮累计推进 600 个调拨单详情。
  - 三个 200 条窗口均为 200 请求、200 写入、0 失败，说明 `transfer_detail` 的参数来源、固定过滤、真实请求、raw 入库和 checkpoint 推进仍稳定。
  - 三轮耗时分别约 404 秒、566 秒、397 秒，仍适合继续按 200 条中等窗口分批回填。
  - `transfer_detail` 当前覆盖 4806/6499，仍未完成历史回填；进入 daily enabled 前仍需要继续补历史并重新设计 daily 增量边界。
- 当前结论：
  - `transfer_detail` 已完成 4806/6499 个调拨单详情回填，连续二十四个 200 条中等窗口均成功，失败 0。
  - 本轮仍不启用 `transfer_detail`；原因是历史回填仍只覆盖约 74.0%，daily 增量边界仍需后续设计。
  - 下一阶段可继续复用 `next_param_offset=4806` 推进下一批 200 条，或切到 `lot_no_detail` 做同等中等窗口验证。

## Stage 8W

- 阶段目标：继续推进完整拉取；不改 YAML，复用 `transfer_detail` 的 200 条中等窗口，把 checkpoint 从 4806 推进到 5006。
- 已完成：
  - 只读 DB 起点确认 `api_config` 总配置 52 条、enabled 32 条；`transfer_detail.enabled=0`、`config_json.enabled=false`、`param_source.limit=200`、`auto_advance=true`。
  - 起点 checkpoint 指向批次 `sync_20260704_171710_864374`，记录 `param_offset=4606`、`param_limit=200`、`next_param_offset=4806`、`item_count=200`、`total_count=200`。
  - 起点上游 `storage_inbound_page` 中 `opType=TFOutbound` 的不同调拨单号为 6499 个；`transfer_detail` 已有 4806 条 raw、4806 个不同主键。
  - `.\\.venv\\Scripts\\python.exe -m app.main`，通过，dry-run 仍显示 loaded 32 enabled API config(s)，说明本轮没有启用 `transfer_detail`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api transfer_detail`，通过，批次 `sync_20260704_173004_020035`，请求 200 次，写入 200 条。
  - DB 核验显示该批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`，从 `2026-07-04 17:30:04` 到 `2026-07-04 17:36:40`，耗时 396 秒。
  - 同批次 `sync_api_log` 为 `status=success`、`request_count=200`、`success_count=200`、`failed_count=0`，耗时 391 秒。
  - 同批次 raw 为 200 条，200 个不同 `source_primary_key`，200 个不同 `data_hash`，`data_date` 范围为 `2025-08-25` 到 `2025-09-26`；样本确认 `source_primary_key` 与 `raw_json.code` 一致。
  - 同批次 `failed_request_log` 为 0 条。
  - `transfer_detail` 当前累计 raw 为 5006 条、5006 个不同调拨单号；checkpoint 指向批次 `sync_20260704_173004_020035`，记录 `param_offset=4806`、`param_limit=200`、`next_param_offset=5006`、`item_count=200`、`total_count=200`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，DB 同步 API 配置 52 条。
  - 覆盖矩阵刷新仍为公开文档 API 185 个、真实配置 API 50 个、enabled 32 个；执行分层摘要为 `configured=50`、`needs_upstream_params=63`、`needs_sensitive_review=22`、`defer_or_review=50`。
  - 已运行 `.\\.venv\\Scripts\\python.exe -m compileall app tests` 和 `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，78 个测试通过。
- 结论：
  - `transfer_detail` 已完成 5006/6499 个调拨单详情回填，连续二十五个 200 条中等窗口均成功，失败 0。
  - 本轮仍不启用 `transfer_detail`；原因是历史回填仍只覆盖约 77.0%，daily 增量边界仍需后续设计。
  - 下一阶段可继续复用 `next_param_offset=5006` 推进下一批 200 条，或切到 `lot_no_detail` 做同等中等窗口验证；8W-8Y 三轮完成后需要复盘。

## Stage 8X

- 阶段目标：继续推进完整拉取；不改 YAML，复用 `transfer_detail` 的 200 条中等窗口，把 checkpoint 从 5006 推进到 5206。
- 已完成：
  - 只读 DB 起点确认 `api_config` 总配置 52 条、enabled 32 条；`transfer_detail.enabled=0`、`config_json.enabled=false`、`param_source.limit=200`、`auto_advance=true`。
  - 起点 checkpoint 指向批次 `sync_20260704_173004_020035`，记录 `param_offset=4806`、`param_limit=200`、`next_param_offset=5006`、`item_count=200`、`total_count=200`。
  - 起点上游 `storage_inbound_page` 中 `opType=TFOutbound` 的不同调拨单号为 6499 个；`transfer_detail` 已有 5006 条 raw、5006 个不同主键。
  - `.\\.venv\\Scripts\\python.exe -m app.main`，通过，dry-run 仍显示 loaded 32 enabled API config(s)，说明本轮没有启用 `transfer_detail`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api transfer_detail`，通过，批次 `sync_20260704_174201_694339`，请求 200 次，写入 200 条。
  - DB 核验显示该批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`，从 `2026-07-04 17:42:02` 到 `2026-07-04 17:48:13`，耗时 371 秒。
  - 同批次 `sync_api_log` 为 `status=success`、`request_count=200`、`success_count=200`、`failed_count=0`，耗时 368 秒。
  - 同批次 raw 为 200 条，200 个不同 `source_primary_key`，200 个不同 `data_hash`，`data_date` 范围为 `2025-09-27` 到 `2025-11-05`；样本确认 `source_primary_key` 与 `raw_json.code` 一致。
  - 同批次 `failed_request_log` 为 0 条。
  - `transfer_detail` 当前累计 raw 为 5206 条、5206 个不同调拨单号；checkpoint 指向批次 `sync_20260704_174201_694339`，记录 `param_offset=5006`、`param_limit=200`、`next_param_offset=5206`、`item_count=200`、`total_count=200`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，DB 同步 API 配置 52 条。
  - 覆盖矩阵刷新仍为公开文档 API 185 个、真实配置 API 50 个、enabled 32 个；执行分层摘要为 `configured=50`、`needs_upstream_params=63`、`needs_sensitive_review=22`、`defer_or_review=50`。
  - 已运行 `.\\.venv\\Scripts\\python.exe -m compileall app tests` 和 `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，78 个测试通过。
- 结论：
  - `transfer_detail` 已完成 5206/6499 个调拨单详情回填，连续二十六个 200 条中等窗口均成功，失败 0。
  - 本轮仍不启用 `transfer_detail`；原因是历史回填仍只覆盖约 80.1%，daily 增量边界仍需后续设计。
  - 下一阶段可继续复用 `next_param_offset=5206` 推进下一批 200 条，或切到 `lot_no_detail` 做同等中等窗口验证；8Y 完成后需要复盘 8W-8Y。

## Stage 8Y

- 阶段目标：继续推进完整拉取；不改 YAML，复用 `transfer_detail` 的 200 条中等窗口，把 checkpoint 从 5206 推进到 5406，并完成 8W-8Y 三轮复盘。
- 已完成：
  - 只读 DB 起点确认 `api_config` 总配置 52 条、enabled 32 条；`transfer_detail.enabled=0`、`config_json.enabled=false`、`param_source.limit=200`、`auto_advance=true`。
  - 起点 checkpoint 指向批次 `sync_20260704_174201_694339`，记录 `param_offset=5006`、`param_limit=200`、`next_param_offset=5206`、`item_count=200`、`total_count=200`。
  - 起点上游 `storage_inbound_page` 中 `opType=TFOutbound` 的不同调拨单号为 6499 个；`transfer_detail` 已有 5206 条 raw、5206 个不同主键。
  - `.\\.venv\\Scripts\\python.exe -m app.main`，通过，dry-run 仍显示 loaded 32 enabled API config(s)，说明本轮没有启用 `transfer_detail`。
  - 首次运行 `.\\.venv\\Scripts\\python.exe -m app.main --sync-api transfer_detail` 失败，批次 `sync_20260704_175431_649119` 在第 64 次请求处返回 `401 Unauthorized`；DB 记录该批次 `sync_batch.status=failed`、`success_count=61`、`failed_count=1`、`failed_request_log=1`，checkpoint 未推进，raw 事务未留下本批次数据。
  - 已删除本地 `logs/token_cache.json` 后重跑同一接口；成功批次为 `sync_20260704_175750_445975`，请求 200 次，写入 200 条。
  - DB 核验显示成功批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`，从 `2026-07-04 17:57:50` 到 `2026-07-04 18:04:23`，耗时 393 秒。
  - 成功批次 `sync_api_log` 为 `status=success`、`request_count=200`、`success_count=200`、`failed_count=0`，耗时 389 秒。
  - 成功批次 raw 为 200 条，200 个不同 `source_primary_key`，200 个不同 `data_hash`，`data_date` 范围为 `2025-11-05` 到 `2025-12-09`；样本确认 `source_primary_key` 与 `raw_json.code` 一致。
  - 成功批次 `failed_request_log` 为 0 条。
  - `transfer_detail` 当前累计 raw 为 5406 条、5406 个不同调拨单号；checkpoint 指向批次 `sync_20260704_175750_445975`，记录 `param_offset=5206`、`param_limit=200`、`next_param_offset=5406`、`item_count=200`、`total_count=200`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，DB 同步 API 配置 52 条。
  - 覆盖矩阵刷新仍为公开文档 API 185 个、真实配置 API 50 个、enabled 32 个；执行分层摘要为 `configured=50`、`needs_upstream_params=63`、`needs_sensitive_review=22`、`defer_or_review=50`。
  - 已运行 `.\\.venv\\Scripts\\python.exe -m compileall app tests` 和 `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，78 个测试通过。
- 8W-8Y 三轮复盘：
  - 8W 从 4806 推进到 5006，8X 从 5006 推进到 5206，8Y 从 5206 推进到 5406；三轮累计推进 600 个调拨单详情。
  - 三个最终成功窗口均为 200 请求、200 写入、0 失败，说明 `transfer_detail` 的参数来源、固定过滤、真实请求、raw 入库和 checkpoint 推进仍稳定。
  - 8Y 暴露了一个真实运行边界：业务接口返回 401 时，当前客户端不会自动刷新 token；本轮通过删除 token 缓存并重跑同一窗口恢复，失败批次未推进 checkpoint、也没有留下 raw 脏数据。
  - 三个成功窗口耗时分别约 396 秒、371 秒、393 秒，仍适合继续按 200 条中等窗口分批回填。
  - `transfer_detail` 当前覆盖 5406/6499，仍未完成历史回填；进入 daily enabled 前仍需要继续补历史并重新设计 daily 增量边界。
- 当前结论：
  - `transfer_detail` 已完成 5406/6499 个调拨单详情回填，约 83.2%。
  - 本轮仍不启用 `transfer_detail`；原因是历史回填未完成，daily 增量边界仍需后续设计。
  - 下一阶段可继续复用 `next_param_offset=5406` 推进下一批 200 条，或切到 `lot_no_detail` 做同等中等窗口验证；8Z-9B 三轮完成后需要下一次复盘。

## Stage 8Z

- 阶段目标：继续推进完整拉取；不改 YAML，复用 `transfer_detail` 的 200 条中等窗口，把 checkpoint 从 5406 推进到 5606。
- 已完成：
  - 只读 DB 起点确认 `api_config` 总配置 52 条、enabled 32 条；`transfer_detail.enabled=0`、`config_json.enabled=false`、`param_source.limit=200`、`auto_advance=true`。
  - 起点 checkpoint 指向批次 `sync_20260704_175750_445975`，记录 `param_offset=5206`、`param_limit=200`、`next_param_offset=5406`、`item_count=200`、`total_count=200`。
  - 起点上游 `storage_inbound_page` 中 `opType=TFOutbound` 的不同调拨单号为 6499 个；`transfer_detail` 已有 5406 条 raw、5406 个不同主键。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api transfer_detail`，通过，批次 `sync_20260704_181145_259163`，请求 200 次，写入 200 条。
  - DB 核验显示该批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`，从 `2026-07-04 18:11:45` 到 `2026-07-04 18:18:12`，耗时 387 秒。
  - 同批次 `sync_api_log` 为 `status=success`、`request_count=200`、`success_count=200`、`failed_count=0`，耗时 384 秒。
  - 同批次 raw 为 200 条，200 个不同 `source_primary_key`，200 个不同 `data_hash`，`data_date` 范围为 `2025-12-09` 到 `2026-01-14`；样本确认 `source_primary_key` 与 `raw_json.code` 一致。
  - 同批次 `failed_request_log` 为 0 条。
  - `transfer_detail` 当前累计 raw 为 5606 条、5606 个不同调拨单号；checkpoint 指向批次 `sync_20260704_181145_259163`，记录 `param_offset=5406`、`param_limit=200`、`next_param_offset=5606`、`item_count=200`、`total_count=200`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，DB 同步 API 配置 52 条。
  - 覆盖矩阵刷新仍为公开文档 API 185 个、真实配置 API 50 个、enabled 32 个；执行分层摘要为 `configured=50`、`needs_upstream_params=63`、`needs_sensitive_review=22`、`defer_or_review=50`。
  - 已运行 `.\\.venv\\Scripts\\python.exe -m compileall app tests` 和 `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，78 个测试通过。
- 当前结论：
  - `transfer_detail` 已完成 5606/6499 个调拨单详情回填，约 86.3%。
  - 本轮仍不启用 `transfer_detail`；原因是历史回填未完成，daily 增量边界仍需后续设计。
  - 下一阶段可继续复用 `next_param_offset=5606` 推进下一批 200 条，或切到 `lot_no_detail` 做同等中等窗口验证；9A 和 9B 完成后需要复盘 8Z-9B。

## Stage 9A

- 阶段目标：继续推进完整拉取；不改 YAML，复用 `transfer_detail` 的 200 条中等窗口，把 checkpoint 从 5606 推进到 5806。
- 已完成：
  - 只读 DB 起点确认 `api_config` 总配置 52 条、enabled 32 条；`transfer_detail.enabled=0`、`config_json.enabled=false`、`param_source.limit=200`、`auto_advance=true`。
  - 起点 checkpoint 指向批次 `sync_20260704_181145_259163`，记录 `param_offset=5406`、`param_limit=200`、`next_param_offset=5606`、`item_count=200`、`total_count=200`。
  - 起点上游 `storage_inbound_page` 中 `opType=TFOutbound` 的不同调拨单号为 6499 个；`transfer_detail` 已有 5606 条 raw、5606 个不同主键。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api transfer_detail`，通过，批次 `sync_20260704_182357_431520`，请求 200 次，写入 200 条。
  - DB 核验显示该批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`，从 `2026-07-04 18:23:57` 到 `2026-07-04 18:30:53`，耗时 416 秒。
  - 同批次 `sync_api_log` 为 `status=success`、`request_count=200`、`success_count=200`、`failed_count=0`，耗时 412 秒。
  - 同批次 raw 为 200 条，200 个不同 `source_primary_key`，200 个不同 `data_hash`，`data_date` 范围为 `2026-01-14` 到 `2026-03-04`；样本确认 `source_primary_key` 与 `raw_json.code` 一致。
  - 同批次 `failed_request_log` 为 0 条。
  - `transfer_detail` 当前累计 raw 为 5806 条、5806 个不同调拨单号；checkpoint 指向批次 `sync_20260704_182357_431520`，记录 `param_offset=5606`、`param_limit=200`、`next_param_offset=5806`、`item_count=200`、`total_count=200`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，DB 同步 API 配置 52 条。
  - 覆盖矩阵刷新仍为公开文档 API 185 个、真实配置 API 50 个、enabled 32 个；执行分层摘要为 `configured=50`、`needs_upstream_params=63`、`needs_sensitive_review=22`、`defer_or_review=50`。
  - 已运行 `.\\.venv\\Scripts\\python.exe -m compileall app tests` 和 `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，78 个测试通过。
- 当前结论：
  - `transfer_detail` 已完成 5806/6499 个调拨单详情回填，约 89.3%。
  - 本轮仍不启用 `transfer_detail`；原因是历史回填未完成，daily 增量边界仍需后续设计。
  - 下一阶段可继续复用 `next_param_offset=5806` 推进下一批 200 条，或切到 `lot_no_detail` 做同等中等窗口验证；9B 完成后需要复盘 8Z-9B。

## Stage 9B

- 阶段目标：继续推进完整拉取；不改 YAML，复用 `transfer_detail` 的 200 条中等窗口，把 checkpoint 从 5806 推进到 6006，并完成 8Z-9B 三轮复盘。
- 已完成：
  - 只读 DB 起点确认 `api_config` 总配置 52 条、enabled 32 条；`transfer_detail.enabled=0`、`config_json.enabled=false`、`param_source.limit=200`、`auto_advance=true`。
  - 起点 checkpoint 指向批次 `sync_20260704_182357_431520`，记录 `param_offset=5606`、`param_limit=200`、`next_param_offset=5806`、`item_count=200`、`total_count=200`。
  - 起点上游 `storage_inbound_page` 中 `opType=TFOutbound` 的不同调拨单号为 6499 个；`transfer_detail` 已有 5806 条 raw、5806 个不同主键。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api transfer_detail`，通过，批次 `sync_20260704_183624_571980`，请求 200 次，写入 200 条。
  - DB 核验显示该批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`，从 `2026-07-04 18:36:25` 到 `2026-07-04 18:42:55`，耗时 390 秒。
  - 同批次 `sync_api_log` 为 `status=success`、`request_count=200`、`success_count=200`、`failed_count=0`，耗时 387 秒。
  - 同批次 raw 为 200 条，200 个不同 `source_primary_key`，200 个不同 `data_hash`，`data_date` 范围为 `2026-03-04` 到 `2026-04-08`；样本确认 `source_primary_key` 与 `raw_json.code` 一致。
  - 同批次 `failed_request_log` 为 0 条。
  - `transfer_detail` 当前累计 raw 为 6006 条、6006 个不同调拨单号；checkpoint 指向批次 `sync_20260704_183624_571980`，记录 `param_offset=5806`、`param_limit=200`、`next_param_offset=6006`、`item_count=200`、`total_count=200`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，DB 同步 API 配置 52 条。
  - 覆盖矩阵刷新仍为公开文档 API 185 个、真实配置 API 50 个、enabled 32 个；执行分层摘要为 `configured=50`、`needs_upstream_params=63`、`needs_sensitive_review=22`、`defer_or_review=50`。
  - 已运行 `.\\.venv\\Scripts\\python.exe -m compileall app tests` 和 `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，78 个测试通过。
- 8Z-9B 三轮复盘：
  - 8Z 从 5406 推进到 5606，9A 从 5606 推进到 5806，9B 从 5806 推进到 6006；三轮累计推进 600 个调拨单详情。
  - 三个窗口均为 200 请求、200 写入、0 失败，说明 `transfer_detail` 的参数来源、固定过滤、真实请求、raw 入库和 checkpoint 推进仍稳定。
  - 三轮耗时分别约 387 秒、416 秒、390 秒，仍适合继续按 200 条中等窗口分批回填。
  - `transfer_detail` 当前覆盖 6006/6499，仍未完成历史回填；进入 daily enabled 前仍需要补完历史并重新设计 daily 增量边界。
- 当前结论：
  - `transfer_detail` 已完成 6006/6499 个调拨单详情回填，约 92.4%。
  - 本轮仍不启用 `transfer_detail`；原因是历史回填未完成，daily 增量边界仍需后续设计。
  - 下一阶段可继续复用 `next_param_offset=6006` 推进下一批 200 条，或切到 `lot_no_detail` 做同等中等窗口验证；9C-9E 三轮完成后需要下一次复盘。

## Stage 9C

- 阶段目标：继续推进完整拉取；不改 YAML，复用 `transfer_detail` 的 200 条中等窗口，把 checkpoint 从 6006 推进到 6206。
- 已完成：
  - 只读 DB 起点确认 `api_config` 总配置 52 条、enabled 32 条；`transfer_detail.enabled=0`、`config_json.enabled=false`、`param_source.limit=200`、`auto_advance=true`。
  - 起点 checkpoint 指向批次 `sync_20260704_183624_571980`，记录 `param_offset=5806`、`param_limit=200`、`next_param_offset=6006`、`item_count=200`、`total_count=200`。
  - 起点上游 `storage_inbound_page` 中 `opType=TFOutbound` 的不同调拨单号为 6499 个；`transfer_detail` 已有 6006 条 raw、6006 个不同主键。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api transfer_detail`，通过，批次 `sync_20260704_184937_597382`，请求 200 次，写入 200 条。
  - DB 核验显示该批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`，从 `2026-07-04 18:49:38` 到 `2026-07-04 18:56:04`，耗时 386 秒。
  - 同批次 `sync_api_log` 为 `status=success`、`request_count=200`、`success_count=200`、`failed_count=0`，耗时 382 秒。
  - 同批次 raw 为 200 条，200 个不同 `source_primary_key`，200 个不同 `data_hash`，`data_date` 范围为 `2026-04-08` 到 `2026-05-18`；样本确认 `source_primary_key` 与 `raw_json.code` 一致。
  - 同批次 `failed_request_log` 为 0 条。
  - `transfer_detail` 当前累计 raw 为 6206 条、6206 个不同调拨单号；checkpoint 指向批次 `sync_20260704_184937_597382`，记录 `param_offset=6006`、`param_limit=200`、`next_param_offset=6206`、`item_count=200`、`total_count=200`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，DB 同步 API 配置 52 条。
  - 覆盖矩阵刷新仍为公开文档 API 185 个、真实配置 API 50 个、enabled 32 个；执行分层摘要为 `configured=50`、`needs_upstream_params=63`、`needs_sensitive_review=22`、`defer_or_review=50`。
  - 已运行 `.\\.venv\\Scripts\\python.exe -m compileall app tests` 和 `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，78 个测试通过。
- 当前结论：
  - `transfer_detail` 已完成 6206/6499 个调拨单详情回填，约 95.5%。
  - 本轮仍不启用 `transfer_detail`；原因是历史回填未完成，daily 增量边界仍需后续设计。
  - 下一阶段可继续复用 `next_param_offset=6206` 推进下一批 200 条，或切到 `lot_no_detail` 做同等中等窗口验证；9C-9E 三轮完成后需要下一次复盘。

## Stage 9D

- 阶段目标：继续推进完整拉取；不改 YAML，复用 `transfer_detail` 的 200 条中等窗口，把 checkpoint 从 6206 推进到 6406，并完成一次全面复盘。
- 已完成：
  - 只读 DB 起点确认 `api_config` 总配置 52 条、enabled 32 条；`transfer_detail.enabled=0`、`config_json.enabled=false`、`param_source.limit=200`、`auto_advance=true`。
  - 起点 checkpoint 指向批次 `sync_20260704_184937_597382`，记录 `param_offset=6006`、`param_limit=200`、`next_param_offset=6206`、`item_count=200`、`total_count=200`。
  - 起点上游 `storage_inbound_page` 中 `opType=TFOutbound` 的不同调拨单号为 6499 个；`transfer_detail` 已有 6206 条 raw、6206 个不同主键。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api transfer_detail`，通过，批次 `sync_20260704_190149_896474`，请求 200 次，写入 200 条。
  - DB 核验显示该批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`，从 `2026-07-04 19:01:50` 到 `2026-07-04 19:09:03`，耗时 433 秒。
  - 同批次 `sync_api_log` 为 `status=success`、`request_count=200`、`success_count=200`、`failed_count=0`，耗时 429 秒。
  - 同批次 raw 为 200 条，200 个不同 `source_primary_key`，200 个不同 `data_hash`，`data_date` 范围为 `2026-05-18` 到 `2026-06-16`；样本确认 `source_primary_key` 与 `raw_json.code` 一致。
  - 同批次 `failed_request_log` 为 0 条。
  - `transfer_detail` 当前累计 raw 为 6406 条、6406 个不同调拨单号；checkpoint 指向批次 `sync_20260704_190149_896474`，记录 `param_offset=6206`、`param_limit=200`、`next_param_offset=6406`、`item_count=200`、`total_count=200`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，DB 同步 API 配置 52 条。
  - 覆盖矩阵刷新仍为公开文档 API 185 个、真实配置 API 50 个、enabled 32 个；执行分层摘要为 `configured=50`、`needs_upstream_params=63`、`needs_sensitive_review=22`、`defer_or_review=50`。
  - `.\\.venv\\Scripts\\python.exe -m app.main` dry-run 显示 loaded 32 enabled API config(s)，说明 `transfer_detail` 没有误进入 enabled。
  - 已运行 `.\\.venv\\Scripts\\python.exe -m compileall app tests` 和 `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，78 个测试通过。
- 全面复盘：
  - 当前项目主流程已经稳定：公开文档覆盖矩阵可生成，YAML 可同步到 DB，真实接口同步可写入 `sync_batch`、`sync_api_log`、`raw_api_data`、`sync_checkpoint` 和 `failed_request_log`。
  - 当前 daily enabled 范围是 32 个 API，最近完整 enabled 批次为 32 个 API 全成功；但该批次耗时约 4244 秒，继续扩大 enabled 前必须评估 cron 窗口。
  - 当前完整拉取的主要缺口不在框架，而在剩余高风险或大体量接口：已配置但 disabled 的 18 个真实 API、63 个仍需参数源的公开文档 API、22 个需敏感审查 API、50 个暂缓或需风险复核 API。
  - `transfer_detail` 从 7Y 的 206/6499 推进到 9D 的 6406/6499，说明依赖参数来源、固定过滤、200 请求窗口、raw 入库和 checkpoint 自动推进是稳定的。
  - `transfer_detail` 还剩 93 个调拨单详情未回填；即使 9E 补完历史，也不能直接加入 enabled，必须先设计 daily 增量边界，避免用历史 offset 语义做日常调度。
  - 8Y 曾暴露业务接口 401 不会自动刷新 token；当前处理方式是失败后先核验 checkpoint 和 raw，再按需清理 token 缓存重跑同一窗口，后续可考虑作为代码改进点。
  - 下一步最小正确目标是 9E：继续 `transfer_detail` 最后一段，预计从 `next_param_offset=6406` 推进到 6499；之后再评估 daily 增量边界，而不是直接启用。
- 当前结论：
  - `transfer_detail` 已完成 6406/6499 个调拨单详情回填，约 98.6%。
  - 本轮仍不启用 `transfer_detail`；原因是历史回填尚余 93 个，且 daily 增量边界仍需后续设计。
  - 下一阶段优先继续复用 `next_param_offset=6406` 跑最后一段，并核验 checkpoint 推进到 6499；9E 完成后按既定节奏复盘 9C-9E。

## Stage 9E

- 阶段目标：继续推进完整拉取；不改 YAML，复用 `transfer_detail` 的最后一段窗口，把 checkpoint 从 6406 推进到 6499，并完成 9C-9E 三轮复盘。
- 已完成：
  - 只读 DB 起点确认 `api_config` 总配置 52 条、enabled 32 条；`transfer_detail.enabled=0`、`config_json.enabled=false`、`param_source.limit=200`、`auto_advance=true`。
  - 起点 checkpoint 指向批次 `sync_20260704_190149_896474`，记录 `param_offset=6206`、`param_limit=200`、`next_param_offset=6406`、`item_count=200`、`total_count=200`。
  - 起点上游 `storage_inbound_page.raw_json.fcode` 中 `opType=TFOutbound` 的不同调拨单号为 6499 个；`transfer_detail` 已有 6406 条 raw、6406 个不同主键，剩余 93 个。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api transfer_detail`，通过，批次 `sync_20260704_191625_238364`，请求 93 次，写入 93 条。
  - DB 核验显示该批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`，从 `2026-07-04 19:16:25` 到 `2026-07-04 19:19:19`，耗时 174 秒。
  - 同批次 `sync_api_log` 为 `status=success`、`request_count=93`、`success_count=93`、`failed_count=0`，耗时 170 秒。
  - 同批次 raw 为 93 条，93 个不同 `source_primary_key`，93 个不同 `data_hash`，`data_date` 范围为 `2026-06-16` 到 `2026-07-03`；样本确认 `source_primary_key` 与 `raw_json.code` 一致。
  - 同批次 `failed_request_log` 为 0 条。
  - `transfer_detail` 当前累计 raw 为 6499 条、6499 个不同调拨单号；checkpoint 指向批次 `sync_20260704_191625_238364`，记录 `param_offset=6406`、`param_limit=200`、`next_param_offset=6499`、`item_count=93`、`total_count=93`。
  - 用与 YAML 一致的 `storage_inbound_page.raw_json.fcode -> transfer_detail.source_primary_key` 口径核验，`TFOutbound` 调拨单详情剩余缺口为 0。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，DB 同步 API 配置 52 条。
  - 覆盖矩阵刷新仍为公开文档 API 185 个、真实配置 API 50 个、enabled 32 个；执行分层摘要为 `configured=50`、`needs_upstream_params=63`、`needs_sensitive_review=22`、`defer_or_review=50`。
  - `.\\.venv\\Scripts\\python.exe -m app.main` dry-run 显示 loaded 32 enabled API config(s)，说明 `transfer_detail` 没有误进入 enabled。
  - 已运行 `.\\.venv\\Scripts\\python.exe -m compileall app tests` 和 `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，78 个测试通过。
- 9C-9E 三轮复盘：
  - 9C 从 6006 推进到 6206，9D 从 6206 推进到 6406，9E 从 6406 推进到 6499；三轮累计推进 493 个调拨单详情。
  - 三轮均为 success，失败请求均为 0，说明 `transfer_detail` 的参数来源、固定过滤、真实请求、raw 入库和 checkpoint 推进稳定。
  - 三轮耗时分别约 386 秒、433 秒、174 秒；最后一轮只剩 93 个请求，所以耗时明显缩短。
  - 补历史时，剩余缺口必须按 `storage_inbound_page.raw_json.fcode` 计算，不能用 `storage_inbound_page.source_primary_key` 代替调拨单号。
  - `transfer_detail` 历史回填已追平当前上游 6499 个 `TFOutbound` 调拨单号；但 daily 增量边界仍未设计完成，所以仍不应直接加入 enabled。
- 当前结论：
  - `transfer_detail` 已完成 6499/6499 个调拨单详情历史回填，剩余缺口为 0。
  - 本轮仍不启用 `transfer_detail`；原因是从“历史 offset 回填”切换到“daily 增量拾取”还需要重新设计和验证。
  - 下一阶段建议评估 `transfer_detail` 的 daily 增量边界，优先复用类似 `product_detail.exclude_existing_target=true` 的缺失主键扫描思路，先验证空缺口行为，再决定是否进入 enabled。

## Stage 9F

- 阶段目标：继续推进完整拉取；评估并验证 `transfer_detail` 从历史 offset 回填切换到 daily 缺失主键扫描的边界，保持 disabled，不直接加入 enabled。
- 已完成：
  - 只读 DB 起点确认 `api_config` 总配置 52 条、enabled 32 条；`transfer_detail.enabled=0`、`config_json.enabled=false`、`param_source.limit=200`、`auto_advance=true`、`exclude_existing_target` 尚未写入 DB。
  - 起点 checkpoint 指向批次 `sync_20260704_191625_238364`，记录 `param_offset=6406`、`param_limit=200`、`next_param_offset=6499`、`item_count=93`、`total_count=93`。
  - 起点上游 `storage_inbound_page.raw_json.fcode` 中 `opType=TFOutbound` 的不同调拨单号为 6499 个；`transfer_detail` 已有 6499 条 raw、6499 个不同主键，剩余缺口为 0。
  - 为 `raw_json.fields` 参数来源补充 `exclude_existing_target=true` 支持：SQL 从 `raw_api_data source_data` 读取上游字段，并按目标 API 的 `raw_api_data.source_primary_key` 反连接排除已同步主键。
  - 将 `config/api_config.example.yaml` 中 `transfer_detail.param_source.exclude_existing_target` 设为 `true`，但 `transfer_detail.enabled` 仍保持 `false`。
  - 新增/更新 `transfer_detail` 参数源测试，覆盖配置项、raw_json 字段缺失扫描 SQL、以及 `exclude_existing_target=true` 时忽略历史 checkpoint offset。
  - `.\\.venv\\Scripts\\python.exe -m unittest tests.test_transfer_detail_param_source tests.test_product_detail_param_source`，通过，10 个测试通过。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，DB 同步 API 配置 52 条。
  - `.\\.venv\\Scripts\\python.exe -m app.main` dry-run 显示 loaded 32 enabled API config(s)，说明本轮没有启用 `transfer_detail`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api transfer_detail`，通过，批次 `sync_20260704_193447_716759`，请求 0 次，写入 0 条。
  - DB 核验显示该批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`。
  - 同批次 `sync_api_log` 为 `status=success`、`request_count=0`、`success_count=0`、`failed_count=0`，同批次 raw 为 0 条，`failed_request_log` 为 0 条。
  - 9F 后 `transfer_detail` checkpoint 指向批次 `sync_20260704_193447_716759`，记录 `param_offset=0`、`param_limit=200`、`next_param_offset=0`、`item_count=0`、`total_count=0`；这是缺失扫描语义，不再使用历史 offset 推进。
  - DB 配置确认 `transfer_detail.enabled=0`、`config_json.enabled=false`、`param_source.exclude_existing_target=true`。
  - `transfer_detail` 当前累计 raw 为 6499 条、6499 个不同调拨单号；用 `storage_inbound_page.raw_json.fcode` 口径核验，`TFOutbound` 调拨单详情剩余缺口仍为 0。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 185 个、真实配置 API 50 个、enabled 32 个；执行分层摘要为 `configured=50`、`needs_upstream_params=63`、`needs_sensitive_review=22`、`defer_or_review=50`。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，80 个测试通过。
- 全面复盘：
  - 9F 解决的是边界语义，不是继续拉历史数据：`transfer_detail` 已从“按历史 offset 继续翻上游参数”切到“每天只找目标表缺失主键”。
  - 这个边界适合 `transfer_detail`，因为上游真实业务主键是 `storage_inbound_page.raw_json.fcode`，目标主键是详情响应 `raw_json.code`，两者已通过 6499 条历史回填证明一致。
  - `transfer_detail` 现在具备进入 daily enabled 的技术前提：历史缺口为 0、空缺口单接口运行成功、checkpoint 已切到缺失扫描语义。
  - 仍不在本轮直接启用：当前 32 个 enabled API 最近完整批次耗时约 4244 秒，启用第 33 个前应先明确是否接受新增的每日运行成本，虽然空缺口时 `transfer_detail` 请求数为 0。
  - 本轮也暴露了一个审核点：人工 DB 核验脚本必须以 `sql/init_tables.sql` 的真实列名为准，不能用口语化字段名；错误只发生在核验脚本，不影响业务同步结果。
- 当前结论：
  - `transfer_detail` 已完成 daily 增量边界验证，保持 disabled，剩余缺口为 0。
  - 下一阶段可以评估是否将 `transfer_detail.enabled` 改为 `true`，并用 dry-run 和完整 `--sync-enabled` 证明 33 个 enabled API 同批次成功；如不启用，则应转向下一个 disabled 真实接口或高价值参数型接口。

## Stage 9G

- 阶段目标：继续推进完整拉取；将 `transfer_detail` 从 disabled 加入 daily enabled，并用完整 `--sync-enabled` 批次证明 33 个 enabled API 同批次成功。
- 已完成：
  - 只读 DB 起点确认 `api_config` 总配置 52 条、enabled 32 条；`transfer_detail.enabled=0`、`config_json.enabled=false`、`param_source.exclude_existing_target=true`。
  - 起点 `transfer_detail` checkpoint 指向批次 `sync_20260704_193447_716759`，记录 `param_offset=0`、`param_limit=200`、`next_param_offset=0`、`item_count=0`、`total_count=0`。
  - 起点 `transfer_detail` 已覆盖 6499/6499 个 `TFOutbound` 调拨单详情，剩余缺口为 0。
  - 将 `config/api_config.example.yaml` 中 `transfer_detail.enabled` 从 `false` 改为 `true`，并更新阶段性测试断言，当前 enabled 数量为 33。
  - `.\\.venv\\Scripts\\python.exe -m unittest tests.test_transfer_detail_param_source tests.test_5v_low_risk_enabled_configs`，通过，5 个测试通过。
  - `.\\.venv\\Scripts\\python.exe -m app.main` dry-run 显示 loaded 33 enabled API config(s)，且列表包含 `transfer_detail`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，DB 同步 API 配置 52 条。
  - DB 核验显示 `api_config` 总配置 52 条、enabled 33 条，`transfer_detail.enabled=1`、`config_json.enabled=true`、`param_source.exclude_existing_target=true`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-enabled`，通过，批次 `sync_20260704_193955_361555`，33 个 API，写入 307946 条，请求 3076 次。
  - DB 核验显示该批次 `sync_batch.status=success`、`total_api_count=33`、`success_api_count=33`、`failed_api_count=0`，从 `2026-07-04 19:39:55` 到 `2026-07-04 20:44:07`，耗时 3852 秒。
  - 同批次 `sync_api_log` 为 33 条，33 条 success、0 条 failed；汇总 `request_count=3076`、`success_count=307946`、`failed_count=0`。
  - 同批次 `transfer_detail` 日志为 `status=success`、`request_count=0`、`success_count=0`、`failed_count=0`，同批次 raw 为 0 条。
  - 同批次 `failed_request_log` 为 0 条。
  - 9G 后 `transfer_detail` checkpoint 指向批次 `sync_20260704_193955_361555`，仍记录 `param_offset=0`、`param_limit=200`、`next_param_offset=0`、`item_count=0`、`total_count=0`。
  - 用 `storage_inbound_page.raw_json.fcode` 口径核验，`TFOutbound` 调拨单详情剩余缺口仍为 0。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 185 个、真实配置 API 50 个、enabled 33 个；执行分层摘要为 `configured=50`、`needs_upstream_params=63`、`needs_sensitive_review=22`、`defer_or_review=50`。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，80 个测试通过。
- 当前结论：
  - `transfer_detail` 已进入 daily enabled；空缺口时不会发起详情请求，但会在 enabled 批次中留下可追踪的成功日志和 checkpoint。
  - 当前 enabled API 已从 32 个增加到 33 个，最近完整 enabled 批次成功且失败请求为 0。
  - 本轮没有新增公开文档覆盖数量；真实配置 API 仍为 50 个，剩余 configured disabled API 从 18 个降为 17 个。

## Stage 9H

- 阶段目标：继续推进完整拉取；评估 `lot_no_detail` 的历史覆盖与 daily enabled 前提，先做中等窗口回填，不直接加入 enabled。
- 已完成：
  - 只读 DB 起点确认 `api_config` 总配置 52 条、enabled 33 条；`lot_no_detail.enabled=0`、`config_json.enabled=false`、`param_source.limit=3`、`auto_advance=true`、`exclude_existing_target` 未设置。
  - 起点 `lot_no_detail` checkpoint 指向批次 `sync_20260703_083838_430764`，记录 `param_offset=3`、`param_limit=3`、`next_param_offset=6`、`item_count=3`、`total_count=3`。
  - 起点 `lot_no_detail` 已有 raw 6 条、6 个不同交货单号。
  - 上游 `storage_inbound_page.raw_json.fcode` 且 `raw_json.opType=LNInbound` 的不同交货单号为 8261 个；按该口径 `lot_no_detail` 起点剩余缺口为 8255 个。
  - 只读核验显示 `lot_no_page.raw_json.code` 当前只有 300 个不同交货单号，与 `storage_inbound_page` 的 `LNInbound.fcode` 重叠 294 个；因此本轮继续沿用既有 `storage_inbound_page.raw_json.fcode` 参数来源，不切换到 `lot_no_page`。
  - 将 `config/api_config.example.yaml` 中 `lot_no_detail.param_source.limit` 从 3 调整为 200，`lot_no_detail.enabled` 仍保持 `false`。
  - 更新 `tests/test_lot_no_detail_param_source.py`，保持 disabled、GET 路径、`storage_inbound_page.raw_json.fcode -> code`、`raw_json.opType=LNInbound` 过滤不变，只更新窗口期望为 200。
  - `.\\.venv\\Scripts\\python.exe -m unittest tests.test_lot_no_detail_param_source`，通过，2 个测试通过。
  - YAML 只读统计确认当前 enabled 数仍为 33，`lot_no_detail.enabled=False`、`lot_no_detail.param_source.limit=200`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，DB 同步 API 配置 52 条。
  - DB 配置核验显示 `api_config` 总配置 52 条、enabled 33 条，`lot_no_detail.enabled=0`、`param_source.limit=200`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api lot_no_detail`，通过，批次 `sync_20260704_205504_873657`，请求 200 次，写入 200 条。
  - DB 核验显示该批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`，从 `2026-07-04 20:55:05` 到 `2026-07-04 20:59:22`。
  - 同批次 `sync_api_log` 为 `status=success`、`request_count=200`、`success_count=200`、`failed_count=0`、`error_message=NULL`。
  - 同批次 raw 为 200 条、200 个不同 `source_primary_key`；`failed_request_log` 为 0 条。
  - 9H 后 `lot_no_detail` 累计 raw 为 206 条、206 个不同交货单号；checkpoint 指向批次 `sync_20260704_205504_873657`，记录 `param_offset=6`、`param_limit=200`、`next_param_offset=206`、`item_count=200`、`total_count=200`。
  - 按 `storage_inbound_page.raw_json.fcode` 且 `opType=LNInbound` 口径核验，`lot_no_detail` 剩余历史缺口为 8055 个。
  - `.\\.venv\\Scripts\\python.exe -m app.main` dry-run 显示 loaded 33 enabled API config(s)，说明 `lot_no_detail` 没有误进入 enabled。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 185 个、真实配置 API 50 个、enabled 33 个；执行分层摘要为 `configured=50`、`needs_upstream_params=63`、`needs_sensitive_review=22`、`defer_or_review=50`。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，80 个测试通过。
- 全面复盘：
  - 本轮没有扩大 enabled 集合，原因很明确：`lot_no_detail` 当前只覆盖 206/8261 个交货单详情，离 daily enabled 的“历史缺口为 0”前提还很远。
  - `lot_no_page` 当前只验证了 300 个交货单号，不能作为更完整的详情参数来源；现阶段更可靠的上游仍是 `storage_inbound_page.raw_json.fcode` 加 `raw_json.opType=LNInbound` 固定过滤。
  - `limit=200` 的中等窗口运行稳定，200 次请求耗时约 257 秒，失败为 0；按剩余 8055 个缺口估算，还需要约 41 个 200 窗口才能追平当前上游。
  - 继续回填比直接启用更符合完整拉取目标：启用一个历史缺口巨大的详情接口会让每日任务语义混乱，也会把历史补数压力混进 daily 批次。
  - 本轮核验脚本曾误用 `sync_api_log.message` 字段，已通过 `SHOW COLUMNS FROM sync_api_log` 查明真实字段为 `error_message` 并重跑证据查询；业务同步结果未受影响。
  - 9G 后的 33 个 enabled API 集合保持稳定，`lot_no_detail` 的推进只影响 disabled 单接口回填，不增加当前 cron 长任务风险。
- 当前结论：
  - `lot_no_detail` 已从 6/8261 推进到 206/8261，剩余缺口 8055。
  - 当前 configured real API 仍为 50 个，enabled 仍为 33 个。
  - 下一阶段建议继续用 `lot_no_detail.param_source.limit=200` 做历史回填窗口，直到接近追平后再评估 `exclude_existing_target=true` daily 缺失扫描和是否启用。

## Stage 9I

- 阶段目标：继续推进完整拉取；复用 `lot_no_detail.param_source.limit=200` 做下一段历史回填，不启用。
- 已完成：
  - 只读 DB 起点确认 `api_config` 总配置 52 条、enabled 33 条；`lot_no_detail.enabled=0`、`config_json.enabled=false`、`param_source.limit=200`。
  - 起点 `lot_no_detail` checkpoint 指向批次 `sync_20260704_205504_873657`，记录 `param_offset=6`、`param_limit=200`、`next_param_offset=206`、`item_count=200`、`total_count=200`。
  - 起点 `lot_no_detail` 累计 raw 为 206 条、206 个不同交货单号；上游 `storage_inbound_page.raw_json.fcode` 且 `opType=LNInbound` 的不同交货单号为 8261 个，剩余缺口为 8055。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api lot_no_detail`，通过，批次 `sync_20260704_210644_385624`，请求 200 次，写入 200 条。
  - DB 核验显示该批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`，从 `2026-07-04 21:06:44` 到 `2026-07-04 21:11:52`。
  - 同批次 `sync_api_log` 为 `status=success`、`request_count=200`、`success_count=200`、`failed_count=0`、`error_message=NULL`。
  - 同批次 raw 为 200 条、200 个不同 `source_primary_key`、200 个不同 `data_hash`；`failed_request_log` 为 0 条。
  - 9I 后 `lot_no_detail` 累计 raw 为 406 条、406 个不同交货单号；checkpoint 指向批次 `sync_20260704_210644_385624`，记录 `param_offset=206`、`param_limit=200`、`next_param_offset=406`、`item_count=200`、`total_count=200`。
  - 按 `storage_inbound_page.raw_json.fcode` 且 `opType=LNInbound` 口径核验，`lot_no_detail` 剩余历史缺口为 7855 个。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，DB 同步 API 配置 52 条。
  - DB 配置核验显示 `api_config` 总配置 52 条、enabled 33 条，`lot_no_detail.enabled=0`、`config_json.enabled=false`、`param_source.limit=200`。
  - `.\\.venv\\Scripts\\python.exe -m app.main` dry-run 显示 loaded 33 enabled API config(s)，说明 `lot_no_detail` 没有误进入 enabled。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 185 个、真实配置 API 50 个、enabled 33 个；执行分层摘要为 `configured=50`、`needs_upstream_params=63`、`needs_sensitive_review=22`、`defer_or_review=50`。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，80 个测试通过。
- 当前结论：
  - `lot_no_detail` 已从 206/8261 推进到 406/8261，剩余缺口 7855。
  - 当前 configured real API 仍为 50 个，enabled 仍为 33 个。
  - 下一阶段建议继续用 `lot_no_detail.param_source.limit=200` 做历史回填窗口；9I-9K 三轮完成后做一次小复盘，再决定是否继续同节奏回填或调整策略。

## Stage 9J

- 阶段目标：继续推进完整拉取；复用 `lot_no_detail.param_source.limit=200` 做下一段历史回填，不启用。
- 已完成：
  - 只读 DB 起点确认 `api_config` 总配置 52 条、enabled 33 条；`lot_no_detail.enabled=0`、`config_json.enabled=false`、`param_source.limit=200`。
  - 起点 `lot_no_detail` checkpoint 指向批次 `sync_20260704_210644_385624`，记录 `param_offset=206`、`param_limit=200`、`next_param_offset=406`、`item_count=200`、`total_count=200`。
  - 起点 `lot_no_detail` 累计 raw 为 406 条、406 个不同交货单号；上游 `storage_inbound_page.raw_json.fcode` 且 `opType=LNInbound` 的不同交货单号为 8261 个，剩余缺口为 7855。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api lot_no_detail`，通过，批次 `sync_20260704_211753_255963`，请求 200 次，写入 200 条。
  - DB 核验显示该批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`，从 `2026-07-04 21:17:53` 到 `2026-07-04 21:22:10`。
  - 同批次 `sync_api_log` 为 `status=success`、`request_count=200`、`success_count=200`、`failed_count=0`、`error_message=NULL`。
  - 同批次 raw 为 200 条、200 个不同 `source_primary_key`、200 个不同 `data_hash`；`failed_request_log` 为 0 条。
  - 9J 后 `lot_no_detail` 累计 raw 为 606 条、606 个不同交货单号；checkpoint 指向批次 `sync_20260704_211753_255963`，记录 `param_offset=406`、`param_limit=200`、`next_param_offset=606`、`item_count=200`、`total_count=200`。
  - 按 `storage_inbound_page.raw_json.fcode` 且 `opType=LNInbound` 口径核验，`lot_no_detail` 剩余历史缺口为 7655 个。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，DB 同步 API 配置 52 条。
  - DB 配置核验显示 `api_config` 总配置 52 条、enabled 33 条，`lot_no_detail.enabled=0`、`config_json.enabled=false`、`param_source.limit=200`。
  - `.\\.venv\\Scripts\\python.exe -m app.main` dry-run 显示 loaded 33 enabled API config(s)，说明 `lot_no_detail` 没有误进入 enabled。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 185 个、真实配置 API 50 个、enabled 33 个；执行分层摘要为 `configured=50`、`needs_upstream_params=63`、`needs_sensitive_review=22`、`defer_or_review=50`。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，80 个测试通过。
- 当前结论：
  - `lot_no_detail` 已从 406/8261 推进到 606/8261，剩余缺口 7655。
  - 当前 configured real API 仍为 50 个，enabled 仍为 33 个。
  - 下一阶段建议继续用 `lot_no_detail.param_source.limit=200` 做历史回填窗口；9K 完成后对 9I-9K 三轮做一次小复盘。

## Stage 9K

- 阶段目标：继续推进完整拉取；复用 `lot_no_detail.param_source.limit=200` 做下一段历史回填，不启用，并复盘 9I-9K。
- 已完成：
  - 只读 DB 起点确认 `api_config` 总配置 52 条、enabled 33 条；`lot_no_detail.enabled=0`、`config_json.enabled=false`、`param_source.limit=200`。
  - 起点 `lot_no_detail` checkpoint 指向批次 `sync_20260704_211753_255963`，记录 `param_offset=406`、`param_limit=200`、`next_param_offset=606`、`item_count=200`、`total_count=200`。
  - 起点 `lot_no_detail` 累计 raw 为 606 条、606 个不同交货单号；上游 `storage_inbound_page.raw_json.fcode` 且 `opType=LNInbound` 的不同交货单号为 8261 个，剩余缺口为 7655。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api lot_no_detail`，通过，批次 `sync_20260704_212741_351181`，请求 200 次，写入 200 条。
  - DB 核验显示该批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`，从 `2026-07-04 21:27:41` 到 `2026-07-04 21:32:04`。
  - 同批次 `sync_api_log` 为 `status=success`、`request_count=200`、`success_count=200`、`failed_count=0`、`error_message=NULL`。
  - 同批次 raw 为 200 条、200 个不同 `source_primary_key`、200 个不同 `data_hash`；`failed_request_log` 为 0 条。
  - 9K 后 `lot_no_detail` 累计 raw 为 806 条、806 个不同交货单号；checkpoint 指向批次 `sync_20260704_212741_351181`，记录 `param_offset=606`、`param_limit=200`、`next_param_offset=806`、`item_count=200`、`total_count=200`。
  - 按 `storage_inbound_page.raw_json.fcode` 且 `opType=LNInbound` 口径核验，`lot_no_detail` 剩余历史缺口为 7455 个。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，DB 同步 API 配置 52 条。
  - DB 配置核验显示 `api_config` 总配置 52 条、enabled 33 条，`lot_no_detail.enabled=0`、`config_json.enabled=false`、`param_source.limit=200`。
  - `.\\.venv\\Scripts\\python.exe -m app.main` dry-run 显示 loaded 33 enabled API config(s)，说明 `lot_no_detail` 没有误进入 enabled。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 185 个、真实配置 API 50 个、enabled 33 个；执行分层摘要为 `configured=50`、`needs_upstream_params=63`、`needs_sensitive_review=22`、`defer_or_review=50`。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，80 个测试通过。
- 9I-9K 三轮复盘：
  - 三轮连续复用 `lot_no_detail.param_source.limit=200`，从 206 推进到 806，累计新增 600 个交货单详情。
  - 三轮批次分别为 `sync_20260704_210644_385624`、`sync_20260704_211753_255963`、`sync_20260704_212741_351181`；每轮均为 200 次请求、200 条 raw、失败 0。
  - 三轮耗时分别约 308 秒、257 秒、263 秒，当前 200 窗口节奏稳定。
  - `lot_no_detail` 当前只覆盖 806/8261，剩余缺口仍有 7455；因此仍不具备启用 daily enabled 的前提。
  - 继续回填仍直接提升完整拉取程度；在历史缺口归零前，不应切换到 `exclude_existing_target=true` daily 缺失扫描，也不应加入 `--sync-enabled`。
- 当前结论：
  - `lot_no_detail` 已从 606/8261 推进到 806/8261，剩余缺口 7455。
  - 当前 configured real API 仍为 50 个，enabled 仍为 33 个。
  - 下一阶段建议继续用 `lot_no_detail.param_source.limit=200` 做历史回填窗口。

## Stage 9L

- 阶段目标：继续推进完整拉取；复用 `lot_no_detail.param_source.limit=200` 做下一段历史回填，不启用。
- 已完成：
  - 只读 DB 起点确认 `api_config` 总配置 52 条、enabled 33 条；`lot_no_detail.enabled=0`、`config_json.enabled=false`、`param_source.limit=200`。
  - 起点 `lot_no_detail` checkpoint 指向批次 `sync_20260704_212741_351181`，记录 `param_offset=606`、`param_limit=200`、`next_param_offset=806`、`item_count=200`、`total_count=200`。
  - 起点 `lot_no_detail` 累计 raw 为 806 条、806 个不同交货单号；上游 `storage_inbound_page.raw_json.fcode` 且 `opType=LNInbound` 的不同交货单号为 8261 个，剩余缺口为 7455。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api lot_no_detail`，通过，批次 `sync_20260704_213830_435604`，请求 200 次，写入 200 条。
  - DB 核验显示该批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`，从 `2026-07-04 21:38:30` 到 `2026-07-04 21:42:38`。
  - 同批次 `sync_api_log` 为 `status=success`、`request_count=200`、`success_count=200`、`failed_count=0`、`error_message=NULL`。
  - 同批次 raw 为 200 条、200 个不同 `source_primary_key`、200 个不同 `data_hash`；`failed_request_log` 为 0 条。
  - 9L 后 `lot_no_detail` 累计 raw 为 1006 条、1006 个不同交货单号；checkpoint 指向批次 `sync_20260704_213830_435604`，记录 `param_offset=806`、`param_limit=200`、`next_param_offset=1006`、`item_count=200`、`total_count=200`。
  - 按 `storage_inbound_page.raw_json.fcode` 且 `opType=LNInbound` 口径核验，`lot_no_detail` 剩余历史缺口为 7255 个。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，DB 同步 API 配置 52 条。
  - DB 配置核验显示 `api_config` 总配置 52 条、enabled 33 条，`lot_no_detail.enabled=0`、`config_json.enabled=false`、`param_source.limit=200`。
  - `.\\.venv\\Scripts\\python.exe -m app.main` dry-run 显示 loaded 33 enabled API config(s)，说明 `lot_no_detail` 没有误进入 enabled。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 185 个、真实配置 API 50 个、enabled 33 个；执行分层摘要为 `configured=50`、`needs_upstream_params=63`、`needs_sensitive_review=22`、`defer_or_review=50`。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，80 个测试通过。
- 当前结论：
  - `lot_no_detail` 已从 806/8261 推进到 1006/8261，剩余缺口 7255。
  - 当前 configured real API 仍为 50 个，enabled 仍为 33 个。
  - 下一阶段建议继续用 `lot_no_detail.param_source.limit=200` 做历史回填窗口；9L-9N 三轮完成后做下一次小复盘。

## Stage 9M

- 阶段目标：继续推进完整拉取；复用 `lot_no_detail.param_source.limit=200` 做下一段历史回填，不启用。
- 已完成：
  - 只读 DB 起点确认 `api_config` 总配置 52 条、enabled 33 条；`lot_no_detail.enabled=0`、`config_json.enabled=false`、`param_source.limit=200`。
  - 起点 `lot_no_detail` checkpoint 指向批次 `sync_20260704_213830_435604`，记录 `param_offset=806`、`param_limit=200`、`next_param_offset=1006`、`item_count=200`、`total_count=200`。
  - 起点 `lot_no_detail` 累计 raw 为 1006 条、1006 个不同交货单号；上游 `storage_inbound_page.raw_json.fcode` 且 `opType=LNInbound` 的不同交货单号为 8261 个，剩余缺口为 7255。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api lot_no_detail`，通过，批次 `sync_20260704_214826_586331`，请求 200 次，写入 200 条。
  - DB 核验显示该批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`，从 `2026-07-04 21:48:27` 到 `2026-07-04 21:52:50`。
  - 同批次 `sync_api_log` 为 `status=success`、`request_count=200`、`success_count=200`、`failed_count=0`、`error_message=NULL`。
  - 同批次 raw 为 200 条、200 个不同 `source_primary_key`、200 个不同 `data_hash`；`failed_request_log` 为 0 条。
  - 9M 后 `lot_no_detail` 累计 raw 为 1206 条、1206 个不同交货单号；checkpoint 指向批次 `sync_20260704_214826_586331`，记录 `param_offset=1006`、`param_limit=200`、`next_param_offset=1206`、`item_count=200`、`total_count=200`。
  - 按 `storage_inbound_page.raw_json.fcode` 且 `opType=LNInbound` 口径核验，`lot_no_detail` 剩余历史缺口为 7055 个。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，DB 同步 API 配置 52 条。
  - DB 配置核验显示 `api_config` 总配置 52 条、enabled 33 条，`lot_no_detail.enabled=0`、`config_json.enabled=false`、`param_source.limit=200`。
  - `.\\.venv\\Scripts\\python.exe -m app.main` dry-run 显示 loaded 33 enabled API config(s)，说明 `lot_no_detail` 没有误进入 enabled。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 185 个、真实配置 API 50 个、enabled 33 个；执行分层摘要为 `configured=50`、`needs_upstream_params=63`、`needs_sensitive_review=22`、`defer_or_review=50`。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，80 个测试通过。
- 当前结论：
  - `lot_no_detail` 已从 1006/8261 推进到 1206/8261，剩余缺口 7055。
  - 当前 configured real API 仍为 50 个，enabled 仍为 33 个。
  - 下一阶段建议继续用 `lot_no_detail.param_source.limit=200` 做历史回填窗口；9N 完成后复盘 9L-9N。

## Stage 9N

- 阶段目标：继续推进完整拉取；复用 `lot_no_detail.param_source.limit=200` 做下一段历史回填，不启用，并复盘 9L-9N。
- 已完成：
  - 只读 DB 起点确认 `api_config` 总配置 52 条、enabled 33 条；`lot_no_detail.enabled=0`、`config_json.enabled=false`、`param_source.limit=200`。
  - 起点 `lot_no_detail` checkpoint 指向批次 `sync_20260704_214826_586331`，记录 `param_offset=1006`、`param_limit=200`、`next_param_offset=1206`、`item_count=200`、`total_count=200`。
  - 起点 `lot_no_detail` 累计 raw 为 1206 条、1206 个不同交货单号；上游 `storage_inbound_page.raw_json.fcode` 且 `opType=LNInbound` 的不同交货单号为 8261 个，剩余缺口为 7055。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api lot_no_detail`，通过，批次 `sync_20260704_220222_951463`，请求 200 次，写入 200 条。
  - DB 核验显示该批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`，从 `2026-07-04 22:02:23` 到 `2026-07-04 22:07:19`。
  - 同批次 `sync_api_log` 为 `status=success`、`request_count=200`、`success_count=200`、`failed_count=0`、`error_message=NULL`。
  - 同批次 raw 为 200 条、200 个不同 `source_primary_key`、200 个不同 `data_hash`；`failed_request_log` 为 0 条。
  - 9N 后 `lot_no_detail` 累计 raw 为 1406 条、1406 个不同交货单号；checkpoint 指向批次 `sync_20260704_220222_951463`，记录 `param_offset=1206`、`param_limit=200`、`next_param_offset=1406`、`item_count=200`、`total_count=200`。
  - 按 `storage_inbound_page.raw_json.fcode` 且 `opType=LNInbound` 口径核验，`lot_no_detail` 剩余历史缺口为 6855 个。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，DB 同步 API 配置 52 条。
  - DB 配置核验显示 `api_config` 总配置 52 条、enabled 33 条，`lot_no_detail.enabled=0`、`config_json.enabled=false`、`param_source.limit=200`。
  - `.\\.venv\\Scripts\\python.exe -m app.main` dry-run 显示 loaded 33 enabled API config(s)，说明 `lot_no_detail` 没有误进入 enabled。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 185 个、真实配置 API 50 个、enabled 33 个；执行分层摘要为 `configured=50`、`needs_upstream_params=63`、`needs_sensitive_review=22`、`defer_or_review=50`。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，80 个测试通过。
- 9L-9N 复盘：
  - 三轮累计新增 600 个 `lot_no_detail` 交货单详情，覆盖从 806/8261 推进到 1406/8261，剩余缺口从 7455 降到 6855。
  - 三轮均为 200 请求、200 raw、失败 0；批次耗时约 248 秒、263 秒、296 秒，200 窗口节奏仍稳定。
  - 当前仍只覆盖约 17.0%，距离完整历史回填还有 6855 个交货单号，不满足进入 daily enabled 的前提。
  - 下一组 9O-9Q 仍建议继续 200 窗口，除非出现 401、锁等待、明显限流或单轮耗时异常；启用前必须先完成历史缺口归零和缺失主键扫描验证。
- 当前结论：
  - `lot_no_detail` 已从 1206/8261 推进到 1406/8261，剩余缺口 6855。
  - 当前 configured real API 仍为 50 个，enabled 仍为 33 个。
  - 下一阶段建议继续用 `lot_no_detail.param_source.limit=200` 做历史回填窗口；下一次小复盘放在 9Q 完成后。

## Stage 9O

- 阶段目标：继续推进完整拉取；复用 `lot_no_detail.param_source.limit=200` 做下一段历史回填，不启用。
- 已完成：
  - 只读 DB 起点确认 `api_config` 总配置 52 条、enabled 33 条；`lot_no_detail.enabled=0`、`config_json.enabled=false`、`param_source.limit=200`。
  - 起点 `lot_no_detail` checkpoint 指向批次 `sync_20260704_220222_951463`，记录 `param_offset=1206`、`param_limit=200`、`next_param_offset=1406`、`item_count=200`、`total_count=200`。
  - 起点 `lot_no_detail` 累计 raw 为 1406 条、1406 个不同交货单号；上游 `storage_inbound_page.raw_json.fcode` 且 `opType=LNInbound` 的不同交货单号为 8261 个，剩余缺口为 6855。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api lot_no_detail`，通过，批次 `sync_20260704_221403_052634`，请求 200 次，写入 200 条。
  - DB 核验显示该批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`，从 `2026-07-04 22:14:03` 到 `2026-07-04 22:18:36`。
  - 同批次 `sync_api_log` 为 `status=success`、`request_count=200`、`success_count=200`、`failed_count=0`、`error_message=NULL`。
  - 同批次 raw 为 200 条、200 个不同 `source_primary_key`、200 个不同 `data_hash`；`failed_request_log` 为 0 条。
  - 9O 后 `lot_no_detail` 累计 raw 为 1606 条、1606 个不同交货单号；checkpoint 指向批次 `sync_20260704_221403_052634`，记录 `param_offset=1406`、`param_limit=200`、`next_param_offset=1606`、`item_count=200`、`total_count=200`。
  - 按 `storage_inbound_page.raw_json.fcode` 且 `opType=LNInbound` 口径核验，`lot_no_detail` 剩余历史缺口为 6655 个。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，DB 同步 API 配置 52 条。
  - DB 配置核验显示 `api_config` 总配置 52 条、enabled 33 条，`lot_no_detail.enabled=0`、`config_json.enabled=false`、`param_source.limit=200`。
  - `.\\.venv\\Scripts\\python.exe -m app.main` dry-run 显示 loaded 33 enabled API config(s)，说明 `lot_no_detail` 没有误进入 enabled。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 185 个、真实配置 API 50 个、enabled 33 个；执行分层摘要为 `configured=50`、`needs_upstream_params=63`、`needs_sensitive_review=22`、`defer_or_review=50`。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，80 个测试通过。
- 当前结论：
  - `lot_no_detail` 已从 1406/8261 推进到 1606/8261，剩余缺口 6655。
  - 当前 configured real API 仍为 50 个，enabled 仍为 33 个。
  - 下一阶段建议继续用 `lot_no_detail.param_source.limit=200` 做历史回填窗口；下一次小复盘仍放在 9Q 完成后。

## Stage 9P

- 阶段目标：继续推进完整拉取；复用 `lot_no_detail.param_source.limit=200` 做下一段历史回填，不启用。
- 已完成：
  - 只读 DB 起点确认 `api_config` 总配置 52 条、enabled 33 条；`lot_no_detail.enabled=0`、`config_json.enabled=false`、`param_source.limit=200`。
  - 起点 `lot_no_detail` checkpoint 指向批次 `sync_20260704_221403_052634`，记录 `param_offset=1406`、`param_limit=200`、`next_param_offset=1606`、`item_count=200`、`total_count=200`。
  - 起点 `lot_no_detail` 累计 raw 为 1606 条、1606 个不同交货单号；上游 `storage_inbound_page.raw_json.fcode` 且 `opType=LNInbound` 的不同交货单号为 8261 个，剩余缺口为 6655。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api lot_no_detail`，通过，批次 `sync_20260704_222516_017767`，请求 200 次，写入 200 条。
  - DB 核验显示该批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`，从 `2026-07-04 22:25:16` 到 `2026-07-04 22:29:21`。
  - 同批次 `sync_api_log` 为 `status=success`、`request_count=200`、`success_count=200`、`failed_count=0`、`error_message=NULL`。
  - 同批次 raw 为 200 条、200 个不同 `source_primary_key`、200 个不同 `data_hash`；`failed_request_log` 为 0 条。
  - 9P 后 `lot_no_detail` 累计 raw 为 1806 条、1806 个不同交货单号；checkpoint 指向批次 `sync_20260704_222516_017767`，记录 `param_offset=1606`、`param_limit=200`、`next_param_offset=1806`、`item_count=200`、`total_count=200`。
  - 按 `storage_inbound_page.raw_json.fcode` 且 `opType=LNInbound` 口径核验，`lot_no_detail` 剩余历史缺口为 6455 个。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，DB 同步 API 配置 52 条。
  - DB 配置核验显示 `api_config` 总配置 52 条、enabled 33 条，`lot_no_detail.enabled=0`、`config_json.enabled=false`、`param_source.limit=200`。
  - `.\\.venv\\Scripts\\python.exe -m app.main` dry-run 显示 loaded 33 enabled API config(s)，说明 `lot_no_detail` 没有误进入 enabled。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 185 个、真实配置 API 50 个、enabled 33 个；执行分层摘要为 `configured=50`、`needs_upstream_params=63`、`needs_sensitive_review=22`、`defer_or_review=50`。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，80 个测试通过。
- 当前结论：
  - `lot_no_detail` 已从 1606/8261 推进到 1806/8261，剩余缺口 6455。
  - 当前 configured real API 仍为 50 个，enabled 仍为 33 个。
  - 下一阶段建议继续用 `lot_no_detail.param_source.limit=200` 做历史回填窗口；9Q 完成后复盘 9O-9Q 三轮。
- 9P 全面复盘：
  - 当前主同步框架、参数来源推进、checkpoint、raw 幂等写入和失败记录链路稳定；9P 新增 200 条 `lot_no_detail`，失败 0。
  - 当前完整拉取的主要瓶颈不是框架能力，而是剩余 disabled 大体量接口、参数型接口历史缺口、敏感接口和风险接口的逐步验证。
  - `lot_no_detail` 当前只覆盖 1806/8261，剩余 6455 个交货单号；在缺口归零并验证缺失扫描前，不应加入 enabled。
  - 33 个 enabled API 的最新完整批次证据仍来自 9G，耗时约 3852 秒；继续扩大 enabled 前必须继续关注 cron 窗口和运行成本。
  - 覆盖矩阵显示 configured 50、enabled 33，未配置部分已经没有普通低风险直接探测候选，后续应继续按 `needs_param_source`、`needs_sensitive_review`、`risk_review_before_probe` 和 `defer_write_or_mutation` 分层推进。
  - 下一步策略保持简单：继续用 200 窗口推进 `lot_no_detail`，每轮用 DB 批次、checkpoint、raw 增量、失败请求和测试结果做验收。

## Stage 9Q

- 阶段目标：继续推进完整拉取；复用 `lot_no_detail.param_source.limit=200` 做下一段历史回填，不启用，并复盘 9O-9Q。
- 已完成：
  - 只读 DB 起点确认 `api_config` 总配置 52 条、enabled 33 条；`lot_no_detail.enabled=0`、`config_json.enabled=false`、`param_source.limit=200`。
  - 起点 `lot_no_detail` checkpoint 指向批次 `sync_20260704_222516_017767`，记录 `param_offset=1606`、`param_limit=200`、`next_param_offset=1806`、`item_count=200`、`total_count=200`。
  - 起点 `lot_no_detail` 累计 raw 为 1806 条、1806 个不同交货单号；上游 `storage_inbound_page.raw_json.fcode` 且 `opType=LNInbound` 的不同交货单号为 8261 个，剩余缺口为 6455。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api lot_no_detail`，通过，批次 `sync_20260704_224135_758655`，请求 200 次，写入 200 条。
  - DB 核验显示该批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`，从 `2026-07-04 22:41:36` 到 `2026-07-04 22:45:58`。
  - 同批次 `sync_api_log` 为 `status=success`、`request_count=200`、`success_count=200`、`failed_count=0`、`error_message=NULL`。
  - 同批次 raw 为 200 条、200 个不同 `source_primary_key`、200 个不同 `data_hash`；`failed_request_log` 为 0 条。
  - 9Q 后 `lot_no_detail` 累计 raw 为 2006 条、2006 个不同交货单号；checkpoint 指向批次 `sync_20260704_224135_758655`，记录 `param_offset=1806`、`param_limit=200`、`next_param_offset=2006`、`item_count=200`、`total_count=200`。
  - 按 `storage_inbound_page.raw_json.fcode` 且 `opType=LNInbound` 口径核验，`lot_no_detail` 剩余历史缺口为 6255 个。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，DB 同步 API 配置 52 条。
  - DB 配置核验显示 `api_config` 总配置 52 条、enabled 33 条，`lot_no_detail.enabled=0`、`config_json.enabled=false`、`param_source.limit=200`。
  - `.\\.venv\\Scripts\\python.exe -m app.main` dry-run 显示 loaded 33 enabled API config(s)，说明 `lot_no_detail` 没有误进入 enabled。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 185 个、真实配置 API 50 个、enabled 33 个；执行分层摘要为 `configured=50`、`needs_upstream_params=63`、`needs_sensitive_review=22`、`defer_or_review=50`。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，80 个测试通过。
- 9O-9Q 复盘：
  - 三轮累计新增 600 个 `lot_no_detail` 交货单详情，覆盖从 1406/8261 推进到 2006/8261，剩余缺口从 6855 降到 6255。
  - 三轮均为 200 请求、200 raw、失败 0；批次耗时约 273 秒、245 秒、262 秒，200 窗口节奏稳定。
  - 当前覆盖约 24.3%，距离完整历史回填仍有 6255 个交货单号，不满足进入 daily enabled 的前提。
  - 下一组 9R-9T 仍建议继续 200 窗口，除非出现 401、锁等待、明显限流或单轮耗时异常；启用前必须先完成历史缺口归零和缺失主键扫描验证。
- 当前结论：
  - `lot_no_detail` 已从 1806/8261 推进到 2006/8261，剩余缺口 6255。
  - 当前 configured real API 仍为 50 个，enabled 仍为 33 个。
  - 下一阶段建议继续用 `lot_no_detail.param_source.limit=200` 做历史回填窗口；下一次小复盘放在 9T 完成后。

## Stage 9R

- 阶段目标：继续推进完整拉取；复用 `lot_no_detail.param_source.limit=200` 做下一段历史回填，不启用。
- 已完成：
  - 只读 DB 起点确认 `api_config` 总配置 52 条、enabled 33 条；`lot_no_detail.enabled=0`、`config_json.enabled=false`、`param_source.limit=200`。
  - 起点 `lot_no_detail` checkpoint 指向批次 `sync_20260704_224135_758655`，记录 `param_offset=1806`、`param_limit=200`、`next_param_offset=2006`、`item_count=200`、`total_count=200`。
  - 起点 `lot_no_detail` 累计 raw 为 2006 条、2006 个不同交货单号；上游 `storage_inbound_page.raw_json.fcode` 且 `opType=LNInbound` 的不同交货单号为 8261 个，剩余缺口为 6255。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api lot_no_detail`，通过，批次 `sync_20260704_225302_414309`，请求 200 次，写入 200 条。
  - DB 核验显示该批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`，从 `2026-07-04 22:53:02` 到 `2026-07-04 22:57:24`。
  - 同批次 `sync_api_log` 为 `status=success`、`request_count=200`、`success_count=200`、`failed_count=0`、`error_message=NULL`。
  - 同批次 raw 为 200 条、200 个不同 `source_primary_key`、200 个不同 `data_hash`；`failed_request_log` 为 0 条。
  - 9R 后 `lot_no_detail` 累计 raw 为 2206 条、2206 个不同交货单号；checkpoint 指向批次 `sync_20260704_225302_414309`，记录 `param_offset=2006`、`param_limit=200`、`next_param_offset=2206`、`item_count=200`、`total_count=200`。
  - 按 `storage_inbound_page.raw_json.fcode` 且 `opType=LNInbound` 口径核验，`lot_no_detail` 剩余历史缺口为 6055 个。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，DB 同步 API 配置 52 条。
  - DB 配置核验显示 `api_config` 总配置 52 条、enabled 33 条，`lot_no_detail.enabled=0`、`config_json.enabled=false`、`param_source.limit=200`。
  - `.\\.venv\\Scripts\\python.exe -m app.main` dry-run 显示 loaded 33 enabled API config(s)，说明 `lot_no_detail` 没有误进入 enabled。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 185 个、真实配置 API 50 个、enabled 33 个；执行分层摘要为 `configured=50`、`needs_upstream_params=63`、`needs_sensitive_review=22`、`defer_or_review=50`。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，80 个测试通过。
- 当前结论：
  - `lot_no_detail` 已从 2006/8261 推进到 2206/8261，剩余缺口 6055。
  - 当前 configured real API 仍为 50 个，enabled 仍为 33 个。
  - 下一阶段建议继续用 `lot_no_detail.param_source.limit=200` 做历史回填窗口；下一次小复盘放在 9T 完成后。

## Stage 9S

- 阶段目标：继续推进完整拉取；复用 `lot_no_detail.param_source.limit=200` 做下一段历史回填，不启用。
- 已完成：
  - 只读 DB 起点确认 `api_config` 总配置 52 条、enabled 33 条；`lot_no_detail.enabled=0`、`config_json.enabled=false`、`param_source.limit=200`。
  - 起点 `lot_no_detail` checkpoint 指向批次 `sync_20260704_225302_414309`，记录 `param_offset=2006`、`param_limit=200`、`next_param_offset=2206`、`item_count=200`、`total_count=200`。
  - 起点 `lot_no_detail` 累计 raw 为 2206 条、2206 个不同交货单号；上游 `storage_inbound_page.raw_json.fcode` 且 `opType=LNInbound` 的不同交货单号为 8261 个，剩余缺口为 6055。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api lot_no_detail`，通过，批次 `sync_20260704_230406_864784`，请求 200 次，写入 200 条。
  - DB 核验显示该批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`，从 `2026-07-04 23:04:07` 到 `2026-07-04 23:09:01`。
  - 同批次 `sync_api_log` 为 `status=success`、`request_count=200`、`success_count=200`、`failed_count=0`、`error_message=NULL`。
  - 同批次 raw 为 200 条、200 个不同 `source_primary_key`、200 个不同 `data_hash`；`failed_request_log` 为 0 条。
  - 9S 后 `lot_no_detail` 累计 raw 为 2406 条、2406 个不同交货单号；checkpoint 指向批次 `sync_20260704_230406_864784`，记录 `param_offset=2206`、`param_limit=200`、`next_param_offset=2406`、`item_count=200`、`total_count=200`。
  - 按 `storage_inbound_page.raw_json.fcode` 且 `opType=LNInbound` 口径核验，`lot_no_detail` 剩余历史缺口为 5855 个。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，DB 同步 API 配置 52 条。
  - DB 配置核验显示 `api_config` 总配置 52 条、enabled 33 条，`lot_no_detail.enabled=0`、`config_json.enabled=false`、`param_source.limit=200`。
  - `.\\.venv\\Scripts\\python.exe -m app.main` dry-run 显示 loaded 33 enabled API config(s)，说明 `lot_no_detail` 没有误进入 enabled。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 185 个、真实配置 API 50 个、enabled 33 个；执行分层摘要为 `configured=50`、`needs_upstream_params=63`、`needs_sensitive_review=22`、`defer_or_review=50`。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，80 个测试通过。
- 当前结论：
  - `lot_no_detail` 已从 2206/8261 推进到 2406/8261，剩余缺口 5855。
  - 当前 configured real API 仍为 50 个，enabled 仍为 33 个。
  - 下一阶段建议继续用 `lot_no_detail.param_source.limit=200` 做历史回填窗口；9T 完成后复盘 9R-9T 三轮。

## Stage 9T

- 阶段目标：继续推进完整拉取；复用 `lot_no_detail.param_source.limit=200` 做下一段历史回填，不启用，并复盘 9R-9T。
- 已完成：
  - 只读 DB 起点确认 `api_config` 总配置 52 条、enabled 33 条；`lot_no_detail.enabled=0`、`config_json.enabled=false`、`param_source.limit=200`。
  - 起点 `lot_no_detail` checkpoint 指向批次 `sync_20260704_230406_864784`，记录 `param_offset=2206`、`param_limit=200`、`next_param_offset=2406`、`item_count=200`、`total_count=200`。
  - 起点 `lot_no_detail` 累计 raw 为 2406 条、2406 个不同交货单号；上游 `storage_inbound_page.raw_json.fcode` 且 `opType=LNInbound` 的不同交货单号为 8261 个，剩余缺口为 5855。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api lot_no_detail`，通过，批次 `sync_20260704_231602_545149`，请求 200 次，写入 200 条。
  - DB 核验显示该批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`，从 `2026-07-04 23:16:03` 到 `2026-07-04 23:20:42`。
  - 同批次 `sync_api_log` 为 `status=success`、`request_count=200`、`success_count=200`、`failed_count=0`、`error_message=NULL`。
  - 同批次 raw 为 200 条、200 个不同 `source_primary_key`、200 个不同 `data_hash`；`failed_request_log` 为 0 条。
  - 9T 后 `lot_no_detail` 累计 raw 为 2606 条、2606 个不同交货单号；checkpoint 指向批次 `sync_20260704_231602_545149`，记录 `param_offset=2406`、`param_limit=200`、`next_param_offset=2606`、`item_count=200`、`total_count=200`。
  - 按 `storage_inbound_page.raw_json.fcode` 且 `opType=LNInbound` 口径核验，`lot_no_detail` 剩余历史缺口为 5655 个。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，DB 同步 API 配置 52 条。
  - DB 配置核验显示 `api_config` 总配置 52 条、enabled 33 条，`lot_no_detail.enabled=0`、`config_json.enabled=false`、`param_source.limit=200`。
  - `.\\.venv\\Scripts\\python.exe -m app.main` dry-run 显示 loaded 33 enabled API config(s)，说明 `lot_no_detail` 没有误进入 enabled。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 185 个、真实配置 API 50 个、enabled 33 个；执行分层摘要为 `configured=50`、`needs_upstream_params=63`、`needs_sensitive_review=22`、`defer_or_review=50`。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，80 个测试通过。
- 9R-9T 复盘：
  - 三轮累计新增 600 个 `lot_no_detail` 交货单详情，覆盖从 2006/8261 推进到 2606/8261，剩余缺口从 6255 降到 5655。
  - 三轮均为 200 请求、200 raw、失败 0；批次耗时约 262 秒、294 秒、279 秒，200 窗口节奏仍稳定。
  - 当前覆盖约 31.5%，距离完整历史回填仍有 5655 个交货单号，不满足进入 daily enabled 的前提。
  - 下一组 9U-9W 仍建议继续 200 窗口，除非出现 401、锁等待、明显限流或单轮耗时异常；启用前必须先完成历史缺口归零和缺失主键扫描验证。
- 当前结论：
  - `lot_no_detail` 已从 2406/8261 推进到 2606/8261，剩余缺口 5655。
  - 当前 configured real API 仍为 50 个，enabled 仍为 33 个。
  - 下一阶段建议继续用 `lot_no_detail.param_source.limit=200` 做历史回填窗口；下一次小复盘放在 9W 完成后。

## Stage 9U

- 阶段目标：继续推进完整拉取；复用 `lot_no_detail.param_source.limit=200` 做下一段历史回填，不启用。
- 已完成：
  - 只读 DB 起点确认 `api_config` 总配置 52 条、enabled 33 条；`lot_no_detail.enabled=0`、`config_json.enabled=false`、`param_source.limit=200`。
  - 起点 `lot_no_detail` checkpoint 指向批次 `sync_20260704_231602_545149`，记录 `param_offset=2406`、`param_limit=200`、`next_param_offset=2606`、`item_count=200`、`total_count=200`。
  - 起点 `lot_no_detail` 累计 raw 为 2606 条、2606 个不同交货单号；上游 `storage_inbound_page.raw_json.fcode` 且 `opType=LNInbound` 的不同交货单号为 8261 个，剩余缺口为 5655。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api lot_no_detail`，通过，批次 `sync_20260704_232906_917435`，请求 200 次，写入 200 条。
  - DB 核验显示该批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`，从 `2026-07-04 23:29:07` 到 `2026-07-04 23:33:43`。
  - 同批次 `sync_api_log` 为 `status=success`、`request_count=200`、`success_count=200`、`failed_count=0`、`error_message=NULL`。
  - 同批次 raw 为 200 条、200 个不同 `source_primary_key`、200 个不同 `data_hash`；`failed_request_log` 为 0 条。
  - 9U 后 `lot_no_detail` 累计 raw 为 2806 条、2806 个不同交货单号；checkpoint 指向批次 `sync_20260704_232906_917435`，记录 `param_offset=2606`、`param_limit=200`、`next_param_offset=2806`、`item_count=200`、`total_count=200`。
  - 按 `storage_inbound_page.raw_json.fcode` 且 `opType=LNInbound` 口径核验，`lot_no_detail` 剩余历史缺口为 5455 个。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，DB 同步 API 配置 52 条。
  - DB 配置核验显示 `api_config` 总配置 52 条、enabled 33 条，`lot_no_detail.enabled=0`、`config_json.enabled=false`、`param_source.limit=200`。
  - `.\\.venv\\Scripts\\python.exe -m app.main` dry-run 显示 loaded 33 enabled API config(s)，说明 `lot_no_detail` 没有误进入 enabled。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 185 个、真实配置 API 50 个、enabled 33 个；执行分层摘要为 `configured=50`、`needs_upstream_params=63`、`needs_sensitive_review=22`、`defer_or_review=50`。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，80 个测试通过。
- 当前结论：
  - `lot_no_detail` 已从 2606/8261 推进到 2806/8261，剩余缺口 5455。
  - 当前 configured real API 仍为 50 个，enabled 仍为 33 个。
  - 下一阶段建议继续用 `lot_no_detail.param_source.limit=200` 做历史回填窗口；下一次小复盘放在 9W 完成后。

## Stage 9V

- 阶段目标：继续推进完整拉取；复用 `lot_no_detail.param_source.limit=200` 做下一段历史回填，不启用。
- 已完成：
  - 只读 DB 起点确认 `api_config` 总配置 52 条、enabled 33 条；`lot_no_detail.enabled=0`、`config_json.enabled=false`、`param_source.limit=200`。
  - 起点 `lot_no_detail` checkpoint 指向批次 `sync_20260704_232906_917435`，记录 `param_offset=2606`、`param_limit=200`、`next_param_offset=2806`、`item_count=200`、`total_count=200`。
  - 起点 `lot_no_detail` 累计 raw 为 2806 条、2806 个不同交货单号；上游 `storage_inbound_page.raw_json.fcode` 且 `opType=LNInbound` 的不同交货单号为 8261 个，剩余缺口为 5455。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api lot_no_detail`，通过，批次 `sync_20260704_234029_450921`，请求 200 次，写入 200 条。
  - DB 核验显示该批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`，从 `2026-07-04 23:40:29` 到 `2026-07-04 23:44:48`。
  - 同批次 `sync_api_log` 为 `status=success`、`request_count=200`、`success_count=200`、`failed_count=0`、`error_message=NULL`。
  - 同批次 raw 为 200 条、200 个不同 `source_primary_key`、200 个不同 `data_hash`；`failed_request_log` 为 0 条。
  - 9V 后 `lot_no_detail` 累计 raw 为 3006 条、3006 个不同交货单号；checkpoint 指向批次 `sync_20260704_234029_450921`，记录 `param_offset=2806`、`param_limit=200`、`next_param_offset=3006`、`item_count=200`、`total_count=200`。
  - 按 `storage_inbound_page.raw_json.fcode` 且 `opType=LNInbound` 口径核验，`lot_no_detail` 剩余历史缺口为 5255 个。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，DB 同步 API 配置 52 条。
  - DB 配置核验显示 `api_config` 总配置 52 条、enabled 33 条，`lot_no_detail.enabled=0`、`config_json.enabled=false`、`param_source.limit=200`。
  - `.\\.venv\\Scripts\\python.exe -m app.main` dry-run 显示 loaded 33 enabled API config(s)，说明 `lot_no_detail` 没有误进入 enabled。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 185 个、真实配置 API 50 个、enabled 33 个；执行分层摘要为 `configured=50`、`needs_upstream_params=63`、`needs_sensitive_review=22`、`defer_or_review=50`。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，80 个测试通过。
- 当前结论：
  - `lot_no_detail` 已从 2806/8261 推进到 3006/8261，剩余缺口 5255。
  - 当前 configured real API 仍为 50 个，enabled 仍为 33 个。
  - 下一阶段建议继续用 `lot_no_detail.param_source.limit=200` 做历史回填窗口；9W 完成后复盘 9U-9W 三轮。

## Stage 9W

- 阶段目标：继续推进完整拉取；复用 `lot_no_detail.param_source.limit=200` 做下一段历史回填，不启用，并复盘 9U-9W。
- 已完成：
  - 只读 DB 起点确认 `api_config` 总配置 52 条、enabled 33 条；`lot_no_detail.enabled=0`、`config_json.enabled=false`、`param_source.limit=200`。
  - 起点 `lot_no_detail` checkpoint 指向批次 `sync_20260704_234029_450921`，记录 `param_offset=2806`、`param_limit=200`、`next_param_offset=3006`、`item_count=200`、`total_count=200`。
  - 起点 `lot_no_detail` 累计 raw 为 3006 条、3006 个不同交货单号；上游 `storage_inbound_page.raw_json.fcode` 且 `opType=LNInbound` 的不同交货单号为 8261 个，剩余缺口为 5255。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api lot_no_detail`，通过，批次 `sync_20260704_235158_844882`，请求 200 次，写入 200 条。
  - DB 核验显示该批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`，从 `2026-07-04 23:51:59` 到 `2026-07-04 23:56:10`。
  - 同批次 `sync_api_log` 为 `status=success`、`request_count=200`、`success_count=200`、`failed_count=0`、`error_message=NULL`。
  - 同批次 raw 为 200 条、200 个不同 `source_primary_key`、200 个不同 `data_hash`；`failed_request_log` 为 0 条。
  - 9W 后 `lot_no_detail` 累计 raw 为 3206 条、3206 个不同交货单号；checkpoint 指向批次 `sync_20260704_235158_844882`，记录 `param_offset=3006`、`param_limit=200`、`next_param_offset=3206`、`item_count=200`、`total_count=200`。
  - 按 `storage_inbound_page.raw_json.fcode` 且 `opType=LNInbound` 口径核验，`lot_no_detail` 剩余历史缺口为 5055 个。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，DB 同步 API 配置 52 条。
  - DB 配置核验显示 `api_config` 总配置 52 条、enabled 33 条，`lot_no_detail.enabled=0`、`config_json.enabled=false`、`param_source.limit=200`。
  - `.\\.venv\\Scripts\\python.exe -m app.main` dry-run 显示 loaded 33 enabled API config(s)，说明 `lot_no_detail` 没有误进入 enabled。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 185 个、真实配置 API 50 个、enabled 33 个；执行分层摘要为 `configured=50`、`needs_upstream_params=63`、`needs_sensitive_review=22`、`defer_or_review=50`。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，80 个测试通过。
- 9U-9W 复盘：
  - 三轮累计新增 600 个 `lot_no_detail` 交货单详情，覆盖从 2606/8261 推进到 3206/8261，剩余缺口从 5655 降到 5055。
  - 三轮均为 200 请求、200 raw、失败 0；批次耗时约 276 秒、259 秒、251 秒，200 窗口节奏稳定。
  - 当前覆盖约 38.8%，距离完整历史回填仍有 5055 个交货单号，不满足进入 daily enabled 的前提。
  - 下一组 9X-9Z 仍建议继续 200 窗口，除非出现 401、锁等待、明显限流或单轮耗时异常；启用前必须先完成历史缺口归零和缺失主键扫描验证。
- 当前结论：
  - `lot_no_detail` 已从 3006/8261 推进到 3206/8261，剩余缺口 5055。
  - 当前 configured real API 仍为 50 个，enabled 仍为 33 个。
  - 下一阶段建议继续用 `lot_no_detail.param_source.limit=200` 做历史回填窗口；下一次小复盘放在 9Z 完成后。

## Stage 9X

- 阶段目标：继续推进完整拉取；复用 `lot_no_detail.param_source.limit=200` 做下一段历史回填，不启用。
- 已完成：
  - 只读 DB 起点确认 `api_config` 总配置 52 条、enabled 33 条；`lot_no_detail.enabled=0`、`config_json.enabled=false`、`param_source.limit=200`。
  - 起点 `lot_no_detail` checkpoint 指向批次 `sync_20260704_235158_844882`，记录 `param_offset=3006`、`param_limit=200`、`next_param_offset=3206`、`item_count=200`、`total_count=200`。
  - 起点 `lot_no_detail` 累计 raw 为 3206 条、3206 个不同交货单号；上游 `storage_inbound_page.raw_json.fcode` 且 `opType=LNInbound` 的不同交货单号为 8261 个，剩余缺口为 5055。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api lot_no_detail`，通过，批次 `sync_20260705_000244_482705`，请求 200 次，写入 200 条。
  - DB 核验显示该批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`，从 `2026-07-05 00:02:44` 到 `2026-07-05 00:08:19`。
  - 同批次 `sync_api_log` 为 `status=success`、`request_count=200`、`success_count=200`、`failed_count=0`、`error_message=NULL`。
  - 同批次 raw 为 200 条、200 个不同 `source_primary_key`、200 个不同 `data_hash`；`failed_request_log` 为 0 条。
  - 9X 后 `lot_no_detail` 累计 raw 为 3406 条、3406 个不同交货单号；checkpoint 指向批次 `sync_20260705_000244_482705`，记录 `param_offset=3206`、`param_limit=200`、`next_param_offset=3406`、`item_count=200`、`total_count=200`。
  - 按 `storage_inbound_page.raw_json.fcode` 且 `opType=LNInbound` 口径核验，`lot_no_detail` 剩余历史缺口为 4855 个。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，DB 同步 API 配置 52 条。
  - DB 配置核验显示 `api_config` 总配置 52 条、enabled 33 条，`lot_no_detail.enabled=0`、`config_json.enabled=false`、`param_source.limit=200`。
  - `.\\.venv\\Scripts\\python.exe -m app.main` dry-run 显示 loaded 33 enabled API config(s)，说明 `lot_no_detail` 没有误进入 enabled。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 185 个、真实配置 API 50 个、enabled 33 个；执行分层摘要为 `configured=50`、`needs_upstream_params=63`、`needs_sensitive_review=22`、`defer_or_review=50`。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，80 个测试通过。
- 当前结论：
  - `lot_no_detail` 已从 3206/8261 推进到 3406/8261，剩余缺口 4855。
  - 当前 configured real API 仍为 50 个，enabled 仍为 33 个。
  - 下一阶段建议继续用 `lot_no_detail.param_source.limit=200` 做历史回填窗口；下一次小复盘放在 9Z 完成后。

## Stage 9Y

- 阶段目标：继续推进完整拉取；复用 `lot_no_detail.param_source.limit=200` 做下一段历史回填，不启用。
- 已完成：
  - 只读 DB 起点确认 `api_config` 总配置 52 条、enabled 33 条；`lot_no_detail.enabled=0`、`config_json.enabled=false`、`param_source.limit=200`。
  - 起点 `lot_no_detail` checkpoint 指向批次 `sync_20260705_000244_482705`，记录 `param_offset=3206`、`param_limit=200`、`next_param_offset=3406`、`item_count=200`、`total_count=200`。
  - 起点 `lot_no_detail` 累计 raw 为 3406 条、3406 个不同交货单号；上游 `storage_inbound_page.raw_json.fcode` 且 `opType=LNInbound` 的不同交货单号为 8261 个，剩余缺口为 4855。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api lot_no_detail`，通过，批次 `sync_20260705_001721_536399`，请求 200 次，写入 200 条。
  - DB 核验显示该批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`，从 `2026-07-05 00:17:22` 到 `2026-07-05 00:22:55`。
  - 同批次 `sync_api_log` 为 `status=success`、`request_count=200`、`success_count=200`、`failed_count=0`、`error_message=NULL`。
  - 同批次 raw 为 200 条、200 个不同 `source_primary_key`、200 个不同 `data_hash`；`failed_request_log` 为 0 条。
  - 9Y 后 `lot_no_detail` 累计 raw 为 3606 条、3606 个不同交货单号；checkpoint 指向批次 `sync_20260705_001721_536399`，记录 `param_offset=3406`、`param_limit=200`、`next_param_offset=3606`、`item_count=200`、`total_count=200`。
  - 按 `storage_inbound_page.raw_json.fcode` 且 `opType=LNInbound` 口径核验，`lot_no_detail` 剩余历史缺口为 4655 个。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，DB 同步 API 配置 52 条。
  - DB 配置核验显示 `api_config` 总配置 52 条、enabled 33 条，`lot_no_detail.enabled=0`、`config_json.enabled=false`、`param_source.limit=200`。
  - `.\\.venv\\Scripts\\python.exe -m app.main` dry-run 显示 loaded 33 enabled API config(s)，说明 `lot_no_detail` 没有误进入 enabled。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 185 个、真实配置 API 50 个、enabled 33 个；执行分层摘要为 `configured=50`、`needs_upstream_params=63`、`needs_sensitive_review=22`、`defer_or_review=50`。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，80 个测试通过。
- 当前结论：
  - `lot_no_detail` 已从 3406/8261 推进到 3606/8261，剩余缺口 4655。
  - 当前 configured real API 仍为 50 个，enabled 仍为 33 个。
  - 下一阶段建议继续用 `lot_no_detail.param_source.limit=200` 做历史回填窗口；9Z 完成后复盘 9X-9Z 三轮。

## Stage 9Z

- 阶段目标：继续推进完整拉取；复用 `lot_no_detail.param_source.limit=200` 做下一段历史回填，不启用，并复盘 9X-9Z。
- 已完成：
  - 只读 DB 起点确认 `api_config` 总配置 52 条、enabled 33 条；`lot_no_detail.enabled=0`、`config_json.enabled=false`、`param_source.limit=200`。
  - 起点 `lot_no_detail` checkpoint 指向批次 `sync_20260705_001721_536399`，记录 `param_offset=3406`、`param_limit=200`、`next_param_offset=3606`、`item_count=200`、`total_count=200`。
  - 起点 `lot_no_detail` 累计 raw 为 3606 条、3606 个不同交货单号；上游 `storage_inbound_page.raw_json.fcode` 且 `opType=LNInbound` 的不同交货单号为 8261 个，剩余缺口为 4655。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api lot_no_detail`，通过，批次 `sync_20260705_002945_035704`，请求 200 次，写入 200 条。
  - DB 核验显示该批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`，从 `2026-07-05 00:29:45` 到 `2026-07-05 00:35:07`。
  - 同批次 `sync_api_log` 为 `status=success`、`request_count=200`、`success_count=200`、`failed_count=0`、`error_message=NULL`。
  - 同批次 raw 为 200 条、200 个不同 `source_primary_key`、200 个不同 `data_hash`；`failed_request_log` 为 0 条。
  - 9Z 后 `lot_no_detail` 累计 raw 为 3806 条、3806 个不同交货单号；checkpoint 指向批次 `sync_20260705_002945_035704`，记录 `param_offset=3606`、`param_limit=200`、`next_param_offset=3806`、`item_count=200`、`total_count=200`。
  - 按 `storage_inbound_page.raw_json.fcode` 且 `opType=LNInbound` 口径核验，`lot_no_detail` 剩余历史缺口为 4455 个。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，DB 同步 API 配置 52 条。
  - DB 配置核验显示 `api_config` 总配置 52 条、enabled 33 条，`lot_no_detail.enabled=0`、`config_json.enabled=false`、`param_source.limit=200`。
  - `.\\.venv\\Scripts\\python.exe -m app.main` dry-run 显示 loaded 33 enabled API config(s)，说明 `lot_no_detail` 没有误进入 enabled。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 185 个、真实配置 API 50 个、enabled 33 个；执行分层摘要为 `configured=50`、`needs_upstream_params=63`、`needs_sensitive_review=22`、`defer_or_review=50`。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，80 个测试通过。
- 9X-9Z 复盘：
  - 三轮累计新增 600 个 `lot_no_detail` 交货单详情，覆盖从 3206/8261 推进到 3806/8261，剩余缺口从 5055 降到 4455。
  - 三轮均为 200 请求、200 raw、失败 0；批次耗时约 335 秒、333 秒、322 秒，200 窗口节奏稳定。
  - 当前覆盖约 46.1%，距离完整历史回填仍有 4455 个交货单号，不满足进入 daily enabled 的前提。
  - 下一组建议继续 200 窗口；如后续要启用，必须先完成历史缺口归零，并验证缺失主键扫描边界不会重复拉取已覆盖交货单。
- 当前结论：
  - `lot_no_detail` 已从 3606/8261 推进到 3806/8261，剩余缺口 4455。
  - 当前 configured real API 仍为 50 个，enabled 仍为 33 个。
  - 下一阶段建议继续用 `lot_no_detail.param_source.limit=200` 做历史回填窗口。

## Stage 10A

- 阶段目标：继续推进完整拉取；复用 `lot_no_detail.param_source.limit=200` 做下一段历史回填，不启用。
- 已完成：
  - 只读 DB 起点确认 `api_config` 总配置 52 条、enabled 33 条；`lot_no_detail.enabled=0`、`config_json.enabled=false`、`param_source.limit=200`。
  - 起点 `lot_no_detail` checkpoint 指向批次 `sync_20260705_002945_035704`，记录 `param_offset=3606`、`param_limit=200`、`next_param_offset=3806`、`item_count=200`、`total_count=200`。
  - 起点 `lot_no_detail` 累计 raw 为 3806 条、3806 个不同交货单号；上游 `storage_inbound_page.raw_json.fcode` 且 `opType=LNInbound` 的不同交货单号为 8261 个，剩余缺口为 4455。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api lot_no_detail`，通过，批次 `sync_20260705_004147_347473`，请求 200 次，写入 200 条。
  - DB 核验显示该批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`，从 `2026-07-05 00:41:47` 到 `2026-07-05 00:46:27`。
  - 同批次 `sync_api_log` 为 `status=success`、`request_count=200`、`success_count=200`、`failed_count=0`、`error_message=NULL`。
  - 同批次 raw 为 200 条、200 个不同 `source_primary_key`、200 个不同 `data_hash`；`failed_request_log` 为 0 条。
  - 10A 后 `lot_no_detail` 累计 raw 为 4006 条、4006 个不同交货单号；checkpoint 指向批次 `sync_20260705_004147_347473`，记录 `param_offset=3806`、`param_limit=200`、`next_param_offset=4006`、`item_count=200`、`total_count=200`。
  - 按 `storage_inbound_page.raw_json.fcode` 且 `opType=LNInbound` 口径核验，`lot_no_detail` 剩余历史缺口为 4255 个。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，DB 同步 API 配置 52 条。
  - DB 配置核验显示 `api_config` 总配置 52 条、enabled 33 条，`lot_no_detail.enabled=0`、`config_json.enabled=false`、`param_source.limit=200`。
  - `.\\.venv\\Scripts\\python.exe -m app.main` dry-run 显示 loaded 33 enabled API config(s)，说明 `lot_no_detail` 没有误进入 enabled。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 185 个、真实配置 API 50 个、enabled 33 个；执行分层摘要为 `configured=50`、`needs_upstream_params=63`、`needs_sensitive_review=22`、`defer_or_review=50`。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，80 个测试通过。
- 当前结论：
  - `lot_no_detail` 已从 3806/8261 推进到 4006/8261，剩余缺口 4255。
  - 当前 configured real API 仍为 50 个，enabled 仍为 33 个。
  - 下一阶段建议继续用 `lot_no_detail.param_source.limit=200` 做历史回填窗口；下一次三轮复盘放在 10C 完成后。

## Stage 10B

- 阶段目标：继续推进完整拉取；复用 `lot_no_detail.param_source.limit=200` 做下一段历史回填，不启用。
- 已完成：
  - 只读 DB 起点确认 `api_config` 总配置 52 条、enabled 33 条；`lot_no_detail.enabled=0`、`config_json.enabled=false`、`param_source.limit=200`。
  - 起点 `lot_no_detail` checkpoint 指向批次 `sync_20260705_004147_347473`，记录 `param_offset=3806`、`param_limit=200`、`next_param_offset=4006`、`item_count=200`、`total_count=200`。
  - 起点 `lot_no_detail` 累计 raw 为 4006 条、4006 个不同交货单号；上游 `storage_inbound_page.raw_json.fcode` 且 `opType=LNInbound` 的不同交货单号为 8261 个，剩余缺口为 4255。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api lot_no_detail`，通过，批次 `sync_20260705_005227_636220`，请求 200 次，写入 200 条。
  - DB 核验显示该批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`，从 `2026-07-05 00:52:28` 到 `2026-07-05 00:57:10`。
  - 同批次 `sync_api_log` 为 `status=success`、`request_count=200`、`success_count=200`、`failed_count=0`、`error_message=NULL`。
  - 同批次 raw 为 200 条、200 个不同 `source_primary_key`、200 个不同 `data_hash`；`failed_request_log` 为 0 条。
  - 10B 后 `lot_no_detail` 累计 raw 为 4206 条、4206 个不同交货单号；checkpoint 指向批次 `sync_20260705_005227_636220`，记录 `param_offset=4006`、`param_limit=200`、`next_param_offset=4206`、`item_count=200`、`total_count=200`。
  - 按 `storage_inbound_page.raw_json.fcode` 且 `opType=LNInbound` 口径核验，`lot_no_detail` 剩余历史缺口为 4055 个。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，DB 同步 API 配置 52 条。
  - DB 配置核验显示 `api_config` 总配置 52 条、enabled 33 条，`lot_no_detail.enabled=0`、`config_json.enabled=false`、`param_source.limit=200`。
  - `.\\.venv\\Scripts\\python.exe -m app.main` dry-run 显示 loaded 33 enabled API config(s)，说明 `lot_no_detail` 没有误进入 enabled。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 185 个、真实配置 API 50 个、enabled 33 个；执行分层摘要为 `configured=50`、`needs_upstream_params=63`、`needs_sensitive_review=22`、`defer_or_review=50`。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，80 个测试通过。
- 当前结论：
  - `lot_no_detail` 已从 4006/8261 推进到 4206/8261，剩余缺口 4055。
  - 当前 configured real API 仍为 50 个，enabled 仍为 33 个。
  - 下一阶段建议继续用 `lot_no_detail.param_source.limit=200` 做历史回填窗口；10C 完成后复盘 10A-10C 三轮。

## Stage 10C

- 阶段目标：继续推进完整拉取；复用 `lot_no_detail.param_source.limit=200` 做下一段历史回填，不启用，并复盘 10A-10C。
- 已完成：
  - 只读 DB 起点确认 `api_config` 总配置 52 条、enabled 33 条；`lot_no_detail.enabled=0`、`config_json.enabled=false`、`param_source.limit=200`。
  - 起点 `lot_no_detail` checkpoint 指向批次 `sync_20260705_005227_636220`，记录 `param_offset=4006`、`param_limit=200`、`next_param_offset=4206`、`item_count=200`、`total_count=200`。
  - 起点 `lot_no_detail` 累计 raw 为 4206 条、4206 个不同交货单号；上游 `storage_inbound_page.raw_json.fcode` 且 `opType=LNInbound` 的不同交货单号为 8261 个，剩余缺口为 4055。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api lot_no_detail`，通过，批次 `sync_20260705_010437_904794`，请求 200 次，写入 200 条。
  - DB 核验显示该批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`，从 `2026-07-05 01:04:38` 到 `2026-07-05 01:11:10`。
  - 同批次 `sync_api_log` 为 `status=success`、`request_count=200`、`success_count=200`、`failed_count=0`、`error_message=NULL`。
  - 同批次 raw 为 200 条、200 个不同 `source_primary_key`、200 个不同 `data_hash`；`failed_request_log` 为 0 条。
  - 10C 后 `lot_no_detail` 累计 raw 为 4406 条、4406 个不同交货单号；checkpoint 指向批次 `sync_20260705_010437_904794`，记录 `param_offset=4206`、`param_limit=200`、`next_param_offset=4406`、`item_count=200`、`total_count=200`。
  - 按 `storage_inbound_page.raw_json.fcode` 且 `opType=LNInbound` 口径核验，`lot_no_detail` 剩余历史缺口为 3855 个。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，DB 同步 API 配置 52 条。
  - `.\\.venv\\Scripts\\python.exe -m app.main` dry-run 显示 loaded 33 enabled API config(s)，说明 `lot_no_detail` 没有误进入 enabled。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 185 个、真实配置 API 50 个、enabled 33 个；执行分层摘要为 `configured=50`、`needs_upstream_params=63`、`needs_sensitive_review=22`、`defer_or_review=50`。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，80 个测试通过。
- 10A-10C 复盘：
  - 三轮累计新增 600 个 `lot_no_detail` 交货单详情，覆盖从 3806/8261 推进到 4406/8261，剩余缺口从 4455 降到 3855。
  - 三轮均为 200 请求、200 raw、失败 0；批次耗时约 280 秒、282 秒、392 秒，10C 较慢但仍在小窗口可接受范围内。
  - 当前覆盖约 53.3%，距离完整历史回填仍有 3855 个交货单号，不满足进入 daily enabled 的前提。
  - 下一组建议继续 200 窗口；如后续要启用，必须先完成历史缺口归零，并验证缺失主键扫描边界不会重复拉取已覆盖交货单。
- 当前结论：
  - `lot_no_detail` 已从 4206/8261 推进到 4406/8261，剩余缺口 3855。
  - 当前 configured real API 仍为 50 个，enabled 仍为 33 个。
  - 下一阶段建议继续用 `lot_no_detail.param_source.limit=200` 做历史回填窗口。

## Stage 10D

- 阶段目标：继续推进完整拉取；复用 `lot_no_detail.param_source.limit=200` 做下一段历史回填，不启用。
- 已完成：
  - 只读 DB 起点确认 `api_config` 总配置 52 条、enabled 33 条；`lot_no_detail.enabled=0`、`config_json.enabled=false`、`param_source.limit=200`。
  - 起点 `lot_no_detail` checkpoint 指向批次 `sync_20260705_010437_904794`，记录 `param_offset=4206`、`param_limit=200`、`next_param_offset=4406`、`item_count=200`、`total_count=200`。
  - 起点 `lot_no_detail` 累计 raw 为 4406 条、4406 个不同交货单号；上游 `storage_inbound_page.raw_json.fcode` 且 `opType=LNInbound` 的不同交货单号为 8261 个，剩余缺口为 3855。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api lot_no_detail`，通过，批次 `sync_20260705_011845_553625`，请求 200 次，写入 200 条。
  - DB 核验显示该批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`，从 `2026-07-05 01:18:46` 到 `2026-07-05 01:24:24`。
  - 同批次 `sync_api_log` 为 `status=success`、`request_count=200`、`success_count=200`、`failed_count=0`、`error_message=NULL`。
  - 同批次 raw 为 200 条、200 个不同 `source_primary_key`、200 个不同 `data_hash`；`failed_request_log` 为 0 条。
  - 10D 后 `lot_no_detail` 累计 raw 为 4606 条、4606 个不同交货单号；checkpoint 指向批次 `sync_20260705_011845_553625`，记录 `param_offset=4406`、`param_limit=200`、`next_param_offset=4606`、`item_count=200`、`total_count=200`。
  - 按 `storage_inbound_page.raw_json.fcode` 且 `opType=LNInbound` 口径核验，`lot_no_detail` 剩余历史缺口为 3655 个。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，DB 同步 API 配置 52 条。
  - `.\\.venv\\Scripts\\python.exe -m app.main` dry-run 显示 loaded 33 enabled API config(s)，说明 `lot_no_detail` 没有误进入 enabled。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 185 个、真实配置 API 50 个、enabled 33 个；执行分层摘要为 `configured=50`、`needs_upstream_params=63`、`needs_sensitive_review=22`、`defer_or_review=50`。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，80 个测试通过。
- 当前结论：
  - `lot_no_detail` 已从 4406/8261 推进到 4606/8261，剩余缺口 3655。
  - 当前 configured real API 仍为 50 个，enabled 仍为 33 个。
  - 下一阶段建议继续用 `lot_no_detail.param_source.limit=200` 做历史回填窗口；下一次三轮复盘放在 10F 完成后。

## Stage 10E

- 阶段目标：继续推进完整拉取；复用 `lot_no_detail.param_source.limit=200` 做下一段历史回填，不启用。
- 已完成：
  - 只读 DB 起点确认 `api_config` 总配置 52 条、enabled 33 条；`lot_no_detail.enabled=0`、`config_json.enabled=false`、`param_source.limit=200`。
  - 起点 `lot_no_detail` checkpoint 指向批次 `sync_20260705_011845_553625`，记录 `param_offset=4406`、`param_limit=200`、`next_param_offset=4606`、`item_count=200`、`total_count=200`。
  - 起点 `lot_no_detail` 累计 raw 为 4606 条、4606 个不同交货单号；上游 `storage_inbound_page.raw_json.fcode` 且 `opType=LNInbound` 的不同交货单号为 8261 个，剩余缺口为 3655。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api lot_no_detail`，通过，批次 `sync_20260705_013034_265972`，请求 200 次，写入 200 条。
  - DB 核验显示该批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`，从 `2026-07-05 01:30:34` 到 `2026-07-05 01:36:24`。
  - 同批次 `sync_api_log` 为 `status=success`、`request_count=200`、`success_count=200`、`failed_count=0`、`error_message=NULL`。
  - 同批次 raw 为 200 条、200 个不同 `source_primary_key`、200 个不同 `data_hash`；`failed_request_log` 为 0 条。
  - 10E 后 `lot_no_detail` 累计 raw 为 4806 条、4806 个不同交货单号；checkpoint 指向批次 `sync_20260705_013034_265972`，记录 `param_offset=4606`、`param_limit=200`、`next_param_offset=4806`、`item_count=200`、`total_count=200`。
  - 按 `storage_inbound_page.raw_json.fcode` 且 `opType=LNInbound` 口径核验，`lot_no_detail` 剩余历史缺口为 3455 个。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，DB 同步 API 配置 52 条。
  - `.\\.venv\\Scripts\\python.exe -m app.main` dry-run 显示 loaded 33 enabled API config(s)，说明 `lot_no_detail` 没有误进入 enabled。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 185 个、真实配置 API 50 个、enabled 33 个；执行分层摘要为 `configured=50`、`needs_upstream_params=63`、`needs_sensitive_review=22`、`defer_or_review=50`。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，80 个测试通过。
- 当前结论：
  - `lot_no_detail` 已从 4606/8261 推进到 4806/8261，剩余缺口 3455。
  - 当前 configured real API 仍为 50 个，enabled 仍为 33 个。
  - 下一阶段建议继续用 `lot_no_detail.param_source.limit=200` 做历史回填窗口；10F 完成后复盘 10D-10F 三轮。

## Stage 10F

- 阶段目标：继续推进完整拉取；复用 `lot_no_detail.param_source.limit=200` 做下一段历史回填，不启用，并复盘 10D-10F。
- 已完成：
  - 只读 DB 起点确认 `api_config` 总配置 52 条、enabled 33 条；`lot_no_detail.enabled=0`、`config_json.enabled=false`、`param_source.limit=200`。
  - 起点 `lot_no_detail` checkpoint 指向批次 `sync_20260705_013034_265972`，记录 `param_offset=4606`、`param_limit=200`、`next_param_offset=4806`、`item_count=200`、`total_count=200`。
  - 起点 `lot_no_detail` 累计 raw 为 4806 条、4806 个不同交货单号；上游 `storage_inbound_page.raw_json.fcode` 且 `opType=LNInbound` 的不同交货单号为 8261 个，剩余缺口为 3455。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api lot_no_detail`，通过，批次 `sync_20260705_014223_409877`，请求 200 次，写入 200 条。
  - DB 核验显示该批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`，从 `2026-07-05 01:42:23` 到 `2026-07-05 01:46:58`。
  - 同批次 `sync_api_log` 为 `status=success`、`request_count=200`、`success_count=200`、`failed_count=0`、`error_message=NULL`。
  - 同批次 raw 为 200 条、200 个不同 `source_primary_key`、200 个不同 `data_hash`；`failed_request_log` 为 0 条。
  - 10F 后 `lot_no_detail` 累计 raw 为 5006 条、5006 个不同交货单号；checkpoint 指向批次 `sync_20260705_014223_409877`，记录 `param_offset=4806`、`param_limit=200`、`next_param_offset=5006`、`item_count=200`、`total_count=200`。
  - 按 `storage_inbound_page.raw_json.fcode` 且 `opType=LNInbound` 口径核验，`lot_no_detail` 剩余历史缺口为 3255 个。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，DB 同步 API 配置 52 条。
  - `.\\.venv\\Scripts\\python.exe -m app.main` dry-run 显示 loaded 33 enabled API config(s)，说明 `lot_no_detail` 没有误进入 enabled。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 185 个、真实配置 API 50 个、enabled 33 个；执行分层摘要为 `configured=50`、`needs_upstream_params=63`、`needs_sensitive_review=22`、`defer_or_review=50`。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，80 个测试通过。
- 10D-10F 复盘：
  - 三轮累计新增 600 个 `lot_no_detail` 交货单详情，覆盖从 4406/8261 推进到 5006/8261，剩余缺口从 3855 降到 3255。
  - 三轮均为 200 请求、200 raw、失败 0；批次耗时约 338 秒、350 秒、275 秒，200 窗口仍保持稳定。
  - 当前覆盖约 60.6%，距离完整历史回填仍有 3255 个交货单号，不满足进入 daily enabled 的前提。
  - 下一组建议继续 200 窗口；如后续要启用，必须先完成历史缺口归零，并验证缺失主键扫描边界不会重复拉取已覆盖交货单。
- 当前结论：
  - `lot_no_detail` 已从 4806/8261 推进到 5006/8261，剩余缺口 3255。
  - 当前 configured real API 仍为 50 个，enabled 仍为 33 个。
  - 下一阶段建议继续用 `lot_no_detail.param_source.limit=200` 做历史回填窗口。

## Stage 10G

- 阶段目标：继续推进完整拉取；复用 `lot_no_detail.param_source.limit=200` 做下一段历史回填，不启用。
- 已完成：
  - 只读 DB 起点确认 `api_config` 总配置 52 条、enabled 33 条；`lot_no_detail.enabled=0`、`config_json.enabled=false`、`param_source.limit=200`。
  - 起点 `lot_no_detail` checkpoint 指向批次 `sync_20260705_014223_409877`，记录 `param_offset=4806`、`param_limit=200`、`next_param_offset=5006`、`item_count=200`、`total_count=200`。
  - 起点 `lot_no_detail` 累计 raw 为 5006 条、5006 个不同交货单号；上游 `storage_inbound_page.raw_json.fcode` 且 `opType=LNInbound` 的不同交货单号为 8261 个，剩余缺口为 3255。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api lot_no_detail`，通过，批次 `sync_20260705_015431_044307`，请求 200 次，写入 200 条。
  - DB 核验显示该批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`，从 `2026-07-05 01:54:31` 到 `2026-07-05 01:58:48`。
  - 同批次 `sync_api_log` 为 `status=success`、`request_count=200`、`success_count=200`、`failed_count=0`、`error_message=NULL`，从 `2026-07-05 01:54:34` 到 `2026-07-05 01:58:47`。
  - 同批次 raw 为 200 条、200 个不同 `source_primary_key`、200 个不同 `data_hash`；`failed_request_log` 为 0 条。
  - 10G 后 `lot_no_detail` 累计 raw 为 5206 条、5206 个不同交货单号；checkpoint 指向批次 `sync_20260705_015431_044307`，记录 `param_offset=5006`、`param_limit=200`、`next_param_offset=5206`、`item_count=200`、`total_count=200`。
  - 按 `storage_inbound_page.raw_json.fcode` 且 `opType=LNInbound` 口径核验，`lot_no_detail` 剩余历史缺口为 3055 个。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，DB 同步 API 配置 52 条。
  - `.\\.venv\\Scripts\\python.exe -m app.main` dry-run 显示 loaded 33 enabled API config(s)，说明 `lot_no_detail` 没有误进入 enabled。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 185 个、真实配置 API 50 个、enabled 33 个；执行分层摘要为 `configured=50`、`needs_upstream_params=63`、`needs_sensitive_review=22`、`defer_or_review=50`。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，80 个测试通过。
- 当前结论：
  - `lot_no_detail` 已从 5006/8261 推进到 5206/8261，剩余缺口 3055。
  - 当前 configured real API 仍为 50 个，enabled 仍为 33 个。
  - 下一阶段建议继续用 `lot_no_detail.param_source.limit=200` 做历史回填窗口；下一次三轮复盘放在 10I 完成后。

## Stage 10H

- 阶段目标：继续推进完整拉取；复用 `lot_no_detail.param_source.limit=200` 做下一段历史回填，不启用。
- 已完成：
  - 只读 DB 起点确认 `api_config` 总配置 52 条、enabled 33 条；`lot_no_detail.enabled=0`、`config_json.enabled=false`、`param_source.limit=200`。
  - 起点 `lot_no_detail` checkpoint 指向批次 `sync_20260705_015431_044307`，记录 `param_offset=5006`、`param_limit=200`、`next_param_offset=5206`、`item_count=200`、`total_count=200`。
  - 起点 `lot_no_detail` 累计 raw 为 5206 条、5206 个不同交货单号；上游 `storage_inbound_page.raw_json.fcode` 且 `opType=LNInbound` 的不同交货单号为 8261 个，剩余缺口为 3055。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api lot_no_detail`，通过，批次 `sync_20260705_020744_241759`，请求 200 次，写入 200 条。
  - DB 核验显示该批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`，从 `2026-07-05 02:07:44` 到 `2026-07-05 02:12:56`。
  - 同批次 `sync_api_log` 为 `status=success`、`request_count=200`、`success_count=200`、`failed_count=0`、`error_message=NULL`，从 `2026-07-05 02:07:47` 到 `2026-07-05 02:12:55`。
  - 同批次 raw 为 200 条、200 个不同 `source_primary_key`、200 个不同 `data_hash`；`failed_request_log` 为 0 条。
  - 10H 后 `lot_no_detail` 累计 raw 为 5406 条、5406 个不同交货单号；checkpoint 指向批次 `sync_20260705_020744_241759`，记录 `param_offset=5206`、`param_limit=200`、`next_param_offset=5406`、`item_count=200`、`total_count=200`。
  - 按 `storage_inbound_page.raw_json.fcode` 且 `opType=LNInbound` 口径核验，`lot_no_detail` 剩余历史缺口为 2855 个。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，DB 同步 API 配置 52 条。
  - `.\\.venv\\Scripts\\python.exe -m app.main` dry-run 显示 loaded 33 enabled API config(s)，说明 `lot_no_detail` 没有误进入 enabled。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 185 个、真实配置 API 50 个、enabled 33 个；执行分层摘要为 `configured=50`、`needs_upstream_params=63`、`needs_sensitive_review=22`、`defer_or_review=50`。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，80 个测试通过。
- 当前结论：
  - `lot_no_detail` 已从 5206/8261 推进到 5406/8261，剩余缺口 2855。
  - 当前 configured real API 仍为 50 个，enabled 仍为 33 个。
  - 下一阶段建议继续用 `lot_no_detail.param_source.limit=200` 做历史回填窗口；10I 完成后复盘 10G-10I 三轮。

## Stage 10I

- 阶段目标：继续推进完整拉取；复用 `lot_no_detail.param_source.limit=200` 做下一段历史回填，不启用，并复盘 10G-10I。
- 已完成：
  - 只读 DB 起点确认 `api_config` 总配置 52 条、enabled 33 条；`lot_no_detail.enabled=0`、`config_json.enabled=false`、`param_source.limit=200`。
  - 起点 `lot_no_detail` checkpoint 指向批次 `sync_20260705_020744_241759`，记录 `param_offset=5206`、`param_limit=200`、`next_param_offset=5406`、`item_count=200`、`total_count=200`。
  - 起点 `lot_no_detail` 累计 raw 为 5406 条、5406 个不同交货单号；上游 `storage_inbound_page.raw_json.fcode` 且 `opType=LNInbound` 的不同交货单号为 8261 个，剩余缺口为 2855。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api lot_no_detail`，通过，批次 `sync_20260705_021930_865405`，请求 200 次，写入 200 条。
  - DB 核验显示该批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`，从 `2026-07-05 02:19:31` 到 `2026-07-05 02:24:22`。
  - 同批次 `sync_api_log` 为 `status=success`、`request_count=200`、`success_count=200`、`failed_count=0`、`error_message=NULL`，从 `2026-07-05 02:19:34` 到 `2026-07-05 02:24:22`。
  - 同批次 raw 为 200 条、200 个不同 `source_primary_key`、200 个不同 `data_hash`；`failed_request_log` 为 0 条。
  - 10I 后 `lot_no_detail` 累计 raw 为 5606 条、5606 个不同交货单号；checkpoint 指向批次 `sync_20260705_021930_865405`，记录 `param_offset=5406`、`param_limit=200`、`next_param_offset=5606`、`item_count=200`、`total_count=200`。
  - 按 `storage_inbound_page.raw_json.fcode` 且 `opType=LNInbound` 口径核验，`lot_no_detail` 剩余历史缺口为 2655 个。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，DB 同步 API 配置 52 条。
  - `.\\.venv\\Scripts\\python.exe -m app.main` dry-run 显示 loaded 33 enabled API config(s)，说明 `lot_no_detail` 没有误进入 enabled。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 185 个、真实配置 API 50 个、enabled 33 个；执行分层摘要为 `configured=50`、`needs_upstream_params=63`、`needs_sensitive_review=22`、`defer_or_review=50`。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，80 个测试通过。
- 10G-10I 复盘：
  - 三轮累计新增 600 个 `lot_no_detail` 交货单详情，覆盖从 5006/8261 推进到 5606/8261，剩余缺口从 3255 降到 2655。
  - 三轮均为 200 请求、200 raw、失败 0；批次耗时约 257 秒、312 秒、291 秒，200 窗口仍保持稳定。
  - 当前覆盖约 67.9%，距离完整历史回填仍有 2655 个交货单号，不满足进入 daily enabled 的前提。
  - 下一组建议继续 200 窗口；如后续要启用，必须先完成历史缺口归零，并验证缺失主键扫描边界不会重复拉取已覆盖交货单。
- 当前结论：
  - `lot_no_detail` 已从 5406/8261 推进到 5606/8261，剩余缺口 2655。
  - 当前 configured real API 仍为 50 个，enabled 仍为 33 个。
  - 下一阶段建议继续用 `lot_no_detail.param_source.limit=200` 做历史回填窗口；下一次三轮复盘放在 10L 完成后。

## Stage 10J

- 阶段目标：继续推进完整拉取；复用 `lot_no_detail.param_source.limit=200` 做下一段历史回填，不启用。
- 已完成：
  - 只读 DB 起点确认 `api_config` 总配置 52 条、enabled 33 条；`lot_no_detail.enabled=0`、`config_json.enabled=false`、`param_source.limit=200`。
  - 起点 `lot_no_detail` checkpoint 指向批次 `sync_20260705_021930_865405`，记录 `param_offset=5406`、`param_limit=200`、`next_param_offset=5606`、`item_count=200`、`total_count=200`。
  - 起点 `lot_no_detail` 累计 raw 为 5606 条、5606 个不同交货单号；上游 `storage_inbound_page.raw_json.fcode` 且 `opType=LNInbound` 的不同交货单号为 8261 个，剩余缺口为 2655。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api lot_no_detail`，通过，批次 `sync_20260705_023234_494584`，请求 200 次，写入 200 条。
  - DB 核验显示该批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`，从 `2026-07-05 02:32:34` 到 `2026-07-05 02:37:32`。
  - 同批次 `sync_api_log` 为 `status=success`、`request_count=200`、`success_count=200`、`failed_count=0`、`error_message=NULL`，从 `2026-07-05 02:32:38` 到 `2026-07-05 02:37:31`。
  - 同批次 raw 为 200 条、200 个不同 `source_primary_key`、200 个不同 `data_hash`；`failed_request_log` 为 0 条。
  - 10J 后 `lot_no_detail` 累计 raw 为 5806 条、5806 个不同交货单号；checkpoint 指向批次 `sync_20260705_023234_494584`，记录 `param_offset=5606`、`param_limit=200`、`next_param_offset=5806`、`item_count=200`、`total_count=200`。
  - 按 `storage_inbound_page.raw_json.fcode` 且 `opType=LNInbound` 口径核验，`lot_no_detail` 剩余历史缺口为 2455 个。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，DB 同步 API 配置 52 条。
  - `.\\.venv\\Scripts\\python.exe -m app.main` dry-run 显示 loaded 33 enabled API config(s)，说明 `lot_no_detail` 没有误进入 enabled。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 185 个、真实配置 API 50 个、enabled 33 个；执行分层摘要为 `configured=50`、`needs_upstream_params=63`、`needs_sensitive_review=22`、`defer_or_review=50`。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，80 个测试通过。
- 当前结论：
  - `lot_no_detail` 已从 5606/8261 推进到 5806/8261，剩余缺口 2455。
  - 当前 configured real API 仍为 50 个，enabled 仍为 33 个。
  - 下一阶段建议继续用 `lot_no_detail.param_source.limit=200` 做历史回填窗口；下一次三轮复盘放在 10L 完成后。

## Stage 10K

- 阶段目标：继续推进完整拉取；复用 `lot_no_detail.param_source.limit=200` 做下一段历史回填，不启用。
- 已完成：
  - 只读 DB 起点确认 `api_config` 总配置 52 条、enabled 33 条；`lot_no_detail.enabled=0`、`config_json.enabled=false`、`param_source.limit=200`。
  - 起点 `lot_no_detail` checkpoint 指向批次 `sync_20260705_023234_494584`，记录 `param_offset=5606`、`param_limit=200`、`next_param_offset=5806`、`item_count=200`、`total_count=200`。
  - 起点 `lot_no_detail` 累计 raw 为 5806 条、5806 个不同交货单号；上游 `storage_inbound_page.raw_json.fcode` 且 `opType=LNInbound` 的不同交货单号为 8261 个，剩余缺口为 2455。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api lot_no_detail`，通过，批次 `sync_20260705_024423_315385`，请求 200 次，写入 200 条。
  - DB 核验显示该批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`，从 `2026-07-05 02:44:23` 到 `2026-07-05 02:49:12`。
  - 同批次 `sync_api_log` 为 `status=success`、`request_count=200`、`success_count=200`、`failed_count=0`、`error_message=NULL`，从 `2026-07-05 02:44:27` 到 `2026-07-05 02:49:12`。
  - 同批次 raw 为 200 条、200 个不同 `source_primary_key`、200 个不同 `data_hash`；`failed_request_log` 为 0 条。
  - 10K 后 `lot_no_detail` 累计 raw 为 6006 条、6006 个不同交货单号；checkpoint 指向批次 `sync_20260705_024423_315385`，记录 `param_offset=5806`、`param_limit=200`、`next_param_offset=6006`、`item_count=200`、`total_count=200`。
  - 按 `storage_inbound_page.raw_json.fcode` 且 `opType=LNInbound` 口径核验，`lot_no_detail` 剩余历史缺口为 2255 个。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，DB 同步 API 配置 52 条。
  - `.\\.venv\\Scripts\\python.exe -m app.main` dry-run 显示 loaded 33 enabled API config(s)，说明 `lot_no_detail` 没有误进入 enabled。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 185 个、真实配置 API 50 个、enabled 33 个；执行分层摘要为 `configured=50`、`needs_upstream_params=63`、`needs_sensitive_review=22`、`defer_or_review=50`。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，80 个测试通过。
- 当前结论：
  - `lot_no_detail` 已从 5806/8261 推进到 6006/8261，剩余缺口 2255。
  - 当前 configured real API 仍为 50 个，enabled 仍为 33 个。
  - 下一阶段建议继续用 `lot_no_detail.param_source.limit=200` 做历史回填窗口；10L 完成后复盘 10J-10L 三轮。

## Stage 10L

- 阶段目标：继续推进完整拉取；复用 `lot_no_detail.param_source.limit=200` 做下一段历史回填，不启用，并复盘 10J-10L。
- 已完成：
  - 只读 DB 起点确认 `api_config` 总配置 52 条、enabled 33 条；`lot_no_detail.enabled=0`、`config_json.enabled=false`、`param_source.limit=200`。
  - 起点 `lot_no_detail` checkpoint 指向批次 `sync_20260705_024423_315385`，记录 `param_offset=5806`、`param_limit=200`、`next_param_offset=6006`、`item_count=200`、`total_count=200`。
  - 起点 `lot_no_detail` 累计 raw 为 6006 条、6006 个不同交货单号；上游 `storage_inbound_page.raw_json.fcode` 且 `opType=LNInbound` 的不同交货单号为 8261 个，剩余缺口为 2255。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api lot_no_detail`，通过，批次 `sync_20260705_025627_748467`，请求 200 次，写入 200 条。
  - DB 核验显示该批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`，从 `2026-07-05 02:56:28` 到 `2026-07-05 03:00:49`。
  - 同批次 `sync_api_log` 为 `status=success`、`request_count=200`、`success_count=200`、`failed_count=0`、`error_message=NULL`，从 `2026-07-05 02:56:31` 到 `2026-07-05 03:00:49`。
  - 同批次 raw 为 200 条、200 个不同 `source_primary_key`、200 个不同 `data_hash`；`failed_request_log` 为 0 条。
  - 10L 后 `lot_no_detail` 累计 raw 为 6206 条、6206 个不同交货单号；checkpoint 指向批次 `sync_20260705_025627_748467`，记录 `param_offset=6006`、`param_limit=200`、`next_param_offset=6206`、`item_count=200`、`total_count=200`。
  - 按 `storage_inbound_page.raw_json.fcode` 且 `opType=LNInbound` 口径核验，`lot_no_detail` 剩余历史缺口为 2055 个。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，DB 同步 API 配置 52 条。
  - `.\\.venv\\Scripts\\python.exe -m app.main` dry-run 显示 loaded 33 enabled API config(s)，说明 `lot_no_detail` 没有误进入 enabled。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 185 个、真实配置 API 50 个、enabled 33 个；执行分层摘要为 `configured=50`、`needs_upstream_params=63`、`needs_sensitive_review=22`、`defer_or_review=50`。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，80 个测试通过。
- 10J-10L 复盘：
  - 三轮累计新增 600 个 `lot_no_detail` 交货单详情，覆盖从 5606/8261 推进到 6206/8261，剩余缺口从 2655 降到 2055。
  - 三轮均为 200 请求、200 raw、失败 0；批次耗时约 298 秒、289 秒、261 秒，200 窗口仍保持稳定。
  - 当前覆盖约 75.1%，距离完整历史回填仍有 2055 个交货单号，不满足进入 daily enabled 的前提。
  - 下一组建议继续 200 窗口；如后续要启用，必须先完成历史缺口归零，并验证缺失主键扫描边界不会重复拉取已覆盖交货单。
- 当前结论：
  - `lot_no_detail` 已从 6006/8261 推进到 6206/8261，剩余缺口 2055。
  - 当前 configured real API 仍为 50 个，enabled 仍为 33 个。
  - 下一阶段建议继续用 `lot_no_detail.param_source.limit=200` 做历史回填窗口；下一次三轮复盘放在 10O 完成后。

## Stage 10M

- 阶段目标：继续推进完整拉取；复用 `lot_no_detail.param_source.limit=200` 做下一段历史回填，不启用。
- 已完成：
  - 只读 DB 起点确认 `api_config` 总配置 52 条、enabled 33 条；`lot_no_detail.enabled=0`、`config_json.enabled=false`、`param_source.limit=200`。
  - 起点 `lot_no_detail` checkpoint 指向批次 `sync_20260705_025627_748467`，记录 `param_offset=6006`、`param_limit=200`、`next_param_offset=6206`、`item_count=200`、`total_count=200`。
  - 起点 `lot_no_detail` 累计 raw 为 6206 条、6206 个不同交货单号；上游 `storage_inbound_page.raw_json.fcode` 且 `opType=LNInbound` 的不同交货单号为 8261 个，剩余缺口为 2055。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api lot_no_detail`，通过，批次 `sync_20260705_030953_593844`，请求 200 次，写入 200 条。
  - DB 核验显示该批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`，从 `2026-07-05 03:09:54` 到 `2026-07-05 03:15:31`。
  - 同批次 `sync_api_log` 为 `status=success`、`request_count=200`、`success_count=200`、`failed_count=0`、`error_message=NULL`，从 `2026-07-05 03:09:57` 到 `2026-07-05 03:15:31`。
  - 同批次 raw 为 200 条、200 个不同 `source_primary_key`、200 个不同 `data_hash`；`failed_request_log` 为 0 条。
  - 10M 后 `lot_no_detail` 累计 raw 为 6406 条、6406 个不同交货单号；checkpoint 指向批次 `sync_20260705_030953_593844`，记录 `param_offset=6206`、`param_limit=200`、`next_param_offset=6406`、`item_count=200`、`total_count=200`。
  - 按 `storage_inbound_page.raw_json.fcode` 且 `opType=LNInbound` 口径核验，`lot_no_detail` 剩余历史缺口为 1855 个。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，DB 同步 API 配置 52 条。
  - `.\\.venv\\Scripts\\python.exe -m app.main` dry-run 显示 loaded 33 enabled API config(s)，说明 `lot_no_detail` 没有误进入 enabled。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 185 个、真实配置 API 50 个、enabled 33 个；执行分层摘要为 `configured=50`、`needs_upstream_params=63`、`needs_sensitive_review=22`、`defer_or_review=50`。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，80 个测试通过。
- 当前结论：
  - `lot_no_detail` 已从 6206/8261 推进到 6406/8261，剩余缺口 1855。
  - 当前 configured real API 仍为 50 个，enabled 仍为 33 个。
  - 下一阶段建议继续用 `lot_no_detail.param_source.limit=200` 做历史回填窗口；下一次三轮复盘放在 10O 完成后。

## Stage 10N

- 阶段目标：继续推进完整拉取；复用 `lot_no_detail.param_source.limit=200` 做下一段历史回填，不启用。
- 已完成：
  - 只读 DB 起点确认 `api_config` 总配置 52 条、enabled 33 条；`lot_no_detail.enabled=0`、`config_json.enabled=false`、`param_source.limit=200`。
  - 起点 `lot_no_detail` checkpoint 指向批次 `sync_20260705_030953_593844`，记录 `param_offset=6206`、`param_limit=200`、`next_param_offset=6406`、`item_count=200`、`total_count=200`。
  - 起点 `lot_no_detail` 累计 raw 为 6406 条、6406 个不同交货单号；上游 `storage_inbound_page.raw_json.fcode` 且 `opType=LNInbound` 的不同交货单号为 8261 个，剩余缺口为 1855。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api lot_no_detail`，通过，批次 `sync_20260705_032312_449483`，请求 200 次，写入 200 条。
  - DB 核验显示该批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`，从 `2026-07-05 03:23:12` 到 `2026-07-05 03:27:42`。
  - 同批次 `sync_api_log` 为 `status=success`、`request_count=200`、`success_count=200`、`failed_count=0`、`error_message=NULL`，从 `2026-07-05 03:23:16` 到 `2026-07-05 03:27:42`。
  - 同批次 raw 为 200 条、200 个不同 `source_primary_key`、200 个不同 `data_hash`；`failed_request_log` 为 0 条。
  - 10N 后 `lot_no_detail` 累计 raw 为 6606 条、6606 个不同交货单号；checkpoint 指向批次 `sync_20260705_032312_449483`，记录 `param_offset=6406`、`param_limit=200`、`next_param_offset=6606`、`item_count=200`、`total_count=200`。
  - 按 `storage_inbound_page.raw_json.fcode` 且 `opType=LNInbound` 口径核验，`lot_no_detail` 剩余历史缺口为 1655 个。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，DB 同步 API 配置 52 条。
  - `.\\.venv\\Scripts\\python.exe -m app.main` dry-run 显示 loaded 33 enabled API config(s)，说明 `lot_no_detail` 没有误进入 enabled。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 185 个、真实配置 API 50 个、enabled 33 个；执行分层摘要为 `configured=50`、`needs_upstream_params=63`、`needs_sensitive_review=22`、`defer_or_review=50`。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，80 个测试通过。
- 当前结论：
  - `lot_no_detail` 已从 6406/8261 推进到 6606/8261，剩余缺口 1655。
  - 当前 configured real API 仍为 50 个，enabled 仍为 33 个。
  - 下一阶段建议继续用 `lot_no_detail.param_source.limit=200` 做历史回填窗口；10O 完成后复盘 10M-10O 三轮。

## Stage 10O

- 阶段目标：继续推进完整拉取；复用 `lot_no_detail.param_source.limit=200` 做下一段历史回填，不启用，并复盘 10M-10O。
- 已完成：
  - 只读 DB 起点确认 `api_config` 总配置 52 条、enabled 33 条；`lot_no_detail.enabled=0`、`config_json.enabled=false`、`param_source.limit=200`。
  - 起点 `lot_no_detail` checkpoint 指向批次 `sync_20260705_032312_449483`，记录 `param_offset=6406`、`param_limit=200`、`next_param_offset=6606`、`item_count=200`、`total_count=200`。
  - 起点 `lot_no_detail` 累计 raw 为 6606 条、6606 个不同交货单号；上游 `storage_inbound_page.raw_json.fcode` 且 `opType=LNInbound` 的不同交货单号为 8261 个，剩余缺口为 1655。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api lot_no_detail`，通过，批次 `sync_20260705_033330_655101`，请求 200 次，写入 200 条。
  - DB 核验显示该批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`，从 `2026-07-05 03:33:31` 到 `2026-07-05 03:38:04`。
  - 同批次 `sync_api_log` 为 `status=success`、`request_count=200`、`success_count=200`、`failed_count=0`、`error_message=NULL`，从 `2026-07-05 03:33:34` 到 `2026-07-05 03:38:04`。
  - 同批次 raw 为 200 条、200 个不同 `source_primary_key`、200 个不同 `data_hash`；`failed_request_log` 为 0 条。
  - 10O 后 `lot_no_detail` 累计 raw 为 6806 条、6806 个不同交货单号；checkpoint 指向批次 `sync_20260705_033330_655101`，记录 `param_offset=6606`、`param_limit=200`、`next_param_offset=6806`、`item_count=200`、`total_count=200`。
  - 按 `storage_inbound_page.raw_json.fcode` 且 `opType=LNInbound` 口径核验，`lot_no_detail` 剩余历史缺口为 1455 个。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，DB 同步 API 配置 52 条。
  - `.\\.venv\\Scripts\\python.exe -m app.main` dry-run 显示 loaded 33 enabled API config(s)，说明 `lot_no_detail` 没有误进入 enabled。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 185 个、真实配置 API 50 个、enabled 33 个；执行分层摘要为 `configured=50`、`needs_upstream_params=63`、`needs_sensitive_review=22`、`defer_or_review=50`。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，80 个测试通过。
- 10M-10O 复盘：
  - 三轮累计新增 600 个 `lot_no_detail` 交货单详情，覆盖从 6206/8261 推进到 6806/8261，剩余缺口从 2055 降到 1455。
  - 三轮均为 200 请求、200 raw、失败 0；批次耗时约 337 秒、270 秒、273 秒，200 窗口继续保持稳定。
  - 当前覆盖约 82.4%，距离完整历史回填仍有 1455 个交货单号，不满足进入 daily enabled 的前提。
  - 下一组建议继续 200 窗口；如后续要启用，必须先完成历史缺口归零，并验证缺失主键扫描边界不会重复拉取已覆盖交货单。
- 当前结论：
  - `lot_no_detail` 已从 6606/8261 推进到 6806/8261，剩余缺口 1455。
  - 当前 configured real API 仍为 50 个，enabled 仍为 33 个。
  - 下一阶段建议继续用 `lot_no_detail.param_source.limit=200` 做历史回填窗口；下一次三轮复盘放在 10R 完成后。

## Stage 10P

- 阶段目标：继续推进完整拉取；复用 `lot_no_detail.param_source.limit=200` 做下一段历史回填，不启用。
- 已完成：
  - 只读 DB 起点确认 `api_config` 总配置 52 条、enabled 33 条；`lot_no_detail.enabled=0`、`config_json.enabled=false`、`param_source.limit=200`。
  - 起点 `lot_no_detail` checkpoint 指向批次 `sync_20260705_033330_655101`，记录 `param_offset=6606`、`param_limit=200`、`next_param_offset=6806`、`item_count=200`、`total_count=200`。
  - 起点 `lot_no_detail` 累计 raw 为 6806 条、6806 个不同交货单号；上游 `storage_inbound_page.raw_json.fcode` 且 `opType=LNInbound` 的不同交货单号为 8261 个，剩余缺口为 1455。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api lot_no_detail`，通过，批次 `sync_20260705_034700_432376`，请求 200 次，写入 200 条。
  - DB 核验显示该批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`，从 `2026-07-05 03:47:00` 到 `2026-07-05 03:51:46`。
  - 同批次 `sync_api_log` 为 `status=success`、`request_count=200`、`success_count=200`、`failed_count=0`、`error_message=NULL`，从 `2026-07-05 03:47:04` 到 `2026-07-05 03:51:46`。
  - 同批次 raw 为 200 条、200 个不同 `source_primary_key`、200 个不同 `data_hash`；`failed_request_log` 为 0 条。
  - 10P 后 `lot_no_detail` 累计 raw 为 7006 条、7006 个不同交货单号；checkpoint 指向批次 `sync_20260705_034700_432376`，记录 `param_offset=6806`、`param_limit=200`、`next_param_offset=7006`、`item_count=200`、`total_count=200`。
  - 按 `storage_inbound_page.raw_json.fcode` 且 `opType=LNInbound` 口径核验，`lot_no_detail` 剩余历史缺口为 1255 个。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，DB 同步 API 配置 52 条。
  - `.\\.venv\\Scripts\\python.exe -m app.main` dry-run 显示 loaded 33 enabled API config(s)，说明 `lot_no_detail` 没有误进入 enabled。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 185 个、真实配置 API 50 个、enabled 33 个；执行分层摘要为 `configured=50`、`needs_upstream_params=63`、`needs_sensitive_review=22`、`defer_or_review=50`。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，80 个测试通过。
- 当前结论：
  - `lot_no_detail` 已从 6806/8261 推进到 7006/8261，剩余缺口 1255。
  - 当前 configured real API 仍为 50 个，enabled 仍为 33 个。
  - 下一阶段建议继续用 `lot_no_detail.param_source.limit=200` 做历史回填窗口；下一次三轮复盘放在 10R 完成后。

## Stage 10Q

- 阶段目标：继续推进完整拉取；复用 `lot_no_detail.param_source.limit=200` 做下一段历史回填，不启用。
- 已完成：
  - 只读 DB 起点确认 `api_config` 总配置 52 条、enabled 33 条；`lot_no_detail.enabled=0`、`config_json.enabled=false`、`param_source.limit=200`。
  - 起点 `lot_no_detail` checkpoint 指向批次 `sync_20260705_034700_432376`，记录 `param_offset=6806`、`param_limit=200`、`next_param_offset=7006`、`item_count=200`、`total_count=200`。
  - 起点 `lot_no_detail` 累计 raw 为 7006 条、7006 个不同交货单号；上游 `storage_inbound_page.raw_json.fcode` 且 `opType=LNInbound` 的不同交货单号为 8261 个，剩余缺口为 1255。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api lot_no_detail`，通过，批次 `sync_20260705_035827_574625`，请求 200 次，写入 200 条。
  - DB 核验显示该批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`，从 `2026-07-05 03:58:28` 到 `2026-07-05 04:03:52`。
  - 同批次 `sync_api_log` 为 `status=success`、`request_count=200`、`success_count=200`、`failed_count=0`、`error_message=NULL`，从 `2026-07-05 03:58:31` 到 `2026-07-05 04:03:52`。
  - 同批次 raw 为 200 条、200 个不同 `source_primary_key`、200 个不同 `data_hash`；`failed_request_log` 为 0 条。
  - 10Q 后 `lot_no_detail` 累计 raw 为 7206 条、7206 个不同交货单号；checkpoint 指向批次 `sync_20260705_035827_574625`，记录 `param_offset=7006`、`param_limit=200`、`next_param_offset=7206`、`item_count=200`、`total_count=200`。
  - 按 `storage_inbound_page.raw_json.fcode` 且 `opType=LNInbound` 口径核验，`lot_no_detail` 剩余历史缺口为 1055 个。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，DB 同步 API 配置 52 条。
  - `.\\.venv\\Scripts\\python.exe -m app.main` dry-run 显示 loaded 33 enabled API config(s)，说明 `lot_no_detail` 没有误进入 enabled。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 185 个、真实配置 API 50 个、enabled 33 个；执行分层摘要为 `configured=50`、`needs_upstream_params=63`、`needs_sensitive_review=22`、`defer_or_review=50`。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，80 个测试通过。
- 当前结论：
  - `lot_no_detail` 已从 7006/8261 推进到 7206/8261，剩余缺口 1055。
  - 当前 configured real API 仍为 50 个，enabled 仍为 33 个。
  - 下一阶段建议继续用 `lot_no_detail.param_source.limit=200` 做历史回填窗口；10R 完成后复盘 10P-10R 三轮。

## Stage 10R

- 阶段目标：继续推进完整拉取；复用 `lot_no_detail.param_source.limit=200` 做下一段历史回填，不启用，并复盘 10P-10R。
- 已完成：
  - 只读 DB 起点确认 `api_config` 总配置 52 条、enabled 33 条；`lot_no_detail.enabled=0`、`config_json.enabled=false`、`param_source.limit=200`。
  - 起点 `lot_no_detail` checkpoint 指向批次 `sync_20260705_035827_574625`，记录 `param_offset=7006`、`param_limit=200`、`next_param_offset=7206`、`item_count=200`、`total_count=200`。
  - 起点 `lot_no_detail` 累计 raw 为 7206 条、7206 个不同交货单号；上游 `storage_inbound_page.raw_json.fcode` 且 `opType=LNInbound` 的不同交货单号为 8261 个，剩余缺口为 1055。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api lot_no_detail`，通过，批次 `sync_20260705_041111_747328`，请求 200 次，写入 200 条。
  - DB 核验显示该批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`，从 `2026-07-05 04:11:12` 到 `2026-07-05 04:16:37`。
  - 同批次 `sync_api_log` 为 `status=success`、`request_count=200`、`success_count=200`、`failed_count=0`、`error_message=NULL`，从 `2026-07-05 04:11:15` 到 `2026-07-05 04:16:37`。
  - 同批次 raw 为 200 条、200 个不同 `source_primary_key`、200 个不同 `data_hash`；`failed_request_log` 为 0 条。
  - 10R 后 `lot_no_detail` 累计 raw 为 7406 条、7406 个不同交货单号；checkpoint 指向批次 `sync_20260705_041111_747328`，记录 `param_offset=7206`、`param_limit=200`、`next_param_offset=7406`、`item_count=200`、`total_count=200`。
  - 按 `storage_inbound_page.raw_json.fcode` 且 `opType=LNInbound` 口径核验，`lot_no_detail` 剩余历史缺口为 855 个。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，DB 同步 API 配置 52 条。
  - `.\\.venv\\Scripts\\python.exe -m app.main` dry-run 显示 loaded 33 enabled API config(s)，说明 `lot_no_detail` 没有误进入 enabled。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 185 个、真实配置 API 50 个、enabled 33 个；执行分层摘要为 `configured=50`、`needs_upstream_params=63`、`needs_sensitive_review=22`、`defer_or_review=50`。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，80 个测试通过。
- 10P-10R 复盘：
  - 三轮累计新增 600 个 `lot_no_detail` 交货单详情，覆盖从 6806/8261 推进到 7406/8261，剩余缺口从 1455 降到 855。
  - 三轮均为 200 请求、200 raw、失败 0；批次耗时约 286 秒、324 秒、325 秒，200 窗口仍保持稳定。
  - 当前覆盖约 89.6%，距离完整历史回填仍有 855 个交货单号，不满足进入 daily enabled 的前提。
  - 下一组建议继续 200 窗口；如后续要启用，仍必须先完成历史缺口归零，并验证缺失主键扫描边界不会重复拉取已覆盖交货单。
- 当前结论：
  - `lot_no_detail` 已从 7206/8261 推进到 7406/8261，剩余缺口 855。
  - 当前 configured real API 仍为 50 个，enabled 仍为 33 个。
  - 下一阶段建议继续用 `lot_no_detail.param_source.limit=200` 做历史回填窗口；下一次三轮复盘放在 10U 完成后。

## Stage 10S

- 阶段目标：继续推进完整拉取；复用 `lot_no_detail.param_source.limit=200` 做下一段历史回填，不启用。
- 已完成：
  - 只读 DB 起点确认 `api_config` 总配置 52 条、enabled 33 条；`lot_no_detail.enabled=0`、`config_json.enabled=false`、`param_source.limit=200`。
  - 起点 `lot_no_detail` checkpoint 指向批次 `sync_20260705_041111_747328`，记录 `param_offset=7206`、`param_limit=200`、`next_param_offset=7406`、`item_count=200`、`total_count=200`。
  - 起点 `lot_no_detail` 累计 raw 为 7406 条、7406 个不同交货单号；上游 `storage_inbound_page.raw_json.fcode` 且 `opType=LNInbound` 的不同交货单号为 8261 个，剩余缺口为 855。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api lot_no_detail`，通过，批次 `sync_20260705_042345_204110`，请求 200 次，写入 200 条。
  - DB 核验显示该批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`，从 `2026-07-05 04:23:45` 到 `2026-07-05 04:28:33`。
  - 同批次 `sync_api_log` 为 `status=success`、`request_count=200`、`success_count=200`、`failed_count=0`、`error_message=NULL`，从 `2026-07-05 04:23:48` 到 `2026-07-05 04:28:33`。
  - 同批次 raw 为 200 条、200 个不同 `source_primary_key`、200 个不同 `data_hash`；`failed_request_log` 为 0 条。
  - 10S 后 `lot_no_detail` 累计 raw 为 7606 条、7606 个不同交货单号；checkpoint 指向批次 `sync_20260705_042345_204110`，记录 `param_offset=7406`、`param_limit=200`、`next_param_offset=7606`、`item_count=200`、`total_count=200`。
  - 按 `storage_inbound_page.raw_json.fcode` 且 `opType=LNInbound` 口径核验，`lot_no_detail` 剩余历史缺口为 655 个。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，DB 同步 API 配置 52 条。
  - `.\\.venv\\Scripts\\python.exe -m app.main` dry-run 显示 loaded 33 enabled API config(s)，说明 `lot_no_detail` 没有误进入 enabled。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 185 个、真实配置 API 50 个、enabled 33 个；执行分层摘要为 `configured=50`、`needs_upstream_params=63`、`needs_sensitive_review=22`、`defer_or_review=50`。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，80 个测试通过。
- 当前结论：
  - `lot_no_detail` 已从 7406/8261 推进到 7606/8261，剩余缺口 655。
  - 当前 configured real API 仍为 50 个，enabled 仍为 33 个。
  - 下一阶段建议继续用 `lot_no_detail.param_source.limit=200` 做历史回填窗口；下一次三轮复盘放在 10U 完成后。

## Stage 10T

- 阶段目标：继续推进完整拉取；复用 `lot_no_detail.param_source.limit=200` 做下一段历史回填，不启用。
- 已完成：
  - 只读 DB 起点确认 `api_config` 总配置 52 条、enabled 33 条；`lot_no_detail.enabled=0`、`config_json.enabled=false`、`param_source.limit=200`。
  - 起点 `lot_no_detail` checkpoint 指向批次 `sync_20260705_042345_204110`，记录 `param_offset=7406`、`param_limit=200`、`next_param_offset=7606`、`item_count=200`、`total_count=200`。
  - 起点 `lot_no_detail` 累计 raw 为 7606 条、7606 个不同交货单号；上游 `storage_inbound_page.raw_json.fcode` 且 `opType=LNInbound` 的不同交货单号为 8261 个，剩余缺口为 655。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api lot_no_detail`，通过，批次 `sync_20260705_043736_871286`，请求 200 次，写入 200 条。
  - DB 核验显示该批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`，从 `2026-07-05 04:37:37` 到 `2026-07-05 04:42:28`。
  - 同批次 `sync_api_log` 为 `status=success`、`request_count=200`、`success_count=200`、`failed_count=0`、`error_message=NULL`，从 `2026-07-05 04:37:40` 到 `2026-07-05 04:42:28`。
  - 同批次 raw 为 200 条、200 个不同 `source_primary_key`、200 个不同 `data_hash`；`failed_request_log` 为 0 条。
  - 10T 后 `lot_no_detail` 累计 raw 为 7806 条、7806 个不同交货单号；checkpoint 指向批次 `sync_20260705_043736_871286`，记录 `param_offset=7606`、`param_limit=200`、`next_param_offset=7806`、`item_count=200`、`total_count=200`。
  - 按 `storage_inbound_page.raw_json.fcode` 且 `opType=LNInbound` 口径核验，`lot_no_detail` 剩余历史缺口为 455 个。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，DB 同步 API 配置 52 条。
  - `.\\.venv\\Scripts\\python.exe -m app.main` dry-run 显示 loaded 33 enabled API config(s)，说明 `lot_no_detail` 没有误进入 enabled。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 185 个、真实配置 API 50 个、enabled 33 个；执行分层摘要为 `configured=50`、`needs_upstream_params=63`、`needs_sensitive_review=22`、`defer_or_review=50`。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，80 个测试通过。
- 当前结论：
  - `lot_no_detail` 已从 7606/8261 推进到 7806/8261，剩余缺口 455。
  - 当前 configured real API 仍为 50 个，enabled 仍为 33 个。
  - 下一阶段建议继续用 `lot_no_detail.param_source.limit=200` 做历史回填窗口；10U 完成后复盘 10S-10U 三轮。

## Stage 10U

- 阶段目标：继续推进完整拉取；复用 `lot_no_detail.param_source.limit=200` 做下一段历史回填，不启用，并复盘 10S-10U。
- 已完成：
  - 只读 DB 起点确认 `api_config` 总配置 52 条、enabled 33 条；`lot_no_detail.enabled=0`、`config_json.enabled=false`、`param_source.limit=200`。
  - 起点 `lot_no_detail` checkpoint 指向批次 `sync_20260705_043736_871286`，记录 `param_offset=7606`、`param_limit=200`、`next_param_offset=7806`、`item_count=200`、`total_count=200`。
  - 起点 `lot_no_detail` 累计 raw 为 7806 条、7806 个不同交货单号；上游 `storage_inbound_page.raw_json.fcode` 且 `opType=LNInbound` 的不同交货单号为 8261 个，剩余缺口为 455。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api lot_no_detail`，通过，批次 `sync_20260705_045048_577028`，请求 200 次，写入 200 条。
  - DB 核验显示该批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`，从 `2026-07-05 04:50:49` 到 `2026-07-05 04:55:35`。
  - 同批次 `sync_api_log` 为 `status=success`、`request_count=200`、`success_count=200`、`failed_count=0`、`error_message=NULL`，从 `2026-07-05 04:50:52` 到 `2026-07-05 04:55:34`。
  - 同批次 raw 为 200 条、200 个不同 `source_primary_key`、200 个不同 `data_hash`；`failed_request_log` 为 0 条。
  - 10U 后 `lot_no_detail` 累计 raw 为 8006 条、8006 个不同交货单号；checkpoint 指向批次 `sync_20260705_045048_577028`，记录 `param_offset=7806`、`param_limit=200`、`next_param_offset=8006`、`item_count=200`、`total_count=200`。
  - 按 `storage_inbound_page.raw_json.fcode` 且 `opType=LNInbound` 口径核验，`lot_no_detail` 剩余历史缺口为 255 个。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，DB 同步 API 配置 52 条。
  - `.\\.venv\\Scripts\\python.exe -m app.main` dry-run 显示 loaded 33 enabled API config(s)，说明 `lot_no_detail` 没有误进入 enabled。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 185 个、真实配置 API 50 个、enabled 33 个；执行分层摘要为 `configured=50`、`needs_upstream_params=63`、`needs_sensitive_review=22`、`defer_or_review=50`。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，80 个测试通过。
- 10S-10U 复盘：
  - 三轮累计新增 600 个 `lot_no_detail` 交货单详情，覆盖从 7406/8261 推进到 8006/8261，剩余缺口从 855 降到 255。
  - 三轮均为 200 请求、200 raw、失败 0；批次耗时约 288 秒、291 秒、286 秒，200 窗口仍保持稳定。
  - 当前覆盖约 96.9%，距离完整历史回填仍有 255 个交货单号，不满足进入 daily enabled 的前提。
  - 下一组建议继续 200 窗口；预计 10V 后剩余约 55 个交货单号，之后再做最后小窗口与 enabled 边界评估。
- 当前结论：
  - `lot_no_detail` 已从 7806/8261 推进到 8006/8261，剩余缺口 255。
  - 当前 configured real API 仍为 50 个，enabled 仍为 33 个。
  - 下一阶段建议继续用 `lot_no_detail.param_source.limit=200` 做历史回填窗口；下一次三轮复盘放在 10X 完成后。

## Stage 10V

- 阶段目标：继续推进完整拉取；复用 `lot_no_detail.param_source.limit=200` 做下一段历史回填，不启用。
- 已完成：
  - 只读 DB 起点确认 `api_config` 总配置 52 条、enabled 33 条；`lot_no_detail.enabled=0`、`config_json.enabled=false`。
  - 起点 `lot_no_detail` checkpoint 指向批次 `sync_20260705_045048_577028`，记录 `param_offset=7806`、`param_limit=200`、`next_param_offset=8006`、`item_count=200`、`total_count=200`。
  - 起点 `lot_no_detail` 累计 raw 为 8006 条、8006 个不同交货单号；上游 `storage_inbound_page.raw_json.fcode` 且 `opType=LNInbound` 的不同交货单号为 8261 个，剩余缺口为 255。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api lot_no_detail`，通过，批次 `sync_20260705_050255_559206`，请求 200 次，写入 200 条。
  - DB 核验显示该批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`，从 `2026-07-05 05:02:56` 到 `2026-07-05 05:09:26`。
  - 同批次 `sync_api_log` 为 `status=success`、`request_count=200`、`success_count=200`、`failed_count=0`、`error_message=NULL`，从 `2026-07-05 05:02:59` 到 `2026-07-05 05:09:25`。
  - 同批次 raw 为 200 条、200 个不同 `source_primary_key`、200 个不同 `data_hash`；`failed_request_log` 为 0 条。
  - 10V 后 `lot_no_detail` 累计 raw 为 8206 条、8206 个不同交货单号；checkpoint 指向批次 `sync_20260705_050255_559206`，记录 `param_offset=8006`、`param_limit=200`、`next_param_offset=8206`、`item_count=200`、`total_count=200`。
  - 按 `storage_inbound_page.raw_json.fcode` 且 `opType=LNInbound` 口径核验，`lot_no_detail` 剩余历史缺口为 55 个。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，DB 同步 API 配置 52 条。
  - `.\\.venv\\Scripts\\python.exe -m app.main` dry-run 显示 loaded 33 enabled API config(s)，说明 `lot_no_detail` 没有误进入 enabled。
  - DB 核验显示 `api_config` 总配置 52 条、enabled 33 条；`lot_no_detail.enabled=0`、`config_json.enabled=false`。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 185 个、真实配置 API 50 个、enabled 33 个；执行分层摘要为 `configured=50`、`needs_upstream_params=63`、`needs_sensitive_review=22`、`defer_or_review=50`。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，80 个测试通过。
- 本轮复盘：
  - 10V 没有新增配置或改 YAML，只推进 `lot_no_detail` 历史覆盖；这是正确边界，因为缺口尚未归零前不能进入 daily enabled。
  - 200 请求窗口仍稳定，批次约 390 秒；接近尾段时下一轮大概率只剩 55 个缺失主键，不能机械预期仍新增 200 条。
  - 当前覆盖已到 8206/8261，剩余缺口 55；10W 应优先完成尾段，再用缺失主键扫描判断是否具备 enabled 评估资格。
- 当前结论：
  - `lot_no_detail` 已从 8006/8261 推进到 8206/8261，剩余缺口 55。
  - 当前 configured real API 仍为 50 个，enabled 仍为 33 个。
  - 下一阶段建议继续用 `lot_no_detail.param_source.limit=200` 做最后尾段；如果 10W 后缺口归零，先评估 enabled 边界，不要直接启用。

## Stage 10W

- 阶段目标：继续推进完整拉取；复用 `lot_no_detail.param_source.limit=200` 做历史尾段回填，不启用，并确认缺口是否归零。
- 已完成：
  - 只读 DB 起点确认 `api_config` 总配置 52 条、enabled 33 条；`lot_no_detail.enabled=0`、`config_json.enabled=false`。
  - 起点 `lot_no_detail` checkpoint 指向批次 `sync_20260705_050255_559206`，记录 `param_offset=8006`、`param_limit=200`、`next_param_offset=8206`、`item_count=200`、`total_count=200`。
  - 起点 `lot_no_detail` 累计 raw 为 8206 条、8206 个不同交货单号；上游 `storage_inbound_page.raw_json.fcode` 且 `opType=LNInbound` 的不同交货单号为 8261 个，剩余缺口为 55。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api lot_no_detail`，通过，批次 `sync_20260705_051850_119507`，请求 55 次，写入 55 条。
  - DB 核验显示该批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`，从 `2026-07-05 05:18:50` 到 `2026-07-05 05:20:43`。
  - 同批次 `sync_api_log` 为 `status=success`、`request_count=55`、`success_count=55`、`failed_count=0`、`error_message=NULL`，从 `2026-07-05 05:18:54` 到 `2026-07-05 05:20:43`。
  - 同批次 raw 为 55 条、55 个不同 `source_primary_key`、55 个不同 `data_hash`；`failed_request_log` 为 0 条。
  - 10W 后 `lot_no_detail` 累计 raw 为 8261 条、8261 个不同交货单号；checkpoint 指向批次 `sync_20260705_051850_119507`，记录 `param_offset=8206`、`param_limit=200`、`next_param_offset=8261`、`item_count=55`、`total_count=55`。
  - 按 `storage_inbound_page.raw_json.fcode` 且 `opType=LNInbound` 口径核验，`lot_no_detail` 剩余历史缺口为 0 个，缺失样本为空。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，DB 同步 API 配置 52 条。
  - `.\\.venv\\Scripts\\python.exe -m app.main` dry-run 显示 loaded 33 enabled API config(s)，说明 `lot_no_detail` 仍未进入 enabled。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 185 个、真实配置 API 50 个、enabled 33 个；执行分层摘要为 `configured=50`、`needs_upstream_params=63`、`needs_sensitive_review=22`、`defer_or_review=50`。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，80 个测试通过。
- 当前结论：
  - `lot_no_detail` 已从 8206/8261 推进到 8261/8261，当前历史缺口为 0。
  - 当前 configured real API 仍为 50 个，enabled 仍为 33 个。
  - 下一阶段进入 10X：先验证 `lot_no_detail` 的缺失主键扫描边界，再决定是否将 `lot_no_detail.enabled` 从 `false` 改为 `true` 并跑完整 `--sync-enabled`。

## Stage 10X

- 阶段目标：验证 `lot_no_detail` 缺失主键扫描边界，将其从 disabled 切入 enabled，并用完整 `--sync-enabled` 批次证明 34 个 enabled API 同批次成功。
- 已完成：
  - TDD 先行补充 `lot_no_detail` 配置边界测试：RED 阶段预期失败 2 项，分别证明 `lot_no_detail.enabled` 仍为 `false`、enabled 清单仍为 33 个。
  - 将 `config/api_config.example.yaml` 中 `lot_no_detail.enabled` 从 `false` 改为 `true`，并加入 `param_source.exclude_existing_target=true`，使 enabled 后只拾取目标表缺失的交货单号。
  - 更新 README 当前 enabled 清单和数量，加入 `lot_no_detail`。
  - `.\\.venv\\Scripts\\python.exe -m unittest tests.test_lot_no_detail_param_source tests.test_5v_low_risk_enabled_configs`，通过，5 个测试通过。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，DB 同步 API 配置 52 条。
  - `.\\.venv\\Scripts\\python.exe -m app.main` dry-run 显示 loaded 34 enabled API config(s)，确认 `lot_no_detail` 已进入 enabled。
  - DB 核验显示 `api_config` 总配置 52 条、enabled 34 条；`lot_no_detail.enabled=1`、`config_json.enabled=true`、`param_source.exclude_existing_target=true`。
  - enabled 前缺失扫描核验显示 `storage_inbound_page` 中 8261 个 LNInbound 交货单号已全部被 `lot_no_detail` 覆盖，剩余缺口 0，缺失候选 0。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-enabled`，通过，批次 `sync_20260705_053106_519317`，34 个 API、3078 次请求、写入 307950 条。
  - DB 核验显示该批次 `sync_batch.status=success`、`total_api_count=34`、`success_api_count=34`、`failed_api_count=0`，从 `2026-07-05 05:31:07` 到 `2026-07-05 06:48:40`。
  - 同批次 `sync_api_log` 共 34 条，34 条 success，non-success 0；请求数 3078，成功写入数 307950，失败数 0；`failed_request_log=0`。
  - `lot_no_detail` 同批次日志为 `status=success`、`request_count=0`、`success_count=0`、`failed_count=0`，说明缺口为 0 时没有重复请求 8261 个历史交货单号。
  - 同批次 `lot_no_detail` raw 写入 0 条；全局覆盖仍为 8261/8261，剩余缺口 0。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 185 个、真实配置 API 50 个、enabled 34 个；执行分层为 `configured=50`、`configured_enabled=34`、`configured_disabled=16`、`needs_upstream_params=63`、`needs_sensitive_review=22`、`defer_or_review=50`。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，82 个测试通过。
- 10V-10X 复盘：
  - 10V 新增 200 个 `lot_no_detail` 交货单详情，覆盖从 8006/8261 推进到 8206/8261；10W 新增最后 55 个详情，覆盖追平 8261/8261；10X 切入 enabled 后在完整批次中请求 0 次，证明缺失扫描没有重复拉取历史。
  - 三轮把 `lot_no_detail` 从“历史回填尾段”推进到“daily enabled”，enabled 数量从 33 增加到 34。
  - 10X 的核心审核点不是新增 raw，而是边界正确：`missing_candidates=0`、`lot_no_detail.request_count=0`、34/34 同批次成功。
  - 剩余推进方向已经不在 `lot_no_detail`：当前还有 16 个 configured disabled API、63 个需要参数源的 API、22 个敏感审核 API 和 50 个延后或需复核 API。
- 当前结论：
  - `lot_no_detail` 已进入 enabled，并通过完整 enabled 批次验证。
  - 当前 configured real API 仍为 50 个，enabled 已为 34 个。
  - 下一阶段 10Y 应从剩余 configured disabled 或 needs_param_source 中选择下一个低风险目标，先做只读盘点和真实证据，不再继续 `lot_no_detail`。

## Stage 10Y

- 阶段目标：从剩余 configured disabled API 中选择一个低风险目标，优先推进直读分页且体量可控的 `transfer_page`。
- 已完成：
  - 只读盘点剩余 16 个 configured disabled API，排除超大分页的 `inventory_event_page`、`inventory_age_page` 和高体量库存类接口后，选择 `transfer_page`；原因是它已完成 3 页小样本验证，当前总量约 6755-6759，低于 `lot_no_page` 和库存大表。
  - TDD 第一段先将 `tests/test_transfer_page_config.py` 改为期望完整窗口 `page.max_pages=100` 且保持 disabled；RED 阶段失败于 `3 != 100`。
  - 将 `config/api_config.example.yaml` 中 `transfer_page.page.max_pages` 从 3 改为 100，保持 `enabled=false`；目标是先完整验证，不直接启用。
  - `.\\.venv\\Scripts\\python.exe -m unittest tests.test_transfer_page_config`，通过。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，DB 同步 API 配置 52 条。
  - `.\\.venv\\Scripts\\python.exe -m app.main` dry-run 显示 loaded 34 enabled API config(s)，确认完整窗口验证前 `transfer_page` 没有误进入 enabled。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api transfer_page`，通过，批次 `sync_20260705_070031_049820`，68 次请求，写入 6759 条。
  - DB 核验显示单接口批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`，从 `2026-07-05 07:00:31` 到 `2026-07-05 07:06:53`。
  - 同批次 `sync_api_log` 为 `status=success`、`request_count=68`、`success_count=6759`、`failed_count=0`、`error_message=NULL`。
  - 同批次 raw 为 6759 条、6759 个不同 `source_primary_key`、6759 个不同 `data_hash`；全量 raw 为 6759 条，`data_date` 范围从 `2022-09-20` 到 `2026-07-03`。
  - `transfer_page` checkpoint 指向批次 `sync_20260705_070031_049820`，记录 `last_page=68`、`request_count=68`、`item_count=6759`、`total_count=6759`；`failed_request_log=0`。
  - TDD 第二段先将 `transfer_page` 测试改为 enabled，并将 enabled 清单测试改为 35 个且包含 `transfer_page`；RED 阶段失败于 `transfer_page.enabled=false` 和 enabled 数量 `34 != 35`。
  - 将 `transfer_page.enabled` 从 `false` 改为 `true`，并保持 `page.max_pages=100`。
  - `.\\.venv\\Scripts\\python.exe -m unittest tests.test_transfer_page_config tests.test_5v_low_risk_enabled_configs`，通过。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，DB 同步 API 配置 52 条。
  - `.\\.venv\\Scripts\\python.exe -m app.main` dry-run 显示 loaded 35 enabled API config(s)，且包含 `transfer_page`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-enabled`，通过，批次 `sync_20260705_070823_117795`，35 个 API、3141 次请求、写入 314709 条。
  - DB 核验显示该批次 `sync_batch.status=success`、`total_api_count=35`、`success_api_count=35`、`failed_api_count=0`，从 `2026-07-05 07:08:23` 到 `2026-07-05 08:28:05`。
  - 同批次 `sync_api_log` 共 35 条，35 条 success，non-success 0；请求数 3141，成功写入数 314709，失败数 0；`failed_request_log=0`。
  - `transfer_page` 同批次日志为 `status=success`、`request_count=68`、`success_count=6759`、`failed_count=0`，同批次 raw 为 6759 条、6759 个不同主键、6759 个不同 hash。
  - `transfer_page` checkpoint 指向 enabled 批次 `sync_20260705_070823_117795`，记录 `last_page=68`、`request_count=68`、`item_count=6759`、`total_count=6759`。
  - DB 核验显示 `api_config` 总配置 52 条、enabled 35 条；`transfer_page.enabled=1`、`config_json.enabled=true`、`page.max_pages=100`。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 185 个、真实配置 API 50 个、enabled 35 个；执行分层为 `configured=50`、`configured_enabled=35`、`configured_disabled=15`、`needs_upstream_params=63`、`needs_sensitive_review=22`、`defer_or_review=50`。
- 当前结论：
  - `transfer_page` 已从 3 页小样本推进到完整 68 页，并进入 enabled。
  - 当前 configured real API 仍为 50 个，enabled 已为 35 个，configured disabled 降为 15 个。
  - 下一阶段 10Z 可优先评估 `lot_no_page`，因为它同样是直读分页、体量约 8602 条，并且可支撑 `procure_detail` 后续扩大参数来源；但启用前仍必须先做完整窗口单接口验证。

## Stage 10Z

- 阶段目标：完成 `lot_no_page` 完整窗口验证，并在通过后进入 enabled。
- 已完成：
  - 只读确认 `lot_no_page` 起点配置为 `enabled=false`、`page.max_pages=3`、`page_size=100`；历史小样本 raw 为 300 条、300 个不同主键、300 个不同 hash。
  - 起点 checkpoint 指向批次 `sync_20260703_101146_180687`，记录 `last_page=3`、`request_count=3`、`item_count=300`、`total_count=8602`。
  - TDD 第一段先将 `tests/test_lot_no_page_config.py` 改为期望完整窗口 `page.max_pages=120` 且保持 disabled；RED 阶段失败于 `3 != 120`。
  - 将 `config/api_config.example.yaml` 中 `lot_no_page.page.max_pages` 从 3 改为 120，保持 `enabled=false`。
  - `.\\.venv\\Scripts\\python.exe -m unittest tests.test_lot_no_page_config`，通过。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，DB 同步 API 配置 52 条。
  - `.\\.venv\\Scripts\\python.exe -m app.main` dry-run 显示 loaded 35 enabled API config(s)，确认完整窗口验证前 `lot_no_page` 没有误进入 enabled。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api lot_no_page`，通过，批次 `sync_20260705_083557_251344`，87 次请求，写入 8631 条。
  - DB 核验显示单接口批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`，从 `2026-07-05 08:35:57` 到 `2026-07-05 08:38:23`。
  - 同批次 `sync_api_log` 为 `status=success`、`request_count=87`、`success_count=8631`、`failed_count=0`、`error_message=NULL`。
  - 同批次 raw 为 8631 条、8631 个不同 `source_primary_key`、8631 个不同 `data_hash`；`data_date` 范围从 `2022-09-20` 到 `2026-07-03`。
  - `lot_no_page` checkpoint 指向批次 `sync_20260705_083557_251344`，记录 `last_page=87`、`request_count=87`、`item_count=8631`、`total_count=8631`；`failed_request_log=0`。
  - TDD 第二段先将 `lot_no_page` 测试改为 enabled，并将 enabled 清单测试改为 36 个且包含 `lot_no_page`；RED 阶段失败于 `lot_no_page.enabled=false` 和 enabled 数量 `35 != 36`。
  - 将 `lot_no_page.enabled` 从 `false` 改为 `true`，并保持 `page.max_pages=120`。
  - `.\\.venv\\Scripts\\python.exe -m unittest tests.test_lot_no_page_config tests.test_5v_low_risk_enabled_configs`，通过。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，DB 同步 API 配置 52 条。
  - `.\\.venv\\Scripts\\python.exe -m app.main` dry-run 显示 loaded 36 enabled API config(s)，且包含 `lot_no_page`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-enabled`，通过，批次 `sync_20260705_083949_209208`，36 个 API、3228 次请求、写入 323340 条。
  - DB 核验显示该批次 `sync_batch.status=success`、`total_api_count=36`、`success_api_count=36`、`failed_api_count=0`，从 `2026-07-05 08:39:49` 到 `2026-07-05 09:57:29`。
  - 同批次 `sync_api_log` 共 36 条，36 条 success，non-success 0；请求数 3228，成功写入数 323340，失败数 0；`failed_request_log=0`。
  - `lot_no_page` 同批次日志为 `status=success`、`request_count=87`、`success_count=8631`、`failed_count=0`，同批次 raw 为 8631 条、8631 个不同主键、8631 个不同 hash。
  - `lot_no_page` checkpoint 指向 enabled 批次 `sync_20260705_083949_209208`，记录 `last_page=87`、`request_count=87`、`item_count=8631`、`total_count=8631`。
  - DB 核验显示 `api_config` 总配置 52 条、enabled 36 条；`lot_no_page.enabled=1`、`config_json.enabled=true`、`page.max_pages=120`。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 185 个、真实配置 API 50 个、enabled 36 个；执行分层为 `configured=50`、`configured_enabled=36`、`configured_disabled=14`、`needs_upstream_params=63`、`needs_sensitive_review=22`、`defer_or_review=50`。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，82 个测试通过。
  - 只读 DB 额外确认完整 `lot_no_page` 后有 8631 条包含 `poCode` 的 raw，去重后有 1153 个采购单号；`procure_detail` 目前只有 3 条小样本，可作为 11A 候选。
- 当前结论：
  - `lot_no_page` 已从 3 页小样本推进到完整 87 页，并进入 enabled。
  - 当前 configured real API 仍为 50 个，enabled 已为 36 个，configured disabled 降为 14 个。
  - 下一阶段 11A 建议评估 `procure_detail` 的参数窗口；10Y-11A 三轮完成后需要做一次复盘。

## Stage 11A

- 阶段目标：扩大 `procure_detail` 参数窗口，验证采购订单详情能按 `lot_no_page.raw_json.poCode` 继续推进，并完成 10Y-11A 三轮复盘。
- 已完成：
  - 只读确认 `procure_detail` 起点为 `api_config.enabled=0`、`config_json.enabled=false`、`param_source.limit=3`，参数来源为 `lot_no_page.raw_json.poCode`。
  - 起点 raw 为 3 条、3 个不同 `data_hash`；checkpoint 指向批次 `sync_20260703_170038_518908`，记录 `param_offset=0`、`param_limit=3`、`next_param_offset=3`。
  - 只读确认完整 `lot_no_page` 中有 8631 条带 `poCode` 的 raw，去重后有 1153 个采购单号；`procure_detail` 仍只覆盖 3/1153。
  - TDD 先将 `tests/test_procure_detail_param_source.py` 改为期望中等窗口 `param_source.limit=100` 且保持 disabled；RED 阶段失败于 `3 != 100`。
  - 将 `config/api_config.example.yaml` 中 `procure_detail.param_source.limit` 从 3 改为 100，注释同步为“中等窗口验证阶段保持 disabled”，未修改 `enabled=false`。
  - `.\\.venv\\Scripts\\python.exe -m unittest tests.test_procure_detail_param_source`，通过。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，DB 同步 API 配置 52 条。
  - `.\\.venv\\Scripts\\python.exe -m app.main` dry-run 显示 loaded 36 enabled API config(s)，确认 `procure_detail` 未误进入 enabled。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api procure_detail`，通过，批次 `sync_20260705_100801_877109`，100 次请求，写入 100 条。
  - DB 核验显示单接口批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`，从 `2026-07-05 10:08:02` 到 `2026-07-05 10:09:44`。
  - 同批次 `sync_api_log` 为 `status=success`、`request_count=100`、`success_count=100`、`failed_count=0`、`error_message=NULL`。
  - 同批次 raw 为 100 条、0 个 `source_primary_key`、100 个不同 `data_hash`、空对象 0；全量 `procure_detail` raw 为 103 条、103 个不同 `data_hash`。
  - `procure_detail` checkpoint 指向批次 `sync_20260705_100801_877109`，记录 `last_page=100`、`request_count=100`、`item_count=100`、`total_count=100`、`param_offset=3`、`param_limit=100`、`next_param_offset=103`。
  - `failed_request_log` 中本批次 `procure_detail` 失败数为 0。
  - DB 核验显示 `procure_detail.enabled=0`、`config_json.enabled=false`、`param_source.limit=100`。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 185 个、真实配置 API 50 个、enabled 36 个；执行分层为 `configured=50`、`configured_enabled=36`、`configured_disabled=14`、`needs_upstream_params=63`、`needs_sensitive_review=22`、`defer_or_review=50`。
- 10Y-11A 复盘：
  - 10Y 将 `transfer_page` 从 3 页小样本推进到完整 6759 条，并进入 enabled；enabled API 从 34 增至 35。
  - 10Z 将 `lot_no_page` 从 3 页小样本推进到完整 8631 条，并进入 enabled；enabled API 从 35 增至 36，同时为 `procure_detail` 提供 1153 个采购单号参数源。
  - 11A 将 `procure_detail` 从 3 条扩到 103 条累计覆盖，checkpoint 从 `next_param_offset=3` 推进到 `next_param_offset=103`，但仍保持 disabled。
  - `procure_detail` 暂不启用的原因：当前只覆盖 103/1153 个采购单号，仍有约 1050 个未拉取；接口当前依靠 `data_hash` 幂等，没有稳定 `source_primary_key`，不适合在历史未补齐时进入 daily enabled。
- 当前结论：
  - `procure_detail` 中等窗口验证通过，参数推进、写入、失败记录和 disabled 边界均符合预期。
  - 当前 configured real API 仍为 50 个，enabled 仍为 36 个，configured disabled 仍为 14 个。
  - 下一阶段 11B 应继续复用 `procure_detail.param_source.limit=100` 推进下一窗口，保持 disabled，直到历史覆盖足够接近 1153 个采购单号后再评估 enabled 或缺失扫描边界。

## Stage 11B

- 阶段目标：不改 YAML，继续复用 `procure_detail.param_source.limit=100`，从 checkpoint 的 `next_param_offset=103` 推进下一批采购单号。
- 已完成：
  - 只读 DB 起点确认 `procure_detail.enabled=0`、`config_json.enabled=false`、`param_source.limit=100`。
  - 起点 raw 为 103 条、103 个不同 `data_hash`；checkpoint 指向批次 `sync_20260705_100801_877109`，记录 `param_offset=3`、`param_limit=100`、`next_param_offset=103`。
  - 只读确认完整 `lot_no_page` 中仍有 1153 个去重采购单号，`procure_detail` 起点覆盖 103/1153。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api procure_detail`，通过，批次 `sync_20260705_101701_069678`，100 次请求，写入 100 条。
  - DB 核验显示单接口批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`，从 `2026-07-05 10:17:01` 到 `2026-07-05 10:18:46`。
  - 同批次 `sync_api_log` 为 `status=success`、`request_count=100`、`success_count=100`、`failed_count=0`、`error_message=NULL`。
  - 同批次 raw 为 100 条、0 个 `source_primary_key`、100 个不同 `data_hash`、空对象 0；全量 `procure_detail` raw 为 203 条、203 个不同 `data_hash`。
  - `procure_detail` checkpoint 指向批次 `sync_20260705_101701_069678`，记录 `last_page=100`、`request_count=100`、`item_count=100`、`total_count=100`、`param_offset=103`、`param_limit=100`、`next_param_offset=203`。
  - `failed_request_log` 中本批次 `procure_detail` 失败数为 0。
  - DB 核验显示 `procure_detail.enabled=0`、`config_json.enabled=false`、`param_source.limit=100`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，DB 同步 API 配置 52 条。
  - `.\\.venv\\Scripts\\python.exe -m app.main` dry-run 显示 loaded 36 enabled API config(s)，确认 `procure_detail` 未误进入 enabled。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 185 个、真实配置 API 50 个、enabled 36 个；执行分层为 `configured=50`、`configured_enabled=36`、`configured_disabled=14`、`needs_upstream_params=63`、`needs_sensitive_review=22`、`defer_or_review=50`。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，82 个测试通过。
- 当前结论：
  - `procure_detail` 第二个 100 窗口验证通过，累计覆盖从 103/1153 推进到 203/1153，仍有约 950 个采购单号历史缺口。
  - 当前 configured real API 仍为 50 个，enabled 仍为 36 个，configured disabled 仍为 14 个。
  - 下一阶段 11C 应继续复用 `procure_detail.param_source.limit=100` 推进下一窗口，保持 disabled，预计 checkpoint 从 `next_param_offset=203` 推进到约 303。

## Stage 11C

- 阶段目标：不改 YAML，继续复用 `procure_detail.param_source.limit=100`，从 checkpoint 的 `next_param_offset=203` 推进下一批采购单号，并完成 11A-11C 三轮复盘。
- 已完成：
  - 只读 DB 起点确认 `procure_detail.enabled=0`、`config_json.enabled=false`、`param_source.limit=100`。
  - 起点 raw 为 203 条、203 个不同 `data_hash`；checkpoint 指向批次 `sync_20260705_101701_069678`，记录 `param_offset=103`、`param_limit=100`、`next_param_offset=203`。
  - 只读确认完整 `lot_no_page` 中仍有 1153 个去重采购单号，`procure_detail` 起点覆盖 203/1153。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api procure_detail`，通过，批次 `sync_20260705_102515_657377`，100 次请求，写入 100 条。
  - DB 核验显示单接口批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`，从 `2026-07-05 10:25:16` 到 `2026-07-05 10:26:52`。
  - 同批次 `sync_api_log` 为 `status=success`、`request_count=100`、`success_count=100`、`failed_count=0`、`error_message=NULL`。
  - 同批次 raw 为 100 条、0 个 `source_primary_key`、100 个不同 `data_hash`、空对象 0；全量 `procure_detail` raw 为 303 条、303 个不同 `data_hash`。
  - `procure_detail` checkpoint 指向批次 `sync_20260705_102515_657377`，记录 `last_page=100`、`request_count=100`、`item_count=100`、`total_count=100`、`param_offset=203`、`param_limit=100`、`next_param_offset=303`。
  - `failed_request_log` 中本批次 `procure_detail` 失败数为 0。
  - DB 核验显示 `procure_detail.enabled=0`、`config_json.enabled=false`、`param_source.limit=100`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，DB 同步 API 配置 52 条。
  - `.\\.venv\\Scripts\\python.exe -m app.main` dry-run 显示 loaded 36 enabled API config(s)，确认 `procure_detail` 未误进入 enabled。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 185 个、真实配置 API 50 个、enabled 36 个；执行分层为 `configured=50`、`configured_enabled=36`、`configured_disabled=14`、`needs_upstream_params=63`、`needs_sensitive_review=22`、`defer_or_review=50`。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，82 个测试通过。
- 11A-11C 复盘：
  - 11A 将 `procure_detail` 从 3 条小样本扩大到 103/1153，确认 `limit=100` 窗口、`data_hash` 幂等和 disabled 边界可用。
  - 11B 继续推进到 203/1153，未修改 YAML，证明 checkpoint 能从 `next_param_offset=103` 正常推进到 203。
  - 11C 继续推进到 303/1153，三轮均为 100 请求、100 raw、失败 0、空对象 0，说明当前 100 窗口节奏稳定。
  - 仍不应启用 `procure_detail`：当前还有约 850 个采购单号历史缺口，且该接口仍无稳定 `source_primary_key`，依靠 `data_hash` 去重；应先继续历史回填，再评估 enabled 或缺失扫描边界。
- 当前结论：
  - `procure_detail` 第三个 100 窗口验证通过，累计覆盖从 203/1153 推进到 303/1153。
  - 当前 configured real API 仍为 50 个，enabled 仍为 36 个，configured disabled 仍为 14 个。
  - 下一阶段 11D 应继续复用 `procure_detail.param_source.limit=100` 推进下一窗口，保持 disabled，预计 checkpoint 从 `next_param_offset=303` 推进到约 403。

## Stage 11D

- 阶段目标：不改 YAML，继续复用 `procure_detail.param_source.limit=100`，从 checkpoint 的 `next_param_offset=303` 推进下一批采购单号，并完成 11B-11D 三轮复盘。
- 已完成：
  - 只读 DB 起点确认 `procure_detail.enabled=0`、`config_json.enabled=false`、`param_source.limit=100`。
  - 起点 raw 为 303 条、303 个不同 `data_hash`；checkpoint 指向批次 `sync_20260705_102515_657377`，记录 `param_offset=203`、`param_limit=100`、`next_param_offset=303`。
  - 只读确认完整 `lot_no_page` 中仍有 1153 个去重采购单号，`procure_detail` 起点覆盖 303/1153。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api procure_detail`，通过，批次 `sync_20260705_103321_126355`，100 次请求，写入 100 条。
  - DB 核验显示单接口批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`，从 `2026-07-05 10:33:21` 到 `2026-07-05 10:35:11`。
  - 同批次 `sync_api_log` 为 `status=success`、`request_count=100`、`success_count=100`、`failed_count=0`、`error_message=NULL`。
  - 同批次 raw 为 100 条、0 个 `source_primary_key`、100 个不同 `data_hash`、空对象 0；全量 `procure_detail` raw 为 403 条、403 个不同 `data_hash`。
  - `procure_detail` checkpoint 指向批次 `sync_20260705_103321_126355`，记录 `last_page=100`、`request_count=100`、`item_count=100`、`total_count=100`、`param_offset=303`、`param_limit=100`、`next_param_offset=403`。
  - `failed_request_log` 中本批次 `procure_detail` 失败数为 0。
  - DB 核验显示 `procure_detail.enabled=0`、`config_json.enabled=false`、`param_source.limit=100`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，DB 同步 API 配置 52 条。
  - `.\\.venv\\Scripts\\python.exe -m app.main` dry-run 显示 loaded 36 enabled API config(s)，确认 `procure_detail` 未误进入 enabled。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 185 个、真实配置 API 50 个、enabled 36 个；执行分层为 `configured=50`、`configured_enabled=36`、`configured_disabled=14`、`needs_upstream_params=63`、`needs_sensitive_review=22`、`defer_or_review=50`。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，82 个测试通过。
- 11B-11D 复盘：
  - 11B 从 103/1153 推进到 203/1153，验证 `next_param_offset=103` 后的第二个 100 窗口稳定。
  - 11C 从 203/1153 推进到 303/1153，验证中段窗口继续稳定，且完成 11A-11C 复盘。
  - 11D 从 303/1153 推进到 403/1153，三轮均为 100 请求、100 raw、失败 0、空对象 0，说明当前 100 窗口节奏仍稳定。
  - 仍不应启用 `procure_detail`：当前还有约 750 个采购单号历史缺口，且该接口仍无稳定 `source_primary_key`，依靠 `data_hash` 去重；应先继续历史回填，再评估 enabled 或缺失扫描边界。
- 当前结论：
  - `procure_detail` 第四个 100 窗口验证通过，累计覆盖从 303/1153 推进到 403/1153。
  - 当前 configured real API 仍为 50 个，enabled 仍为 36 个，configured disabled 仍为 14 个。
  - 下一阶段 11E 应继续复用 `procure_detail.param_source.limit=100` 推进下一窗口，保持 disabled，预计 checkpoint 从 `next_param_offset=403` 推进到约 503。

## Stage 11E

- 阶段目标：不改 YAML，继续复用 `procure_detail.param_source.limit=100`，从 checkpoint 的 `next_param_offset=403` 推进下一批采购单号，并按本轮要求完成一次全面复盘。
- 已完成：
  - 只读 DB 起点确认 `procure_detail.enabled=0`、`config_json.enabled=false`、`param_source.limit=100`。
  - 起点 raw 为 403 条、403 个不同 `data_hash`；checkpoint 指向批次 `sync_20260705_103321_126355`，记录 `param_offset=303`、`param_limit=100`、`next_param_offset=403`。
  - 只读确认完整 `lot_no_page` 中仍有 1153 个去重采购单号，`procure_detail` 起点覆盖 403/1153。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api procure_detail`，通过，批次 `sync_20260705_104321_283866`，100 次请求，写入 100 条。
  - DB 核验显示单接口批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`。
  - 同批次 `sync_api_log` 为 `status=success`、`request_count=100`、`success_count=100`、`failed_count=0`、`error_message=NULL`。
  - 同批次 raw 为 100 条、0 个 `source_primary_key`、100 个 `data_hash`、空对象 0；全量 `procure_detail` raw 为 503 条、503 个 `data_hash`。
  - `procure_detail` checkpoint 指向批次 `sync_20260705_104321_283866`，记录 `last_page=100`、`request_count=100`、`item_count=100`、`total_count=100`、`param_offset=403`、`param_limit=100`、`next_param_offset=503`。
  - `failed_request_log` 中本批次 `procure_detail` 失败数为 0。
  - DB 核验显示 `procure_detail.enabled=0`、`config_json.enabled=false`、`param_source.limit=100`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，DB 同步 API 配置 52 条。
  - `.\\.venv\\Scripts\\python.exe -m app.main` dry-run 显示 loaded 36 enabled API config(s)，确认 `procure_detail` 未误进入 enabled。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 185 个、真实配置 API 50 个、enabled 36 个；执行分层为 `configured=50`、`configured_enabled=36`、`configured_disabled=14`、`needs_upstream_params=63`、`needs_sensitive_review=22`、`defer_or_review=50`。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，82 个测试通过。
- 本轮复盘：
  - 结果层面：`procure_detail` 第五个 100 窗口稳定通过，累计覆盖从 403/1153 推进到 503/1153，失败 0、空对象 0。
  - 边界层面：本轮没有修改 YAML，也没有运行完整 `--sync-enabled`；`procure_detail` 继续保持 disabled，enabled API 稳定为 36 个。
  - 项目目标层面：当前进展仍在补齐历史采购订单详情数据，距离完整覆盖还差约 650 个采购单号；直接启用 daily 会把未补齐历史和日常增量混在一起，不利于证明“完整拉取”。
  - 风险层面：该接口仍没有稳定 `source_primary_key`，依赖 `data_hash` 幂等；在历史未补齐前继续按 100 窗口推进，是当前最小风险路径。
- 当前结论：
  - `procure_detail` 第五个 100 窗口验证通过，累计覆盖从 403/1153 推进到 503/1153。
  - 当前 configured real API 仍为 50 个，enabled 仍为 36 个，configured disabled 仍为 14 个。
  - 下一阶段 11F 应继续复用 `procure_detail.param_source.limit=100` 推进下一窗口，保持 disabled，预计 checkpoint 从 `next_param_offset=503` 推进到约 603。

## Stage 11F

- 阶段目标：不改 YAML，继续复用 `procure_detail.param_source.limit=100`，从 checkpoint 的 `next_param_offset=503` 推进下一批采购单号。
- 已完成：
  - 只读 DB 起点确认 `procure_detail.enabled=0`、`config_json.enabled=false`、`param_source.limit=100`。
  - 起点 raw 为 503 条、503 个 `data_hash`；checkpoint 指向批次 `sync_20260705_104321_283866`，记录 `param_offset=403`、`param_limit=100`、`next_param_offset=503`。
  - 只读确认完整 `lot_no_page` 中仍有 1153 个去重采购单号，`procure_detail` 起点覆盖 503/1153。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api procure_detail`，通过，批次 `sync_20260705_105316_672164`，100 次请求，写入 100 条。
  - DB 核验显示单接口批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`。
  - 同批次 `sync_api_log` 为 `status=success`、`request_count=100`、`success_count=100`、`failed_count=0`、`error_message=NULL`。
  - 同批次 raw 为 100 条、0 个 `source_primary_key`、100 个 `data_hash`、空对象 0；全量 `procure_detail` raw 为 603 条、603 个 `data_hash`。
  - `procure_detail` checkpoint 指向批次 `sync_20260705_105316_672164`，记录 `last_page=100`、`request_count=100`、`item_count=100`、`total_count=100`、`param_offset=503`、`param_limit=100`、`next_param_offset=603`。
  - `failed_request_log` 中本批次 `procure_detail` 失败数为 0。
  - DB 核验显示 `procure_detail.enabled=0`、`config_json.enabled=false`、`param_source.limit=100`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，DB 同步 API 配置 52 条。
  - `.\\.venv\\Scripts\\python.exe -m app.main` dry-run 显示 loaded 36 enabled API config(s)，确认 `procure_detail` 未误进入 enabled。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 185 个、真实配置 API 50 个、enabled 36 个；执行分层为 `configured=50`、`configured_enabled=36`、`configured_disabled=14`、`needs_upstream_params=63`、`needs_sensitive_review=22`、`defer_or_review=50`。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，82 个测试通过。
- 当前结论：
  - `procure_detail` 第六个 100 窗口验证通过，累计覆盖从 503/1153 推进到 603/1153。
  - 当前 configured real API 仍为 50 个，enabled 仍为 36 个，configured disabled 仍为 14 个。
  - 下一阶段 11G 应继续复用 `procure_detail.param_source.limit=100` 推进下一窗口，保持 disabled，预计 checkpoint 从 `next_param_offset=603` 推进到约 703；11G 完成后按三轮节奏复盘 11E-11G。

## Stage 11G

- 阶段目标：不改 YAML，继续复用 `procure_detail.param_source.limit=100`，从 checkpoint 的 `next_param_offset=603` 推进下一批采购单号，并完成 11E-11G 三轮复盘。
- 已完成：
  - 只读 DB 起点确认 `procure_detail.enabled=0`、`config_json.enabled=false`、`param_source.limit=100`。
  - 起点 raw 为 603 条、603 个 `data_hash`；checkpoint 指向批次 `sync_20260705_105316_672164`，记录 `param_offset=503`、`param_limit=100`、`next_param_offset=603`。
  - 只读确认完整 `lot_no_page` 中仍有 1153 个去重采购单号，`procure_detail` 起点覆盖 603/1153。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api procure_detail`，通过，批次 `sync_20260705_110128_240957`，100 次请求，写入 100 条。
  - DB 核验显示单接口批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`。
  - 同批次 `sync_api_log` 为 `status=success`、`request_count=100`、`success_count=100`、`failed_count=0`、`error_message=NULL`。
  - 同批次 raw 为 100 条、0 个 `source_primary_key`、100 个 `data_hash`、空对象 0；全量 `procure_detail` raw 为 703 条、703 个 `data_hash`。
  - `procure_detail` checkpoint 指向批次 `sync_20260705_110128_240957`，记录 `last_page=100`、`request_count=100`、`item_count=100`、`total_count=100`、`param_offset=603`、`param_limit=100`、`next_param_offset=703`。
  - `failed_request_log` 中本批次 `procure_detail` 失败数为 0。
  - DB 核验显示 `procure_detail.enabled=0`、`config_json.enabled=false`、`param_source.limit=100`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，DB 同步 API 配置 52 条。
  - `.\\.venv\\Scripts\\python.exe -m app.main` dry-run 显示 loaded 36 enabled API config(s)，确认 `procure_detail` 未误进入 enabled。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 185 个、真实配置 API 50 个、enabled 36 个；执行分层为 `configured=50`、`configured_enabled=36`、`configured_disabled=14`、`needs_upstream_params=63`、`needs_sensitive_review=22`、`defer_or_review=50`。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，82 个测试通过。
- 11E-11G 复盘：
  - 11E 从 403/1153 推进到 503/1153，验证第五个 100 窗口稳定。
  - 11F 从 503/1153 推进到 603/1153，继续证明 checkpoint 能从 `next_param_offset=503` 正常推进。
  - 11G 从 603/1153 推进到 703/1153，三轮均为 100 请求、100 raw、失败 0、空对象 0，说明当前 100 窗口节奏仍稳定。
  - 仍不应启用 `procure_detail`：当前还有约 450 个采购单号历史缺口，且该接口仍无稳定 `source_primary_key`，依靠 `data_hash` 去重；应先继续历史回填，再评估 enabled 或缺失扫描边界。
- 当前结论：
  - `procure_detail` 第七个 100 窗口验证通过，累计覆盖从 603/1153 推进到 703/1153。
  - 当前 configured real API 仍为 50 个，enabled 仍为 36 个，configured disabled 仍为 14 个。
  - 下一阶段 11H 应继续复用 `procure_detail.param_source.limit=100` 推进下一窗口，保持 disabled，预计 checkpoint 从 `next_param_offset=703` 推进到约 803。

## Stage 11H

- 阶段目标：不改 YAML，继续复用 `procure_detail.param_source.limit=100`，从 checkpoint 的 `next_param_offset=703` 推进下一批采购单号。
- 已完成：
  - 只读 DB 起点确认 `procure_detail.enabled=0`、`config_json.enabled=false`、`param_source.limit=100`。
  - 起点 raw 为 703 条、703 个 `data_hash`；checkpoint 指向批次 `sync_20260705_110128_240957`，记录 `param_offset=603`、`param_limit=100`、`next_param_offset=703`。
  - 只读确认完整 `lot_no_page` 中仍有 1153 个去重采购单号，`procure_detail` 起点覆盖 703/1153。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api procure_detail`，通过，批次 `sync_20260705_111052_296719`，100 次请求，写入 100 条。
  - DB 核验显示单接口批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`。
  - 同批次 `sync_api_log` 为 `status=success`、`request_count=100`、`success_count=100`、`failed_count=0`、`error_message=NULL`。
  - 同批次 raw 为 100 条、0 个 `source_primary_key`、100 个 `data_hash`、空对象 0；全量 `procure_detail` raw 为 803 条、803 个 `data_hash`。
  - `procure_detail` checkpoint 指向批次 `sync_20260705_111052_296719`，记录 `last_page=100`、`request_count=100`、`item_count=100`、`total_count=100`、`param_offset=703`、`param_limit=100`、`next_param_offset=803`。
  - `failed_request_log` 中本批次 `procure_detail` 失败数为 0。
  - DB 核验显示 `procure_detail.enabled=0`、`config_json.enabled=false`、`param_source.limit=100`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，DB 同步 API 配置 52 条。
  - `.\\.venv\\Scripts\\python.exe -m app.main` dry-run 显示 loaded 36 enabled API config(s)，确认 `procure_detail` 未误进入 enabled。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 185 个、真实配置 API 50 个、enabled 36 个；执行分层为 `configured=50`、`configured_enabled=36`、`configured_disabled=14`、`needs_upstream_params=63`、`needs_sensitive_review=22`、`defer_or_review=50`。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，82 个测试通过。
- 当前结论：
  - `procure_detail` 第八个 100 窗口验证通过，累计覆盖从 703/1153 推进到 803/1153。
  - 当前 configured real API 仍为 50 个，enabled 仍为 36 个，configured disabled 仍为 14 个。
  - 下一阶段 11I 应继续复用 `procure_detail.param_source.limit=100` 推进下一窗口，保持 disabled，预计 checkpoint 从 `next_param_offset=803` 推进到约 903；下一次三轮复盘放在 11J 完成后。

## Stage 11I

- 阶段目标：不改 YAML，继续复用 `procure_detail.param_source.limit=100`，从 checkpoint 的 `next_param_offset=803` 推进下一批采购单号。
- 已完成：
  - 只读 DB 起点确认 `procure_detail.enabled=0`、`config_json.enabled=false`、`param_source.limit=100`。
  - 起点 raw 为 803 条、803 个 `data_hash`；checkpoint 指向批次 `sync_20260705_111052_296719`，记录 `param_offset=703`、`param_limit=100`、`next_param_offset=803`。
  - 只读确认完整 `lot_no_page` 中仍有 1153 个去重采购单号，`procure_detail` 起点覆盖 803/1153。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api procure_detail`，通过，批次 `sync_20260705_111947_801738`，100 次请求，写入 100 条。
  - DB 核验显示单接口批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`。
  - 同批次 `sync_api_log` 为 `status=success`、`request_count=100`、`success_count=100`、`failed_count=0`、`error_message=NULL`。
  - 同批次 raw 为 100 条、0 个 `source_primary_key`、100 个 `data_hash`、空对象 0；全量 `procure_detail` raw 为 903 条、903 个 `data_hash`。
  - `procure_detail` checkpoint 指向批次 `sync_20260705_111947_801738`，记录 `last_page=100`、`request_count=100`、`item_count=100`、`total_count=100`、`param_offset=803`、`param_limit=100`、`next_param_offset=903`。
  - `failed_request_log` 中本批次 `procure_detail` 失败数为 0。
  - DB 核验显示 `procure_detail.enabled=0`、`config_json.enabled=false`、`param_source.limit=100`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，DB 同步 API 配置 52 条。
  - `.\\.venv\\Scripts\\python.exe -m app.main` dry-run 显示 loaded 36 enabled API config(s)，确认 `procure_detail` 未误进入 enabled。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 185 个、真实配置 API 50 个、enabled 36 个；执行分层为 `configured=50`、`configured_enabled=36`、`configured_disabled=14`、`needs_upstream_params=63`、`needs_sensitive_review=22`、`defer_or_review=50`。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，82 个测试通过。
- 当前结论：
  - `procure_detail` 第九个 100 窗口验证通过，累计覆盖从 803/1153 推进到 903/1153。
  - 当前 configured real API 仍为 50 个，enabled 仍为 36 个，configured disabled 仍为 14 个。
  - 下一阶段 11J 应继续复用 `procure_detail.param_source.limit=100` 推进下一窗口，保持 disabled，预计 checkpoint 从 `next_param_offset=903` 推进到约 1003；11J 完成后按三轮节奏复盘 11H-11J。

## Stage 11J

- 阶段目标：不改 YAML，继续复用 `procure_detail.param_source.limit=100`，从 checkpoint 的 `next_param_offset=903` 推进下一批采购单号，并完成 11H-11J 三轮复盘。
- 已完成：
  - 只读 DB 起点确认 `procure_detail.enabled=0`、`config_json.enabled=false`、`param_source.limit=100`。
  - 起点 raw 为 903 条、903 个 `data_hash`；checkpoint 指向批次 `sync_20260705_111947_801738`，记录 `param_offset=803`、`param_limit=100`、`next_param_offset=903`。
  - 只读确认完整 `lot_no_page` 中仍有 1153 个去重采购单号，`procure_detail` 起点覆盖 903/1153。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api procure_detail`，通过，批次 `sync_20260705_113031_687363`，100 次请求，写入 100 条。
  - DB 核验显示单接口批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`。
  - 同批次 `sync_api_log` 为 `status=success`、`request_count=100`、`success_count=100`、`failed_count=0`、`error_message=NULL`。
  - 同批次 raw 为 100 条、0 个 `source_primary_key`、100 个 `data_hash`、空对象 0；全量 `procure_detail` raw 为 1003 条、1003 个 `data_hash`。
  - `procure_detail` checkpoint 指向批次 `sync_20260705_113031_687363`，记录 `last_page=100`、`request_count=100`、`item_count=100`、`total_count=100`、`param_offset=903`、`param_limit=100`、`next_param_offset=1003`。
  - `failed_request_log` 中本批次 `procure_detail` 失败数为 0。
  - DB 核验显示 `procure_detail.enabled=0`、`config_json.enabled=false`、`param_source.limit=100`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，DB 同步 API 配置 52 条。
  - `.\\.venv\\Scripts\\python.exe -m app.main` dry-run 显示 loaded 36 enabled API config(s)，确认 `procure_detail` 未误进入 enabled。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 185 个、真实配置 API 50 个、enabled 36 个；执行分层为 `configured=50`、`configured_enabled=36`、`configured_disabled=14`、`needs_upstream_params=63`、`needs_sensitive_review=22`、`defer_or_review=50`。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，82 个测试通过。
- 11H-11J 复盘：
  - 11H 从 703/1153 推进到 803/1153，验证第八个 100 窗口稳定。
  - 11I 从 803/1153 推进到 903/1153，checkpoint 从 `next_param_offset=803` 正常推进。
  - 11J 从 903/1153 推进到 1003/1153，三轮均为 100 请求、100 raw、失败 0、空对象 0，说明当前 100 窗口节奏仍稳定。
  - 仍不应启用 `procure_detail`：当前还有约 150 个采购单号历史缺口，且该接口仍无稳定 `source_primary_key`，依靠 `data_hash` 去重；应先继续历史回填，再评估 enabled 或缺失扫描边界。
- 当前结论：
  - `procure_detail` 第十个 100 窗口验证通过，累计覆盖从 903/1153 推进到 1003/1153。
  - 当前 configured real API 仍为 50 个，enabled 仍为 36 个，configured disabled 仍为 14 个。
  - 下一阶段 11K 应继续复用 `procure_detail.param_source.limit=100` 推进下一窗口，保持 disabled，预计 checkpoint 从 `next_param_offset=1003` 推进到约 1103；11K 完成后不需要三轮复盘，下一次三轮复盘放在 11M 完成后。

## Stage 11K

- 阶段目标：不改 YAML，继续复用 `procure_detail.param_source.limit=100`，从 checkpoint 的 `next_param_offset=1003` 推进下一批采购单号。
- 已完成：
  - 只读 DB 起点确认 `procure_detail.enabled=0`、`config_json.enabled=false`、`param_source.limit=100`。
  - 起点 raw 为 1003 条、1003 个 `data_hash`；checkpoint 指向批次 `sync_20260705_113031_687363`，记录 `param_offset=903`、`param_limit=100`、`next_param_offset=1003`。
  - 只读确认完整 `lot_no_page` 中仍有 1153 个去重采购单号，`procure_detail` 起点覆盖 1003/1153。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api procure_detail`，通过，批次 `sync_20260705_114019_864850`，100 次请求，写入 100 条。
  - DB 核验显示单接口批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`。
  - 同批次 `sync_api_log` 为 `status=success`、`request_count=100`、`success_count=100`、`failed_count=0`、`error_message=NULL`。
  - 同批次 raw 为 100 条、0 个 `source_primary_key`、100 个 `data_hash`、空对象 0；全量 `procure_detail` raw 为 1103 条、1103 个 `data_hash`。
  - `procure_detail` checkpoint 指向批次 `sync_20260705_114019_864850`，记录 `last_page=100`、`request_count=100`、`item_count=100`、`total_count=100`、`param_offset=1003`、`param_limit=100`、`next_param_offset=1103`。
  - `failed_request_log` 中本批次 `procure_detail` 失败数为 0。
  - DB 核验显示 `procure_detail.enabled=0`、`config_json.enabled=false`、`param_source.limit=100`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，DB 同步 API 配置 52 条。
  - `.\\.venv\\Scripts\\python.exe -m app.main` dry-run 显示 loaded 36 enabled API config(s)，确认 `procure_detail` 未误进入 enabled。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 185 个、真实配置 API 50 个、enabled 36 个；执行分层为 `configured=50`、`configured_enabled=36`、`configured_disabled=14`、`needs_upstream_params=63`、`needs_sensitive_review=22`、`defer_or_review=50`。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，82 个测试通过。
- 当前结论：
  - `procure_detail` 第十一个 100 窗口验证通过，累计覆盖从 1003/1153 推进到 1103/1153。
  - 当前 configured real API 仍为 50 个，enabled 仍为 36 个，configured disabled 仍为 14 个。
  - 下一阶段 11L 应继续复用 `procure_detail.param_source.limit=100` 推进剩余采购单号，保持 disabled，预计 checkpoint 从 `next_param_offset=1103` 推进到约 1153；11L 完成后仍不需要三轮复盘，下一次三轮复盘放在 11M 完成后。

## Stage 11L

- 阶段目标：不改 YAML，继续复用 `procure_detail.param_source.limit=100`，从 checkpoint 的 `next_param_offset=1103` 补齐剩余采购单号。
- 已完成：
  - 只读 DB 起点确认 `procure_detail.enabled=0`、`config_json.enabled=false`、`param_source.limit=100`。
  - 起点 raw 为 1103 条、1103 个 `data_hash`；checkpoint 指向批次 `sync_20260705_114019_864850`，记录 `param_offset=1003`、`param_limit=100`、`next_param_offset=1103`。
  - 只读确认完整 `lot_no_page` 中仍有 1153 个去重采购单号，`procure_detail` 起点覆盖 1103/1153。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api procure_detail`，通过，批次 `sync_20260705_114922_155625`，50 次请求，写入 50 条。
  - DB 核验显示单接口批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`。
  - 同批次 `sync_api_log` 为 `status=success`、`request_count=50`、`success_count=50`、`failed_count=0`、`error_message=NULL`。
  - 同批次 raw 为 50 条、0 个 `source_primary_key`、50 个 `data_hash`、空对象 0；全量 `procure_detail` raw 为 1153 条、1153 个 `data_hash`。
  - `procure_detail` checkpoint 指向批次 `sync_20260705_114922_155625`，记录 `last_page=50`、`request_count=50`、`item_count=50`、`total_count=50`、`param_offset=1103`、`param_limit=100`、`next_param_offset=1153`。
  - `failed_request_log` 中本批次 `procure_detail` 失败数为 0。
  - DB 核验显示 `procure_detail.enabled=0`、`config_json.enabled=false`、`param_source.limit=100`。
  - DB 核验显示完整 `lot_no_page` 去重采购单号为 1153 个，`procure_detail` 已覆盖 1153 条，当前历史覆盖追平。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，DB 同步 API 配置 52 条。
  - `.\\.venv\\Scripts\\python.exe -m app.main` dry-run 显示 loaded 36 enabled API config(s)，确认 `procure_detail` 未误进入 enabled。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 185 个、真实配置 API 50 个、enabled 36 个；执行分层为 `configured=50`、`configured_enabled=36`、`configured_disabled=14`、`needs_upstream_params=63`、`needs_sensitive_review=22`、`defer_or_review=50`。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，82 个测试通过。
- 当前结论：
  - `procure_detail` 剩余窗口验证通过，累计覆盖从 1103/1153 推进到 1153/1153。
  - 当前 configured real API 仍为 50 个，enabled 仍为 36 个，configured disabled 仍为 14 个。
  - 仍不直接启用 `procure_detail`：该接口无稳定 `source_primary_key`，依赖 `data_hash` 去重；下一阶段 11M 应先从 `next_param_offset=1153` 再跑一次单接口空缺口/no-op 验证，证明不会重复请求历史数据，再决定是否改为 enabled。

## Stage 11M

- 阶段目标：从 `procure_detail` checkpoint 的 `next_param_offset=1153` 做空缺口/no-op 验证，并完成启用前评估和 11K-11M 三轮复盘。
- 已完成：
  - 只读 DB 起点确认 `procure_detail.enabled=0`、`config_json.enabled=false`、`param_source.limit=100`。
  - 起点 raw 为 1153 条、1153 个 `data_hash`、1153 条空 `source_primary_key`；checkpoint 指向批次 `sync_20260705_114922_155625`，记录 `param_offset=1103`、`param_limit=100`、`next_param_offset=1153`。
  - 只读确认完整 `lot_no_page` 中有 1153 个去重 `poCode`，`procure_detail` 起点覆盖 1153/1153。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api procure_detail`，通过，批次 `sync_20260705_115907_773766`，0 次请求，写入 0 条。
  - DB 核验显示单接口批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`。
  - 同批次 `sync_api_log` 为 `status=success`、`request_count=0`、`success_count=0`、`failed_count=0`、`error_message=NULL`。
  - 同批次 raw 为 0 条；全量 `procure_detail` raw 仍为 1153 条、1153 个 `data_hash`、1153 条空 `source_primary_key`。
  - `procure_detail` checkpoint 指向批次 `sync_20260705_115907_773766`，记录 `last_page=0`、`request_count=0`、`item_count=0`、`total_count=0`、`param_offset=1153`、`param_limit=100`、`next_param_offset=1153`。
  - `failed_request_log` 中本批次 `procure_detail` 失败数为 0。
  - 启用前评估发现：`procure_detail` raw 顶层 `poCode`、`procureId`、`id` 覆盖均为 0；返回顶层主要为 `deliveryOrde`、`procureItemVos`、`attachmentVOList`、`planAttachmentVOList`、`warehouseProcureItemVos`，暂不能直接用 `lot_no_page.poCode` 反查目标表是否已存在。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，DB 同步 API 配置 52 条；DB `api_config` 总数为 52、enabled 配置 36、disabled 配置 16。
  - `.\\.venv\\Scripts\\python.exe -m app.main` dry-run 显示 loaded 36 enabled API config(s)，确认 `procure_detail` 未误进入 enabled。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 185 个、真实配置 API 50 个、enabled 36 个；执行分层为 `configured=50`、`configured_enabled=36`、`configured_disabled=14`、`needs_upstream_params=63`、`needs_sensitive_review=22`、`defer_or_review=50`。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，82 个测试通过。
- 11K-11M 复盘：
  - 11K 新增 100 个 `procure_detail` 详情，覆盖从 1003/1153 推进到 1103/1153。
  - 11L 新增 50 个 `procure_detail` 详情，覆盖从 1103/1153 推进到 1153/1153。
  - 11M no-op 验证请求 0、写入 0，证明当前历史窗口已清零且不会重复拉取已覆盖历史。
  - 三轮均失败 0，enabled API 保持 36 个，`procure_detail` 继续保持 disabled。
- 当前结论：
  - `procure_detail` 历史完整性已达成，但日增量 enabled 还缺少稳定业务键或目标缺失扫描依据。
  - 当前 offset 参数源按来源字段排序后推进，已适合历史回填和 no-op 验证；但如果后续新增采购单号排序落在已推进 offset 之前，直接 enabled 可能漏扫。
  - 下一阶段 11N 应先验证是否能从响应结构或参数记录中建立稳定 `source_primary_key`，再决定是否启用并运行完整 `--sync-enabled`。

## Stage 11N

- 阶段目标：解决 `procure_detail` 日增量 enabled 的稳定键和缺失扫描语义，验证后纳入 enabled 主链路。
- 已完成：
  - 只读扫描 `procure_detail.raw_json`，确认 `warehouseProcureItemVos[].procureItemVos[].code` 有 1153 个去重值，每条 raw 恰好 1 个不同 code。
  - DB 集合核验显示该 1153 个 code 与 `lot_no_page.raw_json.poCode` 的 1153 个去重值完全重合，`source_missing_in_target=0`、`target_missing_in_source=0`。
  - 新增 `primary_key.param_field=poCode` 支持：参数型详情接口可以把请求参数写入 `raw_api_data.source_primary_key`，但不修改 `raw_json`。
  - `_insert_raw_items()` 在重复 `data_hash` 时会用非空 `source_primary_key` 回填主键，避免旧的空主键 raw 永久无法进入缺失扫描。
  - `procure_detail` YAML 已配置 `primary_key.param_field: poCode`、`param_source.exclude_existing_target: true`，并将 `enabled` 改为 `true`。
  - 历史 DB 回填完成：`procure_detail` 从 1153 条空主键变为 1153 条非空主键、1153 个不同 `source_primary_key`，`raw_json` 未改写。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，DB 同步 API 配置 52 条。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api procure_detail`，通过，批次 `sync_20260705_121606_608741`，缺失扫描请求 0 次、写入 0 条、失败 0。
  - DB 核验显示批次 `sync_20260705_121606_608741` 的 `sync_batch.status=success`、`sync_api_log.request_count=0`、`raw_api_data` 同批次写入 0 条、`missing_by_pk=0`。
  - `.\\.venv\\Scripts\\python.exe -m app.main` dry-run 显示 loaded 37 enabled API config(s)，并包含 `procure_detail`。
  - DB 核验显示 `api_config.procure_detail.enabled=1`、`config_json.enabled=true`、`primary_key.param_field="poCode"`、`param_source.exclude_existing_target=true`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-enabled`，通过，批次 `sync_20260705_121739_107135`，37 个 API 全成功，3230 次请求，323340 条成功计数。
  - 同批次 `procure_detail` 为 `status=success`、`request_count=0`、`success_count=0`、`failed_count=0`、`error_message=NULL`，证明 enabled 主链路不会重复请求历史。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 185 个、真实配置 API 50 个、enabled 37 个；执行分层为 `configured=50`、`configured_enabled=37`、`configured_disabled=13`、`needs_upstream_params=63`、`needs_sensitive_review=22`、`defer_or_review=50`。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，83 个测试通过。
- 当前结论：
  - `procure_detail` 已从历史回填接口升级为 enabled 日增量接口。
  - 日增量边界不再依赖排序 offset，而是用 `lot_no_page.poCode` 与 `procure_detail.source_primary_key` 做缺失扫描；新增采购单号只要进入 `lot_no_page`，后续 enabled 批次就能被发现。
  - 当前 configured real API 仍为 50 个，enabled 增至 37 个，configured disabled 降至 13 个。

## Stage 11O

- 阶段目标：复核 `traffic_analysis_page` 是否具备进入 enabled 的完整日期窗口和限流边界。
- 已完成：
  - DB 起点确认 `traffic_analysis_page.enabled=0`、`config_json.enabled=false`、`page.max_pages=1`、`page.page_size=100`、`rate_limit.sleep_seconds=0.2`。
  - 起点 checkpoint 为 `window_start=2026-07-02`、`item_count=100`、`total_count=528`、`next_window_start=2026-07-03`，属于早期单页验证遗留的不完整窗口。
  - TDD 先更新 `tests/test_traffic_analysis_page_config.py`，要求完整窗口配置：`page_size=500`、`max_pages=8`、`rate_limit.sleep_seconds=65`、`retry.retries=1`，并保持 `enabled=false`；RED 阶段先失败于旧 `page_size=100`。
  - 将 `traffic_analysis_page` YAML 改为 `page_size=500`、`max_pages=8`、`params.pagesize=500`、`rate_limit.sleep_seconds=65`、`retry.retries=1`，仍保持 disabled。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，DB 同步 API 配置 52 条。
  - 为补齐早期不完整窗口，手动将 `traffic_analysis_page` checkpoint 调回 `next_window_start=2026-07-02`，并记录 `reset_reason=stage_11O_replay_incomplete_window`。
  - 首次完整窗口尝试批次 `sync_20260705_134444_041489` 失败，错误为 `date window page truncated`：`item_count=1000`、`total_count=3537`，说明旧的 2 页估算不足，日期窗口保护正确阻止 checkpoint 推进。
  - 将 `max_pages` 从 2 调整为 8 后，重新运行 `.\\.venv\\Scripts\\python.exe -m app.main --sync-api traffic_analysis_page`。
  - 批次 `sync_20260705_134816_571790` 成功，8 次请求、写入 3537 条、失败 0；同批次 raw 为 3537 条、3537 个 hash，`data_date=2026-07-02`。
  - DB 核验显示 checkpoint 已推进为 `window_start=2026-07-02`、`window_end=2026-07-02`、`item_count=3537`、`total_count=3537`、`next_window_start=2026-07-03`。
  - 继续尝试 `2026-07-03` 窗口时，批次 `sync_20260705_135657_860017` 很快失败，平台返回 509，响应消息为“接口调用次数已超过限制次数”；同批次 raw 写入 0，checkpoint 未推进，仍停在 `next_window_start=2026-07-03`。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 185 个、真实配置 API 50 个、enabled 37 个；执行分层仍为 `configured=50`、`configured_enabled=37`、`configured_disabled=13`。
  - `.\\.venv\\Scripts\\python.exe -m app.main` dry-run 显示 loaded 37 enabled API config(s)，确认 `traffic_analysis_page` 未误进入 enabled。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，83 个测试通过。
- 当前结论：
  - `traffic_analysis_page` 已补齐 `2026-07-02` 单日完整窗口，但平台限流比单批次页间 65 秒更严格，不能直接进入 enabled。
  - 下一阶段应在冷却后继续从 checkpoint 的 `next_window_start=2026-07-03` 单独运行 `--sync-api traffic_analysis_page`，观察是否能逐日推进；在 7 月 3 日、7 月 4 日窗口稳定完整之前，不应启用。
  - 当前 configured real API 仍为 50 个，enabled 仍为 37 个，configured disabled 仍为 13 个。

## Stage 11P

- 阶段目标：在平台限流冷却后继续推进 `traffic_analysis_page` 的 `2026-07-03` 单日窗口，并完成 11N-11P 三轮复盘。
- 已完成：
  - DB 起点确认 `traffic_analysis_page.enabled=0`、`config_json.enabled=false`、`page.max_pages=8`、`page.page_size=500`、`rate_limit.sleep_seconds=65`。
  - 起点 checkpoint 指向批次 `sync_20260705_134816_571790`，记录 `window_start=2026-07-02`、`item_count=3537`、`total_count=3537`、`next_window_start=2026-07-03`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api traffic_analysis_page`，通过，批次 `sync_20260705_140151_126629`，8 次请求、写入 3548 条、失败 0。
  - DB 核验显示批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`。
  - 同批次 `sync_api_log.status=success`、`request_count=8`、`success_count=3548`、`failed_count=0`、`error_message=NULL`。
  - 同批次 raw 为 3548 条、3548 个 `data_hash`，`data_date=2026-07-03`；`failed_request_log` 中本批次失败数为 0。
  - `traffic_analysis_page` checkpoint 已推进为 `window_start=2026-07-03`、`window_end=2026-07-03`、`item_count=3548`、`total_count=3548`、`next_window_start=2026-07-04`。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 185 个、真实配置 API 50 个、enabled 37 个；执行分层仍为 `configured=50`、`configured_enabled=37`、`configured_disabled=13`。
  - `.\\.venv\\Scripts\\python.exe -m app.main` dry-run 显示 loaded 37 enabled API config(s)，确认 `traffic_analysis_page` 未误进入 enabled。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，83 个测试通过。
- 11N-11P 复盘：
  - 11N 将 `procure_detail` 从历史回填接口升级为 enabled 日增量接口，enabled API 从 36 增至 37。
  - 11O 修正 `traffic_analysis_page` 的完整窗口配置，并补齐 `2026-07-02` 的 3537/3537 条；同日连续推进下一窗口触发平台 509，因此没有 enabled。
  - 11P 在冷却后补齐 `traffic_analysis_page` 的 `2026-07-03` 窗口 3548/3548 条，证明该接口可以按冷却节奏逐日推进。
  - 三轮结论：完整拉取能力继续前进，但 `traffic_analysis_page` 仍需要低频单接口调度观察；在 `2026-07-04` 窗口也稳定完整前，不应进入 enabled 长批次。
- 当前结论：
  - `traffic_analysis_page` 已连续补齐 `2026-07-02` 和 `2026-07-03` 两个单日窗口，checkpoint 停在 `next_window_start=2026-07-04`。
  - 由于 11O 已证明连续同批次下一天会触发 509，本轮不立即继续请求 `2026-07-04`；下一阶段应在冷却后再跑。
  - 当前 configured real API 仍为 50 个，enabled 仍为 37 个，configured disabled 仍为 13 个。

## Stage 11Q

- 阶段目标：在平台限流冷却后继续推进 `traffic_analysis_page` 的 `2026-07-04` 单日窗口，并复核文档状态是否与当前 enabled 清单一致。
- 已完成：
  - DB 起点确认 `traffic_analysis_page.enabled=0`、`config_json.enabled=false`、`page.page_size=500`、`page.max_pages=8`、`rate_limit.sleep_seconds=65`、`retry.retries=1`。
  - 起点 checkpoint 指向批次 `sync_20260705_140151_126629`，记录 `window_start=2026-07-03`、`item_count=3548`、`total_count=3548`、`next_window_start=2026-07-04`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api traffic_analysis_page`，通过，批次 `sync_20260705_141745_382624`，1 次请求、写入 114 条、失败 0。
  - DB 核验显示批次 `sync_batch.status=success`、`total_api_count=1`、`success_api_count=1`、`failed_api_count=0`。
  - 同批次 `sync_api_log.status=success`、`request_count=1`、`success_count=114`、`failed_count=0`、`error_message=NULL`。
  - 同批次 raw 为 114 条、114 个 `data_hash`，`data_date=2026-07-04`；`failed_request_log` 中本批次失败数为 0。
  - `traffic_analysis_page` checkpoint 已推进为 `window_start=2026-07-04`、`window_end=2026-07-04`、`item_count=114`、`total_count=114`、`next_window_start=2026-07-05`。
  - `traffic_analysis_page` 累计 raw 为 7216 条、7216 个 `data_hash`，覆盖 `2026-07-02` 到 `2026-07-04`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，DB 同步 API 配置 52 条。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 185 个、真实配置 API 50 个、enabled 37 个；执行分层仍为 `configured=50`、`configured_enabled=37`、`configured_disabled=13`。
  - `.\\.venv\\Scripts\\python.exe -m app.main` dry-run 显示 loaded 37 enabled API config(s)，确认 `traffic_analysis_page` 未误进入 enabled，`procure_detail` 仍在 enabled 清单中。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，83 个测试通过。
  - README 中过期的 enabled 数量和清单已修正：`procure_detail` 已加入 enabled 说明，`traffic_analysis_page` 仍列为 disabled 风险观察接口。
- 当前结论：
  - `traffic_analysis_page` 已连续补齐 `2026-07-02`、`2026-07-03` 和 `2026-07-04` 三个单日窗口，但 11O 的 509 仍证明它不适合连续快速推进。
  - 由于当前 `date_window` 逻辑在 `next_window_start == today` 时会拉取当天窗口，直接加入每天的 enabled 主链路可能带来“当天未完结数据被提前 checkpoint”的风险；下一阶段应先明确完整历史日/昨日同步边界或独立低频调度策略。
  - 当前 configured real API 仍为 50 个，enabled 仍为 37 个，configured disabled 仍为 13 个。

## Stage 11R

- 阶段目标：为严格报表接口补充“只同步已结束完整日”的日期窗口边界，并评估 `traffic_analysis_page` 是否可进入 enabled 主链路。
- 已完成：
  - TDD 红灯：新增 `test_date_window_lag_days_treats_today_as_not_ready`，先失败于 `lag_days=1` 时仍生成 `2026-07-05` 当天窗口。
  - TDD 红灯：更新 `test_traffic_analysis_page_uses_full_date_window_with_lag_and_is_enabled`，先失败于 `traffic_analysis_page.enabled=false`。
  - `app.sync_engine.SyncEngine` 新增 `date_window.lag_days` 支持：默认 `0` 不改变现有接口；配置为 `1` 时，本次允许同步日期截止到 `today - 1`。
  - `traffic_analysis_page` 已改为 `enabled=true`，并配置 `date_window.lag_days=1`，保留 `page_size=500`、`max_pages=8`、`rate_limit.sleep_seconds=65`、`retry.retries=1`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，DB 同步 API 配置 52 条。
  - `.\\.venv\\Scripts\\python.exe -m app.main` dry-run 显示 loaded 38 enabled API config(s)，确认 `traffic_analysis_page` 已进入 enabled。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api traffic_analysis_page`，通过，批次 `sync_20260705_142751_374712`，0 次请求、写入 0 条、失败 0；DB 显示 `api_config.enabled=1`、`config_json.enabled=true`、`date_window.lag_days=1`。
  - 同批次 checkpoint 保持 `next_window_start=2026-07-05`，记录 `skipped_reason=date_window_caught_up`，证明当天窗口未被提前拉取。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-enabled`，通过，批次 `sync_20260705_142844_991672`，38 个 API 全成功，3230 次请求，323340 条成功计数，失败 0，耗时 4283 秒。
  - 同批次 `traffic_analysis_page` 为 `status=success`、`request_count=0`、`success_count=0`、`failed_count=0`、`error_message=NULL`，未写入 raw。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 185 个、真实配置 API 50 个、enabled 38 个；执行分层为 `configured=50`、`configured_enabled=38`、`configured_disabled=12`。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，84 个测试通过。
- 当前结论：
  - `traffic_analysis_page` 已具备生产 daily 边界：历史窗口按完整日逐日推进，当天窗口由 `lag_days=1` 自动跳过。
  - enabled API 从 37 增至 38，configured disabled 从 13 降至 12。
  - 完整 enabled 批次耗时 4283 秒，仍需按长任务 cron 窗口管理；`product_inventory_page` 和 `storage_inbound_page` 是主要长耗时段。

## Stage 11S

- 阶段目标：盘点剩余 configured disabled API，选择低风险接口继续推进，并完成 11Q-11S 三轮复盘。
- 已完成：
  - 只读盘点剩余 12 个 disabled API：`amazon_msku_page` 是产品域普通分页直读接口，无上游参数，已知总量 18430 条、约 185 页；其余候选要么是更大库存表，要么依赖参数源、费用字段或日期窗口大报表。
  - TDD 红灯：更新 `tests/test_amazon_msku_page_config.py`，要求 `amazon_msku_page.enabled=true`、`page.max_pages=200`，先失败于旧配置 `enabled=false`。
  - 将 `amazon_msku_page` 改为 `enabled=true`，并把 `page.max_pages` 从 3 调整为 200；保留 `page_size=100`、空主键和 `data_hash` 幂等策略，不编造不存在的单字段主键。
  - 更新 enabled 基线测试，enabled API 期望从 38 个增至 39 个，并包含 `amazon_msku_page`。
  - `.\\.venv\\Scripts\\python.exe -m unittest tests.test_amazon_msku_page_config tests.test_5v_low_risk_enabled_configs`，通过，2 个测试。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，DB 同步 API 配置 52 条。
  - `.\\.venv\\Scripts\\python.exe -m app.main` dry-run 显示 loaded 39 enabled API config(s)，确认 `amazon_msku_page` 已进入 enabled。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api amazon_msku_page`，通过，批次 `sync_20260705_160248_556873`，185 次请求、18430 条成功计数、失败 0。
  - DB 核验显示 `amazon_msku_page` 累计 raw 为 18430 条、18430 个 `data_hash`、0 个 `source_primary_key`，`data_date` 覆盖 `2022-08-31` 到 `2026-07-02`。
  - DB 核验显示 `amazon_msku_page` checkpoint 为 `last_page=185`、`request_count=185`、`item_count=18430`、`total_count=18430`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-enabled`，通过，批次 `sync_20260705_160652_068698`，39 个 API 全成功，3414 次请求，341770 条成功计数，失败 0，耗时 4779 秒。
  - 同批次 `amazon_msku_page` 为 `status=success`、`request_count=185`、`success_count=18430`、`failed_count=0`、`error_message=NULL`。
  - 同批次 `failed_request_log` 失败请求数为 0。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 185 个、真实配置 API 50 个、enabled 39 个；执行分层为 `configured=50`、`configured_enabled=39`、`configured_disabled=11`。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，84 个测试通过。
- 11Q-11S 复盘：
  - 11Q 补齐 `traffic_analysis_page` 的 `2026-07-04` 完整日窗口，证明该接口可以按冷却节奏逐日推进，但发现当天窗口边界风险。
  - 11R 新增 `date_window.lag_days=1` 并把 `traffic_analysis_page` 纳入 enabled，解决“当天未完结数据提前 checkpoint”的核心风险。
  - 11S 把 `amazon_msku_page` 从 300 条样本推进到 18430 条全量，并纳入 enabled；它没有稳定单字段主键，继续使用 `data_hash` 幂等是当前最保守的事实边界。
  - 三轮累计把 enabled API 从 37 个推进到 39 个，configured disabled 从 13 个降至 11 个；主要新增风险不是接口正确性，而是完整 enabled 批次耗时从 4283 秒增至 4779 秒。
- 当前结论：
  - `amazon_msku_page` 已完成当前账号可访问数据的全量拉取，并已进入 daily enabled 主链路。
  - 由于该接口无稳定单字段主键，重复运行依靠 `data_hash` 去重；如果上游同一 SKU/MSKU 关系发生字段变化，可能形成新的 raw 版本，这是原始备份层可接受的事实记录。
  - 剩余 configured disabled API 为 11 个，下一阶段应继续优先选择主键明确、分页可控的候选；超大库存事件、库龄和参数型详情接口不应直接 enabled。

## Stage 11T

- 阶段目标：从剩余 configured disabled API 中选择下一个低风险接口，推进完整拉取并纳入 enabled 主链路；本轮结束后做一次全面复盘。
- 已完成：
  - 只读盘点剩余 11 个 disabled API 后选择 `fba_inventory_v2_page`；理由是该接口是 FBA 库存列表 V2，主键字段 `id` 明确，当前总量 30759 条、约 308 页，风险低于库存流水、库龄、费用和依赖参数详情类接口。
  - TDD 红灯：更新 `tests/test_fba_inventory_v2_page_config.py`，要求 `fba_inventory_v2_page.enabled=true`、`page.max_pages=320`，先失败于旧配置 `enabled=false`。
  - 将 `fba_inventory_v2_page` 改为 `enabled=true`，并把 `page.max_pages` 从 3 调整为 320；更新 enabled 基线测试，enabled API 期望从 39 个增至 40 个。
  - `.\\.venv\\Scripts\\python.exe -m unittest tests.test_fba_inventory_v2_page_config tests.test_5v_low_risk_enabled_configs`，通过，2 个测试。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，DB 同步 API 配置 52 条。
  - `.\\.venv\\Scripts\\python.exe -m app.main` dry-run 显示 loaded 40 enabled API config(s)，确认 `fba_inventory_v2_page` 已进入 enabled。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api fba_inventory_v2_page`，通过，批次 `sync_20260705_173836_749182`，308 次请求、30759 条成功计数、失败 0。
  - DB 核验显示 `fba_inventory_v2_page` 累计 raw 为 30759 条、30759 个 `source_primary_key`、30759 个 `data_hash`，`data_date` 覆盖 `2026-03-02` 到 `2026-07-05`。
  - DB 核验显示 `fba_inventory_v2_page` checkpoint 为 `last_page=308`、`request_count=308`、`item_count=30759`、`total_count=30759`。
  - 第一次完整 enabled 批次 `sync_20260705_174452_257185` 失败为 `partial_failed`：40 个 API 中 32 成功、8 失败；失败从 `product_inventory_page` 第 228 次请求开始连续 401。
  - 根因确认：token 缓存过期时间为 `2026-07-05 17:57:50`，失败从 `2026-07-05 17:57:52` 开始；主入口此前只在批次开始取一次 token，长批次跨过 token 生命周期后会失败。
  - 已为 `JijiaApiClient` 增加 HTTP 401 后强制刷新 token 并重试一次的最小逻辑；主入口复用同一个 `JijiaAuthClient`，不在日志和数据库中输出 accessToken。
  - `.\\.venv\\Scripts\\python.exe -m unittest tests.test_api_client_timeout`，通过，覆盖 401 后刷新 token 的路径。
  - 重跑完整 enabled 批次 `sync_20260705_180439_061974`，40 个 API 全成功，3722 次请求，372529 条成功计数，失败 0，耗时 4601 秒。
  - 同批次 `fba_inventory_v2_page` 为 `status=success`、`request_count=308`、`success_count=30759`、`failed_count=0`、`error_message=NULL`。
  - 同批次 `product_inventory_page` 在跨过 token 过期点后仍成功完成，`request_count=1187`、`success_count=118653`、`failed_count=0`，证明 token 刷新逻辑生效。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过；DB 核验 `api_config.fba_inventory_v2_page.enabled=1`、`config_json.enabled=true`、`page.max_pages=320`，enabled 总数为 40。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 185 个、真实配置 API 50 个、enabled 40 个；执行分层为 `configured=50`、`configured_enabled=40`、`configured_disabled=10`。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，85 个测试通过。
- 本轮全面复盘：
  - 覆盖进展：enabled API 从 39 个增至 40 个，configured disabled 从 11 个降至 10 个；`fba_inventory_v2_page` 已完成当前账号可访问数据全量拉取并进入 daily enabled。
  - 质量结论：新接口本身没有异常，主键、分页、checkpoint、raw 去重和 enabled 批次均有数据库证据；本轮暴露的真实风险是长批次 token 生命周期，而不是接口字段配置。
  - 架构结论：随着 enabled 数量增加，`--sync-enabled` 已经是超过 1 小时的长任务，认证不能再假设单 token 覆盖整批；401 后刷新一次是当前最小可靠修复。
  - 调度结论：40 个 API 的完整 enabled 批次耗时 4601 秒，仍需按长任务 cron 窗口管理；后续接入更大接口前，必须先估算请求量、限流和批次耗时。
  - 风险边界：`inventory_event_page`、`inventory_age_page` 仍属于超大接口，不应直接 enabled；费用类、参数型详情类仍需先证明缺失扫描或字段过滤边界。
- 当前结论：
  - `fba_inventory_v2_page` 已完成当前账号可访问数据的全量拉取，并已进入 daily enabled 主链路。
  - 长批次 401 已通过强制刷新 token 的最小逻辑修复，并用完整 enabled 批次验证。
  - 下一阶段 11U 应继续从剩余 10 个 configured disabled API 中选择低风险目标推进；下一次三轮复盘放在 11V 完成后。

## Stage 11U

- 阶段目标：从剩余 configured disabled API 中选择下一个低风险接口，推进完整拉取并纳入 enabled 主链路。
- 已完成：
  - 只读盘点剩余 10 个 disabled API 后选择 `fba_inventory_page`；理由是该接口是旧版 FBA 库存列表，主键字段 `id` 明确，当前总量 30759 条、约 308 页，风险低于库存事件、库龄、费用和参数型详情接口。
  - TDD 红灯：更新 `tests/test_fba_inventory_page_config.py`，要求 `fba_inventory_page.enabled=true`、`page.max_pages=320`，先失败于旧配置 `enabled=false`。
  - 将 `fba_inventory_page` 改为 `enabled=true`，并把 `page.max_pages` 从 3 调整为 320；更新 enabled 基线测试，enabled API 期望从 40 个增至 41 个。
  - `.\\.venv\\Scripts\\python.exe -m unittest tests.test_fba_inventory_page_config tests.test_5v_low_risk_enabled_configs`，通过，2 个测试。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，DB 同步 API 配置 52 条。
  - `.\\.venv\\Scripts\\python.exe -m app.main` dry-run 显示 loaded 41 enabled API config(s)，确认 `fba_inventory_page` 已进入 enabled。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api fba_inventory_page`，通过，批次 `sync_20260705_194120_529908`，308 次请求、30759 条成功计数、失败 0。
  - DB 核验显示 `fba_inventory_page` 累计 raw 为 30759 条、30759 个 `source_primary_key`、30759 个 `data_hash`，`data_date=2026-07-05`。
  - DB 核验显示 `fba_inventory_page` checkpoint 为 `last_page=308`、`request_count=308`、`item_count=30759`、`total_count=30759`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-enabled`，通过，批次 `sync_20260705_194739_055958`，41 个 API 全成功，4030 次请求，403288 条成功计数，失败 0，耗时 5171 秒。
  - 同批次 `fba_inventory_page` 为 `status=success`、`request_count=308`、`success_count=30759`、`failed_count=0`、`error_message=NULL`。
  - 同批次 `failed_request_log` 失败请求数为 0。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 185 个、真实配置 API 50 个、enabled 41 个；执行分层为 `configured=50`、`configured_enabled=41`、`configured_disabled=9`。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests`，通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"`，通过，85 个测试通过。
- 当前结论：
  - `fba_inventory_page` 已完成当前账号可访问数据的全量拉取，并已进入 daily enabled 主链路。
  - 旧版 FBA 库存与 V2 当前总量相同，二者都进入 enabled 后可以保留新旧接口对照；后续如确认 V2 完全覆盖旧版字段，再考虑是否降低旧版调度频率。
  - enabled API 从 40 个增至 41 个，configured disabled 从 10 个降至 9 个；完整 enabled 批次耗时增至 5171 秒。

## Stage 11V

- 阶段目标：从剩余 configured disabled API 中选择下一个低风险接口，推进完整拉取并纳入 enabled 主链路，并复盘 11T-11V 三轮。
- 已完成：
  - 只读盘点剩余 9 个 disabled API 后选择 `storage_ledger_month_page`；理由是该接口已有稳定主键 `id`，当前 `2026-06` 月窗口总量 6044 条、约 61 页，风险低于 5.8 万级直读报表、参数型详情、费用类和百万级库存事件/库龄接口。
  - TDD 红灯：更新 `tests/test_storage_ledger_month_page_config.py`，要求 `storage_ledger_month_page.enabled=true`、`page.max_pages=70`，并把 enabled 基线测试从 41 个增至 42 个；测试先失败于旧配置 `enabled=false`。
  - 将 `storage_ledger_month_page` 改为 `enabled=true`，并把 `page.max_pages` 从 1 调整为 70；保持 `page_size=100`、`primary_key.field=id`、`primary_key.required=true` 和 `monthList=["2026-06"]` 不变。
  - `.\\.venv\\Scripts\\python.exe -m unittest tests.test_storage_ledger_month_page_config tests.test_5v_low_risk_enabled_configs`，通过，2 个测试。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，DB 同步 API 配置 52 条。
  - `.\\.venv\\Scripts\\python.exe -m app.main` dry-run 显示 loaded 42 enabled API config(s)，确认 `storage_ledger_month_page` 已进入 enabled。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api storage_ledger_month_page`，通过，批次 `sync_20260705_213137_534593`，61 次请求、6044 条成功计数、失败 0。
  - DB 核验显示 `storage_ledger_month_page` 单接口批次 raw 为 6044 条、6044 个 `source_primary_key`、6044 个不同主键、6044 个 `data_hash`。
  - DB 核验显示 `storage_ledger_month_page` checkpoint 为 `last_page=61`、`request_count=61`、`item_count=6044`、`total_count=6044`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-enabled`，通过，批次 `sync_20260705_213320_408202`，42 个 API 全成功，4093 次请求，409332 条成功计数，失败 0，耗时 5045 秒。
  - 同批次 `storage_ledger_month_page` 为 `status=success`、`request_count=61`、`success_count=6044`、`failed_count=0`、`error_message=NULL`。
  - 同批次 `failed_request_log` 失败请求数为 0。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 185 个、真实配置 API 50 个、enabled 42 个；执行分层为 `configured=50`、`configured_enabled=42`、`configured_disabled=8`。
- 11T-11V 复盘：
  - 11T 将 `fba_inventory_v2_page` 从样本推进到 30759 条全量并进入 enabled，同时发现并修复长批次 token 过期导致 401 的问题。
  - 11U 将旧版 `fba_inventory_page` 从样本推进到 30759 条全量并进入 enabled，形成 FBA 库存新旧接口对照。
  - 11V 将 `storage_ledger_month_page` 从 100 条样本推进到 6044 条完整月窗口并进入 enabled。
  - 三轮累计把 enabled API 从 39 个推进到 42 个，configured disabled 从 11 个降至 8 个；完整 enabled 批次请求量从 3722 增至 4093，当前实测耗时 5045 秒。
  - 质量结论：三轮新增接口均有单接口全量、DB raw/checkpoint、完整 enabled 批次和失败日志为 0 的证据；长批次 token 刷新已在后续完整批次中持续有效。
- 当前结论：
  - `storage_ledger_month_page` 已完成当前配置 `2026-06` 月窗口的完整拉取，并已进入 daily enabled 主链路。
  - 剩余 configured disabled API 为 8 个，下一阶段应继续避免直接启用百万级或参数边界未证明的接口。

## Stage 11W

- 阶段目标：从剩余 configured disabled API 中选择下一个低风险接口，推进完整拉取并纳入 enabled 主链路。
- 已完成：
  - 只读盘点剩余 8 个 disabled API 后选择 `inventory_adjustments_page`；理由是该接口是普通分页直读，有稳定主键 `id`，当前总量 58239 条、约 583 页，风险低于参数型详情、费用类和百万级库存事件/库龄接口。
  - TDD 红灯：更新 `tests/test_inventory_adjustments_page_config.py`，要求 `inventory_adjustments_page.enabled=true`、`page.max_pages=600`，并把 enabled 基线测试从 42 个增至 43 个；测试先失败于旧配置 `enabled=false`。
  - 将 `inventory_adjustments_page` 改为 `enabled=true`，并把 `page.max_pages` 从 3 调整为 600；保持 `page_size=100`、`primary_key.field=id` 和 `date_field=marketTimeZone` 不变。
  - `.\\.venv\\Scripts\\python.exe -m unittest tests.test_inventory_adjustments_page_config tests.test_5v_low_risk_enabled_configs`，通过，2 个测试。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，DB 同步 API 配置 52 条。
  - `.\\.venv\\Scripts\\python.exe -m app.main` dry-run 显示 loaded 43 enabled API config(s)，确认 `inventory_adjustments_page` 已进入 enabled。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api inventory_adjustments_page`，通过，批次 `sync_20260705_231507_824474`，583 次请求、58239 条成功计数、失败 0。
  - DB 核验显示 `inventory_adjustments_page` 累计 raw 为 58239 条、58239 个 `source_primary_key`、58239 个不同主键、58239 个 `data_hash`，`data_date` 覆盖 `2021-02-01` 到 `2023-02-16`。
  - DB 核验显示 `inventory_adjustments_page` checkpoint 为 `last_page=583`、`request_count=583`、`item_count=58239`、`total_count=58239`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-enabled`，通过，批次 `sync_20260705_232349_206209`，43 个 API 全成功，4681 次请求，467571 条成功计数，失败 0，耗时 5997 秒。
  - 同批次 `inventory_adjustments_page` 为 `status=success`、`request_count=583`、`success_count=58239`、`failed_count=0`、`error_message=NULL`。
  - 同批次 `failed_request_log` 失败请求数为 0。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 185 个、真实配置 API 50 个、enabled 43 个；执行分层为 `configured=50`、`configured_enabled=43`、`configured_disabled=7`。
- 当前结论：
  - `inventory_adjustments_page` 已完成当前账号可访问数据的全量拉取，并已进入 daily enabled 主链路。
  - 剩余 configured disabled API 为 7 个，下一阶段应优先在 `purchase_sale_storage_fba_page` 或 `storage_ledger_detail_page` 等可控窗口中选择，继续避开百万级接口和参数边界未证明的接口。

## Stage 11X

- 阶段目标：从剩余 configured disabled API 中选择下一个低风险接口，推进完整拉取并纳入 enabled 主链路。
- 已完成：
  - 只读盘点剩余 7 个 disabled API 后选择 `purchase_sale_storage_fba_page`；理由是该接口是直读分页报表，有稳定主键 `id`，当前总量 58955 条、约 590 页，风险低于参数型详情、费用类、无主键日期明细和百万级库存事件/库龄接口。
  - TDD 红灯：更新 `tests/test_purchase_sale_storage_fba_page_config.py`，要求 `purchase_sale_storage_fba_page.enabled=true`、`page.max_pages=600`，并把 enabled 基线测试从 43 个增至 44 个；测试先失败于旧配置 `enabled=false`。
  - 将 `purchase_sale_storage_fba_page` 改为 `enabled=true`，并把 `page.max_pages` 从 1 调整为 600；保持 `page_size=100`、`primary_key.field=id`、`date_field=updateTime`、`type=MSKU` 和 `valueType=QUANTITY` 不变。
  - `.\\.venv\\Scripts\\python.exe -m unittest tests.test_purchase_sale_storage_fba_page_config tests.test_5v_low_risk_enabled_configs`，通过，2 个测试。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，DB 同步 API 配置 52 条。
  - `.\\.venv\\Scripts\\python.exe -m app.main` dry-run 显示 loaded 44 enabled API config(s)，确认 `purchase_sale_storage_fba_page` 已进入 enabled。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api purchase_sale_storage_fba_page`，通过，批次 `sync_20260706_012628_594045`，590 次请求、58955 条成功计数、失败 0。
  - DB 核验显示 `purchase_sale_storage_fba_page` 累计 raw 为 58955 条、58955 个 `source_primary_key`、58955 个不同主键、58955 个 `data_hash`，`data_date` 覆盖 `2022-09-15` 到 `2023-04-06`。
  - DB 核验显示 `purchase_sale_storage_fba_page` checkpoint 为 `last_page=590`、`request_count=590`、`item_count=58955`、`total_count=58955`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-enabled`，通过，批次 `sync_20260706_013950_766695`，44 个 API 全成功，5264 次请求，526526 条成功计数，失败 0，耗时 6523 秒。
  - 同批次 `purchase_sale_storage_fba_page` 为 `status=success`、`request_count=590`、`success_count=58955`、`failed_count=0`、`error_message=NULL`。
  - 同批次 `failed_request_log` 失败请求数为 0。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 185 个、真实配置 API 50 个、enabled 44 个；执行分层为 `configured=50`、`configured_enabled=44`、`configured_disabled=6`。
- 当前结论：
  - `purchase_sale_storage_fba_page` 已完成当前账号可访问数据的全量拉取，并已进入 daily enabled 主链路。
  - 剩余 configured disabled API 为 6 个，下一阶段应优先评估 `storage_ledger_detail_page` 的完整日期窗口或参数型详情接口的缺失扫描边界，继续避开百万级接口。
  - 下一阶段 11Y 完成后需要复盘 11W-11Y 三轮。

## Stage 11Y

- 阶段目标：补齐 `storage_ledger_detail_page` 的完整日期窗口，验证追平边界后纳入 enabled 主链路，并复盘 11W-11Y 三轮。
- 已完成：
  - 只读盘点剩余 6 个真实 disabled API 后选择 `storage_ledger_detail_page`；理由是该接口已有 `date_window`，可按单日窗口推进，风险低于百万级 `inventory_event_page`、`inventory_age_page`，也低于参数边界未证明的详情/费用接口。
  - 已确认历史单页样本曾把 checkpoint 推进到 `2026-07-03`，但当时仅写入 100/27104 条；当前代码已有日期窗口截断保护，因此本轮先将 checkpoint 修回 `2026-07-02` 再补完整窗口。
  - TDD 红灯：更新 `tests/test_storage_ledger_detail_page_config.py`，要求 `page.max_pages=320`、`date_window.lag_days=1` 且先保持 disabled；测试先失败于旧配置 `max_pages=1`。
  - 将 `storage_ledger_detail_page.page.max_pages` 从 1 调整为 320，新增 `date_window.lag_days=1`，仍保持 `enabled=false`，并同步 DB 配置 52 条。
  - 单接口追平已完成：`sync_20260706_034129_905604` 补齐 `2026-07-02`，272 次请求、27104 条；`sync_20260706_034805_243943` 补齐 `2026-07-03`，243 次请求、24261 条；`sync_20260706_035340_964565` 补齐 `2026-07-04`，125 次请求、12437 条；`sync_20260706_035641_195931` 补齐 `2026-07-05`，14 次请求、1350 条。
  - 追平 no-op 批次 `sync_20260706_035711_433622` 成功，请求 0 次、写入 0 条，checkpoint 为 `next_window_start=2026-07-06`、`skipped_reason=date_window_caught_up`。
  - DB 核验显示 `storage_ledger_detail_page` 无稳定主键，全部使用 `data_hash`：`2026-07-02` 累计 27204 条，其中包含早期 100 条样本与本轮 27104 条完整窗口；`2026-07-03` 为 24261 条，`2026-07-04` 为 12437 条，`2026-07-05` 为 1350 条。
  - TDD 红灯：更新 `tests/test_storage_ledger_detail_page_config.py` 和 `tests/test_5v_low_risk_enabled_configs.py`，要求 `storage_ledger_detail_page.enabled=true` 且 enabled 总数从 44 增至 45；测试先失败于旧配置 `enabled=false`。
  - 将 `storage_ledger_detail_page.enabled` 改为 `true`；目标测试 `.\\.venv\\Scripts\\python.exe -m unittest tests.test_storage_ledger_detail_page_config tests.test_5v_low_risk_enabled_configs` 通过，2 个测试。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，DB 同步 API 配置 52 条；DB 核验 `storage_ledger_detail_page.enabled=1`、`config_json.enabled=true`、`max_pages=320`、`lag_days=1`。
  - `.\\.venv\\Scripts\\python.exe -m app.main` dry-run 显示 loaded 45 enabled API config(s)，确认 `storage_ledger_detail_page` 已进入 enabled。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-enabled`，通过，批次 `sync_20260706_040245_562729`，45 个 API 全成功，5264 次请求，526526 条成功计数，失败 0，耗时 6924 秒。
  - 同批次 `storage_ledger_detail_page` 为 `status=success`、`request_count=0`、`success_count=0`、`failed_count=0`、`error_message=NULL`；同批次 `failed_request_log` 为 0。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 185 个、真实配置 API 50 个、enabled 45 个；执行分层为 `configured=50`、`configured_enabled=45`、`configured_disabled=5`。
- 11W-11Y 复盘：
  - 11W 将 `inventory_adjustments_page` 推进到 58239 条全量并进入 enabled。
  - 11X 将 `purchase_sale_storage_fba_page` 推进到 58955 条全量并进入 enabled。
  - 11Y 将 `storage_ledger_detail_page` 从历史单页样本补齐到 2026-07-02 至 2026-07-05 的完整日窗口，并用 `lag_days=1` 进入 enabled。
  - 三轮累计把 enabled API 从 42 个推进到 45 个，configured disabled 从 8 个降至 5 个；完整 enabled 批次耗时从 5045 秒增至 6924 秒。
  - 质量结论：三轮新增接口均有单接口或窗口补齐、DB raw/checkpoint、完整 enabled 批次和失败日志为 0 的证据；11Y 的关键边界是无稳定主键，只能以 `data_hash` 保存原始明细。
- 当前结论：
  - `storage_ledger_detail_page` 已完成当前可同步日期窗口的完整拉取，并已进入 daily enabled 主链路。
  - 剩余 configured disabled API 为 5 个，下一阶段应优先处理参数边界可证明的接口，继续避开百万级接口的直接 enabled。

## Stage 11Z

- 阶段目标：从剩余 5 个 configured disabled API 中选择参数边界最清楚的接口继续推进完整拉取，不直接启用高风险接口。
- 已完成：
  - 只读盘点剩余 disabled API 后选择 `storage_inbound_detail`；理由是该接口依赖 `storage_inbound_page.raw_json.code`，响应有稳定主键 `code`，风险低于无稳定主键的 `market_inventory_query`、空费用对象边界复杂的 `delivery_fee_query` 和两个百万级普通分页接口。
  - DB 起点确认 `storage_inbound_detail` 已覆盖 6 个详情，上游 `storage_inbound_page` 去重 code 为 174334 个；缺口仍很大，不适合直接 enabled。
  - TDD 红灯：更新 `tests/test_storage_inbound_detail_param_source.py`，要求 `storage_inbound_detail.param_source.limit=500` 且 `exclude_existing_target=true`，测试先失败于旧配置 `limit=3`。
  - 将 `storage_inbound_detail.param_source.limit` 从 3 调整为 500，新增 `exclude_existing_target=true`，保持 `enabled=false` 和 `auto_advance=true`。
  - `.\\.venv\\Scripts\\python.exe -m unittest tests.test_storage_inbound_detail_param_source`，通过，2 个测试。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，DB 同步 API 配置 52 条。
  - `.\\.venv\\Scripts\\python.exe -m app.main` dry-run 显示 loaded 45 enabled API config(s)，确认 `storage_inbound_detail` 未进入 enabled。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api storage_inbound_detail`，通过，批次 `sync_20260706_060706_960476`，500 次请求、500 条成功计数、失败 0，耗时 458 秒。
  - DB 核验显示本批次 raw 为 500 条、500 个 `source_primary_key`、500 个不同主键、500 个 `data_hash`，`data_date` 覆盖 `2022-09-30` 到 `2023-04-04`。
  - DB 核验显示 `storage_inbound_detail` 累计覆盖从 6 个主键增至 506 个主键；上游去重 code 为 174334 个。
  - DB 配置确认 `storage_inbound_detail.enabled=0`、`param_source.limit=500`、`exclude_existing_target=true`、`auto_advance=true`；同批次 `failed_request_log` 为 0。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 185 个、真实配置 API 50 个、enabled 45 个；执行分层仍为 `configured=50`、`configured_enabled=45`、`configured_disabled=5`。
- 当前结论：
  - `storage_inbound_detail` 已从样本验证转为目标缺失扫描回填模式，本轮把历史详情覆盖推进到 506/174334。
  - 该接口仍不应进入 enabled；后续应继续按 500 或更高但可控窗口分批回填，直到缺失扫描 no-op 后再评估 daily enabled。

## Stage 12A

- 阶段目标：继续推进 `storage_inbound_detail` 缺失扫描回填，并在已验证 500 窗口后评估提高窗口。
- 已完成：
  - DB 起点确认 `storage_inbound_detail` 配置为 `enabled=0`、`param_source.limit=500`、`exclude_existing_target=true`，累计覆盖 506/174334。
  - TDD 红灯：更新 `tests/test_storage_inbound_detail_param_source.py`，要求 `storage_inbound_detail.param_source.limit=1000`，测试先失败于旧配置 `limit=500`。
  - 将 `storage_inbound_detail.param_source.limit` 从 500 调整为 1000，继续保持 `enabled=false`、`auto_advance=true` 和 `exclude_existing_target=true`。
  - 修正过程中确认未误改相邻 `product_detail` 的 `param_source.limit=500`；目标测试和 `tests.test_product_detail_param_source` 一起通过。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，DB 同步 API 配置 52 条。
  - `.\\.venv\\Scripts\\python.exe -m app.main` dry-run 显示 loaded 45 enabled API config(s)，确认 `storage_inbound_detail` 仍未进入 enabled。
  - DB 配置确认 `storage_inbound_detail.enabled=0`、`param_source.limit=1000`、`exclude_existing_target=true`、`auto_advance=true`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api storage_inbound_detail`，通过，批次 `sync_20260706_062155_460920`，1000 次请求、1000 条成功计数、失败 0，耗时 767 秒。
  - DB 核验显示本批次 raw 为 1000 条、1000 个 `source_primary_key`、1000 个不同主键、1000 个 `data_hash`，`data_date` 覆盖 `2023-04-04` 到 `2023-07-27`。
  - DB 核验显示 `storage_inbound_detail` 累计覆盖从 506 增至 1506/174334；同批次 `failed_request_log` 为 0。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 185 个、真实配置 API 50 个、enabled 45 个；执行分层仍为 `configured=50`、`configured_enabled=45`、`configured_disabled=5`。
- 当前结论：
  - `storage_inbound_detail` 的 1000 窗口缺失扫描已跑通，且没有重复主键或失败请求。
  - 该接口仍不应 enabled；下一阶段可继续保持 1000 窗口回填，或只读评估是否提高到 2000。

## Stage 12B

- 阶段目标：继续推进 `storage_inbound_detail` 缺失扫描回填，并在 1000 窗口成功后提高到 2000。
- 已完成：
  - DB 起点确认 `storage_inbound_detail` 配置为 `enabled=0`、`param_source.limit=1000`、`exclude_existing_target=true`、`auto_advance=true`，累计覆盖 1506/174334，失败请求为 0。
  - TDD 红灯：更新 `tests/test_storage_inbound_detail_param_source.py`，要求 `storage_inbound_detail.param_source.limit=2000`，测试先失败于旧配置 `limit=1000`。
  - 将 `storage_inbound_detail.param_source.limit` 从 1000 调整为 2000，继续保持 `enabled=false`、`auto_advance=true` 和 `exclude_existing_target=true`。
  - 目标测试和相邻 `tests.test_product_detail_param_source` 一起通过，确认未误改 `product_detail.param_source.limit=500`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，DB 同步 API 配置 52 条。
  - `.\\.venv\\Scripts\\python.exe -m app.main` dry-run 显示 loaded 45 enabled API config(s)，确认 `storage_inbound_detail` 仍未进入 enabled。
  - DB 配置确认 `storage_inbound_detail.enabled=0`、`param_source.limit=2000`、`exclude_existing_target=true`、`auto_advance=true`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api storage_inbound_detail`，通过，批次 `sync_20260706_064400_057740`，2000 次请求、2000 条成功计数、失败 0，耗时 1725 秒。
  - DB 核验显示本批次 raw 为 2000 条、2000 个 `source_primary_key`、2000 个不同主键、2000 个 `data_hash`，`data_date` 覆盖 `2023-07-27` 到 `2024-02-01`。
  - DB 核验显示 `storage_inbound_detail` 累计覆盖从 1506 增至 3506/174334；本批次和该 API 累计 `failed_request_log` 均为 0。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 185 个、真实配置 API 50 个、enabled 45 个；执行分层仍为 `configured=50`、`configured_enabled=45`、`configured_disabled=5`。
- 11Z-12B 复盘：
  - 11Z 将 `storage_inbound_detail` 从 6 个历史样本推进到 506/174334，并引入 `exclude_existing_target=true` 缺失扫描边界。
  - 12A 将窗口从 500 提高到 1000，累计覆盖推进到 1506/174334。
  - 12B 将窗口从 1000 提高到 2000，累计覆盖推进到 3506/174334。
  - 三轮证明该接口可以按目标表缺失主键稳定回填，500、1000、2000 三个窗口均无重复主键、无失败请求；但覆盖率仍不足，不能进入 daily enabled。
  - 剩余 configured disabled API 仍为 5 个；下一次三轮复盘应在 12E 完成后进行。
- 当前结论：
  - `storage_inbound_detail` 的 2000 窗口缺失扫描已跑通。
  - 该接口仍不应 enabled；下一阶段应继续 2000 窗口回填，或先只读评估是否提高到 3000/5000。

## Stage 12C

- 阶段目标：继续推进 `storage_inbound_detail` 缺失扫描回填，并在 2000 窗口成功后提高到 3000。
- 已完成：
  - DB 起点确认 `storage_inbound_detail` 配置为 `enabled=0`、`param_source.limit=2000`、`exclude_existing_target=true`、`auto_advance=true`，累计覆盖 3506/174334，失败请求为 0。
  - TDD 红灯：更新 `tests/test_storage_inbound_detail_param_source.py`，要求 `storage_inbound_detail.param_source.limit=3000`，测试先失败于旧配置 `limit=2000`。
  - 将 `storage_inbound_detail.param_source.limit` 从 2000 调整为 3000，继续保持 `enabled=false`、`auto_advance=true` 和 `exclude_existing_target=true`。
  - 目标测试和相邻 `tests.test_product_detail_param_source` 一起通过，确认未误改 `product_detail.param_source.limit=500`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，DB 同步 API 配置 52 条。
  - `.\\.venv\\Scripts\\python.exe -m app.main` dry-run 显示 loaded 45 enabled API config(s)，确认 `storage_inbound_detail` 仍未进入 enabled。
  - DB 配置确认 `storage_inbound_detail.enabled=0`、`param_source.limit=3000`、`exclude_existing_target=true`、`auto_advance=true`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api storage_inbound_detail`，通过，批次 `sync_20260706_072021_923826`，3000 次请求、3000 条成功计数、失败 0，耗时 2041 秒。
  - DB 核验显示本批次 raw 为 3000 条、3000 个 `source_primary_key`、3000 个不同主键、3000 个 `data_hash`，`data_date` 覆盖 `2024-02-01` 到 `2024-06-11`。
  - DB 核验显示 `storage_inbound_detail` 累计覆盖从 3506 增至 6506/174334；本批次和该 API 累计 `failed_request_log` 均为 0。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，第一次 120 秒工具窗口超时，无残留进程且覆盖矩阵无 diff；使用 300 秒超时重跑通过，公开文档 API 185 个、真实配置 API 50 个、enabled 45 个；执行分层仍为 `configured=50`、`configured_enabled=45`、`configured_disabled=5`。
- 当前结论：
  - `storage_inbound_detail` 的 3000 窗口缺失扫描已跑通，耗时 2041 秒，单轮效率优于 2000 窗口。
  - 该接口仍不应 enabled；下一阶段可继续 3000 窗口回填，或先只读评估是否提高到 5000。

## Stage 12D

- 阶段目标：继续推进 `storage_inbound_detail` 缺失扫描回填，并在 3000 窗口成功后提高到 5000。
- 已完成：
  - DB 起点确认 `storage_inbound_detail` 配置为 `enabled=0`、`param_source.limit=3000`、`exclude_existing_target=true`、`auto_advance=true`，累计覆盖 6506/174334，失败请求为 0。
  - TDD 红灯：更新 `tests/test_storage_inbound_detail_param_source.py`，要求 `storage_inbound_detail.param_source.limit=5000`，测试先失败于旧配置 `limit=3000`。
  - 将 `storage_inbound_detail.param_source.limit` 从 3000 调整为 5000，继续保持 `enabled=false`、`auto_advance=true` 和 `exclude_existing_target=true`。
  - 目标测试和相邻 `tests.test_product_detail_param_source` 一起通过，确认未误改 `product_detail.param_source.limit=500`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，DB 同步 API 配置 52 条。
  - `.\\.venv\\Scripts\\python.exe -m app.main` dry-run 显示 loaded 45 enabled API config(s)，确认 `storage_inbound_detail` 仍未进入 enabled。
  - DB 配置确认 `storage_inbound_detail.enabled=0`、`param_source.limit=5000`、`exclude_existing_target=true`、`auto_advance=true`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api storage_inbound_detail`，通过，批次 `sync_20260706_081235_083788`，5000 次请求、5000 条成功计数、失败 0，耗时 4241 秒。
  - DB 核验显示本批次 raw 为 5000 条、5000 个 `source_primary_key`、5000 个不同主键、5000 个 `data_hash`，`data_date` 覆盖 `2024-06-11` 到 `2025-06-14`。
  - DB 核验显示 `storage_inbound_detail` 累计覆盖从 6506 增至 11506/174334；本批次和该 API 累计 `failed_request_log` 均为 0。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 185 个、真实配置 API 50 个、enabled 45 个；执行分层仍为 `configured=50`、`configured_enabled=45`、`configured_disabled=5`。
- 当前结论：
  - `storage_inbound_detail` 的 5000 窗口缺失扫描已跑通，但单批耗时 4241 秒。
  - 该接口仍不应 enabled；下一阶段建议继续 5000 窗口或只读评估是否需要拆成更可控的多轮回填。12E 完成后需要复盘 12C-12E。

## Stage 12E

- 阶段目标：继续使用 5000 窗口推进 `storage_inbound_detail` 缺失扫描回填，并完成 12C-12E 三轮复盘。
- 已完成：
  - DB 起点确认 `storage_inbound_detail` 配置为 `enabled=0`、`param_source.limit=5000`、`exclude_existing_target=true`、`auto_advance=true`，累计覆盖 11506/174334，失败请求为 0。
  - 本轮没有改配置或代码；现有目标测试 `tests.test_storage_inbound_detail_param_source` 和相邻 `tests.test_product_detail_param_source` 通过，确认 5000 窗口和 `product_detail.param_source.limit=500` 仍受测试约束。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，DB 同步 API 配置 52 条。
  - `.\\.venv\\Scripts\\python.exe -m app.main` dry-run 显示 loaded 45 enabled API config(s)，确认 `storage_inbound_detail` 仍未进入 enabled。
  - DB 配置确认 `storage_inbound_detail.enabled=0`、`param_source.limit=5000`、`exclude_existing_target=true`、`auto_advance=true`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api storage_inbound_detail`，通过，批次 `sync_20260706_094123_983181`，5000 次请求、5000 条成功计数、失败 0，耗时 4563 秒。
  - DB 核验显示本批次 raw 为 5000 条、5000 个 `source_primary_key`、5000 个不同主键、5000 个 `data_hash`，`data_date` 覆盖 `2022-09-20` 到 `2026-07-03`。
  - DB 核验显示 `storage_inbound_detail` 累计覆盖从 11506 增至 16506/174334；本批次和该 API 累计 `failed_request_log` 均为 0。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 185 个、真实配置 API 50 个、enabled 45 个；执行分层仍为 `configured=50`、`configured_enabled=45`、`configured_disabled=5`。
- 12C-12E 复盘：
  - 12C 将窗口从 2000 提高到 3000，覆盖从 3506 推进到 6506/174334，耗时 2041 秒。
  - 12D 将窗口从 3000 提高到 5000，覆盖从 6506 推进到 11506/174334，耗时 4241 秒。
  - 12E 复用 5000 窗口，覆盖从 11506 推进到 16506/174334，耗时 4563 秒。
  - 三轮累计新增 13000 个入库单详情，三轮均无重复主键、无失败请求；`exclude_existing_target=true` 的目标缺失扫描边界继续成立。
  - 质量结论：5000 窗口可用，但单轮耗时已超过 70 分钟，后续可以继续 5000 窗口做长任务回填，也可以改回 3000 以缩短单轮反馈周期。
  - 该接口仍不能 enabled：当前只覆盖 16506/174334，仍有约 157828 个上游 code 未回填。
- 当前结论：
  - `storage_inbound_detail` 缺失扫描回填继续稳定推进。
  - 下一阶段应继续回填该接口；下一次三轮复盘应在 12H 完成后进行。

## Stage 12F

- 阶段目标：继续使用 5000 窗口推进 `storage_inbound_detail` 缺失扫描回填，并保持该接口不进入 enabled。
- 已完成：
  - DB 起点确认 `storage_inbound_detail` 配置为 `enabled=0`、`param_source.limit=5000`、`exclude_existing_target=true`、`auto_advance=true`，累计覆盖 16506/174334，失败请求为 0。
  - 目标测试 `tests.test_storage_inbound_detail_param_source` 和相邻 `tests.test_product_detail_param_source` 通过，确认 5000 窗口和 `product_detail.param_source.limit=500` 仍受测试约束。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，DB 同步 API 配置 52 条。
  - `.\\.venv\\Scripts\\python.exe -m app.main` dry-run 显示 loaded 45 enabled API config(s)，确认 `storage_inbound_detail` 仍未进入 enabled。
  - 首次启动 12F 单接口同步时，批次 `sync_20260706_112018_586573` 因 `raw_api_data` upsert 锁等待超时失败；排查 `information_schema.innodb_trx` 后确认有本轮后台启动残留的 Sleep 事务，已结束 MySQL 线程 `3999103` 并确认 `innodb_trx` 为空。
  - 重新运行 `.\\.venv\\Scripts\\python.exe -m app.main --sync-api storage_inbound_detail`，通过，批次 `sync_20260706_112231_522900`，5000 次请求、5000 条成功计数、失败 0，耗时 4191 秒。
  - DB 核验显示成功批次 raw 为 5000 条、5000 个 `source_primary_key`、5000 个不同主键、5000 个 `data_hash`，`data_date` 覆盖 `2022-09-20` 到 `2026-07-03`。
  - DB 核验显示 `storage_inbound_detail` 累计覆盖从 16506 增至 21506/174334；成功批次和该 API 累计 `failed_request_log` 均为 0。
  - DB 配置确认 `storage_inbound_detail.enabled=0`、`param_source.limit=5000`、`exclude_existing_target=true`、`auto_advance=true`。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 185 个、真实配置 API 50 个、enabled 45 个；执行分层仍为 `configured=50`、`configured_enabled=45`、`configured_disabled=5`。
- 当前结论：
  - `storage_inbound_detail` 缺失扫描回填继续稳定推进，当前已覆盖 21506/174334。
  - 该接口仍不应 enabled；下一阶段 12G 可继续 5000 窗口回填，也可只读评估是否改回 3000 缩短单批反馈周期。
  - 后续如再遇到锁等待，应先查 `information_schema.processlist` 和 `information_schema.innodb_trx`，确认没有遗留未提交事务。

## Stage 12G

- 阶段目标：接入销售表现接口 `/operation/sts/salesAnalysis/page`，覆盖 7 个 `groupByType`，并拆成多个 API 配置分别落库。
- 已完成：
  - 公开文档确认销售表现文档 id=3375，请求方式为 POST，路径为 `/operation/sts/salesAnalysis/page`，必填参数包含 `groupByType`、`showCurrencyType`、`beginDate`、`endDate`、`page`、`pagesize`。
  - 新增 7 个默认 disabled 配置：`sales_analysis_seller_sku_page`、`sales_analysis_asin_page`、`sales_analysis_variation_asin_page`、`sales_analysis_sku_page`、`sales_analysis_spu_page`、`sales_analysis_country_page`、`sales_analysis_market_page`，分别对应 `seller_sku`、`asin`、`variation_asin`、`sku`、`spu`、`country`、`market`。
  - 销售表现接口实测快速分页会触发 HTTP 509，因此配置 `rate_limit.sleep_seconds=20`、`retry.retries=1`，并保持 `page_size=200`。
  - 新增 `commit_per_page=true` 的单接口验证路径：HTTP 请求和页间 sleep 不包在数据库事务中，每页 raw 写入单独提交，避免宽 JSON 报表在长事务中导致 PolarDB 连接失效。
  - 新增 `write_batch_size=10`，降低销售表现宽 JSON 单次 executemany 体积。
  - 真实响应中 `dateLine` 字段存在但值为 JSON `null`，因此新增 `data_date_param=beginDate`，用请求窗口日期写入 `raw_api_data.data_date`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs` 已执行通过，DB 同步 API 配置 59 条。
  - 7 个销售表现配置均已单接口跑通：`asin` 2651 条/14 次请求，`seller_sku` 2673 条/14 次请求，`sku` 2097 条/11 次请求，`spu` 34 条/1 次请求，`variation_asin` 113 条/1 次请求，`country` 7 条/1 次请求，`market` 24 条/1 次请求。
  - `spu` 在修正 `data_date_param` 后再次回归成功，批次 `sync_20260707_102027_648202` 写入 35 条，DB 核验显示新写入记录 `data_date=2026-07-03`。
  - DB 核验显示 7 个销售表现配置在 `api_config` 中仍为 `enabled=0`，且 `config_json.commit_per_page=true`。
  - 最近一次 7 个销售表现 `sync_api_log` 均为 success，`failed_request_log` 无销售表现失败记录，`information_schema.innodb_trx` 使用 autocommit 查询为空。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests` 通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"` 通过，89 个测试 OK。
  - `.\\.venv\\Scripts\\python.exe -m app.main` dry-run 显示 loaded 45 enabled API config(s)，确认销售表现仍未进入 enabled。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary` 通过；公开文档 API 187 个，真实配置 API 51 个，enabled 45 个，configured disabled 6 个。
- 当前结论：
  - 销售表现接口已经完成 7 个业务粒度的默认 disabled 接入，并完成真实单接口入库验证。
  - 该接口目前只验证了按日窗口单轮同步；由于页间限流较长，暂不进入 enabled，每日任务是否加入需要单独评估 cron 窗口。
  - 修正前写入的部分销售表现历史 raw 记录 `data_date` 为空；修正后新写入窗口已可用 `beginDate` 写入 `data_date`。

## Stage 12H

- 阶段目标：将 `storage_inbound_detail` 缺失扫描窗口从 5000 调整回 2000，优先保证当前执行窗口内可稳定完成，并完成 12F-12H 三轮复盘。
- 已完成：
  - 起点状态：`storage_inbound_detail` 在 12F 后累计覆盖为 21506/174334，`enabled=0`、`param_source.limit=5000`、`exclude_existing_target=true`、`auto_advance=true`，失败请求为 0。
  - 5000 窗口在当前前台执行窗口中过长，曾在 raw 写入阶段被中断；本轮选择回到 2000 窗口，降低单轮收口风险。
  - TDD 红灯：更新 `tests/test_storage_inbound_detail_param_source.py`，要求 `storage_inbound_detail.param_source.limit=2000`，测试先失败于旧配置 `limit=5000`。
  - 将 `config/api_config.example.yaml` 中 `storage_inbound_detail.param_source.limit` 从 5000 调整为 2000，继续保持 `enabled=false`、`auto_advance=true` 和 `exclude_existing_target=true`。
  - 目标测试和相邻 `tests.test_product_detail_param_source` 一起通过，确认未误改 `product_detail.param_source.limit=500`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api-configs`，通过，DB 同步 API 配置 59 条。
  - `.\\.venv\\Scripts\\python.exe -m app.main` dry-run 显示 loaded 45 enabled API config(s)，确认 `storage_inbound_detail` 仍未进入 enabled。
  - DB 配置确认 `storage_inbound_detail.enabled=0`、`param_source.limit=2000`、`exclude_existing_target=true`、`auto_advance=true`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api storage_inbound_detail`，通过，批次 `sync_20260710_193937_362020`，2000 次请求、2000 条成功计数、失败 0，批次耗时 1771 秒。
  - DB 核验显示本批次 raw 为 2000 条、2000 个 `source_primary_key`、2000 个不同主键、2000 个 `data_hash`，`data_date` 覆盖 `2023-12-14` 到 `2024-10-21`。
  - DB 核验显示 `storage_inbound_detail` 累计覆盖从 21506 增至 23506/174334；该 API 累计 `failed_request_log` 为 0。
  - DB 核验显示 `api_config` 共 59 条、enabled 45 条；本次交接复核时 `information_schema.innodb_trx` 不为空，存在 1 条 Sleep 事务，线程号 `5143219`，未在本轮只读核验中处理。
  - `.\\.venv\\Scripts\\python.exe -m app.doc_catalog --output config\\jijia_api_catalog.generated.json --summary`，通过，公开文档 API 187 个、真实配置 API 51 个、enabled 45 个、configured disabled 6 个。
- 12F-12H 复盘：
  - 12F 继续 5000 窗口，处理遗留 Sleep 事务导致的锁等待后重跑成功，覆盖从 16506 推进到 21506/174334，耗时 4191 秒。
  - 12G 暂停回填，接入销售表现文档接口并拆成 7 个默认 disabled 配置，新增 `commit_per_page=true` 短事务验证路径，真实配置 API 从 50 增至 51，configured disabled 从 5 增至 6。
  - 12H 将窗口从 5000 降回 2000，覆盖从 21506 推进到 23506/174334，耗时 1771 秒。
  - 三轮结论：`storage_inbound_detail` 的 `exclude_existing_target=true` 缺失扫描边界仍成立；5000 窗口吞吐更高但不适合当前前台执行窗口，2000 窗口反馈周期更可控。
  - 销售表现已完成真实入库验证但不应直接 enabled；按 20 秒页间隔估算，必须先评估每日 cron 窗口。
- 当前结论：
  - `storage_inbound_detail` 缺失扫描回填继续推进，当前已覆盖 23506/174334，仍不能 enabled。
  - 下一阶段 12I 建议继续使用 2000 窗口推进，除非先实现更稳妥的长任务 runner 或单独运维窗口。

## Stage 12I

- 阶段目标：先实现同步任务并发互斥，避免 cron 或人工命令重叠写入 PolarDB。
- 已完成：
  - 交接只读复核发现 `information_schema.innodb_trx` 存在 1 条 Sleep 事务，线程号 `5143219`；用户确认后已执行 `KILL 5143219`，复查 `innodb_trx` 为空。
  - 新增入口层 MySQL named lock：锁名为 `jijia_polardb_sync_task`，超时为 0 秒，拿不到锁直接退出，不等待、不抢占。
  - 加锁范围限定为会写库或请求真实业务接口的命令：`--mock-sync`、`--test-api`、`--sync-api`、`--sync-enabled`、`--sync-api-configs`。
  - dry-run、`--check-db` 和 `--test-token` 不使用该互斥锁。
  - 新增 `tests/test_main_sync_lock.py`，先验证缺少 `_sync_task_lock` 和 `_requires_sync_lock` 时失败，再实现最小代码使测试通过。
  - 真实数据库 smoke test 已验证 `_sync_task_lock` 可获取并释放 named lock，随后 `information_schema.innodb_trx` 为 0。
  - `.\\.venv\\Scripts\\python.exe -m app.main` dry-run 通过，仍显示 45 个 enabled API。
  - `.\\.venv\\Scripts\\python.exe -m compileall app tests` 通过。
  - `.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"` 通过，92 个测试 OK。
  - `git diff --check` 通过，仅有 LF/CRLF 提示。
- 当前结论：
  - 同步互斥已在入口层生效，不改变 `SyncEngine` 的批次、分页、短事务和 raw 写入逻辑。
  - 本阶段未新增 API、未启用 `storage_inbound_detail`、未推进销售表现 enabled。

## Stage 12J

- 阶段目标：在 12I named lock 已生效的前提下，继续推进 `storage_inbound_detail` 2000 窗口缺失扫描回填。
- 已完成：
  - 已提交 12I 稳定点，提交为 `577cb49 Add sync task named lock`。
  - 前置核验显示工作区仅 ahead 1、无未提交变更；`information_schema.innodb_trx=0`；`storage_inbound_detail.enabled=0`、`param_source.limit=2000`、`exclude_existing_target=true`、`auto_advance=true`。
  - 起点覆盖为 23506/174334，`storage_inbound_detail` 累计失败请求为 0；dry-run 仍显示 45 个 enabled API。
  - 首次后台启动时命中过期 token 后的网络等待，未生成 batch；已停止该进程并确认 named lock 释放、`innodb_trx=0`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --test-token` 通过，刷新 token 缓存后重新启动单接口同步。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api storage_inbound_detail`，通过，批次 `sync_20260710_215533_340234`，2000 次请求、2000 条成功计数、失败 0，批次耗时 1853 秒，API 耗时 1850 秒。
  - 本批次 raw 为 2000 条、2000 个 `source_primary_key`、2000 个不同主键、2000 个 `data_hash`、空主键 0，`data_date` 覆盖 `2024-10-21` 到 `2025-07-07`。
  - DB 核验显示 `storage_inbound_detail` 累计覆盖从 23506 增至 25506/174334；本批次和该 API 累计 `failed_request_log` 均为 0。
  - 同步完成后 named lock 已释放，`information_schema.innodb_trx=0`。
- 当前结论：
  - 12I named lock 没有影响单接口回填结果，且任务结束后没有残留事务。
  - `storage_inbound_detail` 仍不应 enabled；下一阶段 12K 建议继续 2000 窗口再跑一轮，并完成 12I-12K 三轮复盘。

## Stage 12K

- 阶段目标：继续推进 `storage_inbound_detail` 2000 窗口缺失扫描回填，并完成 12I-12K 三轮复盘。
- 已完成：
  - 已提交 12J 文档记录，提交为 `4272256 Document storage inbound detail 12J backfill`。
  - 前置核验显示工作区仅 ahead 2、无未提交变更；`--test-token` 通过；dry-run 仍显示 45 个 enabled API。
  - DB 前置核验显示 named lock 空闲、`information_schema.innodb_trx=0`；`storage_inbound_detail.enabled=0`、`param_source.limit=2000`、`exclude_existing_target=true`、`auto_advance=true`。
  - 起点覆盖为 25506/174334，`storage_inbound_detail` 累计失败请求为 0。
  - 启动 12K 时短暂出现第二个 Python 进程组，但 named lock 阻止了并发重叠；实际运行的同步进程只有一组。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api storage_inbound_detail`，通过，批次 `sync_20260710_231247_400113`，2000 次请求、2000 条成功计数、失败 0，批次耗时 1691 秒，API 耗时 1688 秒。
  - 本批次 raw 为 2000 条、2000 个 `source_primary_key`、2000 个不同主键、2000 个 `data_hash`、空主键 0，`data_date` 覆盖 `2025-07-07` 到 `2026-01-29`。
  - DB 核验显示 `storage_inbound_detail` 累计覆盖从 25506 增至 27506/174334；本批次和该 API 累计 `failed_request_log` 均为 0。
  - 同步完成后 named lock 已释放，`information_schema.innodb_trx=0`。
- 12I-12K 复盘：
  - 12I 先补上入口层 MySQL named lock，解决 cron 或人工命令重叠写入风险；该改动没有改变 `SyncEngine` 内部事务模型。
  - 12J 在 named lock 生效后完成第一轮 2000 窗口回填，覆盖从 23506 推进到 25506/174334，耗时 1853 秒。
  - 12K 继续 2000 窗口回填，覆盖从 25506 推进到 27506/174334，耗时 1691 秒。
  - 两轮回填均无失败请求、无空主键、无重复主键或 hash；named lock 在任务结束后均释放，未留下 InnoDB 残留事务。
- 当前结论：
  - 2000 窗口仍是当前前台执行环境下较稳妥的回填粒度。
  - `storage_inbound_detail` 仍不应 enabled；下一阶段 12L 建议继续 2000 窗口，除非先实现更细粒度短事务或后台 runner。

## Stage 12L

- 阶段目标：继续推进 `storage_inbound_detail` 2000 窗口缺失扫描回填，保持 named lock 与事务收口核验。
- 已完成：
  - 前置核验显示工作区 ahead 3 且干净；`--test-token` 通过；dry-run 仍显示 45 个 enabled API。
  - DB 前置核验显示 named lock 空闲、`information_schema.innodb_trx=0`；`storage_inbound_detail.enabled=0`、`param_source.limit=2000`、`exclude_existing_target=true`、`auto_advance=true`。
  - 起点覆盖为 27506/174334，`storage_inbound_detail` 累计失败请求为 0。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api storage_inbound_detail`，通过，批次 `sync_20260710_234747_756768`，2000 次请求、2000 条成功计数、失败 0，批次耗时 1882 秒，API 耗时 1879 秒。
  - 本批次 raw 为 2000 条、2000 个 `source_primary_key`、2000 个不同主键、2000 个 `data_hash`、空主键 0，`data_date` 覆盖 `2022-09-20` 到 `2026-07-03`。
  - DB 核验显示 `storage_inbound_detail` 累计覆盖从 27506 增至 29506/174334；本批次和该 API 累计 `failed_request_log` 均为 0。
  - 同步完成后 named lock 已释放，`information_schema.innodb_trx=0`。
- 当前结论：
  - 2000 窗口继续稳定，named lock 与事务收口正常。
  - `storage_inbound_detail` 仍不应 enabled；下一阶段 12M 建议继续 2000 窗口。

## Stage 12M

- 阶段目标：继续推进 `storage_inbound_detail` 2000 窗口缺失扫描回填，并核验超出历史耗时区间时的 DB 状态。
- 已完成：
  - 前置核验显示工作区 ahead 4 且干净；`--test-token` 通过；dry-run 仍显示 45 个 enabled API。
  - DB 前置核验显示 named lock 空闲、`information_schema.innodb_trx=0`；`storage_inbound_detail.enabled=0`、`param_source.limit=2000`、`exclude_existing_target=true`、`auto_advance=true`。
  - 起点覆盖为 29506/174334，`storage_inbound_detail` 累计失败请求为 0。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api storage_inbound_detail`，通过，批次 `sync_20260711_002724_893517`，2000 次请求、2000 条成功计数、失败 0，批次耗时 1909 秒，API 耗时 1907 秒。
  - 本批次 raw 为 2000 条、2000 个 `source_primary_key`、2000 个不同主键、2000 个 `data_hash`、空主键 0，`data_date` 覆盖 `2023-11-13` 到 `2026-07-03`。
  - DB 核验显示 `storage_inbound_detail` 累计覆盖从 29506 增至 31506/174334；本批次和该 API 累计 `failed_request_log` 均为 0。
  - 同步完成后 named lock 已释放，独立 autocommit 连接复查 `information_schema.innodb_trx=0`。
- 当前结论：
  - 本轮耗时约 31 分 49 秒，略高于 12J-12L，但仍自然完成且无失败日志。
  - `storage_inbound_detail` 仍不应 enabled；下一阶段 12N 建议继续 2000 窗口，并完成 12L-12N 三轮复盘。

## Stage 12N

- 阶段目标：继续推进 `storage_inbound_detail` 2000 窗口缺失扫描回填，并完成 12L-12N 三轮复盘。
- 已完成：
  - 前置核验显示工作区 ahead 5 且干净；`--test-token` 通过；dry-run 仍显示 45 个 enabled API。
  - DB 前置核验显示 named lock 空闲、`information_schema.innodb_trx=0`；`storage_inbound_detail.enabled=0`、`param_source.limit=2000`、`exclude_existing_target=true`、`auto_advance=true`。
  - 起点覆盖为 31506/174334，`storage_inbound_detail` 累计失败请求为 0。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api storage_inbound_detail`，通过，批次 `sync_20260711_010853_756197`，2000 次请求、2000 条成功计数、失败 0，批次耗时 2156 秒，API 耗时 2153 秒。
  - 本批次 raw 为 2000 条、2000 个 `source_primary_key`、2000 个不同主键、2000 个 `data_hash`、空主键 0，`data_date` 覆盖 `2024-10-11` 到 `2026-06-23`。
  - DB 核验显示 `storage_inbound_detail` 累计覆盖从 31506 增至 33506/174334；本批次和该 API 累计 `failed_request_log` 均为 0。
  - 同步完成后 named lock 已释放，`information_schema.innodb_trx=0`。
- 12L-12N 三轮复盘：
  - 三轮均使用 2000 窗口，分别补齐 2000 条，覆盖从 27506 推进到 33506/174334，净增 6000。
  - 三轮均为 2000 请求、2000 成功、0 失败；批次内主键和 hash 均唯一，空主键均为 0，`failed_request_log` 始终为 0。
  - named lock 能阻止并发写任务；运行中长事务仍存在，但每轮结束后均能释放锁并清空 `information_schema.innodb_trx`。
  - 耗时从 1882 秒、1909 秒增加到 2156 秒，仍可自然完成；如果后续继续升高，应优先评估参数型详情接口短事务或后台 runner，而不是启用该接口。
- 当前结论：
  - `storage_inbound_detail` 仍不应 enabled；下一阶段 12O 建议继续 2000 窗口回填，并继续监控耗时变化。

## Stage 12O

- 阶段目标：继续推进 `storage_inbound_detail` 2000 窗口缺失扫描回填，重点核验 12N 后耗时是否继续升高。
- 已完成：
  - 前置核验显示工作区 ahead 6 且干净；`--test-token` 通过；dry-run 仍显示 45 个 enabled API。
  - DB 前置核验显示 named lock 空闲、`information_schema.innodb_trx=0`；`storage_inbound_detail.enabled=0`、`param_source.limit=2000`、`exclude_existing_target=true`、`auto_advance=true`。
  - 起点覆盖为 33506/174334，`storage_inbound_detail` 累计失败请求为 0。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api storage_inbound_detail`，通过，批次 `sync_20260711_015340_111753`，2000 次请求、2000 条成功计数、失败 0，批次耗时 2069 秒，API 耗时 2067 秒。
  - 本批次 raw 为 2000 条、2000 个 `source_primary_key`、2000 个不同主键、2000 个 `data_hash`、空主键 0，`data_date` 覆盖 `2024-11-23` 到 `2024-12-03`。
  - DB 核验显示 `storage_inbound_detail` 累计覆盖从 33506 增至 35506/174334；本批次和该 API 累计 `failed_request_log` 均为 0。
  - 同步完成后 named lock 已释放，`information_schema.innodb_trx=0`。
- 当前结论：
  - 本轮耗时 2069 秒，低于 12N 的 2156 秒；2000 窗口仍可继续。
  - `storage_inbound_detail` 仍不应 enabled；下一阶段 12P 建议继续 2000 窗口回填。

## Stage 12P

- 阶段目标：继续推进 `storage_inbound_detail` 2000 窗口缺失扫描回填，保持 2000 窗口稳定性核验。
- 已完成：
  - 前置核验显示工作区 ahead 7 且干净；`--test-token` 通过；dry-run 仍显示 45 个 enabled API。
  - DB 前置核验显示 named lock 空闲、`information_schema.innodb_trx=0`；`storage_inbound_detail.enabled=0`、`param_source.limit=2000`、`exclude_existing_target=true`、`auto_advance=true`。
  - 起点覆盖为 35506/174334，`storage_inbound_detail` 累计失败请求为 0。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api storage_inbound_detail`，通过，批次 `sync_20260711_023428_235025`，2000 次请求、2000 条成功计数、失败 0，批次耗时 1730 秒，API 耗时 1728 秒。
  - 本批次 raw 为 2000 条、2000 个 `source_primary_key`、2000 个不同主键、2000 个 `data_hash`、空主键 0，`data_date` 覆盖 `2024-12-03` 到 `2024-12-06`。
  - DB 核验显示 `storage_inbound_detail` 累计覆盖从 35506 增至 37506/174334；本批次和该 API 累计 `failed_request_log` 均为 0。
  - 同步完成后 named lock 已释放，`information_schema.innodb_trx=0`。
- 当前结论：
  - 本轮耗时 1730 秒，低于 12O 的 2069 秒；2000 窗口仍稳定。
  - `storage_inbound_detail` 仍不应 enabled；下一阶段 12Q 建议继续 2000 窗口回填，并完成 12O-12Q 三轮复盘。

## Stage 12Q

- 阶段目标：继续推进 `storage_inbound_detail` 2000 窗口缺失扫描回填，并完成 12O-12Q 三轮复盘。
- 已完成：
  - 前置核验显示工作区 ahead 8 且干净；`--test-token` 通过；dry-run 仍显示 45 个 enabled API。
  - DB 前置核验显示 named lock 空闲、`information_schema.innodb_trx=0`；`storage_inbound_detail.enabled=0`、`param_source.limit=2000`、`exclude_existing_target=true`、`auto_advance=true`。
  - 起点覆盖为 37506/174334，`storage_inbound_detail` 累计失败请求为 0。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api storage_inbound_detail`，通过，批次 `sync_20260711_031541_067013`，2000 次请求、2000 条成功计数、失败 0，批次耗时 1600 秒，API 耗时 1598 秒。
  - 本批次 raw 为 2000 条、2000 个 `source_primary_key`、2000 个不同主键、2000 个 `data_hash`、空主键 0，`data_date` 覆盖 `2024-12-06` 到 `2024-12-07`。
  - DB 核验显示 `storage_inbound_detail` 累计覆盖从 37506 增至 39506/174334；本批次和该 API 累计 `failed_request_log` 均为 0。
  - 同步完成后 named lock 已释放，`information_schema.innodb_trx=0`。
- 12O-12Q 三轮复盘：
  - 三轮均使用 2000 窗口，分别补齐 2000 条，覆盖从 33506 推进到 39506/174334，净增 6000。
  - 三轮均为 2000 请求、2000 成功、0 失败；批次内主键和 hash 均唯一，空主键均为 0，`failed_request_log` 始终为 0。
  - named lock 和事务收口继续正常；每轮结束后 named lock 均释放，`information_schema.innodb_trx=0`。
  - 耗时从 2069 秒、1730 秒下降到 1600 秒，2000 窗口仍适合当前前台执行方式。
- 当前结论：
  - `storage_inbound_detail` 仍不应 enabled；下一阶段 12R 建议继续 2000 窗口回填。

## Stage 12R

- 阶段目标：继续推进 `storage_inbound_detail` 2000 窗口缺失扫描回填，保持 named lock 与事务收口核验。
- 已完成：
  - 前置核验显示工作区 `master...origin/master [ahead 9]` 且干净；最新提交为 `88f2665 Document storage inbound detail 12Q backfill`；`--test-token` 通过；dry-run 仍显示 45 个 enabled API。
  - YAML 核验显示共 59 个 `api_code`、enabled 45 个；`storage_inbound_detail.enabled=false`、`param_source.limit=2000`、`exclude_existing_target=true`、`auto_advance=true`。
  - 覆盖矩阵核验显示公开文档 API 187 个、真实配置 API 51 个、enabled 45 个、configured disabled 6 个；销售表现 7 个拆分配置仍均为 disabled、`commit_per_page=true`、`write_batch_size=10`、`data_date_param=beginDate`。
  - DB 前置核验显示 named lock 空闲、`information_schema.innodb_trx=0`；`storage_inbound_detail` 起点覆盖为 39506/174334，累计失败请求为 0。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api storage_inbound_detail` 通过，批次 `sync_20260711_035846_323463`，2000 次请求、2000 条成功计数、失败 0，批次耗时 1766 秒，API 耗时 1764 秒。
  - 本批次 raw 为 2000 条、2000 个 `source_primary_key`、2000 个不同主键、2000 个 `data_hash`、空主键 0，`data_date` 覆盖 `2024-12-07` 到 `2024-12-10`。
  - DB 核验显示 `storage_inbound_detail` 累计覆盖从 39506 增至 41506/174334，完成约 23.81%，剩余 132828；本批次和该 API 累计 `failed_request_log` 均为 0。
  - 同步结束后 named lock 已释放，`information_schema.innodb_trx=0`。
- 当前结论：
  - `storage_inbound_detail` 仍不应 enabled；下一阶段 12S 建议继续 2000 窗口回填，下一次三轮复盘仍放在 12T 完成后。

## Stage 12S

- 阶段目标：继续推进 `storage_inbound_detail` 2000 窗口缺失扫描回填，并为 12T 三轮复盘保留连续证据。
- 已完成：
  - 前置核验显示工作区 `master...origin/master [ahead 10]` 且干净；最新提交为 `3c7b666 Document storage inbound detail 12R backfill`；`--test-token` 通过；dry-run 仍显示 45 个 enabled API。
  - YAML 核验显示共 59 个 `api_code`、enabled 45 个；`storage_inbound_detail.enabled=false`、`param_source.limit=2000`、`exclude_existing_target=true`、`auto_advance=true`。
  - 覆盖矩阵核验显示公开文档 API 187 个、真实配置 API 51 个、enabled 45 个、configured disabled 6 个；销售表现 7 个拆分配置仍均为 disabled、`commit_per_page=true`、`write_batch_size=10`、`data_date_param=beginDate`。
  - DB 前置核验显示 named lock 空闲、`information_schema.innodb_trx=0`；`storage_inbound_detail` 起点覆盖为 41506/174334，累计失败请求为 0。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api storage_inbound_detail` 通过，批次 `sync_20260711_043506_686038`，2000 次请求、2000 条成功计数、失败 0，批次耗时 1356 秒，API 耗时 1354 秒。
  - 本批次 raw 为 2000 条、2000 个 `source_primary_key`、2000 个不同主键、2000 个 `data_hash`、空主键 0，`data_date` 覆盖 `2024-12-10` 到 `2024-12-11`。
  - DB 核验显示 `storage_inbound_detail` 累计覆盖从 41506 增至 43506/174334，完成约 24.96%，剩余 130828；本批次和该 API 累计 `failed_request_log` 均为 0。
  - 同步结束后 named lock 已释放，`information_schema.innodb_trx=0`。
- 当前结论：
  - `storage_inbound_detail` 仍不应 enabled；下一阶段 12T 建议继续 2000 窗口回填，并完成 12R-12T 三轮复盘。

## Stage 12T

- 阶段目标：继续推进 `storage_inbound_detail` 2000 窗口缺失扫描回填，并完成 12R-12T 三轮复盘。
- 已完成：
  - 前置核验显示工作区 `master...origin/master [ahead 11]` 且干净；最新提交为 `203a687 Document storage inbound detail 12S backfill`；`--test-token` 通过；dry-run 仍显示 45 个 enabled API。
  - YAML 核验显示共 59 个 `api_code`、enabled 45 个；`storage_inbound_detail.enabled=false`、`param_source.limit=2000`、`exclude_existing_target=true`、`auto_advance=true`。
  - 覆盖矩阵核验显示公开文档 API 187 个、真实配置 API 51 个、enabled 45 个、configured disabled 6 个；销售表现 7 个拆分配置仍均为 disabled、`commit_per_page=true`、`data_date_param=beginDate`。
  - DB 前置核验显示 named lock 空闲、`information_schema.innodb_trx=0`；`storage_inbound_detail` 起点覆盖为 43506/174334，累计失败请求为 0。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api storage_inbound_detail` 通过，批次 `sync_20260711_050800_503945`，2000 次请求、2000 条成功计数、失败 0，批次耗时 1991 秒，API 耗时 1989 秒。
  - 本批次 raw 为 2000 条、2000 个 `source_primary_key`、2000 个不同主键、2000 个 `data_hash`、空主键 0，`data_date` 覆盖 `2024-12-11` 到 `2024-12-17`。
  - DB 核验显示 `storage_inbound_detail` 累计覆盖从 43506 增至 45506/174334，完成约 26.10%，剩余 128828；本批次和该 API 累计 `failed_request_log` 均为 0。
  - 同步结束后 named lock 已释放，`information_schema.innodb_trx=0`。
- 12R-12T 三轮复盘：
  - 三轮均使用 2000 窗口，分别补齐 2000 条，覆盖从 39506 推进到 45506/174334，净增 6000。
  - 三轮均为 2000 请求、2000 成功、0 失败；批次内主键和 hash 均唯一，空主键均为 0，`failed_request_log` 始终为 0。
  - named lock 和事务收口正常；每轮结束后 named lock 均释放，`information_schema.innodb_trx=0`。
  - 耗时为 1766 秒、1356 秒、1991 秒，仍能自然完成；12T 耗时回升但未出现锁等待或残留事务。
- 当前结论：
  - `storage_inbound_detail` 仍不应 enabled；下一阶段 12U 建议继续 2000 窗口回填，并持续监控耗时波动。

## Stage 12U

- 阶段目标：继续推进 `storage_inbound_detail` 2000 窗口缺失扫描回填，并观察 12T 后耗时回升是否继续扩大。
- 已完成：
  - 前置核验显示工作区 `master...origin/master [ahead 12]` 且干净；最新提交为 `52101d0 Document storage inbound detail 12T backfill`；`--test-token` 通过；dry-run 仍显示 45 个 enabled API。
  - YAML 核验显示共 59 个 `api_code`、enabled 45 个；`storage_inbound_detail.enabled=false`、`param_source.limit=2000`、`exclude_existing_target=true`、`auto_advance=true`。
  - 覆盖矩阵核验显示公开文档 API 187 个、真实配置 API 51 个、enabled 45 个、configured disabled 6 个；销售表现 7 个拆分配置仍均为 disabled、`commit_per_page=true`、`data_date_param=beginDate`。
  - DB 前置核验显示 named lock 空闲、`information_schema.innodb_trx=0`；`storage_inbound_detail` 起点覆盖为 45506/174334，累计失败请求为 0。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api storage_inbound_detail` 通过，批次 `sync_20260711_055041_994564`，2000 次请求、2000 条成功计数、失败 0，批次耗时 2145 秒，API 耗时 2143 秒。
  - 本批次 raw 为 2000 条、2000 个 `source_primary_key`、2000 个不同主键、2000 个 `data_hash`、空主键 0，`data_date` 覆盖 `2024-12-17` 到 `2024-12-17`。
  - DB 核验显示 `storage_inbound_detail` 累计覆盖从 45506 增至 47506/174334，完成约 27.25%，剩余 126828；本批次和该 API 累计 `failed_request_log` 均为 0。
  - 同步结束后 named lock 已释放，`information_schema.innodb_trx=0`；运行超过 30 分钟时的只读诊断显示事务处于 RUNNING 但无 SQL 锁等待，最终自然完成。
- 当前结论：
  - `storage_inbound_detail` 仍不应 enabled；下一阶段 12V 建议继续 2000 窗口回填，并持续监控耗时，下一次三轮复盘仍放在 12W 完成后。

## Stage 12V

- 阶段目标：继续推进 `storage_inbound_detail` 2000 窗口缺失扫描回填，并验证 12U 后的耗时升高是否仍能自然收口。
- 已完成：
  - 前置核验显示工作区 `master...origin/master [ahead 13]` 且干净；最新提交为 `500a875 Document storage inbound detail 12U backfill`；`--test-token` 通过；dry-run 仍显示 45 个 enabled API。
  - YAML 核验显示共 59 个 `api_code`、enabled 45 个；`storage_inbound_detail.enabled=false`、`param_source.limit=2000`、`exclude_existing_target=true`、`auto_advance=true`。
  - 覆盖矩阵核验显示公开文档 API 187 个、真实配置 API 51 个、enabled 45 个、configured disabled 6 个；销售表现 7 个拆分配置仍均为 disabled、`commit_per_page=true`、`data_date_param=beginDate`。
  - DB 前置核验显示 named lock 空闲、`information_schema.innodb_trx=0`；`storage_inbound_detail` 起点覆盖为 47506/174334，累计失败请求为 0。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api storage_inbound_detail` 通过，批次 `sync_20260711_063413_245884`，2000 次请求、2000 条成功计数、失败 0，批次耗时 2181 秒，API 耗时 2179 秒。
  - 本批次 raw 为 2000 条、2000 个 `source_primary_key`、2000 个不同主键、2000 个 `data_hash`、空主键 0，`data_date` 覆盖 `2024-12-17` 到 `2024-12-17`。
  - DB 核验显示 `storage_inbound_detail` 累计覆盖从 47506 增至 49506/174334，完成约 28.40%，剩余 124828；本批次和该 API 累计 `failed_request_log` 均为 0。
  - 同步结束后 named lock 已释放，`information_schema.innodb_trx=0`；运行超过 30 分钟时的只读诊断显示事务处于 RUNNING 但无 SQL 锁等待，最终自然完成。
- 当前结论：
  - `storage_inbound_detail` 仍不应 enabled；下一阶段 12W 建议继续 2000 窗口回填，并在完成后做 12U-12W 三轮复盘。

## Stage 12W

- 阶段目标：继续推进 `storage_inbound_detail` 2000 窗口缺失扫描回填，并完成 12U-12W 三轮复盘。
- 已完成：
  - 前置核验显示工作区 `master...origin/master [ahead 14]` 且干净；最新提交为 `39b6680 Document storage inbound detail 12V backfill`；`--test-token` 通过；dry-run 仍显示 45 个 enabled API。
  - YAML 核验显示共 59 个 `api_code`、enabled 45 个；`storage_inbound_detail.enabled=false`、`param_source.limit=2000`、`exclude_existing_target=true`、`auto_advance=true`。
  - 覆盖矩阵核验显示公开文档 API 187 个、真实配置 API 51 个、enabled 45 个、configured disabled 6 个；销售表现 7 个拆分配置仍均为 disabled、`commit_per_page=true`、`data_date_param=beginDate`。
  - DB 前置核验显示 named lock 空闲、`information_schema.innodb_trx=0`；`storage_inbound_detail` 起点覆盖为 49506/174334，累计失败请求为 0。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api storage_inbound_detail` 通过，批次 `sync_20260711_071733_399568`，2000 次请求、2000 条成功计数、失败 0，批次耗时 2256 秒，API 耗时 2253 秒。
  - 本批次 raw 为 2000 条、2000 个 `source_primary_key`、2000 个不同主键、2000 个 `data_hash`、空主键 0，`data_date` 覆盖 `2024-12-17` 到 `2024-12-21`。
  - DB 核验显示 `storage_inbound_detail` 累计覆盖从 49506 增至 51506/174334，完成约 29.54%，剩余 122828；本批次和该 API 累计 `failed_request_log` 均为 0。
  - 同步结束后 named lock 已释放，`information_schema.innodb_trx=0`；运行超过 30 分钟时的只读诊断显示事务处于 RUNNING 但无 SQL 锁等待，最终自然完成。
- 12U-12W 三轮复盘：
  - 三轮均使用 2000 窗口，分别补齐 2000 条，覆盖从 45506 推进到 51506/174334，净增 6000。
  - 三轮均为 2000 请求、2000 成功、0 失败；批次内主键和 hash 均唯一，空主键均为 0，`failed_request_log` 始终为 0。
  - named lock 和事务收口正常；每轮结束后 named lock 均释放，`information_schema.innodb_trx=0`。
  - 耗时为 2145 秒、2181 秒、2256 秒，连续三轮略升且均超过 30 分钟，但数据库侧未出现锁等待或残留事务，当前仍可自然完成。
- 当前结论：
  - `storage_inbound_detail` 仍不应 enabled；下一阶段 12X 建议继续 2000 窗口回填，同时持续观察耗时是否继续上升。

## Stage 12X

- 阶段目标：继续推进 `storage_inbound_detail` 2000 窗口缺失扫描回填，并观察 12U-12W 后耗时是否继续上升。
- 已完成：
  - 前置核验显示工作区 `master...origin/master [ahead 15]` 且干净；最新提交为 `868f279 Document storage inbound detail 12W backfill`；`--test-token` 通过；dry-run 仍显示 45 个 enabled API。
  - YAML 核验显示共 59 个 `api_code`、enabled 45 个；`storage_inbound_detail.enabled=false`、`param_source.limit=2000`、`exclude_existing_target=true`、`auto_advance=true`。
  - 覆盖矩阵核验显示公开文档 API 187 个、真实配置 API 51 个、enabled 45 个、configured disabled 6 个；销售表现 7 个拆分配置仍均为 disabled、`commit_per_page=true`、`data_date_param=beginDate`。
  - DB 前置核验显示 named lock 空闲、`information_schema.innodb_trx=0`；`storage_inbound_detail` 起点覆盖为 51506/174334，累计失败请求为 0。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api storage_inbound_detail` 通过，批次 `sync_20260711_080050_309908`，2000 次请求、2000 条成功计数、失败 0，批次耗时 2259 秒，API 耗时 2256 秒。
  - 本批次 raw 为 2000 条、2000 个 `source_primary_key`、2000 个不同主键、2000 个 `data_hash`、空主键 0，`data_date` 覆盖 `2024-12-21` 到 `2025-01-13`。
  - DB 核验显示 `storage_inbound_detail` 累计覆盖从 51506 增至 53506/174334，完成约 30.69%，剩余 120828；本批次和该 API 累计 `failed_request_log` 均为 0。
  - 同步结束后 named lock 已释放，`information_schema.innodb_trx=0`；运行超过 30 分钟时的只读诊断显示事务处于 RUNNING 但无 SQL 锁等待，最终自然完成。
- 当前结论：
  - `storage_inbound_detail` 仍不应 enabled；下一阶段 12Y 建议继续 2000 窗口回填，下一次三轮复盘仍放在 12Z 完成后。

## Stage 12Y

- 阶段目标：继续推进 `storage_inbound_detail` 2000 窗口缺失扫描回填，并为 12Z 三轮复盘保留连续证据。
- 已完成：
  - 前置核验显示工作区 `master...origin/master [ahead 16]` 且干净；最新提交为 `742c909 Document storage inbound detail 12X backfill`；`--test-token` 通过；dry-run 仍显示 45 个 enabled API。
  - YAML 核验显示共 59 个 `api_code`、enabled 45 个；`storage_inbound_detail.enabled=false`、`param_source.limit=2000`、`exclude_existing_target=true`、`auto_advance=true`。
  - 覆盖矩阵核验显示公开文档 API 187 个、真实配置 API 51 个、enabled 45 个、configured disabled 6 个；销售表现 7 个拆分配置仍均为 disabled、`commit_per_page=true`、`data_date_param=beginDate`。
  - DB 前置核验显示 named lock 空闲、`information_schema.innodb_trx=0`；`storage_inbound_detail` 起点覆盖为 53506/174334，累计失败请求为 0。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api storage_inbound_detail` 通过，批次 `sync_20260711_084422_720644`，2000 次请求、2000 条成功计数、失败 0，批次耗时 1870 秒，API 耗时 1869 秒。
  - 本批次 raw 为 2000 条、2000 个 `source_primary_key`、2000 个不同主键、2000 个 `data_hash`、空主键 0，`data_date` 覆盖 `2025-01-13` 到 `2025-01-25`。
  - DB 核验显示 `storage_inbound_detail` 累计覆盖从 53506 增至 55506/174334，完成约 31.84%，剩余 118828；本批次和该 API 累计 `failed_request_log` 均为 0。
  - 同步结束后 named lock 已释放，`information_schema.innodb_trx=0`；本轮耗时较 12X 回落，未出现锁等待或残留事务。
- 当前结论：
  - `storage_inbound_detail` 仍不应 enabled；下一阶段 12Z 建议继续 2000 窗口回填，并完成 12X-12Z 三轮复盘。

## Stage 12Z

- 阶段目标：继续推进 `storage_inbound_detail` 2000 窗口缺失扫描回填，并完成 12X-12Z 三轮复盘。
- 已完成：
  - 前置核验显示工作区 `master...origin/master [ahead 17]` 且干净；最新提交为 `51222c6 Document storage inbound detail 12Y backfill`；`--test-token` 通过；dry-run 仍显示 45 个 enabled API。
  - YAML 核验显示共 59 个 `api_code`、enabled 45 个；`storage_inbound_detail.enabled=false`、`param_source.limit=2000`、`exclude_existing_target=true`、`auto_advance=true`。
  - 覆盖矩阵核验显示公开文档 API 187 个、真实配置 API 51 个、enabled 45 个、configured disabled 6 个；销售表现 7 个拆分配置仍均为 disabled、`commit_per_page=true`、`data_date_param=beginDate`。
  - DB 前置核验显示 named lock 空闲、`information_schema.innodb_trx=0`；`storage_inbound_detail` 起点覆盖为 55506/174334，累计失败请求为 0。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api storage_inbound_detail` 通过，批次 `sync_20260711_092336_648499`，2000 次请求、2000 条成功计数、失败 0，批次耗时 1513 秒，API 耗时 1512 秒。
  - 本批次 raw 为 2000 条、2000 个 `source_primary_key`、2000 个不同主键、2000 个 `data_hash`、空主键 0，`data_date` 覆盖 `2025-01-25` 到 `2025-02-25`。
  - DB 核验显示 `storage_inbound_detail` 累计覆盖从 55506 增至 57506/174334，完成约 32.99%，剩余 116828；本批次和该 API 累计 `failed_request_log` 均为 0。
  - 同步结束后 named lock 已释放，`information_schema.innodb_trx=0`；本轮耗时继续回落，未出现锁等待或残留事务。
- 12X-12Z 三轮复盘：
  - 三轮均使用 2000 窗口，分别补齐 2000 条，覆盖从 51506 推进到 57506/174334，净增 6000。
  - 三轮均为 2000 请求、2000 成功、0 失败；批次内主键和 hash 均唯一，空主键均为 0，`failed_request_log` 始终为 0。
  - named lock 和事务收口正常；每轮结束后 named lock 均释放，`information_schema.innodb_trx=0`。
  - 耗时为 2259 秒、1870 秒、1513 秒，连续两轮回落；当前 2000 窗口仍适合前台执行方式。
- 当前结论：
  - `storage_inbound_detail` 仍不应 enabled；下一阶段 13A 建议继续 2000 窗口回填，或先只读评估是否为该参数型详情接口引入短事务执行路径。

## Stage 13A

- 阶段目标：继续推进 `storage_inbound_detail` 2000 窗口缺失扫描回填，并观察 12X-12Z 复盘后耗时是否继续回落。
- 已完成：
  - 前置核验显示工作区 `master...origin/master [ahead 18]` 且干净；最新提交为 `0650d3f Document storage inbound detail 12Z backfill`；`--test-token` 通过；dry-run 仍显示 45 个 enabled API。
  - YAML 核验显示共 59 个 `api_code`、enabled 45 个；`storage_inbound_detail.enabled=false`、`param_source.limit=2000`、`exclude_existing_target=true`、`auto_advance=true`。
  - 覆盖矩阵核验显示公开文档 API 187 个、真实配置 API 51 个、enabled 45 个、configured disabled 6 个；销售表现 7 个拆分配置仍均为 disabled、`commit_per_page=true`、`data_date_param=beginDate`。
  - DB 前置核验显示 named lock 空闲、`information_schema.innodb_trx=0`；`storage_inbound_detail` 起点覆盖为 57506/174334，累计失败请求为 0。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api storage_inbound_detail` 通过，批次 `sync_20260711_095703_766673`，2000 次请求、2000 条成功计数、失败 0，批次耗时 1753 秒，API 耗时 1752 秒。
  - 本批次 raw 为 2000 条、2000 个 `source_primary_key`、2000 个不同主键、2000 个 `data_hash`、空主键 0，`data_date` 覆盖 `2025-02-25` 到 `2025-03-27`。
  - DB 核验显示 `storage_inbound_detail` 累计覆盖从 57506 增至 59506/174334，完成约 34.13%，剩余 114828；本批次和该 API 累计 `failed_request_log` 均为 0。
  - 运行约 25 分钟时只读诊断显示事务为 RUNNING、线程处于 Sleep、无 SQL 锁等待；同步最终自然完成，结束后 named lock 已释放且 `information_schema.innodb_trx=0`。
- 当前结论：
  - `storage_inbound_detail` 仍不应 enabled；下一阶段 13B 建议继续 2000 窗口回填，下一次三轮复盘放在 13C 完成后。

## Stage 13B

- 阶段目标：继续推进 `storage_inbound_detail` 2000 窗口缺失扫描回填，并为 13C 三轮复盘保留连续证据。
- 已完成：
  - 前置核验显示工作区 `master...origin/master [ahead 19]` 且干净；最新提交为 `817ddcb Document storage inbound detail 13A backfill`；`--test-token` 通过；dry-run 仍显示 45 个 enabled API。
  - YAML 核验显示共 59 个 `api_code`、enabled 45 个；`storage_inbound_detail.enabled=false`、`param_source.limit=2000`、`exclude_existing_target=true`、`auto_advance=true`。
  - 覆盖矩阵核验显示公开文档 API 187 个、真实配置 API 51 个、enabled 45 个、configured disabled 6 个；销售表现 7 个拆分配置仍均为 disabled、`commit_per_page=true`、`data_date_param=beginDate`。
  - DB 前置核验显示 named lock 空闲、`information_schema.innodb_trx=0`；`storage_inbound_detail` 起点覆盖为 59506/174334，累计失败请求为 0。
  - 本轮第一次后台启动后出现 named lock 被占用、`information_schema.innodb_trx=1`，但未生成新 `sync_batch` 且日志为 0 字节；确认对应为本轮创建的两个 Python 进程后已停止，复核 named lock 释放且 `information_schema.innodb_trx=0`。
  - 改为前台执行 `.\\.venv\\Scripts\\python.exe -m app.main --sync-api storage_inbound_detail` 后通过，批次 `sync_20260711_104132_862768`，2000 次请求、2000 条成功计数、失败 0，批次耗时 1665 秒，API 耗时 1663 秒。
  - 本批次 raw 为 2000 条、2000 个 `source_primary_key`、2000 个不同主键、2000 个 `data_hash`、空主键 0，`data_date` 覆盖 `2025-03-27` 到 `2025-05-15`。
  - DB 核验显示 `storage_inbound_detail` 累计覆盖从 59506 增至 61506/174334，完成约 35.28%，剩余 112828；本批次和该 API 累计 `failed_request_log` 均为 0。
  - 同步结束后 named lock 已释放，`information_schema.innodb_trx=0`；最终批次未出现锁等待或残留事务。
  - 验收命令通过：dry-run 45 个 enabled API、`compileall app tests`、92 个 unittest、`git diff --check`；`git diff --check` 仅提示文档 LF/CRLF 替换警告。
  - 最终 DB 复核显示覆盖 61506/174334、`failed_request_log` 累计 0、named lock 空闲、`information_schema.innodb_trx=0`。
- 当前结论：
  - `storage_inbound_detail` 仍不应 enabled；下一阶段 13C 建议继续 2000 窗口回填，并完成 13A-13C 三轮复盘。

## Stage 13C

- 阶段目标：继续推进 `storage_inbound_detail` 2000 窗口缺失扫描回填，并完成 13A-13C 三轮复盘。
- 已完成：
  - 前置核验显示工作区 `master...origin/master [ahead 20]` 且干净；最新提交为 `89135cc Document storage inbound detail 13B backfill`；`--test-token` 通过；dry-run 仍显示 45 个 enabled API。
  - YAML 核验显示共 59 个 `api_code`、enabled 45 个；`storage_inbound_detail.enabled=false`、`param_source.limit=2000`、`exclude_existing_target=true`、`auto_advance=true`。
  - 覆盖矩阵核验显示公开文档 API 187 个、真实配置 API 51 个、enabled 45 个、configured disabled 6 个；销售表现 7 个拆分配置仍均为 disabled、`commit_per_page=true`、`data_date_param=beginDate`。
  - DB 前置核验显示 named lock 空闲、外部 `information_schema.innodb_trx=0`；`storage_inbound_detail` 起点覆盖为 61506/174334，累计失败请求为 0。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api storage_inbound_detail` 通过，批次 `sync_20260711_111607_098213`，2000 次请求、2000 条成功计数、失败 0，批次耗时 1533 秒，API 耗时 1531 秒。
  - 本批次 raw 为 2000 条、2000 个 `source_primary_key`、2000 个不同主键、2000 个 `data_hash`、空主键 0，`data_date` 覆盖 `2025-05-16` 到 `2025-06-19`。
  - DB 核验显示 `storage_inbound_detail` 累计覆盖从 61506 增至 63506/174334，完成约 36.43%，剩余 110828；本批次和该 API 累计 `failed_request_log` 均为 0。
  - 同步结束后 named lock 已释放，外部 `information_schema.innodb_trx=0`；最终批次未出现锁等待或残留事务。
  - 验收命令通过：dry-run 45 个 enabled API、`compileall app tests`、92 个 unittest、`git diff --check`；`git diff --check` 仅提示文档 LF/CRLF 替换警告。
  - 最终 DB 复核显示覆盖 63506/174334、`failed_request_log` 累计 0、named lock 空闲、外部 `information_schema.innodb_trx=0`。
- 13A-13C 三轮复盘：
  - 三轮均使用 2000 窗口，分别补齐 2000 条，覆盖从 57506 推进到 63506/174334，净增 6000。
  - 三轮均为 2000 请求、2000 成功、0 失败；批次内主键和 hash 均唯一，空主键均为 0，`failed_request_log` 始终为 0。
  - named lock 和事务收口正常；13B 的后台启动异常未产生半截批次，停止本轮进程后锁和事务恢复干净，13C 前台执行收口正常。
  - 耗时为 1753 秒、1665 秒、1533 秒，连续两轮回落；当前 2000 窗口仍适合前台执行方式。
- 当前结论：
  - `storage_inbound_detail` 仍不应 enabled；下一阶段 13D 建议继续 2000 窗口回填，下一次三轮复盘放在 13F 完成后。

## Stage 13D

- 阶段目标：继续推进 `storage_inbound_detail` 2000 窗口缺失扫描回填，并为 13F 三轮复盘保留连续证据。
- 已完成：
  - 前置核验显示工作区 `master...origin/master [ahead 21]` 且干净；最新提交为 `b01da26 Document storage inbound detail 13C backfill`；`--test-token` 通过；dry-run 仍显示 45 个 enabled API。
  - YAML 核验显示共 59 个 `api_code`、enabled 45 个；`storage_inbound_detail.enabled=false`、`param_source.limit=2000`、`exclude_existing_target=true`、`auto_advance=true`。
  - 覆盖矩阵核验显示公开文档 API 187 个、真实配置 API 51 个、enabled 45 个、configured disabled 6 个；销售表现 7 个拆分配置仍均为 disabled、`commit_per_page=true`、`data_date_param=beginDate`。
  - DB 前置核验显示 named lock 空闲、外部 `information_schema.innodb_trx=0`；`storage_inbound_detail` 起点覆盖为 63506/174334，累计失败请求为 0。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api storage_inbound_detail` 通过，批次 `sync_20260711_114746_751848`，2000 次请求、2000 条成功计数、失败 0，批次耗时 1595 秒，API 耗时 1593 秒。
  - 本批次 raw 为 2000 条、2000 个 `source_primary_key`、2000 个不同主键、2000 个 `data_hash`、空主键 0，`data_date` 覆盖 `2025-03-08` 到 `2026-06-29`。
  - DB 核验显示 `storage_inbound_detail` 累计覆盖从 63506 增至 65506/174334，完成约 37.58%，剩余 108828；本批次和该 API 累计 `failed_request_log` 均为 0。
  - 同步结束后 named lock 已释放，外部 `information_schema.innodb_trx=0`；最终批次未出现锁等待或残留事务。
  - 验收命令通过：dry-run 45 个 enabled API、`compileall app tests`、92 个 unittest、`git diff --check`；`git diff --check` 仅提示文档 LF/CRLF 替换警告。
  - 最终 DB 复核显示覆盖 65506/174334、`failed_request_log` 累计 0、named lock 空闲、外部 `information_schema.innodb_trx=0`。
- 当前结论：
  - `storage_inbound_detail` 仍不应 enabled；下一阶段 13E 建议继续 2000 窗口回填，下一次三轮复盘放在 13F 完成后。

## Stage 13E

- 阶段目标：继续推进 `storage_inbound_detail` 2000 窗口缺失扫描回填，并为 13F 三轮复盘保留连续证据。
- 已完成：
  - 前置核验显示工作区 `master...origin/master [ahead 22]` 且干净；最新提交为 `f8f5015 Document storage inbound detail 13D backfill`；`--test-token` 通过；dry-run 仍显示 45 个 enabled API。
  - YAML 核验显示共 59 个 `api_code`、enabled 45 个；`storage_inbound_detail.enabled=false`、`param_source.limit=2000`、`exclude_existing_target=true`、`auto_advance=true`。
  - 覆盖矩阵核验显示公开文档 API 187 个、真实配置 API 51 个、enabled 45 个、configured disabled 6 个；销售表现 7 个拆分配置仍均为 disabled、`commit_per_page=true`、`data_date_param=beginDate`。
  - DB 前置核验显示 named lock 空闲、外部 `information_schema.innodb_trx=0`；`storage_inbound_detail` 起点覆盖为 65506/174334，累计失败请求为 0。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api storage_inbound_detail` 通过，批次 `sync_20260711_122050_679722`，2000 次请求、2000 条成功计数、失败 0，批次耗时 1486 秒，API 耗时 1485 秒。
  - 本批次 raw 为 2000 条、2000 个 `source_primary_key`、2000 个不同主键、2000 个 `data_hash`、空主键 0，`data_date` 覆盖 `2025-07-07` 到 `2025-08-04`。
  - DB 核验显示 `storage_inbound_detail` 累计覆盖从 65506 增至 67506/174334，完成约 38.72%，剩余 106828；本批次和该 API 累计 `failed_request_log` 均为 0。
  - 同步结束后 named lock 已释放，外部 `information_schema.innodb_trx=0`；最终批次未出现锁等待或残留事务。
  - 验收命令通过：dry-run 45 个 enabled API、`compileall app tests`、92 个 unittest、`git diff --check`；`git diff --check` 仅提示文档 LF/CRLF 替换警告。
  - 最终 DB 复核显示覆盖 67506/174334、`failed_request_log` 累计 0、named lock 空闲、外部 `information_schema.innodb_trx=0`。
- 当前结论：
  - `storage_inbound_detail` 仍不应 enabled；下一阶段 13F 建议继续 2000 窗口回填，并完成 13D-13F 三轮复盘。

## Stage 13F

- 阶段目标：继续推进 `storage_inbound_detail` 2000 窗口缺失扫描回填，并完成 13D-13F 三轮复盘。
- 已完成：
  - 前置核验显示工作区 `master...origin/master [ahead 23]` 且干净；最新提交为 `7a94430 Document storage inbound detail 13E backfill`；`--test-token` 通过；dry-run 仍显示 45 个 enabled API。
  - YAML 核验显示共 59 个 `api_code`、enabled 45 个；`storage_inbound_detail.enabled=false`、`param_source.limit=2000`、`exclude_existing_target=true`、`auto_advance=true`。
  - 覆盖矩阵核验显示公开文档 API 187 个、真实配置 API 51 个、enabled 45 个、configured disabled 6 个；销售表现 7 个拆分配置仍均为 disabled、`commit_per_page=true`、`data_date_param=beginDate`。
  - DB 前置核验显示 named lock 空闲、外部 `information_schema.innodb_trx=0`；`storage_inbound_detail` 起点覆盖为 67506/174334，累计失败请求为 0。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api storage_inbound_detail` 通过，批次 `sync_20260711_125139_974360`，2000 次请求、2000 条成功计数、失败 0，批次耗时 1729 秒，API 耗时 1726 秒。
  - 本批次 raw 为 2000 条、2000 个 `source_primary_key`、2000 个不同主键、2000 个 `data_hash`、空主键 0，`data_date` 覆盖 `2025-08-04` 到 `2025-09-16`。
  - DB 核验显示 `storage_inbound_detail` 累计覆盖从 67506 增至 69506/174334，完成约 39.87%，剩余 104828；本批次和该 API 累计 `failed_request_log` 均为 0。
  - 同步结束后 named lock 已释放，外部 `information_schema.innodb_trx=0`；最终批次未出现锁等待或残留事务。
  - 13D-13F 三轮复盘：三轮 2000 窗口均成功，覆盖从 63506 推进到 69506/174334，净增 6000；主键、hash、失败日志和事务收口均正常。
  - 13D-13F 三轮复盘：耗时为 1595 秒、1486 秒、1729 秒，13F 较 13E 回升但仍低于此前 12U-12X 的 30 分钟以上区间；当前 2000 窗口仍适合前台执行方式。
  - 验收命令通过：dry-run 45 个 enabled API、`compileall app tests`、92 个 unittest、`git diff --check`；`git diff --check` 仅提示文档 LF/CRLF 替换警告。
  - 最终 DB 复核显示覆盖 69506/174334、`failed_request_log` 累计 0、named lock 空闲、外部 `information_schema.innodb_trx=0`。
- 当前结论：
  - `storage_inbound_detail` 仍不应 enabled；下一阶段 13G 建议继续 2000 窗口回填，并持续观察耗时波动。

## Stage 13G

- 阶段目标：继续推进 `storage_inbound_detail` 2000 窗口缺失扫描回填，并为 13I 三轮复盘保留连续证据。
- 已完成：
  - 前置核验显示工作区 `master...origin/master [ahead 24]` 且干净；最新提交为 `09314cf Document storage inbound detail 13F backfill`；`--test-token` 通过；dry-run 仍显示 45 个 enabled API。
  - YAML 核验显示共 59 个 `api_code`、enabled 45 个；`storage_inbound_detail.enabled=false`、`param_source.limit=2000`、`exclude_existing_target=true`、`auto_advance=true`。
  - 覆盖矩阵核验显示公开文档 API 187 个、真实配置 API 51 个、enabled 45 个、configured disabled 6 个；销售表现 7 个拆分配置仍均为 disabled、`commit_per_page=true`、`data_date_param=beginDate`。
  - DB 前置核验显示 named lock 空闲、外部 `information_schema.innodb_trx=0`；`storage_inbound_detail` 起点覆盖为 69506/174334，累计失败请求为 0。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api storage_inbound_detail` 通过，批次 `sync_20260711_132609_580441`，2000 次请求、2000 条成功计数、失败 0，批次耗时 1588 秒，API 耗时 1587 秒。
  - 本批次 raw 为 2000 条、2000 个 `source_primary_key`、2000 个不同主键、2000 个 `data_hash`、空主键 0，`data_date` 覆盖 `2025-09-16` 到 `2025-11-04`。
  - DB 核验显示 `storage_inbound_detail` 累计覆盖从 69506 增至 71506/174334，完成约 41.02%，剩余 102828；本批次和该 API 累计 `failed_request_log` 均为 0。
  - 同步结束后 named lock 已释放，外部 `information_schema.innodb_trx=0`；最终批次未出现锁等待或残留事务。
  - 验收命令通过：dry-run 45 个 enabled API、`compileall app tests`、92 个 unittest、`git diff --check`；`git diff --check` 仅提示文档 LF/CRLF 替换警告。
  - 最终 DB 复核显示覆盖 71506/174334、`failed_request_log` 累计 0、named lock 空闲、外部 `information_schema.innodb_trx=0`。
- 当前结论：
  - `storage_inbound_detail` 仍不应 enabled；下一阶段 13H 建议继续 2000 窗口回填，下一次三轮复盘放在 13I 完成后。

## Stage 13H

- 阶段目标：继续推进 `storage_inbound_detail` 2000 窗口缺失扫描回填，并为 13I 三轮复盘保留连续证据。
- 已完成：
  - 前置核验显示工作区 `master...origin/master [ahead 25]` 且干净；最新提交为 `988d0e8 Document storage inbound detail 13G backfill`；`--test-token` 通过；dry-run 仍显示 45 个 enabled API。
  - YAML 核验显示共 59 个 `api_code`、enabled 45 个；`storage_inbound_detail.enabled=false`、`param_source.limit=2000`、`exclude_existing_target=true`、`auto_advance=true`。
  - 覆盖矩阵核验显示公开文档 API 187 个、真实配置 API 51 个、enabled 45 个、configured disabled 6 个；销售表现 7 个拆分配置仍均为 disabled、`commit_per_page=true`、`data_date_param=beginDate`。
  - DB 前置核验显示 named lock 空闲、外部 `information_schema.innodb_trx=0`；`storage_inbound_detail` 起点覆盖为 71506/174334，累计失败请求为 0。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api storage_inbound_detail` 通过，批次 `sync_20260711_135800_183626`，2000 次请求、2000 条成功计数、失败 0，批次耗时 1644 秒，API 耗时 1642 秒。
  - 本批次 raw 为 2000 条、2000 个 `source_primary_key`、2000 个不同主键、2000 个 `data_hash`、空主键 0，`data_date` 覆盖 `2025-11-04` 到 `2025-11-13`。
  - DB 核验显示 `storage_inbound_detail` 累计覆盖从 71506 增至 73506/174334，完成约 42.16%，剩余 100828；本批次和该 API 累计 `failed_request_log` 均为 0。
  - 同步结束后 named lock 已释放，外部 `information_schema.innodb_trx=0`；最终批次未出现锁等待或残留事务。
  - 验收命令通过：dry-run 45 个 enabled API、`compileall app tests`、92 个 unittest、`git diff --check`；`git diff --check` 仅提示文档 LF/CRLF 替换警告。
  - 最终 DB 复核显示覆盖 73506/174334、`failed_request_log` 累计 0、named lock 空闲、外部 `information_schema.innodb_trx=0`。
- 当前结论：
  - `storage_inbound_detail` 仍不应 enabled；下一阶段 13I 建议继续 2000 窗口回填，并完成 13G-13I 三轮复盘。

## Stage 13I

- 阶段目标：继续推进 `storage_inbound_detail` 2000 窗口缺失扫描回填，并完成 13G-13I 三轮复盘。
- 已完成：
  - 前置核验显示工作区 `master...origin/master [ahead 26]` 且干净；最新提交为 `80d3b60 Document storage inbound detail 13H backfill`；`--test-token` 通过；dry-run 仍显示 45 个 enabled API。
  - YAML 核验显示共 59 个 `api_code`、enabled 45 个；`storage_inbound_detail.enabled=false`、`param_source.limit=2000`、`exclude_existing_target=true`、`auto_advance=true`。
  - 覆盖矩阵核验显示公开文档 API 187 个、真实配置 API 51 个、enabled 45 个、configured disabled 6 个；销售表现 7 个拆分配置仍均为 disabled、`commit_per_page=true`、`data_date_param=beginDate`。
  - DB 前置核验显示 named lock 空闲、外部 `information_schema.innodb_trx=0`；`storage_inbound_detail` 起点覆盖为 73506/174334，累计失败请求为 0。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api storage_inbound_detail` 通过，批次 `sync_20260711_143112_733218`，2000 次请求、2000 条成功计数、失败 0，批次耗时 1474 秒，API 耗时 1472 秒。
  - 本批次 raw 为 2000 条、2000 个 `source_primary_key`、2000 个不同主键、2000 个 `data_hash`、空主键 0，`data_date` 覆盖 `2025-11-13` 到 `2025-11-22`。
  - DB 核验显示 `storage_inbound_detail` 累计覆盖从 73506 增至 75506/174334，完成约 43.31%，剩余 98828；本批次和该 API 累计 `failed_request_log` 均为 0。
  - 同步结束后 named lock 已释放，外部 `information_schema.innodb_trx=0`；最终批次未出现锁等待或残留事务。
  - 13G-13I 三轮复盘：三轮 2000 窗口均成功，覆盖从 69506 推进到 75506/174334，净增 6000；主键、hash、失败日志和事务收口均正常。
  - 13G-13I 三轮复盘：耗时为 1588 秒、1644 秒、1474 秒，13I 明显回落；当前 2000 窗口仍适合前台执行方式。
  - 验收命令通过：dry-run 45 个 enabled API、`compileall app tests`、92 个 unittest、`git diff --check`；`git diff --check` 仅提示文档 LF/CRLF 替换警告。
  - 最终 DB 复核显示覆盖 75506/174334、`failed_request_log` 累计 0、named lock 空闲、外部 `information_schema.innodb_trx=0`。
- 当前结论：
  - `storage_inbound_detail` 仍不应 enabled；下一阶段 13J 建议继续 2000 窗口回填，下一次三轮复盘放在 13L 完成后。

## Stage 13J

- 阶段目标：继续推进 `storage_inbound_detail` 2000 窗口缺失扫描回填，为 13L 三轮复盘积累第一轮证据。
- 已完成：
  - 前置核验显示工作区 `master...origin/master [ahead 27]` 且干净；最新提交为 `a8edef1 Document storage inbound detail 13I backfill`；`--test-token` 通过；dry-run 仍显示 45 个 enabled API。
  - YAML 核验显示共 59 个 `api_code`、enabled 45 个；`storage_inbound_detail.enabled=false`、`param_source.limit=2000`、`exclude_existing_target=true`、`auto_advance=true`。
  - 覆盖矩阵核验显示公开文档 API 187 个、真实配置 API 51 个、enabled 45 个、configured disabled 6 个；销售表现 7 个拆分配置仍均为 disabled、`commit_per_page=true`、`data_date_param=beginDate`。
  - DB 前置核验显示 named lock 空闲、外部 `information_schema.innodb_trx=0`；`storage_inbound_detail` 起点覆盖为 75506/174334，累计失败请求为 0。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api storage_inbound_detail` 通过，批次 `sync_20260711_150318_718092`，2000 次请求、2000 条成功计数、失败 0，批次耗时 1567 秒，API 耗时 1566 秒。
  - 本批次 raw 为 2000 条、2000 个 `source_primary_key`、2000 个不同主键、2000 个 `data_hash`、空主键 0，`data_date` 覆盖 `2025-11-22` 到 `2025-12-02`。
  - DB 核验显示 `storage_inbound_detail` 累计覆盖从 75506 增至 77506/174334，完成约 44.46%，剩余 96828；本批次和该 API 累计 `failed_request_log` 均为 0。
  - 同步结束后 named lock 已释放，外部 `information_schema.innodb_trx=0`；最终批次未出现锁等待或残留事务。
  - 验收命令通过：dry-run 45 个 enabled API、`compileall app tests`、92 个 unittest、`git diff --check`；`git diff --check` 仅提示文档 LF/CRLF 替换警告。
  - 最终 DB 复核显示覆盖 77506/174334、`failed_request_log` 累计 0、named lock 空闲、外部 `information_schema.innodb_trx=0`。
- 当前结论：
  - `storage_inbound_detail` 仍不应 enabled；下一阶段 13K 建议继续 2000 窗口回填，下一次三轮复盘放在 13L 完成后。

## Stage 13K

- 阶段目标：继续推进 `storage_inbound_detail` 2000 窗口缺失扫描回填，为 13L 三轮复盘积累第二轮证据。
- 已完成：
  - 前置核验显示工作区 `master...origin/master [ahead 28]` 且干净；最新提交为 `4a53f3a Document storage inbound detail 13J backfill`；`--test-token` 通过；dry-run 仍显示 45 个 enabled API。
  - YAML 核验显示共 59 个 `api_code`、enabled 45 个；`storage_inbound_detail.enabled=false`、`param_source.limit=2000`、`exclude_existing_target=true`、`auto_advance=true`。
  - 覆盖矩阵核验显示公开文档 API 187 个、真实配置 API 51 个、enabled 45 个、configured disabled 6 个；销售表现 7 个拆分配置仍均为 disabled、`commit_per_page=true`、`data_date_param=beginDate`、`rate_limit.sleep_seconds=20`。
  - DB 前置核验显示 named lock 空闲、外部 `information_schema.innodb_trx=0`；`storage_inbound_detail` 起点覆盖为 77506/174334，累计失败请求为 0。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api storage_inbound_detail` 通过，批次 `sync_20260711_153428_727704`，2000 次请求、2000 条成功计数、失败 0，批次耗时 1396 秒，API 耗时 1394 秒。
  - 本批次 raw 为 2000 条、2000 个 `source_primary_key`、2000 个不同主键、2000 个 `data_hash`、空主键 0，`data_date` 覆盖 `2025-12-02` 到 `2025-12-03`。
  - DB 核验显示 `storage_inbound_detail` 累计覆盖从 77506 增至 79506/174334，完成约 45.61%，剩余 94828；本批次和该 API 累计 `failed_request_log` 均为 0。
  - 同步结束后 named lock 已释放，外部 `information_schema.innodb_trx=0`；最终批次未出现锁等待或残留事务。
  - 验收命令通过：dry-run 45 个 enabled API、`compileall app tests`、92 个 unittest、`git diff --check`；`git diff --check` 仅提示文档 LF/CRLF 替换警告。
  - 最终 DB 复核显示覆盖 79506/174334、`failed_request_log` 累计 0、named lock 空闲、外部 `information_schema.innodb_trx=0`。
- 当前结论：
  - `storage_inbound_detail` 仍不应 enabled；下一阶段 13L 建议继续 2000 窗口回填，并完成 13J-13L 三轮复盘。

## Stage 13L

- 阶段目标：继续推进 `storage_inbound_detail` 2000 窗口缺失扫描回填，并完成 13J-13L 三轮复盘。
- 已完成：
  - 前置核验显示工作区 `master...origin/master [ahead 29]` 且干净；最新提交为 `f7f2135 Document storage inbound detail 13K backfill`；`--test-token` 通过；dry-run 仍显示 45 个 enabled API。
  - YAML 核验显示共 59 个 `api_code`、enabled 45 个；`storage_inbound_detail.enabled=false`、`param_source.limit=2000`、`exclude_existing_target=true`、`auto_advance=true`。
  - 覆盖矩阵核验显示公开文档 API 187 个、真实配置 API 51 个、enabled 45 个、configured disabled 6 个；销售表现 7 个拆分配置仍均为 disabled、`commit_per_page=true`、`data_date_param=beginDate`、`rate_limit.sleep_seconds=20`。
  - DB 前置核验显示 named lock 空闲、外部 `information_schema.innodb_trx=0`；`storage_inbound_detail` 起点覆盖为 79506/174334，累计失败请求为 0。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api storage_inbound_detail` 通过，批次 `sync_20260711_160250_409869`，2000 次请求、2000 条成功计数、失败 0，批次耗时 1944 秒，API 耗时 1942 秒。
  - 本批次 raw 为 2000 条、2000 个 `source_primary_key`、2000 个不同主键、2000 个 `data_hash`、空主键 0，`data_date` 覆盖 `2025-12-03` 到 `2025-12-05`。
  - DB 核验显示 `storage_inbound_detail` 累计覆盖从 79506 增至 81506/174334，完成约 46.75%，剩余 92828；本批次和该 API 累计 `failed_request_log` 均为 0。
  - 同步结束后 named lock 已释放，外部 `information_schema.innodb_trx=0`；最终批次未出现锁等待或残留事务。
  - 13J-13L 三轮复盘：三轮 2000 窗口均成功，覆盖从 75506 推进到 81506/174334，净增 6000；主键、hash、失败日志和事务收口均正常。
  - 13J-13L 三轮复盘：耗时为 1567 秒、1396 秒、1944 秒，13L 明显回升但仍自然完成；当前 2000 窗口仍适合前台执行，后续继续观察耗时波动。
  - 验收命令通过：dry-run 45 个 enabled API、`compileall app tests`、92 个 unittest、`git diff --check`；`git diff --check` 仅提示文档 LF/CRLF 替换警告。
  - 最终 DB 复核显示覆盖 81506/174334、`failed_request_log` 累计 0、named lock 空闲、外部 `information_schema.innodb_trx=0`。
- 当前结论：
  - `storage_inbound_detail` 仍不应 enabled；下一阶段 13M 建议继续 2000 窗口回填，下一次三轮复盘放在 13O 完成后。

## Stage 13M

- 阶段目标：继续推进 `storage_inbound_detail` 2000 窗口缺失扫描回填，为 13O 三轮复盘积累第一轮证据。
- 已完成：
  - 前置核验显示工作区 `master...origin/master [ahead 30]` 且干净；最新提交为 `4c503fe Document storage inbound detail 13L backfill`；`--test-token` 通过；dry-run 仍显示 45 个 enabled API。
  - YAML 核验显示共 59 个 `api_code`、enabled 45 个；`storage_inbound_detail.enabled=false`、`param_source.limit=2000`、`exclude_existing_target=true`、`auto_advance=true`。
  - 覆盖矩阵核验显示公开文档 API 187 个、真实配置 API 51 个、enabled 45 个、configured disabled 6 个；销售表现 7 个拆分配置仍均为 disabled、`commit_per_page=true`、`data_date_param=beginDate`、`rate_limit.sleep_seconds=20`。
  - DB 前置核验显示 named lock 空闲、外部 `information_schema.innodb_trx=0`；`storage_inbound_detail` 起点覆盖为 81506/174334，累计失败请求为 0。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api storage_inbound_detail` 通过，批次 `sync_20260711_164043_135730`，2000 次请求、2000 条成功计数、失败 0，批次耗时 1654 秒，API 耗时 1652 秒。
  - 本批次 raw 为 2000 条、2000 个 `source_primary_key`、2000 个不同主键、2000 个 `data_hash`、空主键 0，`data_date` 覆盖 `2025-12-05` 到 `2025-12-06`。
  - DB 核验显示 `storage_inbound_detail` 累计覆盖从 81506 增至 83506/174334，完成约 47.90%，剩余 90828；本批次和该 API 累计 `failed_request_log` 均为 0。
  - 同步结束后 named lock 已释放，外部 `information_schema.innodb_trx=0`；最终批次未出现锁等待或残留事务。
  - 验收命令通过：dry-run 45 个 enabled API、`compileall app tests`、92 个 unittest、`git diff --check`；`git diff --check` 仅提示文档 LF/CRLF 替换警告。
  - 最终 DB 复核显示覆盖 83506/174334、`failed_request_log` 累计 0、named lock 空闲、外部 `information_schema.innodb_trx=0`。
- 当前结论：
  - `storage_inbound_detail` 仍不应 enabled；下一阶段 13N 建议继续 2000 窗口回填，下一次三轮复盘放在 13O 完成后。

## Stage 13N

- 阶段目标：继续推进 `storage_inbound_detail` 2000 窗口缺失扫描回填，为 13O 三轮复盘积累第二轮证据。
- 已完成：
  - 前置核验显示工作区 `master...origin/master [ahead 31]` 且干净；最新提交为 `029b44f Document storage inbound detail 13M backfill`；`--test-token` 通过；dry-run 仍显示 45 个 enabled API。
  - YAML 核验显示共 59 个 `api_code`、enabled 45 个；`storage_inbound_detail.enabled=false`、`param_source.limit=2000`、`exclude_existing_target=true`、`auto_advance=true`。
  - 覆盖矩阵核验显示公开文档 API 187 个、真实配置 API 51 个、enabled 45 个、configured disabled 6 个；销售表现 7 个拆分配置仍均为 disabled、`commit_per_page=true`、`data_date_param=beginDate`、`rate_limit.sleep_seconds=20`。
  - DB 前置核验显示 named lock 空闲、外部 `information_schema.innodb_trx=0`；`storage_inbound_detail` 起点覆盖为 83506/174334，累计失败请求为 0。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api storage_inbound_detail` 通过，批次 `sync_20260711_171343_254803`，2000 次请求、2000 条成功计数、失败 0，批次耗时 1792 秒，API 耗时 1789 秒。
  - 本批次 raw 为 2000 条、2000 个 `source_primary_key`、2000 个不同主键、2000 个 `data_hash`、空主键 0，`data_date` 覆盖 `2025-12-06` 到 `2025-12-09`。
  - DB 核验显示 `storage_inbound_detail` 累计覆盖从 83506 增至 85506/174334，完成约 49.05%，剩余 88828；本批次和该 API 累计 `failed_request_log` 均为 0。
  - 同步结束后 named lock 已释放，外部 `information_schema.innodb_trx=0`；最终批次未出现锁等待或残留事务。
  - 验收命令通过：dry-run 45 个 enabled API、`compileall app tests`、92 个 unittest、`git diff --check`；`git diff --check` 仅提示文档 LF/CRLF 替换警告。
  - 最终 DB 复核显示覆盖 85506/174334、`failed_request_log` 累计 0、named lock 空闲、外部 `information_schema.innodb_trx=0`。
- 当前结论：
  - `storage_inbound_detail` 仍不应 enabled；下一阶段 13O 建议继续 2000 窗口回填，并完成 13M-13O 三轮复盘。

## Stage 13O

- 阶段目标：继续推进 `storage_inbound_detail` 2000 窗口缺失扫描回填，并完成 13M-13O 三轮复盘。
- 已完成：
  - 前置核验显示工作区 `master...origin/master [ahead 32]` 且干净；最新提交为 `caa0c12 Document storage inbound detail 13N backfill`；`--test-token` 通过；dry-run 仍显示 45 个 enabled API。
  - YAML 核验显示共 59 个 `api_code`、enabled 45 个；`storage_inbound_detail.enabled=false`、`param_source.limit=2000`、`exclude_existing_target=true`、`auto_advance=true`。
  - 覆盖矩阵核验显示公开文档 API 187 个、真实配置 API 51 个、enabled 45 个、configured disabled 6 个；销售表现 7 个拆分配置仍均为 disabled、`commit_per_page=true`、`data_date_param=beginDate`、`rate_limit.sleep_seconds=20`。
  - DB 前置核验显示 named lock 空闲、外部 `information_schema.innodb_trx=0`；`storage_inbound_detail` 起点覆盖为 85506/174334，累计失败请求为 0。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api storage_inbound_detail` 通过，批次 `sync_20260711_175024_981468`，2000 次请求、2000 条成功计数、失败 0，批次耗时 1769 秒，API 耗时 1767 秒。
  - 本批次 raw 为 2000 条、2000 个 `source_primary_key`、2000 个不同主键、2000 个 `data_hash`、空主键 0，`data_date` 覆盖 `2025-12-09` 到 `2025-12-16`。
  - DB 核验显示 `storage_inbound_detail` 累计覆盖从 85506 增至 87506/174334，完成约 50.19%，剩余 86828；本批次和该 API 累计 `failed_request_log` 均为 0。
  - 同步结束后 named lock 已释放，外部 `information_schema.innodb_trx=0`；最终批次未出现锁等待或残留事务。
  - 13M-13O 三轮复盘：三轮 2000 窗口均成功，覆盖从 81506 推进到 87506/174334，净增 6000；主键、hash、失败日志和事务收口均正常。
  - 13M-13O 三轮复盘：耗时为 1654 秒、1792 秒、1769 秒，三轮都在约 30 分钟内自然完成；当前 2000 窗口仍适合前台执行方式。
  - 验收命令通过：dry-run 45 个 enabled API、`compileall app tests`、92 个 unittest、`git diff --check`；`git diff --check` 仅提示文档 LF/CRLF 替换警告。
  - 最终 DB 复核显示覆盖 87506/174334、`failed_request_log` 累计 0、named lock 空闲、外部 `information_schema.innodb_trx=0`。
- 当前结论：
  - `storage_inbound_detail` 仍不应 enabled；下一阶段 13P 建议继续 2000 窗口回填，下一次三轮复盘放在 13R 完成后。

## Stage 13P

- 阶段目标：继续推进 `storage_inbound_detail` 2000 窗口缺失扫描回填，并处理本轮暴露的同步任务锁释放稳定性问题。
- 已完成：
  - 前置核验显示工作区 `master...origin/master [ahead 33]` 且干净；最新提交为 `5850d0b Document storage inbound detail 13O backfill`；`--test-token` 通过；dry-run 仍显示 45 个 enabled API。
  - YAML 核验显示共 59 个 `api_code`、enabled 45 个；`storage_inbound_detail.enabled=false`、`param_source.limit=2000`、`exclude_existing_target=true`、`auto_advance=true`。
  - 覆盖矩阵核验显示公开文档 API 187 个、真实配置 API 51 个、enabled 45 个、configured disabled 6 个；销售表现 7 个拆分配置仍均为 disabled、`commit_per_page=true`、`data_date_param=beginDate`、`rate_limit.sleep_seconds=20`。
  - DB 前置核验显示 named lock 空闲、外部 `information_schema.innodb_trx=0`；`storage_inbound_detail` 起点覆盖为 87506/174334，累计失败请求为 0。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api storage_inbound_detail` 输出通用失败并以退出码 1 结束，但数据库只读核验显示批次 `sync_20260711_182507_314696` 实际已成功，2000 次请求、2000 条成功计数、失败 0，批次耗时 1604 秒，API 耗时 1601 秒。
  - 本批次 raw 为 2000 条、2000 个 `source_primary_key`、2000 个不同主键、2000 个 `data_hash`、空主键 0，`data_date` 覆盖 `2025-12-16` 到 `2026-01-22`。
  - DB 核验显示 `storage_inbound_detail` 累计覆盖从 87506 增至 89506/174334，完成约 51.34%，剩余 84828；本批次和该 API 累计 `failed_request_log` 均为 0。
  - 同步结束后 named lock 已释放，外部 `information_schema.innodb_trx=0`；最终批次未出现锁等待或残留事务。
  - 已定位本轮 CLI false failure 的最小可测边界：任务体已成功但 `RELEASE_LOCK` 阶段抛出 `SQLAlchemyError` 时，旧代码会把成功任务误报为失败。
  - 已新增回归测试 `test_release_failure_after_successful_task_does_not_fail_task`，并将 `_sync_task_lock` 调整为只在释放锁失败时记录 warning，不再覆盖已成功任务的退出结果；原有拿不到锁和任务体异常释放锁测试仍通过。
  - 验收命令通过：dry-run 45 个 enabled API、`compileall app tests`、93 个 unittest、`git diff --check`；`git diff --check` 仅提示代码和文档 LF/CRLF 替换警告。
  - 最终 DB 复核显示覆盖 89506/174334、`failed_request_log` 累计 0、named lock 空闲、外部 `information_schema.innodb_trx=0`。
- 当前结论：
  - `storage_inbound_detail` 仍不应 enabled；下一阶段 13Q 建议继续 2000 窗口回填，继续观察锁释放 warning 是否复现，下一次三轮复盘放在 13R 完成后。

## Stage 13Q

- 阶段目标：继续推进 `storage_inbound_detail` 2000 窗口缺失扫描回填，并观察 13P 锁释放 false failure 修复后的 CLI 结果。
- 已完成：
  - 前置核验显示工作区 `master...origin/master [ahead 34]` 且干净；最新提交为 `3de0725 Document storage inbound detail 13P backfill`；`--test-token` 通过；dry-run 仍显示 45 个 enabled API。
  - YAML 核验显示共 59 个 `api_code`、enabled 45 个；`storage_inbound_detail.enabled=false`、`param_source.limit=2000`、`exclude_existing_target=true`、`auto_advance=true`。
  - 覆盖矩阵核验显示公开文档 API 187 个、真实配置 API 51 个、enabled 45 个、configured disabled 6 个；销售表现 7 个拆分配置仍均为 disabled、`commit_per_page=true`、`data_date_param=beginDate`、`rate_limit.sleep_seconds=20`。
  - DB 前置核验显示 named lock 空闲、外部 `information_schema.innodb_trx=0`；`storage_inbound_detail` 起点覆盖为 89506/174334，累计失败请求为 0。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api storage_inbound_detail` 正常返回 0，批次 `sync_20260711_190058_925775`，2000 次请求、2000 条成功计数、失败 0，批次耗时 1497 秒，API 耗时 1495 秒。
  - 本批次 raw 为 2000 条、2000 个 `source_primary_key`、2000 个不同主键、2000 个 `data_hash`、空主键 0，`data_date` 覆盖 `2025-09-04` 到 `2026-06-02`。
  - DB 核验显示 `storage_inbound_detail` 累计覆盖从 89506 增至 91506/174334，完成约 52.49%，剩余 82828；本批次和该 API 累计 `failed_request_log` 均为 0。
  - 同步结束后 named lock 已释放，外部 `information_schema.innodb_trx=0`；最终批次未出现锁等待或残留事务。
  - 13P 的锁释放 false failure 修复后，本轮 CLI 与 DB 状态一致：终端成功返回，DB 批次成功，未观察到锁释放 warning。
  - 验收命令通过：dry-run 45 个 enabled API、`compileall app tests`、93 个 unittest、`git diff --check`；`git diff --check` 仅提示文档 LF/CRLF 替换警告。
  - 最终 DB 复核显示覆盖 91506/174334、`failed_request_log` 累计 0、named lock 空闲、外部 `information_schema.innodb_trx=0`。
  - 当前结论：
  - `storage_inbound_detail` 仍不应 enabled；下一阶段 13R 建议继续 2000 窗口回填，并完成 13P-13R 三轮复盘。

## Stage 13R

- 阶段目标：继续推进 `storage_inbound_detail` 2000 窗口缺失扫描回填，并完成 13P-13R 三轮复盘。
- 已完成：
  - 前置核验显示工作区 `master...origin/master [ahead 35]` 且干净；最新提交为 `71c3f67 Document storage inbound detail 13Q backfill`；dry-run 仍显示 45 个 enabled API。
  - YAML 核验显示共 59 个 `api_code`、enabled 45 个；`storage_inbound_detail.enabled=false`、`param_source.limit=2000`、`exclude_existing_target=true`、`auto_advance=true`。
  - 覆盖矩阵核验显示公开文档 API 187 个、真实配置 API 51 个、enabled 45 个、configured disabled 6 个；销售表现 7 个拆分配置仍全部 disabled、`commit_per_page=true`、`data_date_param=beginDate`、`rate_limit.sleep_seconds=20`。
  - DB 前置核验显示 named lock 空闲、外部 `information_schema.innodb_trx=0`；`storage_inbound_detail` 起点覆盖为 91506/174334，累计失败请求为 0。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api storage_inbound_detail` 正常返回 0，批次 `sync_20260711_193306_928252`，2000 次请求、2000 条成功计数、失败 0，批次耗时 1272 秒，API 耗时 1270 秒。
  - 本批次 raw 为 2000 条、2000 个 `source_primary_key`、2000 个不同主键、2000 个 `data_hash`、空主键 0，`data_date` 覆盖 `2025-11-12` 到 `2025-11-25`。
  - DB 核验显示 `storage_inbound_detail` 累计覆盖从 91506 增至 93506/174334，完成约 53.64%，剩余 80828；本批次和该 API 累计 `failed_request_log` 均为 0。
  - 同步结束后 named lock 已释放，外部 `information_schema.innodb_trx=0`；最终批次未出现锁等待或残留事务。
  - 13P-13R 三轮复盘：三轮均使用 2000 窗口并各补齐 2000 条，覆盖从 87506 推进到 93506/174334，净增 6000；13P 数据实际成功但暴露锁释放 false failure，13Q 与 13R CLI 均正常返回 0，修复后未复现该问题。
  - 13P-13R 三轮复盘：三轮均为 2000 请求、2000 成功、0 失败；批内主键和 hash 均唯一，空主键 0，`failed_request_log` 始终为 0；named lock 和外部事务收口正常。
  - 验收命令通过：dry-run 45 个 enabled API、`compileall app tests`、93 个 unittest、`git diff --check`；`git diff --check` 仅提示文档 LF/CRLF 替换警告。
  - 最终 DB 复核显示覆盖 93506/174334、`failed_request_log` 累计 0、named lock 空闲、外部 `information_schema.innodb_trx=0`。
  - 当前结论：
  - `storage_inbound_detail` 仍不应 enabled；下一阶段 13S 建议继续 2000 窗口回填。按新目标模式，13Q-13R 已完成 2 轮，下一轮 13S 完成后做 13Q-13S 复盘和整体规划。

## Stage 13S

- 阶段目标：继续推进 `storage_inbound_detail` 2000 窗口缺失扫描回填，并按新目标模式完成 13Q-13S 复盘和整体规划。
- 已完成：
  - 前置核验显示工作区 `master...origin/master [ahead 36]` 且干净；最新提交为 `bb37e18 Document storage inbound detail 13R backfill`；dry-run 仍显示 45 个 enabled API。
  - YAML 核验显示共 59 个 `api_code`、enabled 45 个；`storage_inbound_detail.enabled=false`、`param_source.limit=2000`、`exclude_existing_target=true`、`auto_advance=true`。
  - 覆盖矩阵核验显示公开文档 API 187 个、真实配置 API 51 个、enabled 45 个、configured disabled 6 个；销售表现 7 个拆分配置仍全部 disabled、`commit_per_page=true`、`data_date_param=beginDate`、`rate_limit.sleep_seconds=20`。
  - DB 前置核验显示 named lock 空闲、外部 `information_schema.innodb_trx=0`；`storage_inbound_detail` 起点覆盖为 93506/174334，累计失败请求为 0。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api storage_inbound_detail` 正常返回 0，批次 `sync_20260711_195939_221698`，2000 次请求、2000 条成功计数、失败 0，批次耗时 1490 秒，API 耗时 1488 秒。
  - 本批次 raw 为 2000 条、2000 个 `source_primary_key`、2000 个不同主键、2000 个 `data_hash`、空主键 0，`data_date` 覆盖 `2025-11-25` 到 `2025-12-03`。
  - DB 核验显示 `storage_inbound_detail` 累计覆盖从 93506 增至 95506/174334，完成约 54.78%，剩余 78828；本批次和该 API 累计 `failed_request_log` 均为 0。
  - 同步结束后 named lock 已释放，外部 `information_schema.innodb_trx=0`；最终批次未出现锁等待或残留事务。
  - 13Q-13S 复盘：三轮均使用 2000 窗口并各补齐 2000 条，覆盖从 89506 推进到 95506/174334，净增 6000；三轮 CLI 均正常返回 0，未复现 13P 的锁释放 false failure。
  - 13Q-13S 复盘：三轮均为 2000 请求、2000 成功、0 失败；批内主键和 hash 均唯一，空主键 0，`failed_request_log` 始终为 0；named lock 和外部事务收口正常。
  - 13Q-13S 整体规划：继续以 `storage_inbound_detail` 2000 窗口推进完整拉取，暂不提升到 5000；销售表现仍保持 disabled，进入 enabled 前仍需补齐历史空 `data_date`、评估额外运行时间，并用真实 enabled 批次证明成功。
  - 验收命令通过：dry-run 45 个 enabled API、`compileall app tests`、93 个 unittest、`git diff --check`；`git diff --check` 仅提示文档 LF/CRLF 替换警告。
  - 最终 DB 复核显示覆盖 95506/174334、`failed_request_log` 累计 0、named lock 空闲、外部 `information_schema.innodb_trx=0`。
- 当前结论：
  - `storage_inbound_detail` 仍不应 enabled；下一阶段 13T 建议继续 2000 窗口回填。按新目标模式，13T 将作为下一组 3 轮的第 1 轮。

## Stage 13T

- 阶段目标：继续推进 `storage_inbound_detail` 2000 窗口缺失扫描回填，并作为新目标模式下一组 3 轮的第 1 轮。
- 已完成：
  - 前置核验显示工作区 `master...origin/master [ahead 37]` 且干净；最新提交为 `d788125 Document storage inbound detail 13S backfill`；dry-run 仍显示 45 个 enabled API。
  - YAML 核验显示共 59 个 `api_code`、enabled 45 个；`storage_inbound_detail.enabled=false`、`param_source.limit=2000`、`exclude_existing_target=true`、`auto_advance=true`。
  - 覆盖矩阵核验显示公开文档 API 187 个、真实配置 API 51 个、enabled 45 个、configured disabled 6 个；销售表现 7 个拆分配置仍全部 disabled、`commit_per_page=true`、`data_date_param=beginDate`、`rate_limit.sleep_seconds=20`。
  - DB 前置核验显示 named lock 空闲、外部 `information_schema.innodb_trx=0`；`storage_inbound_detail` 起点覆盖为 95506/174334，累计失败请求为 0。
  - 第一次执行 `.\\.venv\\Scripts\\python.exe -m app.main --sync-api storage_inbound_detail` 返回通用失败；核验显示未生成新批次、覆盖仍为 95506/174334、失败日志为 0、named lock 空闲、外部 `information_schema.innodb_trx=0`，随后 `--test-token` 成功，判断为未落库的前置阶段瞬时失败。
  - 重跑 `.\\.venv\\Scripts\\python.exe -m app.main --sync-api storage_inbound_detail` 成功，批次 `sync_20260711_205210_613646`，2000 次请求、2000 条成功计数、失败 0，批次耗时 1395 秒，API 耗时 1394 秒。
  - 本批次 raw 为 2000 条、2000 个 `source_primary_key`、2000 个不同主键、2000 个 `data_hash`、空主键 0，`data_date` 覆盖 `2025-12-03` 到 `2025-12-05`。
  - DB 核验显示 `storage_inbound_detail` 累计覆盖从 95506 增至 97506/174334，完成约 55.93%，剩余 76828；本批次和该 API 累计 `failed_request_log` 均为 0。
  - 同步结束后 named lock 已释放，外部 `information_schema.innodb_trx=0`；最终批次未出现锁等待或残留事务。
  - 验收命令通过：dry-run 45 个 enabled API、`compileall app tests`、93 个 unittest、`git diff --check`。
- 当前结论：
  - `storage_inbound_detail` 仍不应 enabled；下一阶段 13U 建议继续 2000 窗口回填。按新目标模式，13U 将作为本组三轮的第 2 轮，13V 完成后做本组复盘和整体规划。

## Stage 13U

- 阶段目标：继续推进 `storage_inbound_detail` 2000 窗口缺失扫描回填，并作为新目标模式本组三轮的第 2 轮。
- 已完成：
  - 前置核验显示工作区 `master...origin/master [ahead 38]` 且干净；最新提交为 `262876d Document storage inbound detail 13T backfill`；dry-run 仍显示 45 个 enabled API。
  - README 核验显示已不再声明所有配置都是占位示例；当前说明为 YAML 同时包含少量占位示例和已按文档验证过的真实接口配置。
  - YAML 核验显示共 59 个 `api_code`、enabled 45 个；`storage_inbound_detail.enabled=false`、`param_source.limit=2000`、`exclude_existing_target=true`、`auto_advance=true`。
  - 覆盖矩阵核验显示公开文档 API 187 个、真实配置 API 51 个、enabled 45 个、configured disabled 6 个；销售表现 7 个拆分配置仍全部 disabled、`commit_per_page=true`、`data_date_param=beginDate`、`rate_limit.sleep_seconds=20`。
  - DB 前置核验显示 named lock 空闲、外部 `information_schema.innodb_trx=0`；`storage_inbound_detail` 起点覆盖为 97506/174334，累计失败请求为 0。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api storage_inbound_detail` 正常返回 0，批次 `sync_20260711_212350_303415`，2000 次请求、2000 条成功计数、失败 0，批次耗时 1319 秒，API 耗时 1317 秒。
  - 本批次 raw 为 2000 条、2000 个 `source_primary_key`、2000 个不同主键、2000 个 `data_hash`、空主键 0，`data_date` 覆盖 `2025-12-05` 到 `2025-12-10`。
  - DB 核验显示 `storage_inbound_detail` 累计覆盖从 97506 增至 99506/174334，完成约 57.08%，剩余 74828；本批次和该 API 累计 `failed_request_log` 均为 0。
  - 同步结束后 named lock 已释放，外部 `information_schema.innodb_trx=0`；最终批次未出现锁等待或残留事务。
  - 验收命令通过：dry-run 45 个 enabled API、`compileall app tests`、93 个 unittest、`git diff --check`。
- 当前结论：
  - `storage_inbound_detail` 仍不应 enabled；下一阶段 13V 建议继续 2000 窗口回填。按新目标模式，13V 将作为本组三轮的第 3 轮，完成后做 13T-13V 复盘和整体规划。

## Stage 13V

- 阶段目标：继续推进 `storage_inbound_detail` 2000 窗口缺失扫描回填，并完成 13T-13V 三轮复盘和整体规划。
- 已完成：
  - 前置核验显示工作区 `master...origin/master [ahead 39]` 且干净；最新提交为 `d81bd1d Document storage inbound detail 13U backfill`；dry-run 仍显示 45 个 enabled API。
  - README 核验显示已不再声明所有配置都是占位示例；当前说明为 YAML 同时包含少量占位示例和已按文档验证过的真实接口配置。
  - YAML 核验显示共 59 个 `api_code`、enabled 45 个；`storage_inbound_detail.enabled=false`、`param_source.limit=2000`、`exclude_existing_target=true`、`auto_advance=true`。
  - 覆盖矩阵核验显示公开文档 API 187 个、真实配置 API 51 个、enabled 45 个、configured disabled 6 个；销售表现 7 个拆分配置仍全部 disabled、`commit_per_page=true`、`data_date_param=beginDate`、`rate_limit.sleep_seconds=20`。
  - DB 前置核验显示 named lock 空闲、外部 `information_schema.innodb_trx=0`；`storage_inbound_detail` 起点覆盖为 99506/174334，累计失败请求为 0。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api storage_inbound_detail` 正常返回 0，批次 `sync_20260711_215114_204353`，2000 次请求、2000 条成功计数、失败 0，批次耗时 1396 秒，API 耗时 1393 秒。
  - 本批次 raw 为 2000 条、2000 个 `source_primary_key`、2000 个不同主键、2000 个 `data_hash`、空主键 0，`data_date` 覆盖 `2025-12-10` 到 `2025-12-16`。
  - DB 核验显示 `storage_inbound_detail` 累计覆盖从 99506 增至 101506/174334，完成约 58.23%，剩余 72828；本批次和该 API 累计 `failed_request_log` 均为 0。
  - 同步结束后 named lock 已释放，外部 `information_schema.innodb_trx=0`；最终批次未出现锁等待或残留事务。
  - 13T-13V 复盘：三轮均使用 2000 窗口并各补齐 2000 条，覆盖从 95506 推进到 101506/174334，净增 6000；除 13T 首次未落库前置阶段瞬时失败后重跑成功外，三轮最终批次均成功。
  - 13T-13V 复盘：三轮最终批次均为 2000 请求、2000 成功、0 失败；批内主键和 hash 均唯一，空主键 0；`failed_request_log` 始终为 0；named lock 和外部事务收口正常。
  - 13T-13V 整体规划：继续以 `storage_inbound_detail` 2000 窗口推进完整拉取，暂不提升到 5000；销售表现仍保持 disabled，进入 enabled 前仍需补齐历史空 `data_date`、评估额外运行时间，并用真实 enabled 批次证明成功。
  - 验收命令通过：dry-run 45 个 enabled API、`compileall app tests`、93 个 unittest、`git diff --check`。
- 当前结论：
  - `storage_inbound_detail` 仍不应 enabled；下一阶段 13W 建议继续 2000 窗口回填。按新目标模式，13W 将作为下一组 3 轮的第 1 轮。

## Stage 13W

- 阶段目标：继续推进 `storage_inbound_detail` 2000 窗口缺失扫描回填，并作为新目标模式下一组 3 轮的第 1 轮。
- 已完成：
  - 前置核验显示工作区 `master...origin/master [ahead 40]` 且干净；最新提交为 `d2696a4 Document storage inbound detail 13V backfill`；dry-run 仍显示 45 个 enabled API。
  - README 核验显示已不再声明所有配置都是占位示例；当前说明为 YAML 同时包含少量占位示例和已按文档验证过的真实接口配置。
  - YAML 核验显示共 59 个 `api_code`、enabled 45 个；`storage_inbound_detail.enabled=false`、`param_source.limit=2000`、`exclude_existing_target=true`、`auto_advance=true`。
  - 覆盖矩阵核验显示公开文档 API 187 个、真实配置 API 51 个、enabled 45 个、configured disabled 6 个；销售表现 7 个拆分配置仍全部 disabled、`commit_per_page=true`、`data_date_param=beginDate`、`rate_limit.sleep_seconds=20`。
  - DB 前置核验显示 named lock 空闲、外部 `information_schema.innodb_trx=0`；`storage_inbound_detail` 起点覆盖为 101506/174334，累计失败请求为 0。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api storage_inbound_detail` 正常返回 0，批次 `sync_20260711_222000_690781`，2000 次请求、2000 条成功计数、失败 0，批次耗时 1348 秒，API 耗时 1346 秒。
  - 本批次 raw 为 2000 条、2000 个 `source_primary_key`、2000 个不同主键、2000 个 `data_hash`、空主键 0，`data_date` 覆盖 `2025-12-16` 到 `2025-12-29`。
  - DB 核验显示 `storage_inbound_detail` 累计覆盖从 101506 增至 103506/174334，完成约 59.37%，剩余 70828；本批次和该 API 累计 `failed_request_log` 均为 0。
  - 同步结束后 named lock 已释放，外部 `information_schema.innodb_trx=0`；最终批次未出现锁等待或残留事务。
  - 验收命令通过：dry-run 45 个 enabled API、`compileall app tests`、93 个 unittest、`git diff --check`。
- 当前结论：
  - `storage_inbound_detail` 仍不应 enabled；下一阶段 13X 建议继续 2000 窗口回填。按新目标模式，13X 将作为本组三轮的第 2 轮。

## Stage 13X

- 阶段目标：继续推进 `storage_inbound_detail` 2000 窗口缺失扫描回填，并作为新目标模式本组三轮的第 2 轮。
- 已完成：
  - 前置核验显示工作区 `master...origin/master [ahead 41]` 且干净；最新提交为 `02a5fb9 Document storage inbound detail 13W backfill`；dry-run 仍显示 45 个 enabled API。
  - README 核验显示已不再声明所有配置都是占位示例；当前说明为 YAML 同时包含少量占位示例和已按文档验证过的真实接口配置。
  - YAML 核验显示共 59 个 `api_code`、enabled 45 个；`storage_inbound_detail.enabled=false`、`param_source.limit=2000`、`exclude_existing_target=true`、`auto_advance=true`。
  - 覆盖矩阵核验显示公开文档 API 187 个、真实配置 API 51 个、enabled 45 个、configured disabled 6 个；销售表现 7 个拆分配置仍全部 disabled、`commit_per_page=true`、`data_date_param=beginDate`、`rate_limit.sleep_seconds=20`。
  - DB 前置核验显示 named lock 空闲、外部 `information_schema.innodb_trx=0`；`storage_inbound_detail` 起点覆盖为 103506/174334，累计失败请求为 0。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api storage_inbound_detail` 正常返回 0，批次 `sync_20260711_224737_012183`，2000 次请求、2000 条成功计数、失败 0，批次耗时 1514 秒，API 耗时 1511 秒。
  - 本批次 raw 为 2000 条、2000 个 `source_primary_key`、2000 个不同主键、2000 个 `data_hash`、空主键 0，`data_date` 覆盖 `2025-09-03` 到 `2026-05-08`。
  - DB 核验显示 `storage_inbound_detail` 累计覆盖从 103506 增至 105506/174334，完成约 60.52%，剩余 68828；本批次和该 API 累计 `failed_request_log` 均为 0。
  - 同步结束后 named lock 已释放，外部 `information_schema.innodb_trx=0`；最终批次未出现锁等待或残留事务。
  - 验收命令通过：dry-run 45 个 enabled API、`compileall app tests`、93 个 unittest、`git diff --check`。
- 当前结论：
  - `storage_inbound_detail` 仍不应 enabled；下一阶段 13Y 建议继续 2000 窗口回填。按新目标模式，13Y 将作为本组三轮的第 3 轮，完成后做 13W-13Y 复盘和整体规划。

## Stage 13Y

- 阶段目标：继续推进 `storage_inbound_detail` 2000 窗口缺失扫描回填，并完成 13W-13Y 三轮复盘和整体规划。
- 已完成：
  - 前置核验显示工作区 `master...origin/master [ahead 42]` 且干净；最新提交为 `d9c5420 Document storage inbound detail 13X backfill`；dry-run 仍显示 45 个 enabled API。
  - README 核验显示已不再声明所有配置都是占位示例；当前说明为 YAML 同时包含少量占位示例和已按文档验证过的真实接口配置。
  - YAML 核验显示共 59 个 `api_code`、enabled 45 个；`storage_inbound_detail.enabled=false`、`param_source.limit=2000`、`exclude_existing_target=true`、`auto_advance=true`。
  - 覆盖矩阵核验显示公开文档 API 187 个、真实配置 API 51 个、enabled 45 个、configured disabled 6 个；销售表现 7 个拆分配置仍全部 disabled、`commit_per_page=true`、`data_date_param=beginDate`、`rate_limit.sleep_seconds=20`。
  - DB 前置核验使用 `raw_json` JSON 路径统计覆盖时曾触发长查询超时，并留下本轮只读查询线程 `5430744`；确认该线程仍在执行同一条只读覆盖 SQL 后已结束该连接，随后复核外部 `information_schema.innodb_trx=0`。
  - 轻量 DB 前置核验改用 `storage_inbound_page.source_primary_key` 与 `storage_inbound_detail.source_primary_key` 统计，显示 named lock 空闲、外部 `information_schema.innodb_trx=0`；`storage_inbound_detail` 起点覆盖为 105506/174334，累计失败请求为 0。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api storage_inbound_detail` 正常返回 0，批次 `sync_20260711_232150_630501`，2000 次请求、2000 条成功计数、失败 0，批次耗时 1338 秒，API 耗时 1336 秒。
  - 本批次 raw 为 2000 条、2000 个 `source_primary_key`、2000 个不同主键、2000 个 `data_hash`、空主键 0，`data_date` 覆盖 `2025-11-11` 到 `2025-11-29`。
  - DB 核验显示 `storage_inbound_detail` 累计覆盖从 105506 增至 107506/174334，完成约 61.67%，剩余 66828；本批次和该 API 累计 `failed_request_log` 均为 0。
  - 同步结束后 named lock 已释放，外部 `information_schema.innodb_trx=0`；最终批次未出现锁等待或残留事务。
  - 13W-13Y 复盘：三轮均使用 2000 窗口并各补齐 2000 条，覆盖从 101506 推进到 107506/174334，净增 6000；三轮同步命令均正常返回 0，最终批次均成功。
  - 13W-13Y 复盘：三轮最终批次均为 2000 请求、2000 成功、0 失败；批内主键和 hash 均唯一，空主键 0；`failed_request_log` 始终为 0；named lock 和外部事务收口正常。
  - 13W-13Y 整体规划：继续以 `storage_inbound_detail` 2000 窗口推进完整拉取，暂不提升到 5000；销售表现仍保持 disabled，进入 enabled 前仍需补齐历史空 `data_date`、评估额外运行时间，并用真实 enabled 批次证明成功。
  - 验收命令通过：dry-run 45 个 enabled API、`compileall app tests`、93 个 unittest、`git diff --check`。
- 当前结论：
  - `storage_inbound_detail` 仍不应 enabled；下一阶段 13Z 建议继续 2000 窗口回填。按新目标模式，13Z 将作为下一组 3 轮的第 1 轮。

## Stage 13Z

- 阶段目标：继续推进 `storage_inbound_detail` 2000 窗口缺失扫描回填，并作为新目标模式下一组 3 轮的第 1 轮。
- 已完成：
  - 前置核验显示工作区 `master...origin/master [ahead 43]` 且干净；最新提交为 `882c18b Document storage inbound detail 13Y backfill`；dry-run 仍显示 45 个 enabled API。
  - README 核验显示已不再声明所有配置都是占位示例；当前说明为 YAML 同时包含少量占位示例和已按文档验证过的真实接口配置。
  - YAML 核验显示共 59 个 `api_code`、enabled 45 个；`storage_inbound_detail.enabled=false`、`param_source.limit=2000`、`exclude_existing_target=true`、`auto_advance=true`。
  - 覆盖矩阵核验显示公开文档 API 187 个、真实配置 API 51 个、enabled 45 个、configured disabled 6 个；销售表现 7 个拆分配置仍全部 disabled、`commit_per_page=true`、`data_date_param=beginDate`、`rate_limit.sleep_seconds=20`。
  - DB 前置核验使用 `source_primary_key` 轻量口径统计，显示 named lock 空闲、外部 `information_schema.innodb_trx=0`；`storage_inbound_detail` 起点覆盖为 107506/174334，累计失败请求为 0。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api storage_inbound_detail` 正常返回 0，批次 `sync_20260711_235035_970138`，2000 次请求、2000 条成功计数、失败 0，批次耗时 1646 秒，API 耗时 1644 秒。
  - 本批次 raw 为 2000 条、2000 个 `source_primary_key`、2000 个不同主键、2000 个 `data_hash`、空主键 0，`data_date` 覆盖 `2025-11-29` 到 `2025-12-04`。
  - DB 核验显示 `storage_inbound_detail` 累计覆盖从 107506 增至 109506/174334，完成约 62.81%，剩余 64828；本批次和该 API 累计 `failed_request_log` 均为 0。
  - 同步结束后 named lock 已释放，外部 `information_schema.innodb_trx=0`；最终批次未出现锁等待或残留事务。
  - 验收命令通过：dry-run 45 个 enabled API、`compileall app tests`、93 个 unittest、`git diff --check`。
- 当前结论：
  - `storage_inbound_detail` 仍不应 enabled；下一阶段 14A 建议继续 2000 窗口回填。按新目标模式，14A 将作为本组三轮的第 2 轮，14B 完成后做本组复盘和整体规划。

## Stage 14A

- 阶段目标：继续推进 `storage_inbound_detail` 2000 窗口缺失扫描回填，并作为新目标模式本组三轮的第 2 轮。
- 已完成：
  - 前置核验显示工作区 `master...origin/master [ahead 44]` 且干净；最新提交为 `ac28da8 Document storage inbound detail 13Z backfill`；dry-run 仍显示 45 个 enabled API。
  - README 核验显示已不再声明所有配置都是占位示例；当前说明为 YAML 同时包含少量占位示例和已按文档验证过的真实接口配置。
  - YAML 核验显示共 59 个 `api_code`、enabled 45 个；`storage_inbound_detail.enabled=false`、`param_source.limit=2000`、`exclude_existing_target=true`、`auto_advance=true`。
  - 覆盖矩阵核验显示公开文档 API 187 个、真实配置 API 51 个、enabled 45 个、configured disabled 6 个；销售表现 7 个拆分配置仍全部 disabled、`commit_per_page=true`、`data_date_param=beginDate`、`rate_limit.sleep_seconds=20`。
  - DB 前置核验使用 `source_primary_key` 轻量口径统计，显示 named lock 空闲、外部 `information_schema.innodb_trx=0`；`storage_inbound_detail` 起点覆盖为 109506/174334，累计失败请求为 0。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api storage_inbound_detail` 正常返回 0，批次 `sync_20260712_002315_005152`，2000 次请求、2000 条成功计数、失败 0，批次耗时 1668 秒，API 耗时 1665 秒。
  - 本批次 raw 为 2000 条、2000 个 `source_primary_key`、2000 个不同主键、2000 个 `data_hash`、空主键 0，`data_date` 覆盖 `2025-12-04` 到 `2025-12-06`。
  - DB 核验显示 `storage_inbound_detail` 累计覆盖从 109506 增至 111506/174334，完成约 63.96%，剩余 62828；本批次和该 API 累计 `failed_request_log` 均为 0。
  - 同步结束后 named lock 已释放，外部 `information_schema.innodb_trx=0`；最终批次未出现锁等待或残留事务。
  - 验收命令通过：dry-run 45 个 enabled API、`compileall app tests`、93 个 unittest、`git diff --check`。
- 当前结论：
  - `storage_inbound_detail` 仍不应 enabled；下一阶段 14B 建议继续 2000 窗口回填，并完成 13Z-14B 三轮复盘和整体规划。

## Stage 14B

- 阶段目标：继续推进 `storage_inbound_detail` 2000 窗口缺失扫描回填，并完成 13Z-14B 三轮复盘和整体规划。
- 已完成：
  - 前置核验显示工作区 `master...origin/master [ahead 45]` 且干净；最新提交为 `bb5c45e Document storage inbound detail 14A backfill`；dry-run 基线仍为 45 个 enabled API。
  - README 核验显示已不再声明所有配置都是占位示例；当前说明为 YAML 同时包含少量占位示例和已按文档验证过的真实接口配置。
  - YAML 核验显示共 59 个 `api_code`、enabled 45 个；`storage_inbound_detail.enabled=false`、`param_source.limit=2000`、`exclude_existing_target=true`、`auto_advance=true`。
  - 覆盖矩阵核验显示公开文档 API 187 个、真实配置 API 51 个、enabled 45 个、configured disabled 6 个；销售表现 7 个拆分配置仍全部 disabled、`commit_per_page=true`、`data_date_param=beginDate`、`rate_limit.sleep_seconds=20`。
  - DB 前置核验使用 `source_primary_key` 轻量口径统计，显示 named lock 空闲、外部 `information_schema.innodb_trx=0`；`storage_inbound_detail` 起点覆盖为 111506/174334，累计失败请求为 0；DB `api_config` 为 59 条、enabled 45 条，`storage_inbound_detail.enabled=0`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api storage_inbound_detail` 正常返回 0，批次 `sync_20260712_005733_731330`，2000 次请求、2000 条成功计数、失败 0，批次耗时 2142 秒，API 耗时 2140 秒。
  - 本批次 raw 为 2000 条、2000 个 `source_primary_key`、2000 个不同主键、2000 个 `data_hash`、空主键 0，`data_date` 覆盖 `2025-12-06` 到 `2025-12-10`。
  - DB 核验显示 `storage_inbound_detail` 累计覆盖从 111506 增至 113506/174334，完成约 65.11%，剩余 60828；本批次和该 API 累计 `failed_request_log` 均为 0。
  - 同步结束后 named lock 已释放，外部 `information_schema.innodb_trx=0`；最终批次未出现锁等待或残留事务。
  - 13Z-14B 复盘：三轮均使用 2000 窗口并各补齐 2000 条，覆盖从 107506 推进到 113506/174334，净增 6000；三轮同步命令均正常返回 0，最终批次均成功。
  - 13Z-14B 复盘：三轮最终批次均为 2000 请求、2000 成功、0 失败；批内主键和 hash 均唯一，空主键 0；`failed_request_log` 始终为 0；named lock 和外部事务收口正常。
  - 13Z-14B 整体规划：继续以 `storage_inbound_detail` 2000 窗口推进完整拉取，暂不提升到 5000；销售表现仍保持 disabled，进入 enabled 前仍需补齐历史空 `data_date`、评估额外运行时间，并用真实 enabled 批次证明成功。
  - 验收命令通过：dry-run 45 个 enabled API、`compileall app tests`、93 个 unittest、`git diff --check`。
- 当前结论：
  - `storage_inbound_detail` 仍不应 enabled；下一阶段 14C 建议继续 2000 窗口回填。按新目标模式，14C 将作为下一组 3 轮的第 1 轮。

## Stage 14C

- 阶段目标：继续推进 `storage_inbound_detail` 2000 窗口缺失扫描回填，并作为新目标模式下一组 3 轮的第 1 轮。
- 已完成：
  - 前置核验显示工作区 `master...origin/master [ahead 46]` 且干净；最新提交为 `ee9ac27 Document storage inbound detail 14B backfill`；文档已指向 14C。
  - README 核验显示已不再声明所有配置都是占位示例；当前说明为 YAML 同时包含少量占位示例和已按文档验证过的真实接口配置。
  - YAML 核验显示共 59 个 `api_code`、enabled 45 个；`storage_inbound_detail.enabled=false`、`param_source.limit=2000`、`exclude_existing_target=true`、`auto_advance=true`。
  - 覆盖矩阵核验显示公开文档 API 187 个、真实配置 API 51 个、enabled 45 个、configured disabled 6 个；销售表现 7 个拆分配置仍全部 disabled、`commit_per_page=true`、`data_date_param=beginDate`、`rate_limit.sleep_seconds=20`。
  - DB 前置核验使用 `source_primary_key` 轻量口径统计，显示 named lock 空闲、外部 `information_schema.innodb_trx=0`；`storage_inbound_detail` 起点覆盖为 113506/174334，累计失败请求为 0；DB `api_config` 为 59 条、enabled 45 条，`storage_inbound_detail.enabled=0`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api storage_inbound_detail` 正常返回 0，批次 `sync_20260712_014014_564932`，2000 次请求、2000 条成功计数、失败 0，批次耗时 1946 秒，API 耗时 1944 秒。
  - 本批次 raw 为 2000 条、2000 个 `source_primary_key`、2000 个不同主键、2000 个 `data_hash`、空主键 0，`data_date` 覆盖 `2025-12-10` 到 `2025-12-17`。
  - DB 核验显示 `storage_inbound_detail` 累计覆盖从 113506 增至 115506/174334，完成约 66.26%，剩余 58828；本批次和该 API 累计 `failed_request_log` 均为 0。
  - 同步结束后 named lock 已释放，外部 `information_schema.innodb_trx=0`；最终批次未出现锁等待或残留事务。
  - 验收命令通过：dry-run 45 个 enabled API、`compileall app tests`、93 个 unittest、`git diff --check`。
- 当前结论：
  - `storage_inbound_detail` 仍不应 enabled；下一阶段 14D 建议继续 2000 窗口回填。按新目标模式，14D 将作为本组三轮的第 2 轮，14E 完成后做本组复盘和整体规划。

## Stage 14D

- 阶段目标：继续推进 `storage_inbound_detail` 2000 窗口缺失扫描回填，并作为新目标模式本组三轮的第 2 轮。
- 已完成：
  - 前置核验显示工作区 `master...origin/master [ahead 47]` 且干净；最新提交为 `8dc56c4 Document storage inbound detail 14C backfill`；文档已指向 14D。
  - README 核验显示已不再声明所有配置都是占位示例；当前说明为 YAML 同时包含少量占位示例和已按文档验证过的真实接口配置。
  - YAML 核验显示共 59 个 `api_code`、enabled 45 个；`storage_inbound_detail.enabled=false`、`param_source.limit=2000`、`exclude_existing_target=true`、`auto_advance=true`。
  - 覆盖矩阵核验显示公开文档 API 187 个、真实配置 API 51 个、enabled 45 个、configured disabled 6 个；销售表现 7 个拆分配置仍全部 disabled、`commit_per_page=true`、`data_date_param=beginDate`、`rate_limit.sleep_seconds=20`。
  - DB 前置核验使用 `source_primary_key` 轻量口径统计，显示 named lock 空闲、外部 `information_schema.innodb_trx=0`；`storage_inbound_detail` 起点覆盖为 115506/174334，累计失败请求为 0；DB `api_config` 为 59 条、enabled 45 条，`storage_inbound_detail.enabled=0`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api storage_inbound_detail` 正常返回 0，批次 `sync_20260712_021800_702802`，2000 次请求、2000 条成功计数、失败 0，批次耗时 1905 秒，API 耗时 1903 秒。
  - 本批次 raw 为 2000 条、2000 个 `source_primary_key`、2000 个不同主键、2000 个 `data_hash`、空主键 0，`data_date` 覆盖 `2025-12-17` 到 `2026-02-25`。
  - DB 核验显示 `storage_inbound_detail` 累计覆盖从 115506 增至 117506/174334，完成约 67.40%，剩余 56828；本批次和该 API 累计 `failed_request_log` 均为 0。
  - 同步结束后 named lock 已释放，外部 `information_schema.innodb_trx=0`；最终批次未出现锁等待或残留事务。
  - 验收命令通过：dry-run 45 个 enabled API、`compileall app tests`、93 个 unittest、`git diff --check`。
- 当前结论：
  - `storage_inbound_detail` 仍不应 enabled；下一阶段 14E 建议继续 2000 窗口回填，并完成 14C-14E 三轮复盘和整体规划。

## Stage 14E

- 阶段目标：继续推进 `storage_inbound_detail` 2000 窗口缺失扫描回填，并完成 14C-14E 三轮复盘和整体规划。
- 已完成：
  - 前置核验显示工作区 `master...origin/master [ahead 48]` 且干净；最新提交为 `bac4c9a Document storage inbound detail 14D backfill`；文档已指向 14E。
  - README 核验显示已不再声明所有配置都是占位示例；当前说明为 YAML 同时包含少量占位示例和已按文档验证过的真实接口配置。
  - YAML 核验显示共 59 个 `api_code`、enabled 45 个；`storage_inbound_detail.enabled=false`、`param_source.limit=2000`、`exclude_existing_target=true`、`auto_advance=true`。
  - 覆盖矩阵核验显示公开文档 API 187 个、真实配置 API 51 个、enabled 45 个、configured disabled 6 个；销售表现 7 个拆分配置仍全部 disabled、`commit_per_page=true`、`data_date_param=beginDate`、`rate_limit.sleep_seconds=20`。
  - DB 前置核验使用 `source_primary_key` 轻量口径统计，显示 named lock 空闲、外部 `information_schema.innodb_trx=0`；`storage_inbound_detail` 起点覆盖为 117506/174334，累计失败请求为 0；DB `api_config` 为 59 条、enabled 45 条，`storage_inbound_detail.enabled=0`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api storage_inbound_detail` 正常返回 0，批次 `sync_20260712_025458_566738`，2000 次请求、2000 条成功计数、失败 0，批次耗时 1903 秒，API 耗时 1902 秒。
  - 本批次 raw 为 2000 条、2000 个 `source_primary_key`、2000 个不同主键、2000 个 `data_hash`、空主键 0，`data_date` 覆盖 `2025-09-04` 到 `2026-07-05`。
  - DB 核验显示 `storage_inbound_detail` 累计覆盖从 117506 增至 119506/174334，完成约 68.55%，剩余 54828；本批次和该 API 累计 `failed_request_log` 均为 0。
  - 同步结束后 named lock 已释放，外部 `information_schema.innodb_trx=0`；最终批次未出现锁等待或残留事务。
  - 14C-14E 复盘：三轮均使用 2000 窗口并各补齐 2000 条，覆盖从 113506 推进到 119506/174334，净增 6000；三轮同步命令均正常返回 0，最终批次均成功。
  - 14C-14E 复盘：三轮最终批次均为 2000 请求、2000 成功、0 失败；批内主键和 hash 均唯一，空主键 0；`failed_request_log` 始终为 0；named lock 和外部事务收口正常。
  - 14C-14E 整体规划：继续以 `storage_inbound_detail` 2000 窗口推进完整拉取，暂不提升到 5000；销售表现仍保持 disabled，进入 enabled 前仍需补齐历史空 `data_date`、评估额外运行时间，并用真实 enabled 批次证明成功。
  - 验收命令通过：dry-run 45 个 enabled API、`compileall app tests`、93 个 unittest、`git diff --check`。
- 当前结论：
  - `storage_inbound_detail` 仍不应 enabled；下一阶段 14F 建议继续 2000 窗口回填。按新目标模式，14F 将作为下一组 3 轮的第 1 轮。

## Stage 14F

- 阶段目标：继续推进 `storage_inbound_detail` 2000 窗口缺失扫描回填，并作为新目标模式下一组 3 轮的第 1 轮。
- 已完成：
  - 前置核验显示工作区 `master...origin/master [ahead 49]` 且干净；最新提交为 `eff776e Document storage inbound detail 14E backfill`；文档已指向 14F。
  - README 核验显示已不再声明所有配置都是占位示例；当前说明为 YAML 同时包含少量占位示例和已按文档验证过的真实接口配置。
  - YAML 核验显示共 59 个 `api_code`、enabled 45 个；`storage_inbound_detail.enabled=false`、`param_source.limit=2000`、`exclude_existing_target=true`、`auto_advance=true`。
  - 覆盖矩阵核验显示公开文档 API 187 个、真实配置 API 51 个、enabled 45 个、configured disabled 6 个；销售表现 7 个拆分配置仍全部 disabled、`commit_per_page=true`、`data_date_param=beginDate`、`rate_limit.sleep_seconds=20`。
  - DB 前置核验使用 `source_primary_key` 轻量口径统计，显示 named lock 空闲、外部 `information_schema.innodb_trx=0`；`storage_inbound_detail` 起点覆盖为 119506/174334，累计失败请求为 0；DB `api_config` 为 59 条、enabled 45 条，`storage_inbound_detail.enabled=0`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api storage_inbound_detail` 正常返回 0，批次 `sync_20260712_033311_412781`，2000 次请求、2000 条成功计数、失败 0，批次耗时 1428 秒，API 耗时 1426 秒。
  - 本批次 raw 为 2000 条、2000 个 `source_primary_key`、2000 个不同主键、2000 个 `data_hash`、空主键 0，`data_date` 覆盖 `2025-11-12` 到 `2025-11-21`。
  - DB 核验显示 `storage_inbound_detail` 累计覆盖从 119506 增至 121506/174334，完成约 69.70%，剩余 52828；本批次和该 API 累计 `failed_request_log` 均为 0。
  - 同步结束后 named lock 已释放，外部 `information_schema.innodb_trx=0`；最终批次未出现锁等待或残留事务。
  - 验收命令通过：dry-run 45 个 enabled API、`compileall app tests`、93 个 unittest、`git diff --check`。
- 当前结论：
  - `storage_inbound_detail` 仍不应 enabled；下一阶段 14G 建议继续 2000 窗口回填。按新目标模式，14G 将作为本组三轮的第 2 轮，14H 完成后做本组复盘和整体规划。

## Stage 14G

- 阶段目标：继续推进 `storage_inbound_detail` 2000 窗口缺失扫描回填，并作为新目标模式本组三轮的第 2 轮。
- 已完成：
  - 前置核验显示工作区 `master...origin/master [ahead 50]` 且干净；最新提交为 `12c5a1e Document storage inbound detail 14F backfill`；文档已指向 14G。
  - README 核验显示已不再声明所有配置都是占位示例；当前说明为 YAML 同时包含少量占位示例和已按文档验证过的真实接口配置。
  - YAML 核验显示共 59 个 `api_code`、enabled 45 个；`storage_inbound_detail.enabled=false`、`param_source.limit=2000`、`exclude_existing_target=true`、`auto_advance=true`。
  - 覆盖矩阵核验显示公开文档 API 187 个、真实配置 API 51 个、enabled 45 个、configured disabled 6 个；销售表现 7 个拆分配置仍全部 disabled、`commit_per_page=true`、`data_date_param=beginDate`、`rate_limit.sleep_seconds=20`。
  - DB 前置核验使用 `source_primary_key` 轻量口径统计，显示 named lock 空闲、外部 `information_schema.innodb_trx=0`；`storage_inbound_detail` 起点覆盖为 121506/174334，累计失败请求为 0；DB `api_config` 为 59 条、enabled 45 条，`storage_inbound_detail.enabled=0`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api storage_inbound_detail` 正常返回 0，批次 `sync_20260712_040244_654638`，2000 次请求、2000 条成功计数、失败 0，批次耗时 1732 秒，API 耗时 1731 秒。
  - 本批次 raw 为 2000 条、2000 个 `source_primary_key`、2000 个不同主键、2000 个 `data_hash`、空主键 0，`data_date` 覆盖 `2025-11-21` 到 `2025-11-29`。
  - DB 核验显示 `storage_inbound_detail` 累计覆盖从 121506 增至 123506/174334，完成约 70.84%，剩余 50828；本批次和该 API 累计 `failed_request_log` 均为 0。
  - 同步结束后 named lock 已释放，外部 `information_schema.innodb_trx=0`；最终批次未出现锁等待或残留事务。
  - 验收命令通过：dry-run 45 个 enabled API、`compileall app tests`、93 个 unittest、`git diff --check`。
- 当前结论：
  - `storage_inbound_detail` 仍不应 enabled；下一阶段 14H 建议继续 2000 窗口回填，并完成 14F-14H 三轮复盘和整体规划。

## Stage 14H

- 阶段目标：继续推进 `storage_inbound_detail` 2000 窗口缺失扫描回填，并完成 14F-14H 三轮复盘和整体规划。
- 已完成：
  - 前置核验显示工作区 `master...origin/master [ahead 51]` 且干净；最新提交为 `9d58c54 Document storage inbound detail 14G backfill`；文档已指向 14H。
  - README 核验显示已不再声明所有配置都是占位示例；当前说明为 YAML 同时包含少量占位示例和已按文档验证过的真实接口配置。
  - YAML 核验显示共 59 个 `api_code`、enabled 45 个；`storage_inbound_detail.enabled=false`、`param_source.limit=2000`、`exclude_existing_target=true`、`auto_advance=true`。
  - 覆盖矩阵核验显示公开文档 API 187 个、真实配置 API 51 个、enabled 45 个、configured disabled 6 个；销售表现 7 个拆分配置仍全部 disabled、`commit_per_page=true`、`data_date_param=beginDate`、`rate_limit.sleep_seconds=20`。
  - DB 前置核验使用 `source_primary_key` 轻量口径统计，显示 named lock 空闲、外部 `information_schema.innodb_trx=0`；`storage_inbound_detail` 起点覆盖为 123506/174334，累计失败请求为 0；DB `api_config` 为 59 条、enabled 45 条，`storage_inbound_detail.enabled=0`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api storage_inbound_detail` 正常返回 0，批次 `sync_20260712_043724_015023`，2000 次请求、2000 条成功计数、失败 0，批次耗时 1414 秒，API 耗时 1411 秒。
  - 本批次 raw 为 2000 条、2000 个 `source_primary_key`、2000 个不同主键、2000 个 `data_hash`、空主键 0，`data_date` 覆盖 `2025-11-29` 到 `2025-12-03`。
  - DB 核验显示 `storage_inbound_detail` 累计覆盖从 123506 增至 125506/174334，完成约 71.99%，剩余 48828；本批次和该 API 累计 `failed_request_log` 均为 0。
  - 同步结束后 named lock 已释放，外部 `information_schema.innodb_trx=0`；最终批次未出现锁等待或残留事务。
  - 14F-14H 复盘：三轮均使用 2000 窗口并各补齐 2000 条，覆盖从 119506 推进到 125506/174334，净增 6000；三轮同步命令均正常返回 0，最终批次均成功。
  - 14F-14H 复盘：三轮最终批次均为 2000 请求、2000 成功、0 失败；批内主键和 hash 均唯一，空主键 0；`failed_request_log` 始终为 0；named lock 和外部事务收口正常。
  - 14F-14H 整体规划：继续以 `storage_inbound_detail` 2000 窗口推进完整拉取，暂不提升到 5000；销售表现仍保持 disabled，进入 enabled 前仍需补齐历史空 `data_date`、评估额外运行时间，并用真实 enabled 批次证明成功。
  - 验收命令通过：dry-run 45 个 enabled API、`compileall app tests`、93 个 unittest、`git diff --check`。
- 当前结论：
  - `storage_inbound_detail` 仍不应 enabled；下一阶段 14I 建议继续 2000 窗口回填。按新目标模式，14I 将作为下一组 3 轮的第 1 轮。

## Stage 14I

- 阶段目标：继续推进 `storage_inbound_detail` 2000 窗口缺失扫描回填，并作为新目标模式下一组 3 轮的第 1 轮。
- 已完成：
  - 前置核验显示工作区 `master...origin/master [ahead 52]` 且干净；最新提交为 `c8321c5 Document storage inbound detail 14H backfill`；文档已指向 14I。
  - README 核验显示已不再声明所有配置都是占位示例；当前说明为 YAML 同时包含少量占位示例和已按文档验证过的真实接口配置。
  - YAML 核验显示共 59 个 `api_code`、enabled 45 个；`storage_inbound_detail.enabled=false`、`param_source.limit=2000`、`exclude_existing_target=true`、`auto_advance=true`。
  - 覆盖矩阵核验显示公开文档 API 187 个、真实配置 API 51 个、enabled 45 个、configured disabled 6 个；销售表现 7 个拆分配置仍全部 disabled、`commit_per_page=true`、`data_date_param=beginDate`、`rate_limit.sleep_seconds=20`。
  - DB 前置核验使用 `source_primary_key` 轻量口径统计，显示 named lock 空闲、外部 `information_schema.innodb_trx=0`；`storage_inbound_detail` 起点覆盖为 125506/174334，累计失败请求为 0；DB `api_config` 为 59 条、enabled 45 条，`storage_inbound_detail.enabled=0`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api storage_inbound_detail` 正常返回 0，批次 `sync_20260712_050745_681739`，2000 次请求、2000 条成功计数、失败 0，批次耗时 2018 秒，API 耗时 2016 秒。
  - 本批次 raw 为 2000 条、2000 个 `source_primary_key`、2000 个不同主键、2000 个 `data_hash`、空主键 0，`data_date` 覆盖 `2025-12-03` 到 `2025-12-05`。
  - DB 核验显示 `storage_inbound_detail` 累计覆盖从 125506 增至 127506/174334，完成约 73.14%，剩余 46828；本批次和该 API 累计 `failed_request_log` 均为 0。
  - 同步结束后 named lock 已释放，外部 `information_schema.innodb_trx=0`；最终批次未出现锁等待或残留事务。
  - 验收命令通过：dry-run 45 个 enabled API、`compileall app tests`、93 个 unittest、`git diff --check`。
- 当前结论：
  - `storage_inbound_detail` 仍不应 enabled；下一阶段 14J 建议继续 2000 窗口回填。按新目标模式，14J 将作为本组三轮的第 2 轮，14K 完成后做本组复盘和整体规划。

## Stage 14J

- 阶段目标：继续推进 `storage_inbound_detail` 2000 窗口缺失扫描回填，并作为新目标模式本组三轮的第 2 轮。
- 已完成：
  - 前置核验显示工作区 `master...origin/master [ahead 53]` 且干净；最新提交为 `a1bbe4c Document storage inbound detail 14I backfill`；文档已指向 14J。
  - README 核验显示已不再声明所有配置都是占位示例；当前说明为 YAML 同时包含少量占位示例和已按文档验证过的真实接口配置。
  - YAML 核验显示共 59 个 `api_code`、enabled 45 个；`storage_inbound_detail.enabled=false`、`param_source.limit=2000`、`exclude_existing_target=true`、`auto_advance=true`。
  - 覆盖矩阵核验显示公开文档 API 187 个、真实配置 API 51 个、enabled 45 个、configured disabled 6 个；销售表现 7 个拆分配置仍全部 disabled、`commit_per_page=true`、`data_date_param=beginDate`、`rate_limit.sleep_seconds=20`。
  - DB 前置核验使用 `source_primary_key` 轻量口径统计，显示 named lock 空闲、外部 `information_schema.innodb_trx=0`；`storage_inbound_detail` 起点覆盖为 127506/174334，累计失败请求为 0；DB `api_config` 为 59 条、enabled 45 条，`storage_inbound_detail.enabled=0`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api storage_inbound_detail` 正常返回 0，批次 `sync_20260712_054716_533385`，2000 次请求、2000 条成功计数、失败 0，批次耗时 1990 秒，API 耗时 1989 秒。
  - 本批次 raw 为 2000 条、2000 个 `source_primary_key`、2000 个不同主键、2000 个 `data_hash`、空主键 0，`data_date` 覆盖 `2025-12-05` 到 `2025-12-10`。
  - DB 核验显示 `storage_inbound_detail` 累计覆盖从 127506 增至 129506/174334，完成约 74.29%，剩余 44828；本批次和该 API 累计 `failed_request_log` 均为 0。
  - 同步结束后 named lock 已释放，外部 `information_schema.innodb_trx=0`；最终批次未出现锁等待或残留事务。
  - 验收命令通过：dry-run 45 个 enabled API、`compileall app tests`、93 个 unittest、`git diff --check`。
- 当前结论：
  - `storage_inbound_detail` 仍不应 enabled；下一阶段 14K 建议继续 2000 窗口回填，并完成 14I-14K 三轮复盘和整体规划。

## Stage 14K

- 阶段目标：继续推进 `storage_inbound_detail` 2000 窗口缺失扫描回填，并完成 14I-14K 三轮复盘和整体规划。
- 已完成：
  - 前置核验显示工作区 `master...origin/master [ahead 54]` 且干净；最新提交为 `ec8f2ec Document storage inbound detail 14J backfill`；文档已指向 14K。
  - README 核验显示已不再声明所有配置都是占位示例；当前说明为 YAML 同时包含少量占位示例和已按文档验证过的真实接口配置。
  - YAML 核验显示共 59 个 `api_code`、enabled 45 个；`storage_inbound_detail.enabled=false`、`param_source.limit=2000`、`exclude_existing_target=true`、`auto_advance=true`。
  - 覆盖矩阵核验显示公开文档 API 187 个、真实配置 API 51 个、enabled 45 个、configured disabled 6 个；销售表现 7 个拆分配置仍全部 disabled、`commit_per_page=true`、`data_date_param=beginDate`、`rate_limit.sleep_seconds=20`。
  - DB 前置核验使用 `source_primary_key` 轻量口径统计，显示 named lock 空闲、外部 `information_schema.innodb_trx=0`；`storage_inbound_detail` 起点覆盖为 129506/174334，累计失败请求为 0；DB `api_config` 为 59 条、enabled 45 条，`storage_inbound_detail.enabled=0`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api storage_inbound_detail` 正常返回 0，批次 `sync_20260712_062548_729441`，2000 次请求、2000 条成功计数、失败 0，批次耗时 1858 秒，API 耗时 1856 秒。
  - 本批次 raw 为 2000 条、2000 个 `source_primary_key`、2000 个不同主键、2000 个 `data_hash`、空主键 0，`data_date` 覆盖 `2025-12-10` 到 `2025-12-14`。
  - DB 核验显示 `storage_inbound_detail` 累计覆盖从 129506 增至 131506/174334，完成约 75.43%，剩余 42828；本批次和该 API 累计 `failed_request_log` 均为 0。
  - 同步结束后 named lock 已释放，外部 `information_schema.innodb_trx=0`；最终批次未出现锁等待或残留事务。
  - 14I-14K 复盘：三轮均使用 2000 窗口并各补齐 2000 条，覆盖从 125506 推进到 131506/174334，净增 6000；三轮同步命令均正常返回 0，最终批次均成功。
  - 14I-14K 复盘：三轮最终批次均为 2000 请求、2000 成功、0 失败；批内主键和 hash 均唯一，空主键 0；`failed_request_log` 始终为 0；named lock 和外部事务收口正常。
  - 14I-14K 整体规划：继续以 `storage_inbound_detail` 2000 窗口推进完整拉取，暂不提升到 5000；销售表现仍保持 disabled，进入 enabled 前仍需补齐历史空 `data_date`、评估额外运行时间，并用真实 enabled 批次证明成功。
  - 验收命令通过：dry-run 45 个 enabled API、`compileall app tests`、93 个 unittest、`git diff --check`。
- 当前结论：
  - `storage_inbound_detail` 仍不应 enabled；下一阶段 14L 建议继续 2000 窗口回填。按新目标模式，14L 将作为下一组 3 轮的第 1 轮。

## Stage 14L

- 阶段目标：继续推进 `storage_inbound_detail` 2000 窗口缺失扫描回填，并作为新目标模式下一组 3 轮的第 1 轮。
- 已完成：
  - 前置核验显示工作区 `master...origin/master [ahead 55]` 且干净；最新提交为 `dcd5888 Document storage inbound detail 14K backfill`；文档已指向 14L。
  - README 核验显示已不再声明所有配置都是占位示例；当前说明为 YAML 同时包含少量占位示例和已按文档验证过的真实接口配置。
  - YAML 核验显示共 59 个 `api_code`、enabled 45 个；`storage_inbound_detail.enabled=false`、`param_source.limit=2000`、`exclude_existing_target=true`、`auto_advance=true`。
  - 覆盖矩阵核验显示公开文档 API 187 个、真实配置 API 51 个、enabled 45 个、configured disabled 6 个；销售表现 7 个拆分配置仍全部 disabled、`commit_per_page=true`、`data_date_param=beginDate`、`rate_limit.sleep_seconds=20`。
  - DB 前置核验使用 `source_primary_key` 轻量口径统计，显示 named lock 空闲、外部 `information_schema.innodb_trx=0`；`storage_inbound_detail` 起点覆盖为 131506/174334，累计失败请求为 0；DB `api_config` 为 59 条、enabled 45 条，`storage_inbound_detail.enabled=0`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api storage_inbound_detail` 正常返回 0，批次 `sync_20260712_070217_270119`，2000 次请求、2000 条成功计数、失败 0，批次耗时 2211 秒，API 耗时 2209 秒。
  - 本批次 raw 为 2000 条、2000 个 `source_primary_key`、2000 个不同主键、2000 个 `data_hash`、空主键 0，`data_date` 覆盖 `2025-12-14` 到 `2025-12-30`。
  - DB 核验显示 `storage_inbound_detail` 累计覆盖从 131506 增至 133506/174334，完成约 76.58%，剩余 40828；本批次和该 API 累计 `failed_request_log` 均为 0。
  - 同步结束后 named lock 已释放，外部 `information_schema.innodb_trx=0`；最终批次未出现锁等待或残留事务。
  - 验收命令通过：dry-run 45 个 enabled API、`compileall app tests`、93 个 unittest、`git diff --check`。
- 当前结论：
  - `storage_inbound_detail` 仍不应 enabled；下一阶段 14M 建议继续 2000 窗口回填。按新目标模式，14M 将作为本组三轮的第 2 轮，14N 完成后做本组复盘和整体规划。

## Stage 14M

- 阶段目标：继续推进 `storage_inbound_detail` 2000 窗口缺失扫描回填，并作为新目标模式本组三轮的第 2 轮。
- 已完成：
  - 前置核验显示工作区 `master...origin/master [ahead 56]` 且干净；最新提交为 `f4fe02e Document storage inbound detail 14L backfill`；文档已指向 14M。
  - README 核验显示已不再声明所有配置都是占位示例；当前说明为 YAML 同时包含少量占位示例和已按文档验证过的真实接口配置。
  - YAML 核验显示共 59 个 `api_code`、enabled 45 个；`storage_inbound_detail.enabled=false`、`param_source.limit=2000`、`exclude_existing_target=true`、`auto_advance=true`。
  - 覆盖矩阵核验显示公开文档 API 187 个、真实配置 API 51 个、enabled 45 个、configured disabled 6 个；销售表现 7 个拆分配置仍全部 disabled、`commit_per_page=true`、`data_date_param=beginDate`、`rate_limit.sleep_seconds=20`。
  - DB 前置核验使用 `source_primary_key` 轻量口径统计，显示 named lock 空闲、外部 `information_schema.innodb_trx=0`；`storage_inbound_detail` 起点覆盖为 133506/174334，累计失败请求为 0；DB `api_config` 为 59 条、enabled 45 条，`storage_inbound_detail.enabled=0`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api storage_inbound_detail` 正常返回 0，批次 `sync_20260712_074605_594229`，2000 次请求、2000 条成功计数、失败 0，批次耗时 1889 秒，API 耗时 1888 秒。
  - 本批次 raw 为 2000 条、2000 个 `source_primary_key`、2000 个不同主键、2000 个 `data_hash`、空主键 0，`data_date` 覆盖 `2025-09-03` 到 `2026-07-01`。
  - DB 核验显示 `storage_inbound_detail` 累计覆盖从 133506 增至 135506/174334，完成约 77.73%，剩余 38828；本批次和该 API 累计 `failed_request_log` 均为 0。
  - 同步结束后 named lock 已释放，外部 `information_schema.innodb_trx=0`；最终批次未出现锁等待或残留事务。
  - 验收命令通过：dry-run 45 个 enabled API、`compileall app tests`、93 个 unittest、`git diff --check` 和最终 DB 复核。
- 当前结论：
  - `storage_inbound_detail` 仍不应 enabled；下一阶段 14N 建议继续 2000 窗口回填，并完成 14L-14N 三轮复盘和整体规划。

## Stage 14N

- 阶段目标：继续推进 `storage_inbound_detail` 2000 窗口缺失扫描回填，并完成 14L-14N 三轮复盘和整体规划。
- 已完成：
  - 前置核验显示工作区 `master...origin/master [ahead 57]` 且干净；最新提交为 `c6e2f8d Document storage inbound detail 14M backfill`；文档已指向 14N。
  - README 核验显示已不再声明所有配置都是占位示例；当前说明为 YAML 同时包含少量占位示例和已按文档验证过的真实接口配置。
  - YAML 核验显示共 59 个 `api_code`、enabled 45 个；`storage_inbound_detail.enabled=false`、`param_source.limit=2000`、`exclude_existing_target=true`、`auto_advance=true`。
  - 覆盖矩阵核验显示公开文档 API 187 个、真实配置 API 51 个、enabled 45 个、configured disabled 6 个；销售表现 7 个拆分配置仍全部 disabled、`commit_per_page=true`、`data_date_param=beginDate`、`rate_limit.sleep_seconds=20`。
  - DB 前置核验使用 `source_primary_key` 轻量口径统计，显示 named lock 空闲、外部 `information_schema.innodb_trx=0`；`storage_inbound_detail` 起点覆盖为 135506/174334，累计失败请求为 0；DB `api_config` 为 59 条、enabled 45 条，`storage_inbound_detail.enabled=0`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api storage_inbound_detail` 正常返回 0，批次 `sync_20260712_082337_762682`，2000 次请求、2000 条成功计数、失败 0，批次耗时 1792 秒，API 耗时 1790 秒。
  - 本批次 raw 为 2000 条、2000 个 `source_primary_key`、2000 个不同主键、2000 个 `data_hash`、空主键 0，`data_date` 覆盖 `2025-10-25` 到 `2025-11-12`。
  - DB 核验显示 `storage_inbound_detail` 累计覆盖从 135506 增至 137506/174334，完成约 78.88%，剩余 36828；本批次和该 API 累计 `failed_request_log` 均为 0。
  - 同步结束后 named lock 已释放，外部 `information_schema.innodb_trx=0`；最终批次未出现锁等待或残留事务。
  - 14L-14N 复盘：三轮均使用 2000 窗口并各补齐 2000 条，覆盖从 131506 推进到 137506/174334，净增 6000；三轮同步命令均正常返回 0，最终批次均成功。
  - 14L-14N 复盘：三轮最终批次均为 2000 请求、2000 成功、0 失败；批内主键和 hash 均唯一，空主键 0；`failed_request_log` 始终为 0；named lock 和外部事务收口正常。
  - 14L-14N 整体规划：继续以 `storage_inbound_detail` 2000 窗口推进完整拉取，暂不提升到 5000；销售表现仍保持 disabled，进入 enabled 前仍需补齐历史空 `data_date`、评估额外运行时间，并用真实 enabled 批次证明成功。
  - 验收命令通过：dry-run 45 个 enabled API、`compileall app tests`、93 个 unittest、`git diff --check` 和最终 DB 复核。
- 当前结论：
  - `storage_inbound_detail` 仍不应 enabled；下一阶段 14O 建议继续 2000 窗口回填。按新目标模式，14O 将作为下一组 3 轮的第 1 轮。

## Stage 14O

- 阶段目标：继续推进 `storage_inbound_detail` 2000 窗口缺失扫描回填，并作为新目标模式下一组 3 轮的第 1 轮。
- 已完成：
  - 前置核验显示工作区 `master...origin/master [ahead 58]` 且干净；最新提交为 `4358769 Document storage inbound detail 14N backfill`；文档已指向 14O。
  - README 核验显示已不再声明所有配置都是占位示例；当前说明为 YAML 同时包含少量占位示例和已按文档验证过的真实接口配置。
  - YAML 核验显示共 59 个 `api_code`、enabled 45 个；`storage_inbound_detail.enabled=false`、`param_source.limit=2000`、`exclude_existing_target=true`、`auto_advance=true`。
  - 覆盖矩阵核验显示公开文档 API 187 个、真实配置 API 51 个、enabled 45 个、configured disabled 6 个；销售表现 7 个拆分配置仍全部 disabled、`commit_per_page=true`、`data_date_param=beginDate`、`rate_limit.sleep_seconds=20`。
  - DB 前置核验使用 `source_primary_key` 轻量口径统计，显示 named lock 空闲、外部 `information_schema.innodb_trx=0`；`storage_inbound_detail` 起点覆盖为 137506/174334，累计失败请求为 0；DB `api_config` 为 59 条、enabled 45 条，`storage_inbound_detail.enabled=0`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api storage_inbound_detail` 正常返回 0，批次 `sync_20260712_085846_427821`，2000 次请求、2000 条成功计数、失败 0，批次耗时 1709 秒，API 耗时 1707 秒。
  - 本批次 raw 为 2000 条、2000 个 `source_primary_key`、2000 个不同主键、2000 个 `data_hash`、空主键 0，`data_date` 覆盖 `2025-11-12` 到 `2025-11-14`。
  - DB 核验显示 `storage_inbound_detail` 累计覆盖从 137506 增至 139506/174334，完成约 80.02%，剩余 34828；本批次和该 API 累计 `failed_request_log` 均为 0。
  - 同步结束后 named lock 已释放，外部 `information_schema.innodb_trx=0`；最终批次未出现锁等待或残留事务。
  - 验收命令通过：dry-run 45 个 enabled API、`compileall app tests`、93 个 unittest、`git diff --check` 和最终 DB 复核。
- 当前结论：
  - `storage_inbound_detail` 仍不应 enabled；下一阶段 14P 建议继续 2000 窗口回填。按新目标模式，14P 将作为本组三轮的第 2 轮，14Q 完成后做本组复盘和整体规划。

## Stage 14P

- 阶段目标：继续推进 `storage_inbound_detail` 2000 窗口缺失扫描回填，并作为新目标模式本组三轮的第 2 轮。
- 已完成：
  - 前置核验显示工作区 `master...origin/master [ahead 59]` 且干净；最新提交为 `99dec43 Document storage inbound detail 14O backfill`；文档已指向 14P。
  - README 核验显示已不再声明所有配置都是占位示例；当前说明为 YAML 同时包含少量占位示例和已按文档验证过的真实接口配置。
  - YAML 核验显示共 59 个 `api_code`、enabled 45 个；`storage_inbound_detail.enabled=false`、`param_source.limit=2000`、`exclude_existing_target=true`、`auto_advance=true`。
  - 覆盖矩阵核验显示公开文档 API 187 个、真实配置 API 51 个、enabled 45 个、configured disabled 6 个；销售表现 7 个拆分配置仍全部 disabled、`commit_per_page=true`、`data_date_param=beginDate`、`rate_limit.sleep_seconds=20`。
  - DB 前置核验使用 `source_primary_key` 轻量口径统计，显示 named lock 空闲、外部 `information_schema.innodb_trx=0`；`storage_inbound_detail` 起点覆盖为 139506/174334，累计失败请求为 0；DB `api_config` 为 59 条、enabled 45 条，`storage_inbound_detail.enabled=0`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api storage_inbound_detail` 正常返回 0，批次 `sync_20260712_093229_427628`，2000 次请求、2000 条成功计数、失败 0，批次耗时 1487 秒，API 耗时 1485 秒。
  - 本批次 raw 为 2000 条、2000 个 `source_primary_key`、2000 个不同主键、2000 个 `data_hash`、空主键 0，`data_date` 覆盖 `2025-11-14` 到 `2025-11-21`。
  - DB 核验显示 `storage_inbound_detail` 累计覆盖从 139506 增至 141506/174334，完成约 81.17%，剩余 32828；本批次和该 API 累计 `failed_request_log` 均为 0。
  - 同步结束后 named lock 已释放，外部 `information_schema.innodb_trx=0`；最终批次未出现锁等待或残留事务。
  - 验收命令通过：dry-run 45 个 enabled API、`compileall app tests`、93 个 unittest、`git diff --check` 和最终 DB 复核。
- 当前结论：
  - `storage_inbound_detail` 仍不应 enabled；下一阶段 14Q 建议继续 2000 窗口回填，并完成 14O-14Q 三轮复盘和整体规划。

## Stage 14Q

- 阶段目标：继续推进 `storage_inbound_detail` 2000 窗口缺失扫描回填，并完成 14O-14Q 三轮复盘和整体规划。
- 已完成：
  - 前置核验显示工作区 `master...origin/master [ahead 60]` 且干净；最新提交为 `7c73880 Document storage inbound detail 14P backfill`；文档已指向 14Q。
  - README 核验显示已不再声明所有配置都是占位示例；当前说明为 YAML 同时包含少量占位示例和已按文档验证过的真实接口配置。
  - YAML 核验显示共 59 个 `api_code`、enabled 45 个；`storage_inbound_detail.enabled=false`、`param_source.limit=2000`、`exclude_existing_target=true`、`auto_advance=true`。
  - 覆盖矩阵核验显示公开文档 API 187 个、真实配置 API 51 个、enabled 45 个、configured disabled 6 个；销售表现 7 个拆分配置仍全部 disabled、`commit_per_page=true`、`data_date_param=beginDate`、`rate_limit.sleep_seconds=20`。
  - DB 前置核验使用 `source_primary_key` 轻量口径统计，显示 named lock 空闲、外部 `information_schema.innodb_trx=0`；`storage_inbound_detail` 起点覆盖为 141506/174334，累计失败请求为 0；DB `api_config` 为 59 条、enabled 45 条，`storage_inbound_detail.enabled=0`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api storage_inbound_detail` 正常返回 0，批次 `sync_20260712_100226_982262`，2000 次请求、2000 条成功计数、失败 0，批次耗时 1653 秒，API 耗时 1651 秒。
  - 本批次 raw 为 2000 条、2000 个 `source_primary_key`、2000 个不同主键、2000 个 `data_hash`、空主键 0，`data_date` 覆盖 `2025-11-21` 到 `2025-11-25`。
  - DB 核验显示 `storage_inbound_detail` 累计覆盖从 141506 增至 143506/174334，完成约 82.32%，剩余 30828；本批次和该 API 累计 `failed_request_log` 均为 0。
  - 同步结束后 named lock 已释放，外部 `information_schema.innodb_trx=0`；最终批次未出现锁等待或残留事务。
  - 14O-14Q 复盘：三轮均使用 2000 窗口并各补齐 2000 条，覆盖从 137506 推进到 143506/174334，净增 6000；三轮同步命令均正常返回 0，最终批次均成功。
  - 14O-14Q 复盘：三轮最终批次均为 2000 请求、2000 成功、0 失败；批内主键和 hash 均唯一，空主键 0；`failed_request_log` 始终为 0；named lock 和外部事务收口正常。
  - 14O-14Q 整体规划：继续以 `storage_inbound_detail` 2000 窗口推进完整拉取，暂不提升到 5000；销售表现仍保持 disabled，进入 enabled 前仍需补齐历史空 `data_date`、评估额外运行时间，并用真实 enabled 批次证明成功。
  - 验收命令通过：dry-run 45 个 enabled API、`compileall app tests`、93 个 unittest、`git diff --check` 和最终 DB 复核。
- 当前结论：
  - `storage_inbound_detail` 仍不应 enabled；下一阶段 14R 建议继续 2000 窗口回填。按新目标模式，14R 将作为下一组 3 轮的第 1 轮。

## Stage 14R

- 阶段目标：继续推进 `storage_inbound_detail` 2000 窗口缺失扫描回填，并作为新目标模式下一组 3 轮的第 1 轮。
- 已完成：
  - 前置核验显示工作区 `master...origin/master [ahead 61]` 且干净；最新提交为 `912460c Document storage inbound detail 14Q backfill`；文档已指向 14R。
  - README 核验显示已不再声明所有配置都是占位示例；当前说明为 YAML 同时包含少量占位示例和已按文档验证过的真实接口配置。
  - YAML 核验显示共 59 个 `api_code`、enabled 45 个；`storage_inbound_detail.enabled=false`、`param_source.limit=2000`、`exclude_existing_target=true`、`auto_advance=true`。
  - 覆盖矩阵核验显示公开文档 API 187 个、真实配置 API 51 个、enabled 45 个、configured disabled 6 个；销售表现 7 个拆分配置仍全部 disabled、`commit_per_page=true`、`data_date_param=beginDate`、`rate_limit.sleep_seconds=20`。
  - DB 前置核验使用 `source_primary_key` 轻量口径统计，显示 named lock 空闲、外部 `information_schema.innodb_trx=0`；`storage_inbound_detail` 起点覆盖为 143506/174334，累计失败请求为 0；DB `api_config` 为 59 条、enabled 45 条，`storage_inbound_detail.enabled=0`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api storage_inbound_detail` 正常返回 0，批次 `sync_20260712_103531_227809`，2000 次请求、2000 条成功计数、失败 0，批次耗时 1572 秒，API 耗时 1569 秒。
  - 本批次 raw 为 2000 条、2000 个 `source_primary_key`、2000 个不同主键、2000 个 `data_hash`、空主键 0，`data_date` 覆盖 `2025-11-25` 到 `2025-12-01`。
  - DB 核验显示 `storage_inbound_detail` 累计覆盖从 143506 增至 145506/174334，完成约 83.46%，剩余 28828；本批次和该 API 累计 `failed_request_log` 均为 0。
  - 同步结束后 named lock 已释放，外部 `information_schema.innodb_trx=0`；最终批次未出现锁等待或残留事务。
  - 验收命令通过：dry-run 45 个 enabled API、`compileall app tests`、93 个 unittest、`git diff --check` 和最终 DB 复核。
- 当前结论：
  - `storage_inbound_detail` 仍不应 enabled；下一阶段 14S 建议继续 2000 窗口回填。按新目标模式，14S 将作为本组三轮的第 2 轮，14T 完成后做本组复盘和整体规划。

## Stage 14S

- 阶段目标：继续推进 `storage_inbound_detail` 2000 窗口缺失扫描回填，并作为本组三轮的第 2 轮。
- 已完成：
  - 前置核验显示工作区 `master...origin/master [ahead 62]` 且干净；最新提交为 `58c96be Document storage inbound detail 14R backfill`；文档已指向 14S。
  - README 核验显示已不再声明所有配置都是占位示例；当前说明为 YAML 同时包含少量占位示例和已按文档验证过的真实接口配置。
  - YAML 核验显示共 59 个 `api_code`、enabled 45 个；`storage_inbound_detail.enabled=false`、`param_source.limit=2000`、`exclude_existing_target=true`、`auto_advance=true`。
  - 覆盖矩阵核验显示公开文档 API 187 个、真实配置 API 51 个、enabled 45 个、configured disabled 6 个；销售表现 7 个拆分配置仍全部 disabled、`commit_per_page=true`、`data_date_param=beginDate`、`rate_limit.sleep_seconds=20`。
  - DB 前置核验使用 `source_primary_key` 轻量口径统计，显示 named lock 空闲、外部 `information_schema.innodb_trx=0`；`storage_inbound_detail` 起点覆盖为 145506/174334，累计失败请求为 0；DB `api_config` 为 59 条、enabled 45 条，`storage_inbound_detail.enabled=0`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api storage_inbound_detail` 正常返回 0，批次 `sync_20260712_110921_589140`，2000 次请求、2000 条成功计数、失败 0，批次耗时 1449 秒，API 耗时 1447 秒。
  - 本批次 raw 为 2000 条、2000 个 `source_primary_key`、2000 个不同主键、2000 个 `data_hash`、空主键 0，`data_date` 覆盖 `2025-12-01` 到 `2025-12-04`。
  - DB 核验显示 `storage_inbound_detail` 累计覆盖从 145506 增至 147506/174334，完成约 84.61%，剩余 26828；本批次和该 API 累计 `failed_request_log` 均为 0。
  - 同步结束后 named lock 已释放，外部 `information_schema.innodb_trx=0`；最终批次未出现锁等待或残留事务。
  - 验收命令通过：dry-run 45 个 enabled API、`compileall app tests`、93 个 unittest、`git diff --check` 和最终 DB 复核。
- 当前结论：
  - `storage_inbound_detail` 仍不应 enabled；下一阶段 14T 建议继续 2000 窗口回填。按新目标模式，14T 将作为本组三轮的第 3 轮，完成后做本组复盘和整体规划。

## Stage 14T

- 阶段目标：继续推进 `storage_inbound_detail` 2000 窗口缺失扫描回填，并作为本组三轮的第 3 轮；完成后做 14R-14T 三轮复盘。
- 已完成：
  - 前置核验显示工作区 `master...origin/master [ahead 63]` 且干净；最新提交为 `4cba4ef Document storage inbound detail 14S backfill`；文档已指向 14T。
  - README 核验显示已不再声明所有配置都是占位示例；当前说明为 YAML 同时包含少量占位示例和已按文档验证过的真实接口配置。
  - YAML 核验显示共 59 个 `api_code`、enabled 45 个；`storage_inbound_detail.enabled=false`、`param_source.limit=2000`、`exclude_existing_target=true`、`auto_advance=true`。
  - 覆盖矩阵核验显示公开文档 API 187 个、真实配置 API 51 个、enabled 45 个、configured disabled 6 个；销售表现 7 个拆分配置仍全部 disabled、`commit_per_page=true`、`data_date_param=beginDate`、`rate_limit.sleep_seconds=20`。
  - DB 前置核验使用 `source_primary_key` 轻量口径统计，显示 named lock 空闲、外部 `information_schema.innodb_trx=0`；`storage_inbound_detail` 起点覆盖为 147506/174334，累计失败请求为 0；DB `api_config` 为 59 条、enabled 45 条，`storage_inbound_detail.enabled=0`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api storage_inbound_detail` 正常返回 0，批次 `sync_20260712_113859_437382`，2000 次请求、2000 条成功计数、失败 0，批次耗时 1339 秒，API 耗时 1337 秒。
  - 本批次 raw 为 2000 条、2000 个 `source_primary_key`、2000 个不同主键、2000 个 `data_hash`、空主键 0，`data_date` 覆盖 `2025-12-04` 到 `2025-12-05`。
  - DB 核验显示 `storage_inbound_detail` 累计覆盖从 147506 增至 149506/174334，完成约 85.76%，剩余 24828；本批次和该 API 累计 `failed_request_log` 均为 0。
  - 同步结束后 named lock 已释放，外部 `information_schema.innodb_trx=0`；最终批次未出现锁等待或残留事务。
  - 验收命令通过：dry-run 45 个 enabled API、`compileall app tests`、93 个 unittest、`git diff --check` 和最终 DB 复核。
- 三轮复盘：
  - 14R-14T 三轮均为 `storage_inbound_detail` 2000 窗口回填，三个批次均成功，合计 6000 次请求、6000 条成功计数、失败 0。
  - 覆盖从 143506/174334 推进到 149506/174334，净增 6000；完成率从约 82.32% 提升到约 85.76%，剩余从 30828 降到 24828。
  - 三轮均未出现 failed_request_log、named lock 残留或外部 InnoDB 事务残留；当前 2000 窗口仍是稳定推进策略。
- 当前结论：
  - `storage_inbound_detail` 仍不应 enabled；下一阶段 14U 建议继续 2000 窗口回填。按新目标模式，14U 将作为下一组三轮的第 1 轮。

## Stage 14U

- 阶段目标：继续推进 `storage_inbound_detail` 2000 窗口缺失扫描回填，并作为下一组三轮的第 1 轮。
- 已完成：
  - 前置核验显示工作区 `master...origin/master [ahead 64]` 且干净；最新提交为 `a4a251e Document storage inbound detail 14T backfill`；文档已指向 14U。
  - README 核验显示已不再声明所有配置都是占位示例；当前说明为 YAML 同时包含少量占位示例和已按文档验证过的真实接口配置。
  - YAML 核验显示共 59 个 `api_code`、enabled 45 个；`storage_inbound_detail.enabled=false`、`param_source.limit=2000`、`exclude_existing_target=true`、`auto_advance=true`。
  - 覆盖矩阵核验显示公开文档 API 187 个、真实配置 API 51 个、enabled 45 个、configured disabled 6 个；销售表现 7 个拆分配置仍全部 disabled、`commit_per_page=true`、`data_date_param=beginDate`、`rate_limit.sleep_seconds=20`。
  - DB 前置核验使用 `source_primary_key` 轻量口径统计，显示 named lock 空闲、外部 `information_schema.innodb_trx=0`；`storage_inbound_detail` 起点覆盖为 149506/174334，累计失败请求为 0；DB `api_config` 为 59 条、enabled 45 条，`storage_inbound_detail.enabled=0`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api storage_inbound_detail` 正常返回 0，批次 `sync_20260712_120648_798323`，2000 次请求、2000 条成功计数、失败 0，批次耗时 1618 秒，API 耗时 1615 秒。
  - 本批次 raw 为 2000 条、2000 个 `source_primary_key`、2000 个不同主键、2000 个 `data_hash`、空主键 0，`data_date` 均为 `2025-12-05`。
  - DB 核验显示 `storage_inbound_detail` 累计覆盖从 149506 增至 151506/174334，完成约 86.91%，剩余 22828；本批次和该 API 累计 `failed_request_log` 均为 0。
  - 同步结束后 named lock 已释放，外部 `information_schema.innodb_trx=0`；最终批次未出现锁等待或残留事务。
  - 验收命令通过：dry-run 45 个 enabled API、`compileall app tests`、93 个 unittest、`git diff --check` 和最终 DB 复核。
- 当前结论：
  - `storage_inbound_detail` 仍不应 enabled；下一阶段 14V 建议继续 2000 窗口回填。按新目标模式，14V 将作为本组三轮的第 2 轮，14W 完成后做本组复盘和整体规划。

## Stage 14V

- 阶段目标：继续推进 `storage_inbound_detail` 2000 窗口缺失扫描回填，并作为本组三轮的第 2 轮。
- 已完成：
  - 前置核验显示工作区 `master...origin/master [ahead 65]` 且干净；最新提交为 `bacc319 Document storage inbound detail 14U backfill`；文档已指向 14V。
  - README 核验显示已不再声明所有配置都是占位示例；当前说明为 YAML 同时包含少量占位示例和已按文档验证过的真实接口配置。
  - YAML 核验显示共 59 个 `api_code`、enabled 45 个；`storage_inbound_detail.enabled=false`、`param_source.limit=2000`、`exclude_existing_target=true`、`auto_advance=true`。
  - 覆盖矩阵核验显示公开文档 API 187 个、真实配置 API 51 个、enabled 45 个、configured disabled 6 个；销售表现 7 个拆分配置仍全部 disabled、`commit_per_page=true`、`data_date_param=beginDate`、`rate_limit.sleep_seconds=20`。
  - DB 前置核验使用 `source_primary_key` 轻量口径统计，显示 named lock 空闲、外部 `information_schema.innodb_trx=0`；`storage_inbound_detail` 起点覆盖为 151506/174334，累计失败请求为 0；DB `api_config` 为 59 条、enabled 45 条，`storage_inbound_detail.enabled=0`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api storage_inbound_detail` 正常返回 0，批次 `sync_20260712_123918_371296`，2000 次请求、2000 条成功计数、失败 0，批次耗时 1755 秒，API 耗时 1752 秒。
  - 本批次 raw 为 2000 条、2000 个 `source_primary_key`、2000 个不同主键、2000 个 `data_hash`、空主键 0，`data_date` 覆盖 `2025-12-05` 到 `2025-12-06`。
  - DB 核验显示 `storage_inbound_detail` 累计覆盖从 151506 增至 153506/174334，完成约 88.05%，剩余 20828；本批次和该 API 累计 `failed_request_log` 均为 0。
  - 同步结束后 named lock 已释放，外部 `information_schema.innodb_trx=0`；最终批次未出现锁等待或残留事务。
  - 验收命令通过：dry-run 45 个 enabled API、`compileall app tests`、93 个 unittest、`git diff --check` 和最终 DB 复核。
- 当前结论：
  - `storage_inbound_detail` 仍不应 enabled；下一阶段 14W 建议继续 2000 窗口回填并完成 14U-14W 三轮复盘和整体规划。

## Stage 14W

- 阶段目标：继续推进 `storage_inbound_detail` 2000 窗口缺失扫描回填，并作为本组三轮的第 3 轮；完成后做 14U-14W 三轮复盘。
- 已完成：
  - 前置核验显示工作区 `master...origin/master [ahead 66]` 且干净；最新提交为 `ffe77ec Document storage inbound detail 14V backfill`；文档已指向 14W。
  - README 核验显示已不再声明所有配置都是占位示例；当前说明为 YAML 同时包含少量占位示例和已按文档验证过的真实接口配置。
  - YAML 核验显示共 59 个 `api_code`、enabled 45 个；`storage_inbound_detail.enabled=false`、`param_source.limit=2000`、`exclude_existing_target=true`、`auto_advance=true`。
  - 覆盖矩阵核验显示公开文档 API 187 个、真实配置 API 51 个、enabled 45 个、configured disabled 6 个；销售表现 7 个拆分配置仍全部 disabled、`commit_per_page=true`、`data_date_param=beginDate`、`rate_limit.sleep_seconds=20`。
  - DB 前置核验使用 `source_primary_key` 轻量口径统计，显示 named lock 空闲、外部 `information_schema.innodb_trx=0`；`storage_inbound_detail` 起点覆盖为 153506/174334，累计失败请求为 0；DB `api_config` 为 59 条、enabled 45 条，`storage_inbound_detail.enabled=0`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api storage_inbound_detail` 正常返回 0，批次 `sync_20260712_131413_719479`，2000 次请求、2000 条成功计数、失败 0，批次耗时 1521 秒，API 耗时 1519 秒。
  - 本批次 raw 为 2000 条、2000 个 `source_primary_key`、2000 个不同主键、2000 个 `data_hash`、空主键 0，`data_date` 覆盖 `2025-12-06` 到 `2025-12-09`。
  - DB 核验显示 `storage_inbound_detail` 累计覆盖从 153506 增至 155506/174334，完成约 89.20%，剩余 18828；本批次和该 API 累计 `failed_request_log` 均为 0。
  - 同步结束后 named lock 已释放，外部 `information_schema.innodb_trx=0`；最终批次未出现锁等待或残留事务。
  - 验收命令通过：dry-run 45 个 enabled API、`compileall app tests`、93 个 unittest、`git diff --check` 和最终 DB 复核。
- 三轮复盘：
  - 14U-14W 三轮均为 `storage_inbound_detail` 2000 窗口回填，三个批次均成功，合计 6000 次请求、6000 条成功计数、失败 0。
  - 覆盖从 149506/174334 推进到 155506/174334，净增 6000；完成率从约 85.76% 提升到约 89.20%，剩余从 24828 降到 18828。
  - 三轮均未出现 failed_request_log、named lock 残留或外部 InnoDB 事务残留；当前 2000 窗口仍是稳定推进策略。
- 当前结论：
  - `storage_inbound_detail` 仍不应 enabled；下一阶段 14X 建议继续 2000 窗口回填。按新目标模式，14X 将作为下一组三轮的第 1 轮。

## Stage 14X

- 阶段目标：继续推进 `storage_inbound_detail` 2000 窗口缺失扫描回填，并作为下一组三轮的第 1 轮。
- 已完成：
  - 前置核验显示工作区 `master...origin/master [ahead 67]` 且干净；最新提交为 `b3ffb23 Document storage inbound detail 14W backfill`；文档已指向 14X。
  - README 核验显示已不再声明所有配置都是占位示例；当前说明为 YAML 同时包含少量占位示例和已按文档验证过的真实接口配置。
  - YAML 核验显示共 59 个 `api_code`、enabled 45 个；`storage_inbound_detail.enabled=false`、`param_source.limit=2000`、`exclude_existing_target=true`、`auto_advance=true`。
  - 覆盖矩阵核验显示公开文档 API 187 个、真实配置 API 51 个、enabled 45 个、configured disabled 6 个；销售表现 7 个拆分配置仍全部 disabled、`commit_per_page=true`、`data_date_param=beginDate`、`rate_limit.sleep_seconds=20`。
  - DB 前置核验使用 `source_primary_key` 轻量口径统计，显示 named lock 空闲、外部 `information_schema.innodb_trx=0`；`storage_inbound_detail` 起点覆盖为 155506/174334，累计失败请求为 0；DB `api_config` 为 59 条、enabled 45 条，`storage_inbound_detail.enabled=0`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api storage_inbound_detail` 正常返回 0，批次 `sync_20260712_134502_879945`，2000 次请求、2000 条成功计数、失败 0，批次耗时 1551 秒，API 耗时 1549 秒。
  - 本批次 raw 为 2000 条、2000 个 `source_primary_key`、2000 个不同主键、2000 个 `data_hash`、空主键 0，`data_date` 覆盖 `2025-12-09` 到 `2025-12-10`。
  - DB 核验显示 `storage_inbound_detail` 累计覆盖从 155506 增至 157506/174334，完成约 90.35%，剩余 16828；本批次和该 API 累计 `failed_request_log` 均为 0。
  - 同步结束后 named lock 已释放，外部 `information_schema.innodb_trx=0`；最终批次未出现锁等待或残留事务。
  - 验收命令通过：dry-run 45 个 enabled API、`compileall app tests`、93 个 unittest、`git diff --check` 和最终 DB 复核。
- 当前结论：
  - `storage_inbound_detail` 仍不应 enabled；下一阶段 14Y 建议继续 2000 窗口回填。按新目标模式，14Y 将作为本组三轮的第 2 轮，14Z 完成后做本组复盘和整体规划。

## Stage 14Y

- 阶段目标：继续推进 `storage_inbound_detail` 2000 窗口缺失扫描回填，并作为本组三轮的第 2 轮。
- 本轮结果：
  - 前置核验显示工作区 `master...origin/master [ahead 68]` 且干净；最新提交为 `ae817ef Document storage inbound detail 14X backfill`；文档已指向 14Y。
  - YAML 核验显示共 59 个 `api_code`、enabled 45 个；`storage_inbound_detail.enabled=false`、`param_source.limit=2000`、`exclude_existing_target=true`、`auto_advance=true`。
  - 覆盖矩阵核验显示公开文档 API 187 个、真实配置 API 51 个、enabled 45 个、configured disabled 6 个；销售表现 7 个拆分配置仍全部 disabled、`commit_per_page=true`。
  - DB 前置核验使用 `source_primary_key` 轻量口径统计，显示 named lock 空闲、外部 `information_schema.innodb_trx=0`；`storage_inbound_detail` 起点覆盖为 157506/174334，累计失败请求为 0；DB `api_config` 为 59 条、enabled 45 条，`storage_inbound_detail.enabled=0`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api storage_inbound_detail` 正常返回 0，批次 `sync_20260712_141747_244175`，2000 次请求、2000 条成功计数、失败 0，批次耗时 1454 秒，API 耗时 1451 秒。
  - 本批次 raw 为 2000 条、2000 个 `source_primary_key`、2000 个不同主键、2000 个 `data_hash`、空主键 0，`data_date` 覆盖 `2025-12-10` 到 `2025-12-11`。
  - DB 核验显示 `storage_inbound_detail` 累计覆盖从 157506 增至 159506/174334，完成约 91.49%，剩余 14828；本批次和该 API 累计 `failed_request_log` 均为 0。
  - 同步结束后 named lock 已释放，外部 `information_schema.innodb_trx=0`；DB `api_config` 仍为 59 条、enabled 45 条，`storage_inbound_detail.enabled=0`。
  - 验收命令通过：dry-run 45 个 enabled API、`compileall app tests`、93 个 unittest、`git diff --check` 和最终 DB 复核。
- 当前结论：
  - `storage_inbound_detail` 仍不应 enabled；下一阶段 14Z 建议继续 2000 窗口回填，并完成本组三轮复盘和整体规划。

## Stage 14Z

- 阶段目标：继续推进 `storage_inbound_detail` 2000 窗口缺失扫描回填，并完成 14X-14Z 三轮复盘和整体规划。
- 本轮结果：
  - 前置核验显示工作区 `master...origin/master [ahead 69]` 且干净；最新提交为 `14aa8a4 Document storage inbound detail 14Y backfill`；文档已指向 14Z。
  - YAML 核验显示共 59 个 `api_code`、enabled 45 个；`storage_inbound_detail.enabled=false`、`param_source.limit=2000`、`exclude_existing_target=true`、`auto_advance=true`。
  - 覆盖矩阵核验显示公开文档 API 187 个、真实配置 API 51 个、enabled 45 个、configured disabled 6 个；销售表现 7 个拆分配置仍全部 disabled、`commit_per_page=true`。
  - DB 前置核验使用 `source_primary_key` 轻量口径统计，显示 named lock 空闲、外部 `information_schema.innodb_trx=0`；`storage_inbound_detail` 起点覆盖为 159506/174334，累计失败请求为 0；DB `api_config` 为 59 条、enabled 45 条，`storage_inbound_detail.enabled=0`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api storage_inbound_detail` 正常返回 0，批次 `sync_20260712_144942_448994`，2000 次请求、2000 条成功计数、失败 0，批次耗时 1627 秒，API 耗时 1625 秒。
  - 本批次 raw 为 2000 条、2000 个 `source_primary_key`、2000 个不同主键、2000 个 `data_hash`、空主键 0，`data_date` 覆盖 `2025-12-11` 到 `2025-12-13`。
  - DB 核验显示 `storage_inbound_detail` 累计覆盖从 159506 增至 161506/174334，完成约 92.64%，剩余 12828；本批次和该 API 累计 `failed_request_log` 均为 0。
  - 同步结束后 named lock 已释放，外部 `information_schema.innodb_trx=0`；DB `api_config` 仍为 59 条、enabled 45 条，`storage_inbound_detail.enabled=0`。
  - 验收命令通过：dry-run 45 个 enabled API、`compileall app tests`、93 个 unittest、`git diff --check` 和最终 DB 复核。
- 三轮复盘：
  - 14X-14Z 三轮均为 `storage_inbound_detail` 2000 窗口回填，三个批次均成功，合计 6000 次请求、6000 条成功计数、失败 0。
  - 覆盖从 155506/174334 推进到 161506/174334，净增 6000；完成率从约 89.20% 提升到约 92.64%，剩余从 18828 降到 12828。
  - 三轮均未出现 failed_request_log、named lock 残留或外部 InnoDB 事务残留；当前 2000 窗口仍是稳定推进策略。
  - 销售表现仍保持 disabled；进入 enabled 前仍需补齐历史空 `data_date`、评估约 22 分钟额外单日运行时间，并用真实 enabled 批次证明成功。
- 整体规划：
  - 下一组从 15A 开始，继续以 `storage_inbound_detail` 2000 窗口推进完整拉取，暂不提升到 5000。
  - 15A 作为下一组三轮第 1 轮，优先继续缺失扫描回填；当剩余缺口接近 10000 以下时再评估是否调整收尾策略。
- 当前结论：
  - `storage_inbound_detail` 仍不应 enabled；下一阶段 15A 建议继续 2000 窗口回填。

## Stage 15A

- 阶段目标：继续推进 `storage_inbound_detail` 2000 窗口缺失扫描回填，并作为下一组三轮的第 1 轮。
- 本轮结果：
  - 前置核验显示工作区 `master...origin/master [ahead 70]` 且干净；最新提交为 `a67a97c Document storage inbound detail 14Z backfill`；文档已指向 15A。
  - YAML 核验显示共 59 个 `api_code`、enabled 45 个；`storage_inbound_detail.enabled=false`、`param_source.limit=2000`、`exclude_existing_target=true`、`auto_advance=true`。
  - 覆盖矩阵核验显示公开文档 API 187 个、真实配置 API 51 个、enabled 45 个、configured disabled 6 个；销售表现 7 个拆分配置仍全部 disabled、`commit_per_page=true`。
  - DB 前置核验使用 `source_primary_key` 轻量口径统计，显示 named lock 空闲、外部 `information_schema.innodb_trx=0`；`storage_inbound_detail` 起点覆盖为 161506/174334，累计失败请求为 0；DB `api_config` 为 59 条、enabled 45 条，`storage_inbound_detail.enabled=0`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api storage_inbound_detail` 正常返回 0，批次 `sync_20260712_152306_276301`，2000 次请求、2000 条成功计数、失败 0，批次耗时 1411 秒，API 耗时 1409 秒。
  - 本批次 raw 为 2000 条、2000 个 `source_primary_key`、2000 个不同主键、2000 个 `data_hash`、空主键 0，`data_date` 覆盖 `2025-12-13` 到 `2025-12-16`。
  - DB 核验显示 `storage_inbound_detail` 累计覆盖从 161506 增至 163506/174334，完成约 93.79%，剩余 10828；本批次和该 API 累计 `failed_request_log` 均为 0。
  - 同步结束后 named lock 已释放，外部 `information_schema.innodb_trx=0`；DB `api_config` 仍为 59 条、enabled 45 条，`storage_inbound_detail.enabled=0`。
  - 验收命令通过：dry-run 45 个 enabled API、`compileall app tests`、93 个 unittest、`git diff --check` 和最终 DB 复核。
- 当前结论：
  - `storage_inbound_detail` 仍不应 enabled；下一阶段 15B 建议继续 2000 窗口回填。按新目标模式，15B 将作为本组三轮的第 2 轮，15C 完成后做本组复盘和整体规划。

## Stage 15B

- 阶段目标：继续推进 `storage_inbound_detail` 2000 窗口缺失扫描回填，并作为本组三轮的第 2 轮。
- 本轮结果：
  - 前置核验显示工作区 `master...origin/master [ahead 71]`；最新提交为 `69c80a2 Document storage inbound detail 15A backfill`；文档已指向 15B。
  - YAML 核验显示共 59 个 `api_code`、enabled 45 个；`storage_inbound_detail.enabled=false`、`param_source.limit=2000`、`exclude_existing_target=true`、`auto_advance=true`。
  - 覆盖矩阵核验显示公开文档 API 187 个、真实配置 API 51 个、enabled 45 个、configured disabled 6 个；销售表现 7 个拆分配置仍全部 disabled、`commit_per_page=true`。
  - DB 前置核验使用 `source_primary_key` 轻量口径统计，显示 named lock 空闲、外部 `information_schema.innodb_trx=0`；`storage_inbound_detail` 起点覆盖为 163506/174334，累计失败请求为 0；DB `api_config` 为 59 条、enabled 45 条，`storage_inbound_detail.enabled=0`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api storage_inbound_detail` 正常返回 0，批次 `sync_20260712_155325_112417`，2000 次请求、2000 条成功计数、失败 0，批次耗时 1808 秒，API 耗时 1806 秒。
  - 本批次 raw 为 2000 条、2000 个 `source_primary_key`、2000 个不同主键、2000 个 `data_hash`、空主键 0，`data_date` 覆盖 `2025-12-16` 到 `2025-12-17`。
  - DB 核验显示 `storage_inbound_detail` 累计覆盖从 163506 增至 165506/174334，完成约 94.94%，剩余 8828；本批次和该 API 累计 `failed_request_log` 均为 0。
  - 同步结束后 named lock 已释放，外部 `information_schema.innodb_trx=0`；DB `api_config` 仍为 59 条、enabled 45 条，`storage_inbound_detail.enabled=0`。
  - 验收命令通过：dry-run 45 个 enabled API、`compileall app tests`、93 个 unittest、`git diff --check` 和最终 DB 复核。
- 当前结论：
  - `storage_inbound_detail` 仍不应 enabled；下一阶段 15C 建议继续 2000 窗口回填，并在完成后做 15A-15C 三轮复盘和整体规划。

## Stage 15C

- 阶段目标：继续推进 `storage_inbound_detail` 2000 窗口缺失扫描回填，并完成 15A-15C 三轮复盘和整体规划。
- 本轮结果：
  - 前置核验显示工作区 `master...origin/master [ahead 72]`；最新提交为 `8648917 Document storage inbound detail 15B backfill`；文档已指向 15C。
  - YAML 核验显示共 59 个 `api_code`、enabled 45 个；`storage_inbound_detail.enabled=false`、`param_source.limit=2000`、`exclude_existing_target=true`、`auto_advance=true`。
  - 覆盖矩阵核验显示公开文档 API 187 个、真实配置 API 51 个、enabled 45 个、configured disabled 6 个；销售表现 7 个拆分配置仍全部 disabled、`commit_per_page=true`。
  - DB 前置核验使用 `source_primary_key` 轻量口径统计，显示 named lock 空闲、外部 `information_schema.innodb_trx=0`；`storage_inbound_detail` 起点覆盖为 165506/174334，累计失败请求为 0；DB `api_config` 为 59 条、enabled 45 条，`storage_inbound_detail.enabled=0`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api storage_inbound_detail` 正常返回 0，批次 `sync_20260712_163010_583171`，2000 次请求、2000 条成功计数、失败 0，批次耗时 1654 秒，API 耗时 1653 秒。
  - 本批次 raw 为 2000 条、2000 个 `source_primary_key`、2000 个不同主键、2000 个 `data_hash`、空主键 0，`data_date` 均为 `2025-12-17`。
  - DB 核验显示 `storage_inbound_detail` 累计覆盖从 165506 增至 167506/174334，完成约 96.08%，剩余 6828；本批次和该 API 累计 `failed_request_log` 均为 0。
  - 同步结束后 named lock 已释放，外部 `information_schema.innodb_trx=0`；DB `api_config` 仍为 59 条、enabled 45 条，`storage_inbound_detail.enabled=0`。
  - 验收命令通过：dry-run 45 个 enabled API、`compileall app tests`、93 个 unittest、`git diff --check` 和最终 DB 复核。
- 三轮复盘：
  - 15A-15C 三轮均为 `storage_inbound_detail` 2000 窗口回填，三个批次均成功，合计 6000 次请求、6000 条成功计数、失败 0。
  - 覆盖从 161506/174334 推进到 167506/174334，净增 6000；完成率从约 92.64% 提升到约 96.08%，剩余从 12828 降到 6828。
  - 三轮批次内主键和 hash 均唯一，空主键均为 0；三轮均无 `failed_request_log`、named lock 残留或外部 InnoDB 事务残留。
- 整体规划：
  - 下一组从 15D 开始，继续以 `storage_inbound_detail` 2000 窗口推进完整拉取；当前剩余 6828，仍不在前台任务中临时放大到 5000。
  - 如果连续 2000 窗口把剩余缺口压到 3000 以下，再评估是否用较小收尾窗口或继续当前 limit 完成闭环。
  - 销售表现继续保持 disabled；进入 enabled 前仍需补齐历史空 `data_date`、评估约 22 分钟额外单日运行时间，并用真实 enabled 批次证明成功。
- 当前结论：
  - `storage_inbound_detail` 仍不应 enabled；下一阶段 15D 建议继续 2000 窗口回填。按新目标模式，15D 将作为下一组三轮的第 1 轮。

## Stage 15D

- 阶段目标：继续推进 `storage_inbound_detail` 2000 窗口缺失扫描回填，并作为下一组三轮的第 1 轮。
- 本轮结果：
  - 前置核验显示工作区 `master...origin/master [ahead 73]`；最新提交为 `b1e9fac Document storage inbound detail 15C backfill`；文档已指向 15D。
  - YAML 核验显示共 59 个 `api_code`、enabled 45 个；`storage_inbound_detail.enabled=false`、`param_source.limit=2000`、`exclude_existing_target=true`、`auto_advance=true`。
  - 覆盖矩阵核验显示公开文档 API 187 个、真实配置 API 51 个、enabled 45 个、configured disabled 6 个；销售表现 7 个拆分配置仍全部 disabled、`commit_per_page=true`。
  - DB 前置核验使用 `source_primary_key` 轻量口径统计，显示 named lock 空闲、外部 `information_schema.innodb_trx=0`；`storage_inbound_detail` 起点覆盖为 167506/174334，累计失败请求为 0；DB `api_config` 为 59 条、enabled 45 条，`storage_inbound_detail.enabled=0`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api storage_inbound_detail` 正常返回 0，批次 `sync_20260712_170335_445099`，2000 次请求、2000 条成功计数、失败 0，批次耗时 1868 秒，API 耗时 1865 秒。
  - 本批次 raw 为 2000 条、2000 个 `source_primary_key`、2000 个不同主键、2000 个 `data_hash`、空主键 0，`data_date` 覆盖 `2025-12-17` 到 `2025-12-24`。
  - DB 核验显示 `storage_inbound_detail` 累计覆盖从 167506 增至 169506/174334，完成约 97.23%，剩余 4828；本批次和该 API 累计 `failed_request_log` 均为 0。
  - 同步结束后 named lock 已释放，外部 `information_schema.innodb_trx=0`；DB `api_config` 仍为 59 条、enabled 45 条，`storage_inbound_detail.enabled=0`。
  - 验收命令通过：dry-run 45 个 enabled API、`compileall app tests`、93 个 unittest、`git diff --check` 和最终 DB 复核；`git diff --check` 仅提示文档 LF/CRLF 替换警告。
- 当前结论：
  - `storage_inbound_detail` 仍不应 enabled；下一阶段 15E 建议继续 2000 窗口回填。按新目标模式，15E 将作为本组三轮的第 2 轮。

## Stage 15E

- 阶段目标：继续推进 `storage_inbound_detail` 2000 窗口缺失扫描回填，并作为本组三轮的第 2 轮。
- 本轮结果：
  - 前置核验显示工作区 `master...origin/master [ahead 74]`；最新提交为 `0ecaf44 Document storage inbound detail 15D backfill`；文档已指向 15E。
  - YAML 核验显示共 59 个 `api_code`、enabled 45 个；`storage_inbound_detail.enabled=false`、`param_source.limit=2000`、`exclude_existing_target=true`、`auto_advance=true`。
  - 覆盖矩阵核验显示公开文档 API 187 个、真实配置 API 51 个、enabled 45 个、configured disabled 6 个；销售表现 7 个拆分配置仍全部 disabled、`commit_per_page=true`。
  - DB 前置核验使用 `source_primary_key` 轻量口径统计，显示 named lock 空闲、外部 `information_schema.innodb_trx=0`；`storage_inbound_detail` 起点覆盖为 169506/174334，累计失败请求为 0；DB `api_config` 为 59 条、enabled 45 条，`storage_inbound_detail.enabled=0`。
  - `.\\.venv\\Scripts\\python.exe -m app.main --sync-api storage_inbound_detail` 正常返回 0，批次 `sync_20260712_174146_036059`，2000 次请求、2000 条成功计数、失败 0，批次耗时 1520 秒，API 耗时 1517 秒。
  - 本批次 raw 为 2000 条、2000 个 `source_primary_key`、2000 个不同主键、2000 个 `data_hash`、空主键 0，`data_date` 覆盖 `2025-12-24` 到 `2026-01-22`。
  - DB 核验显示 `storage_inbound_detail` 累计覆盖从 169506 增至 171506/174334，完成约 98.38%，剩余 2828；本批次和该 API 累计 `failed_request_log` 均为 0。
  - 同步结束后 named lock 已释放，外部 `information_schema.innodb_trx=0`；DB `api_config` 仍为 59 条、enabled 45 条，`storage_inbound_detail.enabled=0`。
  - 验收命令通过：dry-run 45 个 enabled API、`compileall app tests`、93 个 unittest、`git diff --check` 和最终 DB 复核；`git diff --check` 仅提示文档 LF/CRLF 替换警告。
- 当前结论：
  - `storage_inbound_detail` 仍不应 enabled；下一阶段 15F 建议继续 2000 窗口回填。按新目标模式，15F 将作为本组三轮的第 3 轮，完成后需要做 15D-15F 三轮复盘。

## Stage 15F

- 阶段目标：继续推进 `storage_inbound_detail` 2000 窗口缺失扫描回填，并作为本组三轮的第 3 轮；完成后做 15D-15F 三轮复盘。
- 本轮结果：
  - 前置核验显示工作区 `master...origin/master [ahead 75]`；最新提交为 `4a52d77 Document storage inbound detail 15E backfill`；文档已指向 15F。
  - YAML 核验显示共 59 个 `api_code`、enabled 45 个；`storage_inbound_detail.enabled=false`、`param_source.limit=2000`、`exclude_existing_target=true`、`auto_advance=true`。
  - 覆盖矩阵核验显示公开文档 API 187 个、真实配置 API 51 个、enabled 45 个、configured disabled 6 个；销售表现 7 个拆分配置仍全部 disabled、`commit_per_page=true`。
  - DB 前置核验使用 `source_primary_key` 轻量口径统计，显示 named lock 空闲、外部 `information_schema.innodb_trx=0`；`storage_inbound_detail` 起点覆盖为 171506/174334，累计失败请求为 0；DB `api_config` 为 59 条、enabled 45 条，`storage_inbound_detail.enabled=0`。
  - 前两次 `.\\.venv\\Scripts\\python.exe -m app.main --sync-api storage_inbound_detail` 均返回通用失败并提示 `release sync task lock failed`；DB 复核显示未生成可见新批次、覆盖未推进、失败日志为 0，但分别留下 Sleep InnoDB 事务 `5635742` 和 `5637222`，已在确认事务归属和锁状态后结束连接，清理后 named lock 与外部事务均恢复为空。
  - 为定位顶层通用错误，直接调用 `SyncEngine.test_api_once('storage_inbound_detail', ...)` 的诊断脚本执行成功，批次 `sync_20260712_182634_361462`，2000 次请求、2000 条成功计数、失败 0，批次耗时 1498 秒，API 耗时 1494 秒。
  - 本批次 raw 为 2000 条、2000 个 `source_primary_key`、2000 个不同主键、2000 个 `data_hash`、空主键 0，`data_date` 覆盖 `2026-01-22` 到 `2026-03-09`。
  - DB 核验显示 `storage_inbound_detail` 累计覆盖从 171506 增至 173506/174334，完成约 99.53%，剩余 828；本批次和该 API 累计 `failed_request_log` 均为 0。
  - 同步结束后 named lock 已释放，外部 `information_schema.innodb_trx=0`；DB `api_config` 仍为 59 条、enabled 45 条，`storage_inbound_detail.enabled=0`。
  - 验收命令通过：dry-run 45 个 enabled API、`compileall app tests`、93 个 unittest、`git diff --check` 和最终 DB 复核；`git diff --check` 仅提示文档 LF/CRLF 替换警告。
- 15D-15F 三轮复盘：
  - 三轮最终成功批次均为 2000 窗口回填，合计 6000 请求、6000 条成功计数、失败 0；覆盖从 167506/174334 推进到 173506/174334，净增 6000，剩余从 6828 降到 828。
  - 三轮最终成功批次内主键和 hash 均唯一，空主键均为 0；最终状态下三轮均无 `failed_request_log`、named lock 残留或外部 InnoDB 事务残留。
  - 15F 暴露出顶层 CLI 在失败路径中仍可能留下 Sleep InnoDB 事务；本轮未改代码，先按事实记录。后续如再次复现，应优先最小化定位 `_sync_task_lock` 与单接口事务边界，而不是直接扩大回填窗口。
- 当前结论：
  - `storage_inbound_detail` 仍不应 enabled；下一阶段 15G 建议继续 2000 窗口完成剩余 828 个缺失详情，并作为下一组三轮的第 1 轮。

## Stage 15G

- 阶段目标：继续推进 `storage_inbound_detail` 2000 窗口缺失扫描回填，完成剩余 828 个缺失详情，并作为下一组三轮的第 1 轮。
- 本轮结果：
  - 前置核验显示工作区 `master...origin/master [ahead 76]`；最新提交为 `e393bda Document storage inbound detail 15F backfill`。
  - YAML 核验显示共 59 个 `api_code`、enabled 45 个；`storage_inbound_detail.enabled=false`、`param_source.limit=2000`、`exclude_existing_target=true`、`auto_advance=true`。
  - 覆盖矩阵核验显示公开文档 API 187 个、真实配置 API 51 个、enabled 45 个、configured disabled 6 个；销售表现 7 个拆分配置仍全部 disabled、`commit_per_page=true`。
  - DB 前置核验显示 named lock 空闲、外部 `information_schema.innodb_trx=0`；`storage_inbound_detail` 起点覆盖为 173506/174334，累计失败请求为 0；DB `api_config` 为 59 条、enabled 45 条，`storage_inbound_detail.enabled=0`。
  - 为复查 15F 的 CLI 失败假设，短脚本只执行 `_sync_task_lock` 获取和释放；期间 `jijia_polardb_sync_task` 被当前连接持有，但 `information_schema.innodb_trx` 无外部事务，释放后 named lock 为空，未复现 15F 的 Sleep InnoDB 事务残留。
  - 官方 CLI `.\\.venv\\Scripts\\python.exe -m app.main --sync-api storage_inbound_detail` 成功，批次 `sync_20260712_185853_014941`，828 次请求、828 条成功计数、失败 0，批次耗时 656 秒，API 耗时 654 秒。
  - 本批次 raw 为 828 条、828 个 `source_primary_key`、828 个不同主键、828 个 `data_hash`、空主键 0，`data_date` 覆盖 `2025-09-23` 到 `2026-07-04`。
  - DB 核验显示 `storage_inbound_detail` 累计覆盖从 173506 增至 174334/174334，完成 100.00%，剩余 0；本批次和该 API 累计 `failed_request_log` 均为 0。
  - 同步结束后 named lock 已释放，外部 `information_schema.innodb_trx=0`；DB `api_config` 仍为 59 条、enabled 45 条，`storage_inbound_detail.enabled=0`。
- 当前结论：
  - `storage_inbound_detail` 历史缺失详情已按当前上游 `storage_inbound_page` 去重 code 补齐，但仍先不加入 enabled；下一阶段 15H 建议做空缺口验证、enabled 运行边界评估和 15G-15I 本组三轮的第 2 轮推进。

## Stage 15H

- 阶段目标：对已补齐的 `storage_inbound_detail` 做空缺口验证，证明 `exclude_existing_target=true` 不会重复拉取全量历史，并作为 15G-15I 本组三轮第 2 轮。
- 本轮结果：
  - 前置核验显示工作区 `master...origin/master [ahead 77]`；最新提交为 `2f1ea76 Document storage inbound detail 15G backfill`。
  - 文档交接已指向 15H；YAML 核验显示共 59 个 `api_code`、enabled 45 个；`storage_inbound_detail.enabled=false`、`param_source.limit=2000`、`exclude_existing_target=true`、`auto_advance=true`。
  - 覆盖矩阵 summary 显示公开文档 API 187 个、真实配置 API 51 个、enabled 45 个、configured disabled 6 个；销售表现 7 个拆分配置仍全部 disabled、`commit_per_page=true`。
  - DB 前置核验显示 named lock 空闲、外部 `information_schema.innodb_trx=0`；`storage_inbound_detail` 起点覆盖为 174334/174334，累计失败请求为 0；DB `api_config` 为 59 条、enabled 45 条，`storage_inbound_detail.enabled=0`。
  - 官方 CLI `.\\.venv\\Scripts\\python.exe -m app.main --sync-api storage_inbound_detail` 成功，批次 `sync_20260712_191559_497680`，0 次请求、0 条成功计数、失败 0，批次耗时 4 秒，API 耗时 2 秒。
  - 本批次 raw 写入 0 条；DB 核验显示累计覆盖仍为 174334/174334，完成 100.00%，剩余 0；本批次和该 API 累计 `failed_request_log` 均为 0。
  - 同步结束后 named lock 已释放，外部 `information_schema.innodb_trx=0`；DB `api_config` 仍为 59 条、enabled 45 条，`storage_inbound_detail.enabled=0`。
  - `sync_checkpoint` 已更新到批次 `sync_20260712_191559_497680`，`checkpoint_value` 记录 `request_count=0`、`item_count=0`、`total_count=0`、`param_limit=2000`、`next_param_offset=0`。
  - 本轮一个辅助 checkpoint 查询曾误用不存在的列名 `last_page`；查 `SHOW COLUMNS FROM sync_checkpoint` 后确认真实结构为 `checkpoint_value` JSON，已用实际结构复核完成，不涉及同步链路异常。
- 当前结论：
  - `storage_inbound_detail` 已具备“空缺口不重复拉取历史”的证据，但仍先不加入 enabled；下一阶段 15I 建议做 enabled 边界只读评估，并在完成后做 15G-15I 三轮复盘和整体规划。

## Stage 15I

- 阶段目标：只读评估 `storage_inbound_detail` 是否具备进入 enabled 的最小边界，并完成 15G-15I 三轮复盘；本轮不直接启用。
- 本轮结果：
  - 前置核验显示工作区 `master...origin/master [ahead 78]`；最新提交为 `5839c35 Document storage inbound detail 15H empty gap`。
  - YAML 核验显示共 59 个 `api_code`、enabled 45 个；`storage_inbound_detail.enabled=false`、`param_source.limit=2000`、`exclude_existing_target=true`、`auto_advance=true`。
  - 覆盖矩阵 summary 显示公开文档 API 187 个、真实配置 API 51 个、enabled 45 个、configured disabled 6 个；销售表现 7 个拆分配置仍全部 disabled，且均为 `commit_per_page=true`。
  - DB 前置核验显示 `storage_inbound_detail` 累计覆盖 174334/174334，剩余 0，累计失败请求为 0；named lock 空闲，外部 `information_schema.innodb_trx=0`；DB `api_config` 为 59 条、enabled 45 条，`storage_inbound_detail.enabled=0`。
  - 代码路径核验显示 `--sync-enabled` 通过 `SyncEngine.sync_enabled_apis()` 遍历 `_enabled_apis()`，每个 API 进入 `_sync_api_in_batch()`；遇到 `param_source` 时复用 `_sync_api_from_param_source_in_batch()`，与 `--sync-api storage_inbound_detail` 的参数源、缺口扫描和写入路径一致。
  - YAML 顺序核验显示 `storage_inbound_page` 位于 `storage_inbound_detail` 之前；若后续启用详情接口，enabled 列表会先同步上游入库单分页，再由详情接口按目标表缺失主键扫描新增 code。
  - 当前同口径 LEFT JOIN 缺口查询返回 `missing_count=0`；`exclude_existing_target=true` 会忽略 checkpoint offset，按 `raw_json.code` 与目标 `source_primary_key` 的缺口决定是否请求详情。
  - 既有测试已覆盖 enabled 批次分事务提交、详情接口从 `raw_json` 字段取参数、`exclude_existing_target=true` 生成 LEFT JOIN 缺口过滤，以及 `storage_inbound_detail` 当前 disabled 和参数源配置。
- 15G-15I 三轮复盘：
  - 15G 补齐最后 828 个详情，覆盖从 173506/174334 推进到 174334/174334；15H 空缺口验证为 0 请求、0 写入、0 失败；15I 只读确认 enabled 主链路会复用同一套缺口扫描逻辑。
  - 三轮结束后 `storage_inbound_detail` 当前覆盖为 174334/174334，失败日志为 0，named lock 与外部 InnoDB 事务均无残留。
  - 当前结论是“具备进入 enabled 的技术边界”，不是“已经 enabled”；真正启用仍需修改 YAML、同步 DB 配置、dry-run 变为 46 个 enabled，并用真实批次证明。
- 当前结论：
  - `storage_inbound_detail` 可以作为下一轮 15J 的候选 enabled 实施目标，但必须先获得确认；本轮没有新增 API、没有启用接口、没有调整销售表现。

## Stage 15J

- 阶段目标：只读复核销售表现进入 enabled 的四个前置条件，避免在未满足条件时误加入 daily enabled。
- 本轮结果：
  - 前置核验显示工作区 `master...origin/master [ahead 79]`；最新提交为 `ee2029e Document storage inbound detail 15I enabled boundary`。
  - YAML 和 DB 均显示 7 个销售表现拆分配置仍为 `enabled=false`；配置保持 `commit_per_page=true`、`data_date_param=beginDate`、`write_batch_size=10`、`rate_limit.sleep_seconds=20`、`retry.retries=1`。
  - 代码路径核验显示 `commit_per_page` 目前只在 `SyncEngine.test_api_once()` 单接口路径分流到 `_test_api_once_commit_per_page()`；`sync_enabled_apis()` 仍直接调用 `_sync_api_in_batch()`，因此 enabled 路径尚不支持销售表现需要的等价短事务。
  - DB 只读核验显示销售表现 raw 当前合计空 `data_date` 仍为 7728 条，分布为：`sales_analysis_seller_sku_page=2673`、`sales_analysis_asin_page=2651`、`sales_analysis_sku_page=2097`、`sales_analysis_variation_asin_page=217`、`sales_analysis_market_page=44`、`sales_analysis_spu_page=32`、`sales_analysis_country_page=14`。
  - 最新销售表现单接口验证日志合计为 43 次请求、7600 条成功、0 失败、1323 秒，约 22 分钟；这仍只是单接口验证日志，不是 enabled 批次证明。
  - dry-run 仍显示 45 个 enabled API，未包含任何销售表现配置；DB named lock 空闲且外部 `information_schema.innodb_trx=0`。
- 当前结论：
  - 销售表现仍不能进入 enabled。进入 enabled 前仍必须完成：enabled 路径支持 `commit_per_page` 或等价短事务、补齐 7728 条历史空 `data_date`、接受约 22 分钟额外单日运行时间、用真实 enabled 批次证明成功。

## Stage 15K

- 阶段目标：只读复核剩余 configured disabled API 的风险分层，明确下一轮最小目标；本轮不改代码、不改 YAML、不启用接口。
- 本轮结果：
  - 前置核验显示工作区 `master...origin/master [ahead 80]`；最新提交为 `3c9e245 Document sales analysis 15J enabled prerequisites`。
  - YAML 核验显示共 59 个 `api_code`，其中真实配置 57 个、enabled 45 个、disabled 12 个；catalog summary 仍为公开文档 API 187 个、真实配置 API 51 个、enabled 45 个、configured disabled 6 个。DB `api_config` disabled 为 14 条，是因为还包含 7 个销售表现拆分配置和 2 个占位示例 `order_list`、`product_list`。
  - catalog 中 6 个 configured disabled 真实文档接口为：`market_inventory_query`、`storage_inbound_detail`、`delivery_fee_query`、`inventory_event_page`、`inventory_age_page` 和销售表现 `/operation/sts/salesAnalysis/page`。其中 3 个为 `requires_upstream_params`，2 个为大分页 `direct_read_candidate`，销售表现带敏感响应字段且需要日期/分组参数。
  - DB 运行日志显示：`storage_inbound_detail` 最新空缺口批次 `sync_20260712_191559_497680` 为 0 请求、0 写入、0 失败，累计覆盖 174334/174334；`delivery_fee_query` 最新验证 3 请求、0 成功、0 失败，当前 raw 仍为 0；`market_inventory_query` 最新验证 4 请求、1 成功、0 失败，当前 raw 4 条但主键均为空、`data_date` 均为空。
  - 参数源覆盖显示：`storage_inbound_detail` 上游去重 code 为 174334，目标覆盖 174334，缺口 0；`delivery_fee_query` 当前 OROutbound 发货单参数约 142288 个，目标覆盖 0；`market_inventory_query` 当前库存参数对约 111307 个，但该接口暂无稳定主键和日期字段配置。
  - 大分页接口仍保持 disabled：`inventory_event_page` 当前小样本 raw 300 条，历史估算总量约 2669068 条、约 26691 页；`inventory_age_page` 当前小样本 raw 30 条，历史估算总量约 6597161 条，当前每页 10 且响应慢，曾有 1 条失败日志。
  - 销售表现仍保持 7 个拆分配置 disabled；最新只读证据仍是合计 7728 条空 `data_date`、单接口验证约 1323 秒，且 enabled 路径尚不支持 `commit_per_page` 短事务。
  - DB 终态核验显示 named lock 空闲；排除当前核验连接后外部 `information_schema.innodb_trx=0`。
- 当前结论：
  - 不应批量启用剩余 disabled 接口。`storage_inbound_detail` 是最接近 enabled 的候选，但仍需明确确认后才能改 YAML/DB 并跑真实 enabled 批次；`delivery_fee_query` 和 `market_inventory_query` 需要先解决费用风险、主键和生产级参数窗口；`inventory_event_page`、`inventory_age_page` 继续保持 disabled；销售表现继续被四个 enabled 前置条件阻挡。

## Stage 15L

- 阶段目标：实施同步任务互斥锁连接 `AUTOCOMMIT` 最小改造，降低 named lock 专用连接留下隐式事务的风险，并完成 15J-15L 三轮复盘。
- 本轮结果：
  - 前置核验显示工作区 `master...origin/master [ahead 81]`；最新提交为 `4d7d306 Document disabled API 15K risk review`。
  - 本轮未启用任何 API，未修改 YAML 或 DB `api_config.enabled`；`storage_inbound_detail` 仍为 disabled，销售表现 7 个拆分配置仍为 disabled。
  - TDD RED：先修改 `tests/test_main_sync_lock.py`，让 fake 连接记录 `execution_options()` 调用，并断言 `_sync_task_lock()` 必须使用 `isolation_level="AUTOCOMMIT"`；此时 `python -m unittest tests.test_main_sync_lock` 按预期失败，失败原因为未找到该 isolation level 调用。
  - GREEN：将 `app/main.py` 的锁专用连接改为 `engine.connect().execution_options(isolation_level="AUTOCOMMIT")`，只影响 named lock 连接，不改变业务写入事务边界。
  - 锁测试通过：`python -m unittest tests.test_main_sync_lock` 运行 4 个测试全部通过，覆盖拿不到锁退出、异常释放、释放失败不掩盖任务成功、以及锁连接 AUTOCOMMIT。
  - DB 锁烟测通过：持锁期间 `IS_FREE_LOCK('jijia_polardb_sync_task')=0` 且外部 `information_schema.innodb_trx=0`；释放后 `IS_FREE_LOCK(...)=1` 且外部事务仍为 0。
  - 主验证通过：dry-run 仍加载 45 个 enabled API，`compileall app tests` 通过，93 个 unittest 通过。
- 15J-15L 三轮复盘：
  - 15J 只读复核销售表现 enabled 前置条件，结论是仍不能 enabled：enabled 路径未支持短事务、历史空 `data_date` 仍为 7728 条、单接口耗时约 1323 秒、没有 enabled 批次证明。
  - 15K 只读复核 configured disabled 风险分层，结论是不应批量启用剩余 disabled；`storage_inbound_detail` 最接近 enabled，`delivery_fee_query`、`market_inventory_query`、两个大分页接口和销售表现均需继续分层推进。
  - 15L 完成同步任务互斥锁连接 `AUTOCOMMIT` 小改造，把 15F 暴露的 named lock 专用连接隐式事务风险向下收敛；本轮没有改变 API enabled 范围。
- 当前结论：
  - 同步互斥稳定性已有一项最小改造落地；下一阶段 15M 建议在明确确认后实施 `storage_inbound_detail` enabled 最小变更，并用 dry-run 46 个 enabled、真实 enabled 批次和 DB 复核证明成功。

## Stage 15M

- 阶段目标：按确认实施 `storage_inbound_detail` enabled 最小变更，并用真实 enabled 批次证明成功。
- 当前状态：本阶段已完成；`storage_inbound_detail` enabled 主链路、四个日期窗口分页容量和 `traffic_sku_page` 调用频率限制均已完成单接口与真实 46 API enabled 批次验证。
- 已完成：
  - 前置核验显示工作区基线为 `master...origin/master [ahead 82]`，最新提交为 `9bcd0a9 Use autocommit for sync task lock`。
  - TDD RED：先将 `tests/test_storage_inbound_detail_param_source.py` 中 `storage_inbound_detail` 的期望从 disabled 改为 enabled；在 YAML 仍为 `enabled=false` 时，目标测试按预期失败。
  - GREEN：将 `config/api_config.example.yaml` 中 `storage_inbound_detail.enabled` 改为 `true`，目标测试转绿。
  - 已运行 `python -m app.doc_catalog --output config/jijia_api_catalog.generated.json --summary`，覆盖矩阵刷新为公开文档 API 187、真实配置 API 51、configured enabled 46、configured disabled 5。
  - 已运行 `python -m app.main --sync-api-configs`，DB `api_config` 为 59 条、enabled 46 条；`storage_inbound_detail.enabled=1`、`param_source.limit=2000`、`exclude_existing_target=true`、`auto_advance=true`。
  - dry-run 已加载 46 个 enabled API，并包含 `storage_inbound_detail`。
  - 启动真实 `--sync-enabled` 批次 `sync_20260713_095929_623027`，批次记录 `total_api_count=46`；前 22 个 API 成功，累计 942 次请求、95115 条成功计数、失败 0。
  - 该真实 enabled 批次未完成，最终按事实收尾为 `status=failed`、`success_api_count=22`、`failed_api_count=1`，message 为 `interrupted before completion; finalized from 22 api logs`。
  - 失败批次内 `failed_request_log` 为 0；最终复核 named lock 空闲，外部 `information_schema.innodb_trx=0`。
- 重要异常：
  - `--sync-enabled` 停在 `fba_inventory_v2_page` 之后、`inventory_adjustments_page` 之前；CLI 只输出通用错误和 `release sync task lock failed`，没有 traceback。
  - 单独前台运行 `python -m app.main --sync-api inventory_adjustments_page` 也失败，并一度留下 named lock 线程 `5817884` 和 Sleep InnoDB 事务线程 `5817893`；两者已被确认归属本轮失败命令并清理，清理后锁空闲且外部事务为 0。
  - 后续又尝试直接调用 `SyncEngine.test_api_once('inventory_adjustments_page', ...)` 以绕过 CLI 外层锁获取真实异常，但用户因会话卡顿中止，本轮没有拿到结果。
  - 新会话只读复核确认：Git 基线和 6 个原有未提交文件与交接一致；YAML 为 59 个配置、enabled 46；catalog 为公开文档 API 187、真实配置 API 51、configured enabled 46、configured disabled 5；DB `api_config` 为 59 条、enabled 46 条。
  - 失败 enabled 批次 `sync_20260713_095929_623027` 仍为 `status=failed`、`total_api_count=46`、`success_api_count=22`、`failed_api_count=1`；22 条已落库 `sync_api_log` 合计 942 次请求、95115 条成功计数、失败请求 0。
  - 前置和运行后均确认没有 `app.main` 同步进程残留；named lock 空闲，外部 `information_schema.innodb_trx=0`。
  - 目标测试通过：`tests.test_storage_inbound_detail_param_source` 2 个测试、`tests.test_main_sync_lock` 4 个测试均通过。
  - TDD RED：新增 `tests/test_main_error_logging.py`，约束单接口和 enabled 顶层异常必须记录异常类型与消息；同时增强锁释放失败测试。现有代码分别缺少 `ValueError`、`SQLAlchemyError` 和 `release failed` 细节，3 个断言按预期失败。
  - GREEN：`app/main.py` 的 `--sync-api`、`--sync-enabled` 捕获分支改用 `logger.exception`，保留异常类型、message 和 traceback；`_sync_task_lock()` 释放失败也记录具体 `SQLAlchemyError`。新日志测试 2 个、锁测试 4 个均通过。
  - 完整回归首次发现 `tests/test_5v_low_risk_enabled_configs.py` 仍把 enabled 数量硬编码为 45；已最小改为 46，并把 `storage_inbound_detail` 加入期望集合。修正后定向 9 个测试、完整 95 个 unittest、`compileall app tests` 和 dry-run 46 API 均通过。
  - 旧失败的真实异常无法从旧日志恢复；增强日志后官方 CLI `--sync-api inventory_adjustments_page` 未复现失败，而是成功完成批次 `sync_20260713_143641_005829`：583 次请求、58239 条成功计数、失败 0、耗时约 479 秒、CLI 返回 0。
  - 单接口批次 DB 复核：58239 条 raw、58239 个不同主键、58239 个不同 hash、空主键 0、空 `data_date` 0，日期范围 `2021-02-01` 至 `2023-02-16`，`failed_request_log=0`；结束后 named lock 空闲、外部事务 0。
  - 已在完整批次前重新确认 Git、YAML、catalog、DB `api_config`、named lock、外部事务和同步进程；定向 9 个测试、完整 95 个 unittest、`compileall app tests`、dry-run 46 API 和 `git diff --check` 均通过。
  - 完整 enabled 批次 `sync_20260713_162236_372212` 自 `2026-07-13 16:22:36` 运行至 `19:04:49`，耗时 9733 秒；46 条 `sync_api_log` 全部落库，42 success、4 failed，累计 5939 次请求、561493 条成功计数、失败计数 4，批次状态为 `partial_failed`。
  - `inventory_adjustments_page` 已在完整 enabled 批次中再次成功：583 次请求、58239 条成功计数、失败 0；本次不再停在 `fba_inventory_v2_page` 之后。
  - `storage_inbound_detail` 已在真实 enabled 主链路成功：从同批次先完成的 `storage_inbound_page` 发现 228 个新增 code，228 次请求、228 条成功计数、失败 0；本批次 raw 为 228 条、228 个不同主键、228 个不同 hash、空主键 0、空 `data_date` 0。
  - `storage_inbound_detail` 累计覆盖为 174562/174562，缺口 0；checkpoint 已更新到本批次 `sync_20260713_162236_372212`。
  - 4 个失败接口均为同步引擎主动拦截的 `date window page truncated`：`traffic_page=1000/3611`、`traffic_sku_page=200/1990`、`storage_ledger_page=1500/5036`、`inventory_receipts_page=1000/1089`。
  - 四个失败接口的 checkpoint 均未推进，仍指向 `sync_20260706_040245_562729`；本批次 `failed_request_log=0`，说明失败来自完整性校验而非 HTTP 请求重试耗尽。
  - 批次结束后 named lock 空闲、外部 `information_schema.innodb_trx=0`、无 `app.main` 同步进程残留；DB `api_config` 仍为 59 条、enabled 46，销售表现 7 个配置仍全部 disabled。
  - 已按确认用 TDD 把四个接口的 `page.max_pages` 期望改为 20；YAML 仍为旧值时 4 个测试按预期 RED，随后仅修改四处 YAML 后转 GREEN。
  - catalog 已刷新且统计保持公开文档 API 187、真实配置 API 51、configured enabled 46、configured disabled 5；`--sync-api-configs` 后 DB 仍为 59/46，四个目标接口的 `config_json.page.max_pages` 均为 20，销售表现 enabled 数仍为 0。
  - `traffic_page` 单接口批次 `sync_20260714_105420_817468` 成功：8 次请求、3611/3611 条、失败 0，checkpoint 推进到 `2026-07-08`。
  - `storage_ledger_page` 单接口批次 `sync_20260714_110523_505585` 成功：11 次请求、5036/5036 条、失败 0，checkpoint 推进到 `2026-07-08`。
  - `inventory_receipts_page` 单接口批次 `sync_20260714_111705_499431` 成功：11 次请求、1089/1089 条、失败 0，checkpoint 推进到 `2026-07-08`。
  - `traffic_sku_page` 批次 `sync_20260714_110309_393325` 和一次受控重跑 `sync_20260714_110411_450377` 均在 `2026-07-07` 第 2 页失败；每次第 1 页成功 200 条，随后 4 次尝试后收到 HTTP 509，`failed_request_log` 的非敏感响应字段为 `code=90008`、`message=接口调用次数已超过限制次数`。
  - `traffic_sku_page` 失败后 checkpoint 未推进，仍指向 `sync_20260706_040245_562729` 和 `next_window_start=2026-07-07`；当时 `rate_limit.sleep_seconds=0.5`，而同类 `traffic_page` 使用 65 秒页间隔，因此 15M 新阻塞从分页容量收敛为该接口的调用频率限制。
  - 验证通过：定向 12 个测试、完整 95 个 unittest、`compileall app tests`、真实 dry-run 46 API、`git diff --check`；所有写任务结束后均无同步进程残留，named lock 空闲、外部 `information_schema.innodb_trx=0`。
  - TDD RED：在 `tests/test_traffic_sku_page_config.py` 增加 `rate_limit.sleep_seconds=65` 期望，YAML 仍为 0.5 秒时目标测试按预期失败；仅把该接口页间隔改为 65 秒后转 GREEN。
  - catalog 再次刷新后仍为公开文档 API 187、真实配置 API 51、configured enabled 46、configured disabled 5；`--sync-api-configs` 后 DB 仍为 59/46，`traffic_sku_page.max_pages=20`、`sleep_seconds=65`，销售表现 enabled 数为 0。
  - `traffic_sku_page` 单接口批次 `sync_20260714_112649_287490` 成功：10 次请求、1990/1990 条、失败 0，checkpoint 推进到 `2026-07-08`；本批次 `failed_request_log=0`，不再触发 90008。
  - 最终完整 enabled 批次 `sync_20260714_113841_049234` 自 `2026-07-14 11:38:41` 运行至 `14:18:46`，耗时 9605 秒；批次 `status=success`、`total_api_count=46`、`success_api_count=46`、`failed_api_count=0`。
  - 最终批次 46 条 `sync_api_log` 全部 success，合计 5645 次请求、568730 条成功计数、失败计数 0，`failed_request_log=0`。
  - 四个修复接口在最终 enabled 批次全部成功并推进 checkpoint 到 `2026-07-09`：`traffic_page=3655/3655`、8 请求；`traffic_sku_page=1980/1980`、10 请求；`storage_ledger_page=5052/5052`、11 请求；`inventory_receipts_page=688/688`、7 请求。
  - `storage_inbound_detail` 在最终 enabled 批次成功发现并同步 37 个新增 code，37/37、失败 0；本批次 raw 为 37 条、37 个不同 hash、空主键 0、空 `data_date` 0。
  - 按真实 `param_source.source_field=raw_json.code` 口径复核，`storage_inbound_page` 上游去重 code 为 174599、`storage_inbound_detail` 目标主键为 174599，缺口探针为空。
  - 覆盖审计曾误用上游 `source_primary_key`，随后一次全量 JSON CTE 又在客户端超时后留在服务端运行；已确认该查询修改行 0、锁行 0，仅终止本轮残留查询。最终改用同步引擎同口径的 `raw_json.code` LEFT JOIN + `LIMIT 1` 缺口探针完成复核，外部事务恢复为 0。
  - 最终批次结束后无同步进程残留，named lock 空闲、外部 `information_schema.innodb_trx=0`；YAML/DB 保持 59/46，销售表现 7 个配置仍全部 disabled。
- 阶段 16A 已完成：
  - 公开文档 `id=1017` 确认接口为 `POST /operation/sts/trafficSkuAnalysis/page`，必填参数为 `currency`、`beginDate`、`endDate`、`page`、`pagesize`、`viewType`，分页列表和总量为 `data.rows`、`data.total`，官方页大小上限为 100，默认限流为每分钟 1 次。
  - TDD RED 先要求新增 `traffic_sku_analysis_page` 默认关闭配置；YAML 未配置时测试按预期失败，随后仅新增候选配置后转 GREEN。
  - catalog 刷新为 187/52/46/6；`--sync-api-configs` 后 DB 为 60/46，候选 `enabled=0`。
  - 第一次普通事务单接口尝试在已写入页面后遇到 MySQL 2006 / WinError 10054，业务连接和 named lock 连接同时被远端重置；事务完整回滚，因此未留下批次、raw、checkpoint、API log 或 failed request，最终锁空闲、事务和进程均为 0。
  - MySQL `wait_timeout=86400`，本次失败不是三分钟空闲超时；现有 `_test_api_once_commit_per_page()` 正是为分钟级限流分页接口避免让 HTTP、sleep 和 raw 写入长期占用同一事务，因此用第二轮 TDD 为该候选增加 `commit_per_page=true`。
  - 短事务单接口批次 `sync_20260715_150626_428012` 成功：19 次请求、1857/1857 条、失败 0，耗时 1263 秒；每页提交后的外部 InnoDB 事务均为 0。
  - 本批次 raw 为 1857 条、1857 个不同 hash、空主键 1857、空 `data_date` 0，日期均为 `2026-07-02`；无稳定强制业务主键时按 `data_hash` 幂等符合当前设计。
  - checkpoint 记录 `last_page=19`、`request_count=19`、`item_count=1857`、`total_count=1857`、`next_window_start=2026-07-03`；`failed_request_log=0`。
  - 最终 named lock 空闲、外部 `information_schema.innodb_trx=0`、无同步进程残留；候选继续 disabled，未运行完整 `--sync-enabled`。
- 阶段 16B 已完成：
  - 公开文档 `id=131` 确认接口为 `POST /operation/sts/productAnalyzeMultiIndex/page`，必填参数为 `showCurrencyType`、`beginDate`、`endDate`、`page`、`pagesize`，分页列表和总量为 `data.rows`、`data.total`，官方页大小上限为 100，默认限流为每分钟 1 次。
  - TDD RED 先要求新增 `product_analyze_multi_index_page` 默认关闭候选；配置缺失时测试按预期失败，随后新增 `enabled=false`、`commit_per_page=true`、单日窗口、`showCurrencyType=YUAN`、哈希幂等和 65 秒限流配置后转 GREEN。
  - 第一次单接口批次 `sync_20260715_154048_587898` 按 20 页安全上限提交 2000 行后，被 `item_count < total_count` 完整性校验正确标记 failed；真实总量为 2891，checkpoint 未创建，`failed_request_log=0`，结束后锁和事务均清空。
  - 第二轮 TDD 先把配置测试期望改为 `max_pages=30` 并得到 `20 != 30` 的 RED，再只调整该候选分页上限后转 GREEN；官方页大小已经是最大 100，2891 条实际需要 29 页，30 页仅保留 1 页余量。
  - 成功批次 `sync_20260715_161132_797343` 完成 29 次请求、2891/2891 条、失败 0，耗时 1949 秒；分页等待期间持续核对，外部 InnoDB 事务始终为 0。
  - 本批次 raw 为 2891 条、2891 个不同 hash、空主键 2891、空 `data_date` 0，日期均为 `2026-07-02`；checkpoint 记录 `last_page=29`、`total_count=2891`、`next_window_start=2026-07-03`。
  - 最终 DB `api_config` 为 61/46，候选仍为 `enabled=0`、`max_pages=30`、`commit_per_page=true`；named lock 空闲、外部事务 0、数据库会话 0，未运行完整 `--sync-enabled`。
- 阶段 16C 已完成：
  - 公开文档 `id=132` 确认接口为 `POST /operation/sts/storeSalesPerformance/page`，必填参数为 `showCurrencyType`、`beginDate`、`endDate`、`page`、`pagesize`，`marketList` 可选，分页列表和总量为 `data.rows`、`data.total`，官方页大小上限 100，默认限流为每分钟 1 次。
  - 文档字段表虽把行 `id` 和 `statisticsDate` 标为必填，但官方响应示例二者均为 `null`；因此配置不编造稳定主键，继续使用 `data_hash` 幂等，并以请求 `beginDate` 覆盖 `data_date`。
  - TDD RED 先要求新增 `store_sales_performance_page`；配置缺失时测试按预期失败，随后新增 `enabled=false`、`commit_per_page=true`、单日窗口、`showCurrencyType=YUAN`、`pagesize=100`、`max_pages=20` 和 65 秒限流配置后转 GREEN。
  - 单接口批次 `sync_20260715_165256_777600` 成功：1 次请求、25/25 条、失败 0，耗时约 12 秒；raw 为 25 条、25 个不同 hash、空主键 25、空 `data_date` 0，日期均为 `2026-07-02`。
  - checkpoint 记录 `last_page=1`、`request_count=1`、`item_count=25`、`total_count=25`、`next_window_start=2026-07-03`；`failed_request_log=0`。
  - 最终 DB `api_config` 为 62/46，候选仍为 `enabled=0`；named lock 空闲、外部事务 0、数据库会话 0，未运行完整 `--sync-enabled`。
- 16A-16C 三轮综合复盘：
  - 三轮均坚持 `default-disabled -> 配置测试 RED/GREEN -> catalog -> DB api_config -> 单接口 -> DB/锁事务审计`，没有扩大 enabled 范围，也没有重跑 15M 完整长批次。
  - `traffic_sku_analysis_page` 和 `product_analyze_multi_index_page` 的分钟级多页任务证明 `commit_per_page` 能让 HTTP 与限流等待期间的外部 InnoDB 事务保持为 0；`store_sales_performance_page` 单页同样通过该路径。
  - 完整性校验在 16B 正确拦截 `2000/2891`，证明不能为了完成候选而放宽 `item_count == total_count`；分页上限必须由官方页大小和真实总量共同决定。
  - 三个新候选继续 disabled：enabled 主链尚未复用 `commit_per_page`，且 16A/16B 单日分别耗时约 21/32 分钟；单接口成功只证明可读取和可完整落库，不等于适合每日批量启用。
- 阶段 16D 已完成：
  - 公开文档 `id=133` 确认接口为 `POST /operation/sts/marketAnalyze/page`；必填参数为 `target`、`showCurrencyType`、`beginDate`、`endDate`、`viewType`，其中 `target` 支持 `unitsOrdered/orders`，`viewType` 支持 `day/week/month`，默认限流为每分钟 1 次。
  - 尽管路径含 `/page`，官方请求体和示例都没有 `page/pagesize`，响应说明还把 `total/page/pagesize` 标为无效字段；因此配置明确使用 `page.enabled=false`、`data.rows`，不配置 `total_field`，也不发送分页参数。
  - 行结构为 `marketId`、`marketName`、`subtotalAmount`、`amountVoMap`，没有独立日期字段；为避免同一店铺不同窗口或指标互相覆盖，不使用 `marketId` 唯一主键，而是按 `data_hash` 幂等，并用请求 `beginDate` 覆盖 `data_date`。
  - TDD RED 先要求 `market_analyze_page` 使用文档化的非分页边界；配置缺失时测试按预期失败，新增 `enabled=false`、`target=unitsOrdered`、`viewType=day`、`showCurrencyType=YUAN`、单日窗口和短事务配置后转 GREEN。
  - 单接口批次 `sync_20260715_170801_554088` 成功：1 次请求、25 行、失败 0；raw 为 25 条、25 个不同 hash、空主键 25、空 `data_date` 0，日期均为 `2026-07-02`。
  - checkpoint 记录 `last_page=1`、`request_count=1`、`item_count=25`、`total_count=null`、`next_window_start=2026-07-03`；这里的 null 是对官方无效总数字段的真实表达，不伪造 25/25。
  - 最终 DB `api_config` 为 63/46，候选仍为 `enabled=0`；`failed_request_log=0`、named lock 空闲、外部事务 0、数据库会话 0，未运行完整 `--sync-enabled`。
- 阶段 16E 已完成：
  - 公开文档 `id=130` 确认接口为 `POST /operation/sts/listingAnalyze/page`；必填 `groupByType`、`target`、`viewType`、`showCurrencyType`、`beginDate/endDate`、`page/pagesize`，官方页大小上限 100、默认限流每分钟 1 次，响应 `data.rows/data.total` 有效。
  - TDD RED 先要求新增 `listing_analyze_page`；随后新增 `enabled=false`、MSKU 维度、`target=unitsOrdered`、单日窗口、哈希幂等、`commit_per_page=true` 和 65 秒限流配置后转 GREEN。
  - 批次 `sync_20260715_172023_885288` 在 1700 条后遇到 API 连接与本机 DNS 同时中断，未留下 API log/checkpoint；恢复后只把精确批次如实收尾为 failed。批次 `sync_20260715_174526_930015` 在 30 页提交 3000 条后被完整性校验正确拦截，真实总量为 4305，checkpoint 未前移。
  - TDD 将分页保护值从 30 最小提高到 45；下一批 `sync_20260715_182354_185521` 在 4100 条后被 Windows 终端进程结束，未留下 API log/checkpoint，命名锁和事务已释放后才把该精确批次收尾为 failed，没有伪造接口日志。
  - 使用独立后台进程重跑同一单接口后，成功批次 `sync_20260716_112121_765692` 完成 44 次请求、4309/4309 条、0 失败；上游总量较前一日增加 4 条，因此以本批次 `item_count == total_count` 为准。
  - 成功批次 raw 为 4309 条、4309 个不同 hash、null 主键 4309、空 `data_date` 0，日期均为 `2026-07-02`；checkpoint 记录 `last_page=44`、`total_count=4309`、`next_window_start=2026-07-03`，`failed_request_log=0`。
  - 最终 named lock 空闲、外部事务 0、数据库活动会话 0；候选继续 disabled，未运行完整 `--sync-enabled`。
- 阶段 16F 已完成：
  - 公开文档 `id=140` 确认接口为 `POST /operation/sts/listingAnalyzeMultiIndex/page`；必填 `groupByType`、`showCurrencyType`、`beginDate/endDate`、`isShowTotal`、`page/pagesize`，官方页大小上限 100、默认限流每 5 秒 1 次，响应 `data.rows/data.total` 和行 `statisticsDate` 有效。
  - TDD RED 先要求新增 `listing_analyze_multi_index_page`；随后新增 `enabled=false`、MSKU 维度、`isShowTotal=false`、单日窗口、哈希幂等、`commit_per_page=true`、`max_pages=45` 和 6 秒限流配置后转 GREEN。
  - catalog 刷新为 187/57/46/11，DB/YAML 为 65/46；候选在 DB 中保持 `enabled=0`，完整 101 个测试、`compileall` 和无参数 dry-run 均通过，dry-run 仍只加载 46 个 enabled。
  - 单接口批次 `sync_20260716_141834_366978` 成功完成 44 次请求、4309/4309 条、0 失败；raw 为 4309 条、4309 个不同 hash、null 主键 4309、空 `data_date` 0，日期均为 `2026-07-02`。
  - checkpoint 记录 `last_page=44`、`request_count=44`、`item_count=4309`、`total_count=4309`、`next_window_start=2026-07-03`；`failed_request_log=0`，最终 named lock 空闲、外部事务 0、数据库活动会话 0。
- 16D-16F 三轮综合复盘：
  - 三轮继续执行 `default-disabled -> TDD RED/GREEN -> catalog -> DB api_config -> 单接口 -> raw/log/checkpoint/锁事务审计`，enabled 始终为 46，未运行完整 `--sync-enabled`。
  - 16D 按官方无效 total 如实记录 `total_count=null`；16E 两次外部中断均保留已提交 raw 并只收尾精确 batch，不伪造 API log/checkpoint；16E/16F 最终都以 `4309 == 4309` 证明窗口完整。
  - 分钟级接口使用独立后台进程避免终端单元生命周期中断，页级短事务保证限流等待期间外部事务为 0；该运行方式不改变接口配置或 enabled 边界。
- 阶段 16G 已完成：
  - 公开文档 `id=1016` 确认接口为 `POST /operation/sts/saleProfit/page`；必填 `showCurrencyType`、`page/pagesize`、`type`，日期维度使用 `beginDate/endDate`，`type` 支持 `PARENT/ASIN/MSKU/MARKET`，响应 `data.rows/data.total` 和行 `statisticsDate` 有效，默认限流每分钟 1 次。
  - 为先证明接口可用性而不直接拉取数千 MSKU，候选使用 `type=MARKET`、`showCurrencyType=YUAN`、单日窗口、`pagesize=100`、`max_pages=5`、哈希幂等、`commit_per_page=true` 和 65 秒限流，并保持 `enabled=false`。
  - TDD 测试先因缺少 `sale_profit_page` RED，新增唯一候选后 GREEN；catalog 刷新为 187/58/46/12，DB/YAML 为 66/46，完整 102 个测试、`compileall`、dry-run 和差异检查通过，dry-run 仍为 46 个 enabled。
  - 单接口批次 `sync_20260716_143418_686778` 成功完成 1 次请求、24/24 条、0 失败；raw 为 24 条、24 个不同 hash、null 主键 24、空 `data_date` 0，日期均为 `2026-07-02`。
  - checkpoint 记录 `last_page=1`、`request_count=1`、`item_count=24`、`total_count=24`、`next_window_start=2026-07-03`；`failed_request_log=0`，最终 named lock 空闲、外部事务 0、数据库活动会话 0。
- 阶段 16H 已完成：
  - 公开文档 `id=128` 确认接口为 `GET /finance/sts/allocationDetail/page`；只有 `page/pagesize` 必填，`marketDate` 可用 `YYYY-MM` 限定分摊月份，响应 `data.rows/data.total` 有效，行 `id` 是官方主键，默认限流每 2 秒 1 次。
  - 候选固定 `marketDate=2026-06` 控制首次验证范围，使用官方最大 `pagesize=100`、`max_pages=20`、3 秒页间隔、`commit_per_page=true`，保持 `enabled=false`。`YYYY-MM` 不能直接写 MySQL DATE，因此不配置 `data_date_param`，改用响应 `createTime`；主键 `id.required=false` 以保留异常空 ID 行。
  - TDD 测试先因缺少 `allocation_detail_page` RED，新增唯一候选后 GREEN；catalog 为 187/59/46/13，DB/YAML 为 67/46，完整 103 个测试、`compileall`、dry-run 和差异检查通过，enabled 仍为 46。
  - 单接口批次 `sync_20260716_144111_386873` 成功完成 10 次请求、903/903 条、0 失败；raw 为 903 条、903 个不同主键、903 个不同 hash、空主键 0、空 `data_date` 0，日期均为 `2026-06-01`。
  - checkpoint 记录 `last_page=10`、`request_count=10`、`item_count=903`、`total_count=903`；由于配置是固定单月而非滚动窗口，checkpoint 不写 `next_window_start`。`failed_request_log=0`，最终 named lock 空闲、外部事务 0、数据库活动会话 0。
- 阶段 16I 已完成：
  - 公开文档 `id=129` 确认接口为 `POST /finance/sts/profitCostAnalysis/page`；`beginDate/endDate`、`page/pagesize` 必填，响应 `data.rows/data.total` 有效，行 `id` 是官方主键，默认限流每 5 秒 1 次。
  - TDD 先因缺少 `profit_cost_analysis_page` RED，再新增 `enabled=false`、`currency=YUAN`、`platformCodes=[AMAZON]`、`costValues=0`、单日窗口、`pagesize=100`、6 秒页间隔和 `commit_per_page=true` 的唯一候选后 GREEN。
  - 首次批次 `sync_20260716_144820_882238` 在 20 页写入 2000 条后，被完整性校验正确标记为 `2000/18425` 截断；TDD 将该候选 `max_pages` 从 20 最小提高到 190，checkpoint 未前移。
  - 第二次批次 `sync_20260716_145343_590447` 在第 94 页写库时发生 MySQL 2013 / WinError 10060，前 93 页 9300 条已按页提交；批次正确记为 failed，checkpoint 未创建，最终锁和事务清空。根因在连接取出后的 INSERT 边界，`pool_pre_ping` 无法提前发现。
  - TDD 新增“首次页写入连接失效、第二次成功”用例；短事务页写入仅在 `DBAPIError.connection_invalidated=true` 时换新连接重试一次，其他数据库错误仍直接抛出。raw 使用幂等 upsert，首次提交结果不确定时重试也不会制造明显重复。
  - 第三次受外部进程生命周期影响的批次 `sync_20260716_151848_575655` 只提交 300 条后进程退出，没有 API log/checkpoint；在再次确认进程不存在、named lock 空闲、外部事务和活动会话为 0 后，精确收尾为 failed，没有伪造接口日志。
  - 最终前台受管批次 `sync_20260717_101830_525973` 成功完成 185 次请求、18425/18425 条、0 失败，耗时约 25 分钟；raw 为 18425 条、18425 个不同官方主键、18425 个不同 hash、空主键 0、空 `data_date` 0，日期均为 `2026-07-02`。
  - checkpoint 记录 `last_page=185`、`request_count=185`、`item_count=18425`、`total_count=18425`、`next_window_start=2026-07-03`；`failed_request_log=0`，最终 named lock 空闲、外部事务 0、数据库活动会话 0。
- 16G-16I 三轮综合复盘：
  - 三轮新增候选均保持 disabled，enabled 始终为 46，未运行完整 `--sync-enabled`；16G 用低基数 MARKET 维度验证，16H 用固定月份验证，16I 用单日窗口完成大分页验证。
  - 16I 的 `2000/18425` 截断再次证明完整性校验不能放宽；MySQL 中途断线则证明按页短事务还需要对“已取出后失效”的连接做一次幂等恢复，但不能把所有数据库错误都吞成重试。
  - 长接口后续统一使用工具会话保持存活的前台受管进程，不再依赖父进程已退出的独立后台方式；结果仍必须由 batch、API log、raw、checkpoint、失败日志、锁和事务共同判定。
- 阶段 16J 已完成：
  - 公开文档 `id=309` 确认接口为 `POST /finance/sts/financialProfitAnalysis/page`；`page/pagesize/startDate/endDate/currency` 必填，响应 `data.rows/data.total` 有效，行 `id` 是官方主键，默认限流每 2 秒 1 次。
  - TDD 先因缺少 `financial_profit_analysis_page` RED，再新增 `enabled=false`、`currency=YUAN`、`platformCodes=[AMAZON]`、单日窗口、官方最大 `pagesize=100`、3 秒页间隔和 `commit_per_page=true` 的唯一候选后 GREEN。
  - 首批 `sync_20260717_105203_289692` 在 50 页写入 5000 条后，被完整性校验正确标记为 `5000/20978` 截断；checkpoint 未创建、失败请求 0、锁和事务全清。
  - 官方页大小已经是 100，完整窗口需要 210 页；TDD 先得到 `50 != 220` 的 RED，再只把该候选 `max_pages` 最小提高到 220，保留 10 页余量且不放宽完整性校验。
  - catalog 刷新为 187/61/46/15，DB/YAML 为 69/46；完整 106 个测试、`compileall`、dry-run 和差异检查通过，enabled 仍为 46。
  - 最终前台受管批次 `sync_20260717_105845_443853` 成功完成 210 次请求、20978/20978 条、0 失败，耗时约 17 分钟；raw 为 20978 条、20978 个不同官方主键、20978 个不同 hash、空主键 0、空 `data_date` 0，日期均为 `2026-07-02`。
  - checkpoint 记录 `last_page=210`、`request_count=210`、`item_count=20978`、`total_count=20978`、`next_window_start=2026-07-03`；`failed_request_log=0`，最终 named lock 空闲、外部事务 0、数据库活动会话 0。
- 阶段 16K 已完成：
  - 公开文档 `id=2256` 确认接口为 `POST /finance/sts/financialAnalysis/page/V2`；必填 `queryType/costValues/page/pagesize/currency/dateType`，`dateType=0` 时使用 `startDate/endDate`，响应 `data.rows/data.total` 有效，默认限流每 10 秒 1 次。
  - TDD 先因缺少 `financial_analysis_v2_page` RED，再新增 `enabled=false`、`queryType=market`、`costValues=0`、`currency=YUAN`、`dateType=0`、单日窗口、`pagesize=100`、`max_pages=5`、11 秒页间隔和 `commit_per_page=true` 的唯一候选后 GREEN。
  - 响应无通用稳定业务主键，不按维度字段强行覆盖跨日期记录；使用 `data_hash` 幂等，并以请求 `startDate` 覆盖 `data_date`。
  - catalog 刷新为 187/62/46/16，DB/YAML 为 70/46；完整 107 个测试、`compileall`、dry-run 和差异检查通过，enabled 仍为 46。
  - 单接口批次 `sync_20260717_112436_771393` 成功完成 1 次请求、23/23 条、0 失败；raw 为 23 条、23 个不同 hash、空主键 23、空 `data_date` 0，日期均为 `2026-07-02`。
  - checkpoint 记录 `last_page=1`、`request_count=1`、`item_count=23`、`total_count=23`、`next_window_start=2026-07-03`；`failed_request_log=0`，最终 named lock 空闲、外部事务 0、数据库活动会话 0。
- 阶段 16L 已完成：
  - 公开文档 `id=2280` 确认接口为 `GET /finance/sts/colData/query`；`dimension` 必填，响应 `data` 是列配置数组，每项含 `colCode` 并可能嵌套 `detailCols`，默认限流每秒 3 次。
  - TDD 先因缺少 `financial_analysis_columns_query` RED，再新增 `enabled=false`、`dimension=market`、非分页 `list_field=data`、`colCode` 主键、空日期、0.5 秒间隔和 `commit_per_page=true` 的唯一候选后 GREEN。
  - 嵌套 `detailCols` 作为每个列配置原始 JSON 的一部分整体保留，不额外拆分或编造日期；接口没有有效 total，checkpoint 必须记录 `total_count=null`。
  - catalog 刷新为 187/63/46/17，DB/YAML 为 71/46；完整 108 个测试、`compileall`、dry-run 和差异检查通过，enabled 仍为 46。
  - 单接口批次 `sync_20260717_113058_412348` 成功完成 1 次请求、55 条、0 失败；raw 为 55 条、55 个不同 `colCode`、55 个不同 hash、空主键 0、空 `data_date` 55。
  - checkpoint 记录 `last_page=1`、`request_count=1`、`item_count=55`、`total_count=null`；`failed_request_log=0`，最终 named lock 空闲、外部事务 0、数据库活动会话 0。
- 16J-16L 三轮综合复盘：
  - 三轮新增候选均保持 disabled，enabled 始终为 46，未运行完整 `--sync-enabled`；16J 用单日大分页验证结算明细，16K 用 MARKET 低基数验证 V2，16L 用 MARKET 维度读取列元数据。
  - 16J 的 `5000/20978` 截断继续证明分页保护必须由真实总量校准；16K 无稳定主键时按 hash 保存快照；16L 无日期和 total 时保持 null，不能为统一格式伪造字段。
  - 三轮都使用受管前台进程或短前台命令，并由 batch、API log、raw、checkpoint、失败日志、锁和事务共同验收。
- 阶段 16M 已完成：
  - 公开文档 `id=2284` 确认接口为 `POST /finance/sts/financialAnalysisMonth/query/V2`；必填 `costValues/startDate/endDate/currency`，响应 `data` 是同时包含月份轴和数据树的对象，默认限流每秒 1 次。
  - TDD 先因缺少 `financial_analysis_month_v2_query` RED，再新增 `enabled=false`、固定 `2026-06-01` 至 `2026-06-30`、`costValues=0`、`currency=YUAN`、非分页 `response.item_field=data`、哈希幂等、2 秒间隔和 `commit_per_page=true` 的唯一候选后 GREEN。
  - 固定单月只用于首次验证，不代表已有自动月份推进；必须把响应 `data` 整体保存，不能只提取内部 `data.data` 而丢失月份轴。
  - catalog 刷新为 187/64/46/18，DB/YAML 为 72/46；完整 109 个测试、`compileall`、dry-run 和差异检查通过，enabled 仍为 46。
  - 单接口批次 `sync_20260717_113608_001647` 成功完成 1 次请求、1 个整体对象、0 失败；raw 为 1 条、1 个 hash、空主键 1、空 `data_date` 0，日期为 `2026-06-01`。
  - DB JSON 类型审核确认 raw 根对象的 `date` 为数组且长度 1，`data` 为数组且长度 7，证明月份轴和数据树均已保留；未输出业务内容。
  - checkpoint 记录 `last_page=1`、`request_count=1`、`item_count=1`、`total_count=null`；`failed_request_log=0`，最终 named lock 空闲、外部事务 0、数据库活动会话 0。
- 统计板块 17 API 最终审核：
  - generated catalog 的统计菜单为 17 个文档，17 个均有 `configured_api_code`，enabled 文档 3 个、disabled 文档 14 个、缺失 0。
  - YAML 与 DB 均为 72 个配置、enabled 46；API code 集合完全一致，`enabled/method/path` 差异为 0。
  - 本轮 13 个新增候选的 checkpoint 均指向 success 批次；对应 API log 均 success，raw 数量与成功计数一致，成功批次 `failed_request_log` 均为 0。
  - 最终 latest batch 为 `sync_20260717_113608_001647`、状态 success；named lock 空闲、外部 InnoDB 事务 0、数据库活动会话 0。未运行完整 `--sync-enabled`，未扩大 enabled 范围。
- 阶段 16N 已完成：
  - TDD RED 先用普通 API 与 `commit_per_page` API 混合批次证明 enabled 主链会错误地把两者都送入普通事务；实际 `item_count=2`，与期望 3 不一致。
  - `sync_enabled_apis()` 现在只做最小分流：短事务配置调用 `_sync_api_with_page_transactions()`，普通配置继续在独立 `engine.begin()` 中调用 `_sync_api_in_batch()`。
  - 4 个定向测试、完整 110 个 unittest、`compileall app tests`、YAML 配置加载和 `git diff --check` 均通过。
  - YAML 仍为 72/46；20 个 `commit_per_page` 配置全部 disabled，与 `param_source` 冲突配置为 0。未修改 DB 配置、未请求真实 API、未运行完整 `--sync-enabled`。
- 阶段 16O 已完成：
  - 低风险 3 个：`financial_analysis_v2_page`、`financial_analysis_columns_query`、`market_analyze_page`。前两者分别为 1 请求 23/23 和 1 请求 55 条；`market_analyze_page` 为官方非分页接口，但没有有效 total，完整性置信度略低。
  - 中风险 7 个：`store_sales_performance_page`、`sale_profit_page`、`listing_analyze_multi_index_page`、`sales_analysis_variation_asin_page`、`sales_analysis_spu_page`、`sales_analysis_country_page`、`sales_analysis_market_page`。主要风险是敏感响应标签、历史空日期或 44 页运行量。
  - 高风险或阻断 10 个：`traffic_sku_analysis_page`、`product_analyze_multi_index_page`、`listing_analyze_page`、`allocation_detail_page`、`profit_cost_analysis_page`、`financial_profit_analysis_page`、`financial_analysis_month_v2_query`、`sales_analysis_seller_sku_page`、`sales_analysis_asin_page`、`sales_analysis_sku_page`。主要风险是 19–210 页长任务、历史连接中断、固定月份不推进或销售表现历史空 `data_date`。
  - 推荐 `financial_analysis_v2_page` 作为首个启用前候选：真实验证 1 请求、23/23、0 失败，自动单日窗口、有效 total、catalog 无敏感响应标签，并且是实际财务统计数据而非仅列元数据。
  - 本阶段只读分析，YAML 保持 72/46，20 个 `commit_per_page` 配置仍全部 disabled；未连接真实 API 或 DB，历史 DB 证据没有在本轮刷新。
- 阶段 16P 已完成：
  - 从剩余 95 个只读/审查候选中只选择文档 `id=113` 的“查询月结算” `POST /finance/asset/monthlyStatementAmount/query`，确认其为查询操作；必填 `typeCode/beginDate/endDate`，非分页返回 `data` 数组，默认限流每秒 1 次。
  - TDD 先因缺少 `monthly_statement_amount_query` RED，再新增唯一默认关闭配置后 GREEN；使用 `typeCode=0`、`viewType=day`、`showCurrencyType=YUAN`、单日自动窗口、哈希幂等、请求 `beginDate` 覆盖 `data_date`、1.1 秒限流和 `commit_per_page=true`。
  - catalog 刷新为 187/65/46/19，DB/YAML 为 73/46 且 code、enabled、method、path 差异为 0；完整 111 个测试、`compileall app tests`、dry-run 和差异检查通过。
  - 单接口批次 `sync_20260717_153412_241025` 成功：1 次请求、5 条、0 失败；raw 为 5 条、5 个不同 hash、空主键 5、空 `data_date` 0，日期均为 `2026-07-02`。
  - checkpoint 记录 `last_page=1`、`request_count=1`、`item_count=5`、`total_count=null`、`next_window_start=2026-07-03`；`failed_request_log=0`。
  - 最终 named lock 空闲、外部 InnoDB 事务 0、数据库活动会话 0、同步进程 0；候选继续 disabled，未运行完整 `--sync-enabled`。
  - 未配置文档降为 122 个；除 28 个写入/修改/确认操作外，剩余只读/审查候选为 94 个：`needs_param_source=51`、`needs_sensitive_review=22`、`risk_review_before_probe=19`、`known_risk_review=2`。
- 当前工作区未提交变更：
  - `README.md`
  - `app/sync_engine.py`
  - `config/api_config.example.yaml`
  - `config/jijia_api_catalog.generated.json`
  - `docs/progress.md`
  - `docs/decisions.md`
  - `docs/next_prompt.md`
  - `tests/test_traffic_sku_analysis_page_config.py`
  - `tests/test_product_analyze_multi_index_page_config.py`
  - `tests/test_store_sales_performance_page_config.py`
  - `tests/test_market_analyze_page_config.py`
  - `tests/test_listing_analyze_page_config.py`
  - `tests/test_listing_analyze_multi_index_page_config.py`
  - `tests/test_sale_profit_page_config.py`
  - `tests/test_allocation_detail_page_config.py`
  - `tests/test_profit_cost_analysis_page_config.py`
  - `tests/test_financial_profit_analysis_page_config.py`
  - `tests/test_financial_analysis_v2_page_config.py`
  - `tests/test_financial_analysis_columns_query_config.py`
  - `tests/test_financial_analysis_month_v2_query_config.py`
  - `tests/test_monthly_statement_amount_query_config.py`
  - `tests/test_sync_api_commit_per_page.py`

## Known Issues

- `amazon_shop_page` 第一版以 `data_hash` 去重，不强行编造业务主键。
- 各业务 API 的具体路径、字段、分页和主键需要逐个阅读文档确认。
- 新增后续业务接口前，仍需要逐个阅读积加文档确认路径、分页、主键和日期字段。
- 当前 enabled API 已有 46 个：`amazon_shop_page`、`org_manage_query`、`role_list`、`dictionary_query`、`rate_page`、`continent_country_tree`、`ship_transport_list`、`country_tree`、`category_page`、`brand_page`、`product_page`、`amazon_msku_page`、`parent_product_page`、`kb_product_page`、`fba_warehouse_page`、`store_location_page`、`multi_shop_query`、`platform_msku_page`、`crm_tags_page`、`inventory_team_query`、`fba_inventory_page`、`fba_inventory_v2_page`、`inventory_adjustments_page`、`product_inventory_page`、`storage_inbound_page`、`transfer_page`、`lot_no_page`、`procure_detail`、`storage_return_page`、`strategy_template_page`、`traffic_analysis_page`、`traffic_page`、`traffic_sku_page`、`shipment_data_page`、`storage_ledger_page`、`storage_ledger_detail_page`、`storage_ledger_month_page`、`inventory_receipts_page`、`purchase_sale_storage_fba_page`、`purchase_plan_page`、`product_detail`、`storage_inbound_detail`、`country_province_query`、`transfer_detail`、`lot_no_detail`、`base_currency_query`。
- 当前已配置真实 API 为 65 个，其中 46 个已加入 enabled；统计菜单 17 个文档接口已全部配置并验证，其中 3 个 enabled、14 个 disabled。全平台新增的 `monthly_statement_amount_query` 已完成单日真实验证并保持 disabled；其余 `market_inventory_query`、`delivery_fee_query`、`inventory_event_page`、`inventory_age_page` 和销售表现拆分配置继续保持 disabled。所有 disabled 候选在启用前仍需单独评估运行时长、日期推进和业务风险。
- 当前依赖参数来源机制支持从 `raw_api_data.source_primary_key` 取单个参数，也支持从 `raw_json` 点路径提取多个参数、从单层数组路径如 `raw_json.marketListVos[].marketId` 展开一个参数，并可用 `param_source.filters` 做固定等值过滤、用 `param_source.auto_advance` 基于 checkpoint 推进窗口；`source_primary_key` 和 `raw_json` 点路径参数源均已支持 `exclude_existing_target=true` 按目标表缺失主键做增量拾取；参数型详情接口还支持用 `primary_key.param_field` 把请求参数写入 raw 主键但不污染 `raw_json`；响应提取机制已支持列表、单对象和标量包装；`product_detail`、`transfer_detail`、`lot_no_detail` 和 `procure_detail` 已通过该机制进入 enabled；另有 111307 个库存参数对或 142281 个发货单号尚未纳入生产级调度。
- `primary_key.required=true` 会过滤缺少必填主键的响应对象，避免详情接口返回全空对象时写入 `source_primary_key="None"` 的 raw。
- 覆盖矩阵是公开文档视角，不等同于当前账号真实授权可调用结果；真实可访问性仍需单接口运行验证。
- 当前 46 个 enabled API 的最终真实批量同步为 5645 次请求、568730 条成功计数、46/46 success，15M 实测耗时 9605 秒，必须按至少 3 小时的长耗时任务安排 cron 窗口。四个日期窗口接口 checkpoint 已推进到 `2026-07-09`；`storage_inbound_detail` 累计覆盖 174599/174599、缺口 0。其余各接口历史规模与验证细节见对应阶段记录。
- `--sync-enabled` 已在 5W 改为批次头、单 API、最终汇总分事务提交，已完成 API 的 raw、log 和 checkpoint 可随 API 完成后提交；但总运行时长仍由接口请求量和数据库写入量决定。
- 请求参数已支持 `{{ today }}`、`{{ yesterday }}`、`{{ days_ago:N }}` 三类日期模板；`date_window` 已通过 `traffic_analysis_page`、`traffic_sku_analysis_page`、`product_analyze_multi_index_page`、`store_sales_performance_page`、`market_analyze_page`、`listing_analyze_page`、`listing_analyze_multi_index_page`、`sale_profit_page`、`traffic_page`、`traffic_sku_page`、`shipment_data_page`、`storage_ledger_page`、`storage_ledger_detail_page` 和 `inventory_receipts_page` 真实验证，可用 checkpoint 中的 `next_window_start` 推进历史窗口，支持嵌套字段，并已支持追平当前日期后的自动跳过；日期窗口接口如果配置了有效 `total_field` 且 `item_count < total_count` 会记为 failed 且不推进 checkpoint。
- 后续如果继续增加大分页接口或依赖型批量接口，需要关注运行时长、数据库写入耗时和 cron 窗口。
- 远程 PolarDB 如出现遗留睡眠未提交事务，可能导致 raw 写入锁等待超时，需要先查 `information_schema.processlist` 和 `information_schema.innodb_trx`；同步任务互斥锁专用连接已在 15L 改为 `AUTOCOMMIT`，但业务写入连接仍需按事务边界正常排查。
- 覆盖矩阵已增加执行分层；当前未配置且可直接普通探测的候选为 0 个，剩余接口应按 `needs_param_source`、`needs_sensitive_review`、`risk_review_before_probe`、`known_risk_review` 和 `defer_write_or_mutation` 分别推进。

## Next Stage

阶段 16P 已按全平台覆盖主线完成 `monthly_statement_amount_query` 接入和真实验证。下一阶段继续从剩余 94 个只读/审查候选中只选 1 个，先只读证明真实参数来源、读取性质、分页限流、幂等、`data_date` 和敏感字段边界，再向用户提交最小方案；不要批量新增，也不要直接运行完整 `--sync-enabled`。

建议目标：

- 阶段 16P 已由批次 `sync_20260717_153412_241025` 完成“查询月结算”验收；不要为重复证明重跑 16A-16P，也不要运行完整 `--sync-enabled`。
- 最终统计菜单 17/17 配置且真实验证完成；3 个 enabled、14 个 disabled，新增候选没有改变每日批量范围。
- enabled 主链已尊重 `commit_per_page`；后续启用评估仍必须重新核算分钟级限流接口、固定月份接口和大分页接口的 cron 时长及日期推进语义。
- `delivery_fee_query`、`market_inventory_query`、`inventory_event_page`、`inventory_age_page` 和销售表现继续保持只读观察，不要直接 enabled。
- 15J 已完成销售表现前置复核，15K 已完成剩余 disabled 风险分层，15L 已完成同步互斥锁连接 `AUTOCOMMIT` 改造和 15J-15L 三轮复盘；15M 已完成 `storage_inbound_detail` enabled 及 46/46 enabled 批次验收。
- 13T-13V 三轮复盘已完成；13W-13Y 三轮复盘已完成；13Z-14B 三轮复盘已完成；14C-14E 三轮复盘已完成；14F-14H 三轮复盘已完成；14I-14K 三轮复盘已完成；14L-14N 三轮复盘已完成；14O-14Q 三轮复盘已完成；14R-14T 三轮复盘已完成；14U-14W 三轮复盘已完成；14X-14Z 三轮复盘已完成；15A-15C 三轮复盘已完成；15D-15F 三轮复盘已完成；15G-15I 三轮复盘已完成；15J 已完成销售表现 enabled 前置条件只读复核，结论是仍不能 enabled。
- 任何日期窗口完整验证都必须确认 `item_count == total_count`；如触发 `date window page truncated`，应先修正分页上限后重跑。
- 最终成功批次耗时 9605 秒；后续真实完整验证仍应预留至少 3 小时且不得与其他写任务并发。

验收：

- 新接口、完整窗口或 enabled 评估必须由公开文档、覆盖矩阵、真实请求、数据库只读查询或测试证明，不靠猜测字段。
- 如启用接口，必须证明 `api_config.enabled=1`、dry-run enabled 数量变化正确，并用真实同步批次证明成功；涉及缺失扫描时必须先证明不会重复拉取全部历史，也不会漏扫新增来源参数。
- 如调整参数型详情接口的幂等或缺失扫描逻辑，必须先证明旧数据不丢、新数据可发现，并用测试覆盖关键逻辑；如推进日期窗口，必须证明 `item_count == total_count` 或者明确说明接口返回总量为 0。
- `api_config` 与覆盖矩阵显示真实配置 API 或 enabled 数量符合本轮目标；当前基线是 DB/YAML 73/46，catalog 为真实配置 API 65 个、enabled 46 个、configured disabled 19 个。
- `compileall` 和 `unittest discover` 通过。
- 继续保持 `.env`、token 缓存、日志和真实凭证不提交。

## 2026-07-17 阶段 16Q：按板块审核终态机制

- 已把按板块接入计划落盘到 `docs/superpowers/plans/2026-07-17-section-based-api-integration.md`，保持未暂存、未提交、未推送。
- 新增 `config/api_review_overrides.yaml`，用独立文件持久化未配置接口的人工审核终态；当前登记文档 596 为 `framework_auth_only`、文档 3095 为 `defer_sensitive_credentials`，两者均未请求真实业务接口。
- catalog 状态优先级固定为：已配置状态 > 审核覆盖表 > 自动分类；审核文件缺失时继续兼容旧生成命令，未知状态会直接报错，避免误收口。
- catalog CLI 新增 `--review-config`；summary 新增 `menu_progress`，按板块输出 `total/configured/enabled/terminal_deferred/pending_review/closed`。
- 公开文档 catalog 已重新生成：187 个详情全部成功；真实配置 65、enabled 46、configured disabled 19，新增 2 个审核终态后待审分层为 `needs_param_source=50`、`needs_sensitive_review=21`、`risk_review_before_probe=19`、`known_risk_review=2`。
- 基础数据板块当前为 `total=16`、`configured=9`、`enabled=9`、`terminal_deferred=3`、`pending_review=4`、`closed=false`；三个终态分别是写操作文档 61、鉴权专用文档 596、敏感凭证阻断文档 3095。
- 统计和报表板块均为 `pending_review=0`、`closed=true`；这里表示板块终态收口，不表示所有接口都已配置或 enabled。
- 写入前只读刷新确认 DB/YAML 仍为 73/46、code/enabled/method/path 差异 0；latest batch 仍为 `sync_20260717_153412_241025` success，named lock 空闲，外部事务、数据库会话和同步进程均为 0。
- 验证通过：117 个 unittest、`compileall app tests`、无参数 dry-run 加载 46 个 enabled、`git diff --check`；未运行完整 `--sync-enabled`，未修改 DB 配置。
- 下一步只进入阶段 16R 的独立确认门：`GET /middle/base/marketNames/query`（文档 1177），确认后才做数组包装 TDD、disabled 配置和单接口真实验证。

## 2026-07-17 阶段 16R：店铺 ID 查询店铺名称终态暂缓

- 公开文档确认文档 1177 为 `GET /middle/base/marketNames/query` 查询接口，必填参数 `markerIds` 为 `array<int>`，响应 `data` 为字符串，默认限流每秒 10 次。
- 上游来源已由 DB 汇总证明：`amazon_shop_page` 有 92 条 raw、91 条包含站点数组，展开 273 条站点记录、39 个不同 market ID；审核过程未输出任何 ID 值。
- TDD 先证明 `wrap_in_list`、单元素数组主键规范化和候选配置缺失，再做最小实现；未设置包装的旧数组来源继续返回标量参数。
- 临时 disabled 配置同步后 DB/YAML 为 74/46，code/enabled/method/path 差异 0；写入前 named lock、事务、会话和同步进程均为空。
- 真实批次 `sync_20260717_223116_798898` 只发起 1 次请求即返回 HTTP 400：batch/API log 均为 failed，失败请求 1、raw 0、checkpoint 0。
- 按确认方案未重试、未猜测其他数组编码，也没有读取或输出失败请求参数和响应正文。
- 文档 1177 已写入审核覆盖表为 `defer_runtime_rejected`；失败候选的 YAML 配置和刚创建的单条 DB `api_config` 已精确清理，失败 batch、API log、failed request 证据完整保留。
- 清理后 DB/YAML 回到 73/46；catalog 仍为 187/65/46/19，基础数据变为 `configured=9`、`terminal_deferred=4`、`pending_review=3`、`closed=false`。
- 通用 `wrap_in_list` 与单元素主键规范化能力保留，供后续文档 1179 使用；121 个 unittest、`compileall app tests`、dry-run 和差异检查通过。
- 最终 named lock 空闲、外部事务 0、数据库会话 0、同步进程 0；未运行完整 `--sync-enabled`，未暂存、提交或推送。
- 下一步进入阶段 16S 独立确认门，只处理 `GET /middle/base/warehouseIds/query`（文档 1179）。

## 2026-07-18 阶段 16S：店铺 ID 查询仓库信息终态暂缓

- 公开文档确认文档 1179 为 `GET /middle/base/warehouseIds/query` 查询接口，必填 `marketIdList` 为 `array<int>`，响应 `data` 为对象数组，默认限流每秒 1 次。
- 上游参数仍来自 `amazon_shop_page.raw_json.marketListVos[].marketId`；DB 只读汇总为 92 条来源 raw、39 个不同 market ID，审核过程未输出标识值。
- 配置测试先因 `warehouse_ids_query` 缺失按预期 RED；临时配置保持 `enabled=false`、最多 3 个参数、单元素数组、1.1 秒限流、单次尝试、非分页 `list_field=data`、完整对象 `data_hash` 幂等和 `data_date=null`，随后转 GREEN。
- 临时配置同步后 YAML/DB 为 74/46，code、enabled、method、path 差异 0；真实运行前 named lock、外部事务、数据库会话和同步进程均为空。
- 批次 `sync_20260718_105341_073837` 首个且唯一请求返回 HTTP 400：batch/API log 均为 failed，请求 1、成功 0、失败 1，失败日志 1、raw 0、checkpoint 0。
- 按确认方案未重试、未尝试其他数组编码，也未读取或输出失败请求参数和响应正文。
- 文档 1179 已写入审核覆盖表为 `defer_runtime_rejected`；临时 YAML 配置和本轮创建的单条 DB `api_config` 已精确清理，失败 batch、API log 和 failed request 证据完整保留。
- 清理后 YAML/DB 回到 73/46；catalog 为 187 个公开文档、65 个真实配置、46 个 enabled、19 个 configured disabled。
- 基础数据变为 `total=16`、`configured=9`、`enabled=9`、`terminal_deferred=5`、`pending_review=2`、`closed=false`；剩余仅文档 25 和文档 694。
- 122 个 unittest、`compileall app tests`、dry-run 和 `git diff --check` 通过；最终 named lock 空闲、外部事务、数据库会话和同步进程均为 0。
- 未运行完整 `--sync-enabled`，未暂存、提交或推送。
- 下一步只对阶段 16T 文档 25 `/middle/base/allUser/list` 做只读审核并等待独立确认。

## 2026-07-20 阶段 16T：查询所有用户列表真实验证完成

- 公开文档确认文档 25 为 `GET /middle/base/allUser/list` 读取接口，无请求参数、无分页、响应 `data` 为数组，官方默认限流每秒 1 次。
- 配置测试先因 `all_user_list` 缺失按预期 RED；新增配置保持 `enabled=false`、非分页 `list_field=data`、必填主键 `id`、`date_field=createdTime`、1.1 秒限流和单次请求。
- 人员字段只保存到 `raw_api_data.raw_json`；新增 `sensitive_response=true`，失败时 `sync_api_log` 使用通用错误、`failed_request_log.response_body` 置空且不保存原始错误详情，普通接口行为不变。
- 13 位毫秒时间戳按 `Asia/Shanghai` 转换为 `data_date`，原有 ISO 日期路径保持不变；Windows 运行环境补充 `tzdata>=2024.1` 依赖。
- `--sync-api-configs` 后 YAML/DB 均为 74/46，code、enabled、method、path 差异为 0；目标配置在 YAML 和 DB 中均保持 disabled。
- 单接口批次 `sync_20260720_104305_848823` 成功：1 次请求、35 条、0 失败；API log 与 batch 状态一致，`failed_request_log=0`。
- raw 聚合为 35 条、35 个不同主键、35 个不同 hash、缺失主键 0、空 `data_date` 0；`createdTime` 真实 JSON 类型为 `UNSIGNED INTEGER`，35 条均为 13 位，审核未输出任何人员字段值。
- checkpoint 唯一行指向本成功批次，记录 `last_page=1`、`request_count=1`、`item_count=35`；named lock 空闲，外部事务、数据库会话和同步进程均为 0。
- catalog 187 个详情全部刷新成功：真实配置 66、enabled 46、configured disabled 20；基础数据为 `total=16`、`configured=10`、`enabled=9`、`terminal_deferred=5`、`pending_review=1`、`closed=false`。
- 127 个 unittest、`compileall app tests`、dry-run 和 `git diff --check` 通过；未运行完整 `--sync-enabled`，未暂存、提交或推送。
- 下一步只对阶段 16U 文档 694 `/middle/base/fileFileUrl/query` 做只读参数来源审核；不输出附件 ID 或链接值，未确认前不新增配置或请求真实接口。

## 2026-07-20 阶段 16U：附件接口只读审核完成，等待确认

- 官方文档确认文档 694 为 `GET /middle/base/fileFileUrl/query` 读取接口，必填请求字段为 `id:int`，非分页，响应 `data` 为 `string`，默认限流为每秒 2 次。
- catalog 当前把文档 694 保持为 `needs_param_source`；本阶段没有新增 YAML、DB `api_config` 或审核终态，也没有请求该接口。
- 服务器端 raw 字段名聚合只返回结构信息：发现 `attachmentVOList`、`planAttachmentVOList`、`customizeFiledData` 三个附件语义顶层容器；没有输出任何附件 ID、文件名或链接值。
- `attachmentVOList[].id` 只在已配置的 `procure_detail` 和 `transfer_detail` 来源中出现，JSON 类型均为 `INTEGER`；`procure_detail` 1 条、`transfer_detail` 999 条，缺失和空值均为 0，999 个 transfer ID 全部不同。
- 因此形成的最小候选方案（尚未实施）是从 `transfer_detail.raw_json.attachmentVOList[].id` 取前 3 个参数，目标字段 `id`，非分页标量 `data` 包装入 raw，使用请求 `id` 作为 `source_primary_key`，`data_date=null`，0.6 秒限流，单次尝试并保持 disabled；成功后再评估 `auto_advance` 的持续推进。
- 该候选只在用户确认 16U 方案后进入 TDD、配置同步和单接口验证；确认前不得使用文档示例 ID、猜测字段或硬编码值。

## 2026-07-20 阶段 16U：附件接口已完成默认关闭验证与基础数据收口

- 用户确认后新增唯一 `file_file_url_query` 配置和 3 个定向测试；配置为 `enabled=false`、首轮 `limit=3`、`auto_advance=false`、请求 `id` 作为 raw 主键、标量 `data` 包装为 `fileUrl`、`data_date=null`、0.6 秒间隔、单次尝试、`sensitive_response=true`。
- `--sync-api-configs` 后 YAML/DB 均为 75/46；仅运行 `--sync-api file_file_url_query`。终端回显被运行器超时截断，但数据库批次 `sync_20260720_112016_182107` 已证明 success：3 次请求、3 条成功、0 失败；没有重试、没有运行完整 `--sync-enabled`。
- raw 只做聚合核验：3 条、3 个不同请求主键、3 个不同 hash、缺失主键 0、空 `data_date` 3；3 条均存在 `fileUrl` 字段且没有请求 `id` 字段，未读取或输出附件 ID、文件名或链接。checkpoint 指向该批次，`last_page=3`、`total_count=3`、`item_count=3`、`param_offset=0`、`param_limit=3`、`next_param_offset=3`；失败请求为 0。
- catalog 187 个详情全部刷新成功：真实配置 67、enabled 46、configured disabled 21。基础数据为 `total=16`、`configured=11`、`enabled=9`、`terminal_deferred=5`、`pending_review=0`、`closed=true`；这是“已配置或有明确终态”的审核收口，不表示 16 个接口均已配置。
- 130 个 unittest、`compileall app tests`、dry-run 和 `git diff --check` 通过。最终 named lock 空闲、外部 InnoDB 事务 0、本地同步进程 0、数据库同步相关活动会话 0；另有 9 个非同步活动会话和 12 个睡眠会话，未占用同步锁。
- 下一步仅做产品板块整板只读预审：先生成待审清单和单接口候选证据，再另行等待确认；不要在同一阶段新增产品接口或执行真实产品同步。

## 2026-07-20 产品板块：审核终态收口

- 产品菜单 18 个公开文档接口完成整板只读预审：8 个已配置且 enabled，9 个写入/修改/创建接口继续 `defer_write_or_mutation`，唯一待审为文档 5070「查询变体属性」。
- 文档 5070 为读取型 `GET /purchase/goods/attribute/detail`，必填 `attributeName`、非分页、默认每秒 3 次、无日期字段；现有 36,820 条相关产品 raw 的字段名聚合没有发现 `attributeName` 或属性项字段，`product_page.variantProperty` 也全部为 null。审核未读取或输出任何产品、SKU 或属性值。
- 用户确认后仅在 `config/api_review_overrides.yaml` 增加文档 5070 的 `defer_no_param_source`；没有新增业务 YAML 配置、没有执行 `--sync-api-configs`、没有请求真实 API 或运行完整 `--sync-enabled`。
- catalog 187 个文档详情全部刷新成功：真实配置 67、enabled 46、configured disabled 21；产品板块为 `total=18`、`configured=8`、`enabled=8`、`terminal_deferred=10`、`pending_review=0`、`closed=true`。这表示审核终态收口，不表示 18 个接口均已配置。
- YAML/DB 仍为 75/46，最新业务批次保持 success；写入前实际同步 named lock 空闲、外部 InnoDB 事务 0、同步相关活动会话和本地同步进程均为 0。
- 130 个 unittest、`compileall app tests` 和无参数 dry-run 通过；未暂存、提交或推送。
- 下一步仅做仓库板块整板只读预审，先形成清单和单接口候选方案，再等待确认。

## 2026-07-20 阶段 16V：供应商仓接口已完成默认关闭验证

- 文档 64 `POST /purchase/inventory/supplierWarehouse/page` 已新增为 `supplier_warehouse_page`，不依赖上游业务参数；使用 `data.rows`/`data.total` 分页、`id` 主键、`createDate` 日期、0.5 秒间隔、最多 20 页和 `sensitive_response=true`，始终保持 `enabled=false`。
- TDD 先新增配置测试并确认缺少接口时失败，补齐 YAML 后转绿；完整验证为 131 个 unittest、`compileall app tests`、dry-run 与 `git diff --check` 通过。
- `--sync-api-configs` 后 YAML/DB 均为 76/46，code、enabled、method、path 差异为 0；仅运行 `--sync-api supplier_warehouse_page`，未运行完整 `--sync-enabled`。
- 成功批次 `sync_20260720_152244_506820`：1 次请求、0 条、0 失败；batch/API log 均为 success，checkpoint 记录 `last_page=1`、`request_count=1`、`item_count=0`、`total_count=0`，raw 与失败请求均为 0。这是上游空列表，不是运行时拒绝。
- catalog 187 个详情全部刷新成功：真实配置 68、enabled 46、configured disabled 22；仓库板块为 `total=6`、`configured=3`、`enabled=2`、`terminal_deferred=0`、`pending_review=3`、`closed=false`。最终 named lock 空闲、外部 InnoDB 事务 0、同步相关活动会话与本地同步进程均为 0。
- 下一步仍只做仓库板块：从余下 3 个待审接口中只选择 1 个候选，先提交最小方案等待确认。

## 2026-07-20 阶段 16W：自营仓接口已完成默认关闭验证

- 文档 212 `POST /purchase/inventory/selfWarehouse/page` 已新增为 `self_warehouse_page`，无上游业务参数；使用 `data.rows`/`data.total` 分页、`id` 必填主键、`data_date=null`、0.5 秒间隔、最多 20 页和 `sensitive_response=true`，保持 `enabled=false`。
- TDD 先新增配置测试并确认缺少接口时失败，补齐 YAML 后转绿；完整验证为 132 个 unittest、`compileall app tests`、dry-run 与 `git diff --check` 通过。
- `--sync-api-configs` 后 YAML/DB 均为 77/46，code、enabled、method、path 差异为 0；仅运行 `--sync-api self_warehouse_page`，未运行完整 `--sync-enabled`。
- 成功批次 `sync_20260720_155429_491510`：1 次请求、27 条、0 失败；batch/API log 均为 success，checkpoint 记录 `last_page=1`、`request_count=1`、`item_count=27`、`total_count=27`，失败请求为 0。
- raw 只做聚合核验：27 条、27 个不同主键、27 个不同 hash、缺失主键 0、空 `data_date` 27；不读取或输出邮箱、电话、手机号、联系人或地址值。
- catalog 187 个详情全部刷新成功：真实配置 69、enabled 46、configured disabled 23；仓库板块为 `total=6`、`configured=4`、`enabled=2`、`terminal_deferred=0`、`pending_review=2`、`closed=false`。最终 named lock 空闲、外部 InnoDB 事务 0、同步相关活动会话与本地同步进程均为 0。
- 下一步仍只做仓库板块：仅对文档 1035 或 1449 之一做只读预审并等待确认。

## 2026-07-20 阶段 16X：仓库板块审核终态收口

- 文档 1035 `POST /purchase/store/multiTypeWarehouse/page` 为分页读取接口，但公开响应结构含服务商凭证字段；登记 `defer_sensitive_credentials`，不创建业务 YAML、不请求真实 API。
- 文档 1449 `POST /fulfillment/store/selfInboundListAndDetail/page` 为分页读取接口，必填 `rnType` 的公开枚举未在现有自营仓 27 条和 FBA 仓 36 条 raw 类型字段中找到可证明映射；登记 `defer_no_param_source`，不猜测参数或请求真实 API。
- TDD 新增终态收口测试：登记前因缺少 1035 覆盖而 RED，补齐覆盖后 GREEN；测试同时约束仓库板块为 4 个 configured、2 个 enabled、2 个 terminal、0 个 pending、`closed=true`。
- 批量公开文档刷新因上游单条详情无超时阻塞而在写文件前超时；现有 catalog 保持完整有效的 187 个详情记录，已基于同一份详情和当前审核覆盖离线重分类，不伪称重新拉取成功。
- YAML/DB 仍为 77/46，code、enabled、method、path 差异 0；未运行 `--sync-api-configs`、`--sync-api` 或完整 `--sync-enabled`，最新业务批次保持 success。
- 下一步按固定顺序进入库存板块，仅做整板只读预审并提交一个候选最小方案等待确认。

## 2026-07-20 阶段 16Y：库存板块审核终态收口

- 库存板块 14 个公开文档接口已完成整板只读预审：9 个已配置（8 个 enabled），4 个创建出入库单接口继续 `defer_write_or_mutation`，唯一待审为文档 1022。
- 文档 1022 `POST /purchase/inventory/purchaseSaleStorageSelf/page` 是非敏感分页读取接口，公开结构有 `data.rows/data.total`，但无稳定 `id` 或日期字段；只能依赖 `data_hash`，没有可验证的 `data_date` 来源。
- 历史真实证据显示 `dateType=DAY` 配合 `beginDate/endDate` 返回 400/50099；公开文档未给出限流值。本轮不重跑旧探测，登记 `defer_runtime_rejected`。
- TDD 新增库存终态收口测试：登记前因缺少 1022 覆盖而 RED，补齐覆盖后 GREEN；测试约束库存板块为 9 个 configured、8 个 enabled、5 个 terminal、0 个 pending、`closed=true`。
- catalog 保留有效的 187 条公开详情并按当前审核覆盖离线重分类；库存板块为 `total=14`、`configured=9`、`enabled=8`、`terminal_deferred=5`、`pending_review=0`、`closed=true`。这是审核收口，不表示所有接口均已配置。
- YAML/DB 仍为 77/46，未运行 `--sync-api-configs`、`--sync-api` 或完整 `--sync-enabled`；下一步按固定顺序进入采购板块，只做整板只读预审并等待确认。
## 2026-07-20 阶段 16Z：采购订单列表完成默认关闭验证

- 文档 86 `POST /purchase/srm/procure/page` 已新增为 `procure_page`，保持 `enabled=false`；公开契约只要求嵌套分页对象 `pageInfo.page`、`pageInfo.pagesize`，没有业务筛选参数，因此不依赖猜测的上游参数来源。
- 同步引擎的两个分页路径均改为通过既有点路径读写器设置分页字段；TDD 覆盖普通分页和参数来源分页的嵌套字段，旧扁平分页接口行为不变。
- 配置固定为每页 100、首次最多 1 页、`data.rows`/`data.total`、`id` 必填主键、`updateTime` 为 `data_date`、1 秒间隔、单次尝试；公开响应未标记敏感字段，审核过程未输出任何采购订单字段值。
- `--sync-api-configs` 后 YAML/DB 均为 78/46，code/enabled/method/path 差异 0；仅运行 `--sync-api procure_page`，未运行完整 `--sync-enabled`。
- 成功批次 `sync_20260720_171204_853350`：1 次请求、100 条成功、0 失败；raw 为 100 个不同主键、100 个不同 hash、空日期 0；checkpoint 指向同批次，失败请求为 0。
- catalog 保留完整的 187 个公开详情并按当前 YAML/审核覆盖离线重分类：真实配置 70、enabled 46；采购板块为 `total=23`、`configured=6`、`enabled=5`、`terminal_deferred=11`、`pending_review=6`、`closed=false`。这不表示采购板块已收口。
- 最终 named lock 空闲、外部 InnoDB 事务 0、同步相关活动会话 0、本地同步进程 0；未暂存、提交或推送。

## 2026-07-20 阶段 16AA：关联采购订单信息终态暂缓

- 文档 90 `GET /purchase/srm/relevancePoInfo/query` 是读取接口，必填参数 `code` 的官方语义为采购计划单号；接口非分页、公开文档未给出限流值、响应不含敏感字段。
- 只读来源审核确认：`procure_page.raw_json.purchasePlanCode` 在 100 条 raw 中字段存在，但非空值为 0；`purchase_plan_page` 没有可用 raw。未读取或输出任何采购单号、计划号、SKU 或产品字段值。
- 因没有语义正确且非空的真实参数来源，用户确认后仅登记文档 90 为 `defer_no_param_source`；不新增 YAML、DB `api_config`、batch、raw、checkpoint 或失败日志，不调用真实业务接口。
- TDD 新增采购板块终态计数测试：登记前因缺少文档 90 覆盖而 RED，登记后 GREEN；catalog 保留 187 条有效公开详情并离线重分类为采购 `total=23`、`configured=6`、`enabled=5`、`terminal_deferred=12`、`pending_review=5`、`closed=false`。
- YAML/DB 保持 78/46、配置差异 0，最新业务批次仍为 `sync_20260720_171204_853350` success；未运行 `--sync-api-configs`、`--sync-api` 或完整 `--sync-enabled`。

## 2026-07-20 阶段 16AB：供应商信息列表完成默认关闭验证

- 文档 43 `POST /purchase/srm/supplier/page` 已新增为 `supplier_page`，保持 `enabled=false`；所有业务筛选字段均可选，首轮仅第 1 页、每页 100，使用 `data.rows`/`data.total`。
- 公开响应包含联系人、电话、邮箱和地址字段；配置 `sensitive_response=true`，成功数据只进入 `raw_api_data.raw_json`，失败时不保存响应正文或原始错误详情，审核未输出任何敏感字段值。
- 响应的供应商编号 `code` 未在运行前证明全局唯一，首轮不设置业务主键，使用完整对象 `data_hash` 幂等；`createdAt` 生成 `data_date`。
- `--sync-api-configs` 后 YAML/DB 均为 79/46，code/enabled/method/path 差异 0；仅运行 `--sync-api supplier_page`，未运行完整 `--sync-enabled`。
- 成功批次 `sync_20260720_182049_479213`：1 次请求、27 条成功、0 失败；raw 为 27 个不同 hash、空日期 0、业务主键为空，checkpoint 指向同批次，失败请求为 0。
- catalog 保留 187 条有效公开详情并离线重分类：真实配置 71、enabled 46；采购板块为 `total=23`、`configured=7`、`enabled=5`、`terminal_deferred=12`、`pending_review=4`、`closed=false`。
- 最终 named lock 空闲、外部 InnoDB 事务 0、同步相关活动会话 0、本地同步进程 0；未暂存、提交或推送。

## 2026-07-21 阶段 16AC：采购计划明细终态暂缓

- 文档 88 `POST /purchase/srm/plan/detail` 是读取型详情接口，必须提供采购计划 `id` 或 `code` 二选一；非分页、公开文档未给出限流值，响应含人员姓名和账号等敏感字段。
- 只读来源审核确认：`purchase_plan_page` 没有 raw；`procure_page` 没有采购计划 ID，计划编号字段为空；交货单 `fid` 经公开文档确认是采购订单 ID，不得误用为采购计划 ID。审核未读取或输出任何真实计划、订单、人员或账号值。
- 因没有语义正确且非空的真实参数来源，用户确认后仅登记文档 88 为 `defer_no_param_source`；不新增 YAML、DB `api_config`、batch、raw、checkpoint 或失败日志，不调用真实业务接口。
- TDD 新增采购计划明细终态计数测试：登记前因缺少文档 88 覆盖而 RED，登记后 GREEN；catalog 保留 187 条有效公开详情并离线重分类为采购 `total=23`、`configured=7`、`enabled=5`、`terminal_deferred=13`、`pending_review=3`、`closed=false`。
- YAML/DB 保持 79/46、配置差异 0，最新业务批次仍为 `sync_20260720_182049_479213` success；未运行 `--sync-api-configs`、`--sync-api` 或完整 `--sync-enabled`。

## 2026-07-29 阶段 16AD：供应商产品列表完成受保护的一页验证

- 文档 91 `POST /purchase/srm/supplierSkuQuote/page` 已新增为 `supplier_sku_quote_page`，保持 `enabled=false`；无业务必填参数，使用 `data.rows`/`data.total` 分页，`id` 为必填主键，`createdAt` 生成 `data_date`，人员标识只做 raw 备份。
- TDD 新增唯一配置测试：新增配置前 RED，补齐后 GREEN；目标配置固定每页 100、最多 1 页、1 秒间隔、单次重试和 `sensitive_response=true`。
- `--sync-api-configs` 后 YAML/DB 均为 80/46，code/enabled/method/path 差异 0；仅运行 `--sync-api supplier_sku_quote_page`，未运行完整 `--sync-enabled`。
- 批次 `sync_20260729_120154_588297` 为 failed：1 次请求、100 条成功计数、失败计数 1；raw 为 100 个不同主键和 hash、空日期 0，失败请求为 0，未写 checkpoint。
- 失败由分页完整性保护触发：单页上限小于上游有效总量，禁止把截断结果写为成功 checkpoint；这不是上游拒绝，不登记 `defer_runtime_rejected`，也不将接口表述为已真实验证完成。
- 最终 named lock 空闲、外部 InnoDB 事务 0、同步相关活动会话 0、本地同步进程 0；catalog 离线重分类为 187 个有效公开详情、72 个真实配置、46 个 enabled，采购板块为 `total=23`、`configured=8`、`enabled=5`、`terminal_deferred=13`、`pending_review=2`、`closed=false`。

## 2026-07-29 阶段 16AE：供应商产品列表两页受限验证仍未覆盖完整总量

- 用户确认后，仅将 `supplier_sku_quote_page.max_pages` 从 1 调整为 2；TDD 先修改唯一配置测试至 RED，再更新 YAML 转 GREEN。接口继续 `enabled=false`，其他接口未改动。
- 写入前两次只读核验均确认 named lock 空闲、外部 InnoDB 事务 0、同步相关活动会话 0、本地同步进程 0；`--sync-api-configs` 后 YAML/DB 均为 80/46，code/enabled/method/path 差异 0。
- 仅运行 `--sync-api supplier_sku_quote_page`，批次 `sync_20260729_121333_642328` 为 failed：2 次请求、200 条成功计数、失败计数 1；raw 为 200 个不同主键和 hash、空日期 0，checkpoint 和失败请求均为 0。
- 两页均由上游正常返回；失败仍是本地分页完整性保护，因为有效总量超过 200。不得将其登记为上游拒绝或已验证成功，也不执行第三页或完整 `--sync-enabled`。
- 最终 named lock 空闲、外部 InnoDB 事务 0、同步相关活动会话 0、本地同步进程 0；catalog 和采购板块计数保持 187/72/46 与 `configured=8`、`enabled=5`、`terminal_deferred=13`、`pending_review=2`。

## 2026-07-29 阶段 16AF：分页预检与写前容量保护完成

- 新增 `--probe-api <api_code>`：只请求普通分页接口首页，输出总数、页大小、所需页数和请求次数；不创建数据库引擎，也不写入同步表。
- 普通事务和 `commit_per_page` 均在首页 raw 写入前核验 `max_pages` 是否覆盖 `required_pages`；不足时立即失败且 raw 数为 0。完整回归 160 个 unittest、编译、dry-run 和 `git diff --check` 通过。
- `supplier_sku_quote_page` 预检总量 9,727、每页 100、所需 98 页、请求 1 次；预检后 batch/raw/checkpoint/API log/失败请求均保持原值。YAML/DB 为 80/46、差异 0，锁、事务、会话和进程均为 0。

## 2026-07-29 阶段 16AG：供应商产品列表改为实时 total 驱动分页

- 再次读取官方文档 91：`POST /purchase/srm/supplierSkuQuote/page`，必填分页字段为 `page/pagesize`，官方单页最大 100；响应分页字段为 `data.rows/data.total`，默认每 1 秒 1 次。官方没有给出固定总页数上限。
- 写前只读核验确认 YAML/DB 均为 80/46、code/enabled/method/path 差异 0，latest batch 仍为 `sync_20260729_121333_642328` failed；named lock 空闲、外部 InnoDB 事务 0、活动数据库会话 0、本地积加同步进程 0。
- TDD 先得到 4 个预期失败，再实现可选 `max_pages`：省略时每页读取最新 `total` 并自动继续；运行中 `total` 增长也会继续请求新增页；缺失或非法 `total` 会在首页 raw 写入前失败。已有固定 `max_pages` 的接口保持原容量保护。
- `supplier_sku_quote_page` 已从 YAML 删除固定两页上限，增加 `commit_per_page=true`，继续保持 `enabled=false`；按页短事务避免全量分页期间长期占用同一 InnoDB 事务。
- 完整验证为 162 个 unittest 通过，`compileall app tests`、无参数 dry-run 和 `git diff --check` 通过。
- 只读 `--probe-api supplier_sku_quote_page` 返回 `total_count=9727`、`page_size=100`、`required_pages=98`、请求 1 次，耗时 2.502 秒。
- 预检后 DB 没有新增写入：latest batch 不变，目标 raw 200、checkpoint 0、API log 2、failed request 0；named lock 空闲、外部事务和活动会话均为 0。
- 当前没有执行 `--sync-api-configs`，所以 DB `config_json` 仍为旧的 `max_pages=2` 且没有 `commit_per_page`；也没有运行真实 `--sync-api` 或完整 `--sync-enabled`。catalog 状态保持 187 个有效详情、72 个已配置、46 个 enabled，采购板块仍有 2 个待审。

## 2026-07-29 阶段 16AH：供应商产品列表完成 total 驱动真实验证

- 正式写入前重新核对 Git、YAML、catalog、DB、latest batch、named lock、外部 InnoDB 事务、活动数据库会话和本地同步进程；YAML/DB 均为 80/46、code/enabled/method/path 差异 0，锁、事务、会话和进程均为空。
- 再次读取官方文档 91，确认 `POST /purchase/srm/supplierSkuQuote/page` 必填 `page/pagesize`、单页最大 100、响应为 `data.rows/data.total`，默认每 1 秒 1 次；没有人为补充固定总页数上限。
- 执行 `--sync-api-configs` 后，DB 配置与 YAML 一致：目标接口没有 `max_pages`、`commit_per_page=true`，并继续保持 `enabled=false`。
- 仅运行 `--sync-api supplier_sku_quote_page`。批次 `sync_20260729_151815_934165` 为 success：运行时 total 为 9,727，共 98 次请求、9,727 条成功、0 失败，耗时约 5 分 30 秒。
- 目标 raw 共 9,727 条，业务主键、data hash 均为 9,727 个，空主键和空 `data_date` 均为 0；9,727 条均指向本批次。checkpoint 为 `last_page=98`、`request_count=98`、`item_count=9727`、`total_count=9727`。
- 当前批次和目标接口累计 `failed_request_log` 均为 0；最终 named lock 空闲、外部 InnoDB 事务 0、活动数据库会话 0、本地同步进程 0。
- 完整回归 162 个 unittest 通过；未运行完整 `--sync-enabled`，未暂存、提交或推送。catalog 状态仍为 187 个有效详情、72 个已配置、46 个 enabled；采购板块仍有 2 个待审，尚未收口。

## 2026-07-30 阶段 16AI：采购快捷入库查询运行拒绝终态

- 正式写入前重新核对 Git、YAML、catalog、DB、latest batch、named lock、外部 InnoDB 事务、活动数据库会话和本地同步进程；YAML/DB 均为 80/46、code/enabled/method/path 差异 0，锁、事务、会话和进程均为空。
- 官方文档 1080 明确 `POST /purchase/srm/quickInbound/query` 为读取接口，请求体 `data` 是可选 `array<string>`，最多 100 个采购单号，响应 `data` 为对象数组，默认每秒 1 次；响应包含 `poId`，没有可用于 `data_date` 的日期字段。
- 真实参数来源为已验证的 `procure_page.raw_json.code`。只读聚合核验确认现有 100 行均有非空采购单号且去重后仍为 100；审核和日志均未输出任何采购单号值。
- TDD 增加顶层 param source 字段的显式 `wrap_in_list=true` 支持：目标参数生成单元素 Python 列表；未配置数组包装的旧顶层字段继续生成标量。临时接口配置保持 `enabled=false`、非分页、`list_field=data`、主键 `poId`、`data_date=null`，首次参数来源上限为 3。
- 执行 `--sync-api-configs` 后仅运行 `--sync-api quick_inbound_query`。批次 `sync_20260730_100043_263810` 在第 1 次官方格式请求收到 HTTP 400 后失败，未重试、未尝试其他数组编码；API log 为 1 次请求、0 条成功、1 条失败，raw 和 checkpoint 均为 0。
- `failed_request_log` 保留 HTTP 400 和脱敏错误摘要，`request_params`、`response_body` 均为空。随后将文档 1080 登记为 `defer_runtime_rejected`，删除临时 YAML 配置和精确匹配的 disabled DB 配置行，保留 batch、API log 和失败日志证据。
- 收尾核验恢复 YAML/DB 80/46，code/enabled/method/path 差异 0；目标配置在 YAML/DB 均不存在，named lock 空闲、外部事务 0、活动会话 0、本地同步进程 0。
- 实时刷新官方 catalog 得到 189 个有效详情、72 个已配置、46 个 enabled；相较上一快照新增的 2 个文档均落在物流板块。采购板块当前为 `configured=8`、`enabled=5`、`terminal_deferred=14`、`pending_review=1`、`closed=false`。
- 本阶段未运行完整 `--sync-enabled`，未暂存、提交或推送；采购板块只剩文档 5262 的敏感响应终态审核。
- 最终完整回归 166 个 unittest 通过；`compileall app tests`、无参数 dry-run 和 `git diff --check` 通过。

## 2026-07-30 阶段 16AJ：采购主体敏感终态与采购板块收口

- 写前只读门禁确认 Git 无 staged 文件，YAML/DB 均为 80/46、code/enabled/method/path 差异 0；latest batch 仍为 `sync_20260730_100043_263810` failed，named lock 空闲、外部 InnoDB 事务 0、活动数据库会话 0、本地同步进程 0。
- 实时官方文档 5262 确认 `POST /purchase/srm/purchaseSubject/list`、`opType=list`、审核通过且公开；请求体为空、响应 `data` 为对象数组、非分页，默认每秒 1 次。
- 官方响应包含联系人、邮箱、电话、税号、地址、银行账户和公章图片链接等高敏感字段。即使存在主键 `id` 和日期字段 `createTime`，也禁止将该接口接入通用业务 raw 备份。
- TDD 先因审核覆盖表缺少文档 5262 得到 `KeyError: 5262`，再增加唯一一条 `defer_sensitive_credentials` 终态；采购板块关闭测试和审核终态测试转绿。
- 实时刷新 catalog 成功读取 189/189 个详情、错误 0；全平台仍为 72 个已配置、46 个 enabled。采购板块变为 `configured=8`、`enabled=5`、`terminal_deferred=15`、`pending_review=0`、`closed=true`。
- 本阶段没有新增业务 YAML 配置，没有执行 `--sync-api-configs`，没有调用文档 5262 或其他真实业务 API，也没有写数据库；YAML/DB 仍为 80/46。
- 未运行完整 `--sync-enabled`，未暂存、提交或推送。采购板块现已完成审核终态收口，但不能表述为 23 个接口均已配置。
- 最终完整回归 167 个 unittest 通过；`compileall app tests`、无参数 dry-run 和 `git diff --check` 通过。

## 2026-07-30 阶段 16AK-A：物流方式官方契约修正与只读分页预检

- 启动前只读门禁确认：Git 无 staged 文件；YAML/DB 均为 80 个配置、46 个 enabled，code/enabled/method/path 差异为 0；latest batch 为 `sync_20260730_100043_263810` failed；named lock 空闲，外部 InnoDB 事务、活动数据库会话和本地同步进程均为 0。
- 实时官方文档 3059 与公开 apiMap 均确认 `GET /fulfillment/ship/transport/list`；必填分页参数为 `page/pagesize`，`pagesize` 最大 100，响应为 `data.rows/data.total`，默认限流为每秒 1 次。当前官方契约优先于历史 POST 配置和历史成功批次。
- TDD 新增唯一配置测试：旧配置因 `enabled=true` 先 RED；随后仅把本地 YAML 改为 `enabled=false`、`method=GET`、1 秒限流，删除猜测的 `max_pages=10`，按实时有效 `total` 动态分页后转 GREEN。既有 enabled 总数测试同步改为 45，并明确排除该接口。
- 只执行一次 `--probe-api ship_transport_list`：返回 `total_count=292`、`page_size=100`、`required_pages=3`、`request_count=1`，总耗时 1.613 秒；预检不创建数据库引擎，不写 batch、API log、raw、checkpoint 或失败日志。
- catalog 使用现有 189 条实时官方详情重新核对本地配置状态：72 个已配置、45 个 enabled；物流板块为 `configured=3`、`enabled=1`、`terminal_deferred=2`、`pending_review=16`、`closed=false`。
- 本阶段没有运行 `--sync-api-configs`、`--sync-api` 或完整 `--sync-enabled`。本地 YAML 为 80/45 且目标方法为 GET；DB 仍为上一快照 80/46 且目标方法为 POST，这是等待二次确认的预期差异。
- 完整回归 168 个 unittest、`compileall app tests`、无参数 dry-run 和 `git diff --check` 通过；未暂存、提交或推送。

## 2026-07-30 阶段 16AK-B：物流方式 GET 单接口真实验证

- 实时官方 detail 再次确认文档 3059 为审核通过且公开的 `GET /fulfillment/ship/transport/list` 读取接口；`page/pagesize` 必填、单页最大 100、响应 `data.rows/data.total`，默认每秒 1 次。
- 写前门禁确认 Git 无 staged 文件；YAML/catalog 为 80/45 和 189/72/45，DB 为 80/46；唯一 enabled/method 差异是待修正的 `ship_transport_list`。latest batch 仍为 `sync_20260730_100043_263810` failed，named lock 空闲，外部事务、活动会话和同步进程均为 0。
- `--sync-api-configs` 成功同步 80 条配置；复核后 YAML/DB 均为 80/45，目标配置为 GET、disabled、无固定 max_pages、每页 100、`data.total` 驱动、1 秒限流，code/enabled/method/path 差异均为 0。
- 仅运行 `--sync-api ship_transport_list`，未运行完整 `--sync-enabled`。批次 `sync_20260730_112541_515611` 为 success：运行时 total 292、3 次请求、292 条成功、0 失败，CLI 总耗时 14.378 秒。
- 当前批次 raw 为 292 条，业务主键和 data hash 各 292 个，空主键 0；官方无日期字段，292 条 `data_date` 均为 null。raw 总表为 293 条，其中 1 条历史记录本次上游未返回，按原始备份原则保留而不删除。
- checkpoint 与本批次一致：`last_page=3`、`request_count=3`、`item_count=292`、`total_count=292`；本批次及目标接口累计失败请求均为 0。
- 收尾 named lock 空闲，外部 InnoDB 事务、活动数据库会话和本地同步进程均为 0；接口继续保持 disabled，恢复 daily enabled 需下一次单独确认。
- 完整回归 168 个 unittest、`compileall app tests`、无参数 dry-run 和 `git diff --check` 通过；未暂存、提交或推送。

## 2026-07-30 阶段 16AK-C：恢复物流方式 daily enabled

- 用户确认后，写前重新核对 Git、YAML/catalog、DB、latest batch、named lock、外部 InnoDB 事务、活动数据库会话和本地同步进程；YAML/DB 起点均为 80/45、差异 0，latest batch 为 16AK-B 成功批次，锁、事务、会话和进程均为空。
- TDD 先把 `ship_transport_list` 和 enabled 总数期望改为 true/46，得到 2 个预期失败；随后只将目标 YAML 的 `enabled` 改为 true，并同步 catalog 计数，定向测试转绿。GET、分页、主键、日期、限流和重试配置均未改动。
- catalog 离线汇总自检通过：189 个有效详情、72 个已配置、46 个 enabled；物流板块为 `configured=3`、`enabled=2`、`terminal_deferred=2`、`pending_review=16`、`closed=false`。
- 完整回归 168 个 unittest、`compileall app tests`、无参数 dry-run 和 `git diff --check` 通过；dry-run 明确加载 46 个 enabled 并包含 `ship_transport_list`。
- 再次确认唯一 YAML/DB 差异是目标 enabled、named lock 空闲且事务/会话/进程均为 0 后，只运行 `--sync-api-configs`，成功同步 80 条配置。
- 收尾 YAML/DB 均为 80/46，code/enabled/method/path 差异 0；目标 DB 配置为 enabled、GET、无固定 max_pages、每页 100、`data.total` 驱动、1 秒限流。
- 本阶段没有调用任何真实业务 API，没有运行 `--sync-api` 或完整 `--sync-enabled`；latest batch、293 条 raw、51 条目标 API log、checkpoint 和失败请求计数均保持 16AK-B 结果不变。
- 最终 named lock 空闲，外部 InnoDB 事务、活动会话和本地同步进程均为 0；无 staged 文件，未提交或推送。

## 2026-07-30 阶段 16AL-A：发货单列表配置与只读分页预检

- 实时官方文档 1027 确认 `POST /fulfillment/ship/delivery/page` 是审核通过且公开的读取接口；只有 `page/pagesize` 必填，单页最大 100，响应为 `data.rows/data.total`，默认每秒 2 次，所有业务筛选条件均为可选。
- 新增本地 `delivery_page` 配置并保持 `enabled=false`：不设置 `max_pages`、不设置日期窗口或参数来源，按实时有效 total 动态分页；限流间隔 0.5 秒，单页只尝试 1 次。
- 幂等优先使用响应 `id`，但官方未把该字段标为必填，因此配置 `required=false`，缺失时使用完整对象 `data_hash`；`updateTime` 生成 `data_date`。
- 官方响应包含店铺账号标识、人员标识及姓名、金额与币种、订单/采购/物流/货件/供应商/仓库编号和备注等业务敏感字段，配置 `sensitive_response=true`，仅允许 raw 备份，日志和交接文档不输出字段值。
- TDD 聚焦测试先因配置不存在得到预期失败，再加入最小配置转 GREEN；catalog 使用项目自身汇总函数校验，存储汇总与计算结果一致。
- 严格只执行一次 `--probe-api delivery_page`：实时 `total_count=18162`、`page_size=100`、`required_pages=182`、`request_count=1`，CLI 总耗时 5.065 秒。
- 按当前 total，正常完整同步基线为 182 次请求、181 次页间等待，固定限流等待共 90.5 秒；182 页不是长期上限，实际同步仍按运行时 total 自动计算。
- probe 没有创建数据库引擎或写同步表。复核显示本地 YAML 为 81/46、DB 为 80/46，唯一差异是未同步的 `delivery_page`；目标在 DB 配置、API log、raw、checkpoint 和失败日志中的计数均为 0，latest batch 仍为 `sync_20260730_112541_515611` success。
- named lock 空闲，外部 InnoDB 事务、活动数据库会话和本地同步进程均为 0；未运行 `--sync-api-configs`、`--sync-api` 或完整 `--sync-enabled`。
- catalog 为 189 个有效详情、73 个已配置、46 个 enabled；物流板块为 `configured=4`、`enabled=2`、`terminal_deferred=2`、`pending_review=15`、`closed=false`。

## 2026-07-30 阶段 16AL-B：发货单列表真实单接口验证

- 写入前再次读取官方文档 1027 和 apiMap：两者一致确认 `POST /fulfillment/ship/delivery/page`；仅 `page/pagesize` 必填，单页最大 100，响应为 `data.rows/data.total`，默认每秒 2 次，接口公开且审核通过。
- Git 保持 `master@51a6484`、无 staged；起点 YAML 为 81/46、DB 为 80/46，唯一差异是尚未同步的 `delivery_page`。latest batch 为 `sync_20260730_112541_515611` success，锁、事务、活动会话和同步进程均为空。
- TDD 先将目标配置测试改为要求 `commit_per_page=true`，因 YAML 缺少该字段得到预期 `KeyError`；只增加按页短事务配置后转 GREEN，没有增加固定页数、业务筛选或其他非官方限制。
- 配置写入前完整回归 169 个 unittest 通过；`compileall app tests`、无参数 dry-run 和 `git diff --check` 通过，dry-run 仍只加载 46 个 enabled API。
- 只执行 `--sync-api-configs`，成功同步 81 条配置；随后 YAML/DB 均为 81/46，code/enabled/method/path 差异为 0，目标为 disabled、POST、每页 100、无 `max_pages`、`commit_per_page=true`、`sensitive_response=true`。
- 真实同步前再次确认 named lock 空闲、外部 InnoDB 事务 0、活动数据库会话 0、本地同步进程 0；仅运行 `--sync-api delivery_page`，没有运行完整 `--sync-enabled`。
- 批次 `sync_20260730_143314_977605` 为 success：运行时 `total=18168`、182 次请求、18168 条成功、0 失败；DB 批次耗时 1110 秒，CLI 总耗时 1116.106 秒。
- 16AL-A 预检 total 为 18162，真实同步时增加 6 条但仍按最新 total 完整覆盖 182 页；182 页没有写入配置，后续业务增长继续由运行时 total 动态处理。
- 本批次 raw 为 18168 条，业务主键、data hash 均为 18168 个；空主键、缺失 JSON id、主键映射不一致均为 0。
- `data_date` 全部来自 `updateTime`：空日期、缺失 updateTime、日期映射不一致均为 0；日期范围为 2022-10-29 至 2026-07-30。
- checkpoint 与批次一致：`last_page=182`、`request_count=182`、`item_count=18168`、`total_count=18168`；本批次及目标累计失败请求均为 0。
- 收尾 YAML/DB 仍为 81/46 且差异 0；named lock 空闲、外部事务、活动会话和同步进程均为 0。

## 2026-07-30 阶段 16AL-C：发货单列表加入 daily enabled

- 启用前再次读取官方 detail 与 apiMap，确认文档 1027 仍为公开且审核通过的 `POST /fulfillment/ship/delivery/page`；分页、单页最大 100、`data.rows/data.total` 和默认每秒 2 次均未变化。
- 写前门禁确认 Git 为 `master@51a6484`、无 staged；YAML/DB 均为 81/46 且差异 0，目标 disabled；latest batch、18168 条 raw、1 条 API log、checkpoint 和 0 条失败记录保持 16AL-B 证据，锁、事务、会话和同步进程均为空。
- TDD 只将目标 enabled 期望改为 true、全局 enabled 总数改为 47并加入目标断言；旧 YAML 产生 2 个预期失败。
- 只将 `delivery_page.enabled` 改为 true，并同步 catalog 的 enabled 汇总、物流板块计数和文档 1027 状态；聚焦测试转 GREEN，catalog 项目内汇总函数自检一致。
- catalog 本地状态为 189 个有效详情、73 个已配置、47 个 enabled；物流板块为 `configured=4`、`enabled=3`、`terminal_deferred=2`、`pending_review=15`、`closed=false`。
- 完整回归 169 个 unittest、`compileall app tests`、无参数 dry-run 和 `git diff --check` 通过；dry-run 明确加载 47 个 enabled 并包含 `delivery_page`。
- 配置写入前再次确认唯一 YAML/DB 差异为 `delivery_page.enabled`，named lock 空闲、外部 InnoDB 事务 0、活动会话 0、本地同步进程 0。
- 只执行 `--sync-api-configs`，成功同步 81 条配置；没有运行 `--sync-api` 或完整 `--sync-enabled`，没有调用任何业务 API。
- 收尾 YAML/DB 均为 81/47，code/enabled/method/path 差异 0；目标 DB 配置继续为 POST、无固定 `max_pages`、每页 100、`commit_per_page=true`、`sensitive_response=true`。
- latest batch 仍为 `sync_20260730_143314_977605` success；raw 18168、不同主键 18168、不同 hash 18168、空日期 0，API log 1、失败请求 0，checkpoint 仍为第 182 页、182 次请求、18168 条和 total 18168。
- 最终 named lock 空闲，外部事务、活动会话和同步进程均为 0；未暂存、提交或推送。
- 下一候选审核发现文档 256 虽被 catalog 归为无业务必填参数，但官方明确“分页查询必须带一个条件，只传分页参数不返回数据”，因此不能直接无条件探测，也不能擅自用约 1.8 万个发货单号逐单请求。
- 只读比较其余候选后选择文档 1778 `POST /fulfillment/ship/cost/page`：读取接口公开且审核通过，业务筛选均可选，分页最大 100、`data.rows/data.total`、默认每秒 2 次。
- 文档 1778 响应顶层存在非必填 `id` 和 `updateAt`；费用、金额、币种、组织、付款条件及物流单号等字段必须 `sensitive_response=true` 且仅 raw 备份。
- 下一阶段 16AM-A 只允许增加默认关闭配置并执行一次首页 total 预检，不同步 DB、不运行真实数据同步或完整 enabled；取得 total 后再提交请求量、事务和运行时间方案。

## 2026-07-30 阶段 16AM-A：物流费用金额明细配置与失败预检收口

- 实时官方 detail 和 apiMap 一致确认文档 1778 为公开且审核通过的 `POST /fulfillment/ship/cost/page`，名称为“查询物流费用金额明细”，`opType=page`，属于读取接口。
- 官方业务筛选 `codes/feeTypes/expenseTypes/updateTimeStart/updateTimeEnd/createTimeStart/createTimeEnd`、分页字段 `page/pagesize` 均为可选；单页最大 100，响应为 `data.rows/data.total`，默认每秒 2 次。
- 响应顶层 `id` 和 `updateAt` 均非必填，因此使用 `id required=false` 并在缺失时回退 data hash，`updateAt` 生成 `data_date`；金额、币种、费用、付款和组织字段按敏感 raw-only 处理。
- 写前门禁确认 Git 为 `master@51a6484`、无 staged；YAML/DB 均为 81/47 且差异 0，catalog 为 189/73/47，latest batch 为 16AL-B 成功批次，目标五张表计数均为 0，锁、事务、会话和同步进程为空。
- TDD 新增独立配置测试，先因 `logistics_cost_page` 不存在得到预期失败；随后加入唯一默认关闭配置并转 GREEN。
- 配置不含 `max_pages`、`commit_per_page`、`date_window` 或 `param_source`；只传官方分页字段 `page=1/pagesize=100`，限流 0.5 秒、单次尝试。
- catalog 项目内汇总函数自检一致：189 个有效详情、74 个已配置、47 个 enabled；物流板块为 `configured=5`、`enabled=3`、`terminal_deferred=2`、`pending_review=14`、`closed=false`。
- 完整回归 170 个 unittest、`compileall app tests`、无参数 dry-run 和 `git diff --check` 通过；dry-run 仍只加载 47 个 enabled。
- 严格只执行一次 `--probe-api logistics_cost_page`，1.213 秒后返回 `ApiRequestError`，未取得 total 或所需页数。
- 没有重试，没有增加官方未要求的筛选条件，没有尝试其他请求编码，也没有运行配置同步、真实单接口同步或完整 enabled。
- 当前 probe 对包装后的 `ApiRequestError` 只记录异常类型，没有安全 HTTP 状态；现有非 token 日志中也没有额外状态证据，因此不能把结果猜成 HTTP 400/500 或登记上游拒绝终态。
- probe 后数据库仍为 81/47，本地 YAML 为 82/47，唯一差异是未同步的 `logistics_cost_page`；目标在 DB 配置、API log、raw、checkpoint 和失败日志中的计数均为 0。
- latest batch 仍为 `sync_20260730_143314_977605` success；named lock 空闲，外部 InnoDB 事务、活动会话和本地同步进程均为 0。
- 接口继续保持 configured disabled，catalog 原因更新为“等待安全错误分类”；当前不具备提交真实同步方案所需的 total、请求量和运行时间证据。
- 本阶段未暂存、提交或推送，也未修改或清理其他未提交内容。

## 2026-07-30 阶段 16AM-B：probe 安全错误分类与官方条件纠正

- 实时 detail 与 apiMap 再次确认文档 1778 为公开且审核通过的 `POST /fulfillment/ship/cost/page` 读取分页接口。
- 本次完整读取到接口说明“发货单集合、时间必传一项”；字段级 `must=false` 不能覆盖接口级约束，16AM-A 的“允许无筛选请求”结论作废。
- 启动门禁确认 Git 为 `master@51a6484`、无 staged；YAML 为 82/47、DB 为 81/47，唯一差异是未同步目标；latest batch 未变，目标五张表计数均为 0，锁、事务、会话和同步进程为空。
- TDD 新增包装 HTTP 异常和无 response 异常测试，先因日志只有 `ApiRequestError` 得到两个预期失败，再做最小实现并转 GREEN。
- `_probe_single_api` 现在仅记录包装内原始异常类型和 HTTP 状态；不记录异常正文、URL、请求参数、响应正文或敏感字段。
- 完整回归 172 个 unittest、`compileall app tests`、无参数 dry-run 和 `git diff --check` 通过；dry-run 仍只加载 47 个 enabled。
- 因官方要求真实业务条件，本阶段取消原定的无筛选复检，没有再次调用文档 1778；旧 `ApiRequestError` 继续保持未分类，不登记 `defer_runtime_rejected`。
- 没有运行 `--sync-api-configs`、`--sync-api` 或完整 `--sync-enabled`，没有创建 batch 或写入 raw、checkpoint、API log、失败日志。
- 本地 YAML 与 catalog 仍为 82/47 和 189/74/47；物流板块仍为 configured=5、enabled=3、terminal=2、pending=14，目标保持 configured disabled。
- 收尾数据库仍为 81/47，latest batch 仍为 `sync_20260730_143314_977605` success；named lock 空闲，外部事务、活动会话和同步进程均为 0。
- 下一阶段只读审核 `codes` 或时间条件的真实来源与官方边界；在形成并确认新的最小方案前不得再次探测或同步。

## 2026-07-31 阶段 16AM-C：物流费用条件来源审核与暂缓

- 官方文档 1027 的 data.rows.code 明确为发货单号，现有 delivery_page 共有 18,168 条非空且唯一的真实 code，与文档 1778 的发货单集合 codes 语义一致。
- 官方文档 1778 没有给出 codes 数组数量上限，也没有给出时间筛选跨度；不得自行猜测分组大小、请求上限或历史窗口。
- 用户确认暂缓文档 1778；logistics_cost_page 继续 configured disabled，不再探测或同步。后续只有取得官方边界后才重新提交方案。
- 下一个候选只读审核选择文档 1028 POST /fulfillment/ship/delivery/query，不与文档 1778 混合实施。

## 2026-07-31 阶段 16AN-A：查询发货单明细单源验证

- 实时官方 detail 与 apiMap 确认文档 1028 为公开、审核通过的读取接口；deliveryCodes 为可选字符串数组，needItem 为布尔值，响应 data 为对象数组，默认每秒 5 次。
- 真实参数来源是 delivery_page.raw_json.code；写前聚合复核为 18,168/18,168 条可用且唯一，审核未输出任何发货单号值。
- TDD 新增独立配置测试，先因配置不存在得到预期 RED；最小新增 delivery_detail_query 后转 GREEN。
- 配置保持 enabled=false、非分页、response.item_field=data、deliveryCode required=false、updateTime 日期、sensitive_response=true、0.2 秒限流、单次尝试。
- param_source 使用 raw_json.code -> deliveryCodes、wrap_in_list=true、limit=1、auto_advance=true 和 exclude_existing_target=true；固定参数只有 needItem=true。
- 写前门禁确认 Git 为 master@51a6484、无 staged；named lock 空闲、外部事务 0、同步会话 0、本地同步进程 0。
- --sync-api-configs 成功同步 83 条配置；YAML/DB 均为 83/47，code/enabled/method/path 差异为 0，新接口和 logistics_cost_page 均为 disabled。
- 仅运行一次 --sync-api delivery_detail_query，批次 sync_20260731_105320_767996 为 success：1 次请求、1 条成功、0 失败，批次耗时 5 秒。
- 本批次 raw 为 1 条、唯一 hash 1 个；响应 deliveryCode 是空字符串，因此 source_primary_key 为空并按 data_hash 回退幂等。updateTime 存在且与 data_date 一致，明细数组存在。
- checkpoint 指向本批次，记录 last_page=1、request_count=1、item_count=1、total_count=1、param_offset=0、param_limit=1、next_param_offset=1；失败请求为 0。
- logistics_cost_page 的 API log、raw、checkpoint 和失败请求仍全部为 0，证明配置同步没有调用文档 1778。
- 完整回归 173 个 unittest、compileall app tests、47 个 enabled dry-run 和 git diff --check 通过。
- 收尾 named lock 空闲、外部事务 0、同步会话 0、本项目虚拟环境 Python 进程 0；未运行 probe、完整 --sync-enabled，未暂存、提交或推送。

## 2026-08-03 阶段 16AO-A：退货订单列表首页预检与运行终态

- 实时官方 detail 与 apiMap 确认文档 9 为公开、审核通过的 `POST /operation/sale/returnOrder/page` 读取分页接口；必填参数只有 `page/pagesize`，单页最大 100，响应为 `data.rows/data.total`，默认每秒 5 次。
- 幂等预案为非必填 `id` 优先、缺失时回退完整对象 `data_hash`；`returnDateTime` 作为 `data_date`，订单、退货原因、买家备注和商品字段按敏感 raw-only 处理。
- 写前门禁确认 Git 为 master@51a6484、无 staged；YAML/DB 为 83/47 且差异为 0，目标五张表为 0，latest batch 成功，named lock、外部事务、活动会话和项目进程为空。
- TDD 独立配置测试先因目标缺失得到预期 RED；最小新增 disabled 临时配置和 catalog 后转 GREEN，没有固定 `max_pages`、`commit_per_page`、日期窗口或参数来源。
- 完整回归通过 174 个 unittest、`compileall app tests`、47 个 enabled dry-run 和 `git diff --check`。
- 预检前再次确认 YAML 84/47、DB 83/47，唯一差异为未同步目标；严格只执行一次 `--probe-api sale_return_order_page`，1.154 秒后得到 HTTP 400，没有取得 total 或所需页数。
- 没有重试、猜测筛选条件、改换请求编码、输出响应内容、同步配置、执行单接口数据库同步或运行完整 `--sync-enabled`。
- 文档 9 登记为 `defer_runtime_rejected`；临时 YAML 配置已清理，接口专用测试改为验证“无业务配置 + 审核终态”。
- 收口后 YAML/DB 均为 83/47，catalog 为 189/75/47；销售板块 configured=0、enabled=0、terminal=2、pending=13、closed=false。
- 收尾 DB latest batch 仍为 `sync_20260731_105320_767996` success，目标在 api_config、API log、raw、checkpoint 和失败日志均为 0；锁、事务、会话和项目进程为空。
- 本阶段未暂存、提交或推送，没有清理或覆盖其他未提交修改。

## 2026-08-11 阶段 16AO-B：退货订单独立完整分页验证

- 上游错误响应补充证明接口运行时要求至少一个日期查询条件，且日期跨度不能超过 31 天；该要求来自真实业务响应，不再把此前 HTTP 400 归因于请求方法、路径或 JSON 格式。
- 新增独立脚本 `request_sale_return_order_page.py`，复用项目鉴权，仅请求 `POST /operation/sale/returnOrder/page`，不写数据库，不输出 accessToken 或订单明细。
- 脚本新增 `--all-pages` 模式：第一页读取实时 `data.total`，按 `ceil(total/pagesize)` 动态分页，不配置猜测性固定页数上限；官方默认每秒 5 次，页间隔 0.2 秒。
- 真实验证窗口为 `2026-08-04` 至 `2026-08-10`，不包含当天，不传 `marketIds`，覆盖当前账号可访问的全部店铺站点。
- 完整验证返回 HTTP 200、业务码 200、`total=11007`；动态计算并实际请求 111 页，累计读取 11007 条，完整性校验通过，执行耗时约 113 秒。
- 新增 `tests/test_request_sale_return_order_page.py`，离线证明 `total=250` 时只请求 3 页、累计 250 条，汇总结果不包含 `rows`；完整回归为 175 个 unittest 通过。
- 本阶段没有新增 YAML 业务配置，没有运行 `--sync-api-configs`、`--sync-api` 或完整 `--sync-enabled`；DB 仍为 83/47，目标配置、API log、raw、checkpoint 和失败日志均为 0。
- 文档 9 的 `defer_runtime_rejected` 已失效并从审核覆盖表移除；接口回到待正式接入审核，不把独立只读测试表述为已经完成数据库同步接入。

## 2026-08-25 阶段 16AO-C：退货订单正式接入与首窗口同步

- 实时官方 detail 再次确认文档 9 为公开、审核通过的 `POST /operation/sale/returnOrder/page` 读取分页接口；必填 `page/pagesize`、单页最大 100、响应为 `data.rows/data.total`、默认每秒 5 次。
- 运行时已验证业务请求必须提供日期条件且跨度不超过 31 天；正式配置使用 `returnStartDate/returnEndDate`、`default_start=2026-01-01`、31 天窗口和 `lag_days=1`，不传可选 `marketIds`。
- TDD 将原“未配置”测试改为完整配置契约，先因目标缺失得到 RED；新增唯一 `sale_return_order_page` 后转 GREEN，没有修改同步引擎。
- 配置保持 `enabled=false`，使用实时 total 分页、不设置 `max_pages`、`commit_per_page=true`、官方 `id` 优先并回退 `data_hash`、`returnDateTime` 生成 `data_date`、敏感字段 raw-only、0.2 秒页间隔和单次重试配置。
- catalog 实时刷新 189/189 成功，结果为 189 个文档、76 个已配置、47 个 enabled；文档 9 为 `configured_disabled`，销售板块 configured=1、enabled=0、terminal=1、pending=13。
- 本地完整验证为 175 个 unittest、`compileall app tests`、`pip check`、47 enabled dry-run 和 `git diff --check` 通过。
- 首页预检窗口 `2026-01-01` 至 `2026-01-31` 返回 HTTP 200、业务码 200、实时 `total=41557`，按每页 100 精确计算 416 页；取得用户确认后才进入数据库写入。
- 写前再次确认 named lock 空闲、外部 InnoDB 事务 0、活动数据库会话 0、本地同步进程 0；`--sync-api-configs` 成功把 YAML/DB 同步为 84/47，code/enabled/method/path 差异为 0。
- 仅运行 `--sync-api sale_return_order_page`，批次 `sync_20260825_170357_498282` 为 success：416 次请求、41,557 个处理行、0 失败，运行约 18 分 44 秒；没有运行完整 `--sync-enabled`。
- 上游 41,557 个返回行按 `id` 幂等后保留 38,198 条唯一 raw；source primary key 缺失 0、唯一主键 38,198、唯一 hash 38,198，`data_date` 缺失 0，日期范围为 `2026-01-01` 至 `2026-01-31`。
- 针对处理行数与唯一 raw 数的差异，跨第 1、100、200、300 和尾页附近抽样 50 页共 4,957 行：发现 244 个完全重复行，distinct id 与 distinct full-row hash 均为 4,713，同一 id 对应不同 hash 的碰撞数为 0；因此保留 `id` 幂等策略，不把上游重复行重复落库。
- checkpoint 记录窗口 `2026-01-01..2026-01-31`、`total_count=41557`、`next_window_start=2026-02-01`；本批次失败日志为 0，收尾 named lock 空闲、外部事务 0、活动会话 0。
- 当前只完成首个历史窗口，接口继续 disabled；没有继续 `2026-02-01` 之后的回填，也没有暂存、提交或推送，既有 `AGENTS.md` 用户修改保持不变。

## 2026-08-26 阶段 16AP-A：接入 Seekway Codex 开发规范

- 核对 `songtu2025/seekway-codex-standards` 主分支，采用 V1.0.0、提交 `18150b5b24bb8af8a8db4b875137c7425fc6c761` 作为本次接入基准。
- 按上游对现有项目的要求，将通用开发、范围控制、Python、数据库、安全、验证和完成报告规则合并到根目录 `AGENTS.md`，完整保留原有积加同步业务规范。
- 明确历史项目差异：继续使用现有单体 Python 结构、`sql/init_tables.sql`、ECS 与 cron/systemd timer，不为套用模板新增 FastAPI、React、Alembic、Docker、Ruff 或类型检查依赖。
- 修正规则内“直接实施”与“先调研确认”的潜在冲突，统一为完成调研并取得必要确认后再实施。
- 本阶段不修改业务代码、API 配置、数据库、认证、依赖、部署配置或 README，不调用真实积加 API，不连接或写入 PolarDB。

## 2026-08-26 阶段 0 + M1：Web 身份认证可登录闭环

- 保留现有 `app/` 同步链路和 `sql/init_tables.sql`，新增独立 `backend/`、`frontend/` 与 Windows PowerShell 脚手架。
- Alembic `0001` 只创建 `app_user`、`auth_action_token`、`user_session`；邀请令牌和 Session 只落 SHA-256 哈希，密码使用 Argon2。
- 完成首个管理员邀请、邀请验证/注册、邮箱密码登录、服务端 HttpOnly Session Cookie、CSRF、退出、登录失败锁定与会话过期；邀请链接使用 URL Fragment，注册页按 Fragment 解析令牌。
- 完成 Admin/Operator/Viewer 固定角色、管理员成员/邀请管理、最后一名可用管理员保护，以及 SMTP/Console/Fake 邮件适配器。
- Figma 文件新增 `20 · 邮箱密码登录`、`21 · 邀请注册` 和 `Overlay · 邀请成员`，前端实现复用既有 `10 · 成员与权限` 视觉规范。
- 后端 11 个 pytest、前端 5 个 Vitest、既有 175 个 unittest、Ruff、mypy、TypeScript、Vite build、compileall、pip check 和 diff check 纳入统一检查。
- 未执行生产数据库迁移、真实 SMTP、部署或真实业务 API；未实现密码重置、积加账号、同步策略、Worker、Redis、Celery 和第三方登录。

## 2026-08-26 M2：积加账号与接口策略本地代码验收

- 新增积加账号、加密凭证、账号级接口策略、只读接口目录、Alembic `0002` 以及账号列表、接入向导和策略页面；未引入 Worker、`sync_job` 或多账号同步表迁移。
- M1 跨角色修复已纳入集成：邀请令牌条件更新保证单次消费、邀请邮件失败回滚、Session 恢复时 CSRF 稳定；成员邀请失败时保留弹窗和输入。
- M2 安全回归补齐缺失/错误 CSRF、Viewer 策略写入拒绝、验证失败脱敏、凭证更新后待重验、停用状态和同一接口的账号级策略隔离。
- 总负责人串行运行 `scripts/check.ps1` 通过：后端 29 个 pytest、既有同步 177 个 unittest、前端 9 个文件 13 个 Vitest、Ruff、mypy、TypeScript、Vite build、compileall、pip check 和 `git diff --check` 全部通过；后端覆盖率 86%。
- 应用内浏览器验证成员邀请弹窗焦点与 `Esc` 恢复、账号空列表和接入向导进入/返回均通过，控制台无 `warn/error`。首次账号页错误已证明是旧 M1 演示进程未加载 M2 路由，不是当前代码缺陷。
- 本阶段只完成本地代码和临时 SQLite 隔离验证；未执行真实 MySQL/PolarDB `0002` 迁移、真实积加 Token 联调、生产 SMTP、部署、提交、推送或合并。

## 2026-08-26 Web M3 MVP：退货历史同步任务闭环

- 按 MVP 原则完成 `sale_return_order_page` 单接口闭环：创建历史任务、固定 31 天窗口、队列领取、单窗口执行、成功后自动衔接下一窗口，并保持“一任务一批次一窗口”。
- 原始数据采用“完整业务历史 + 内容变化版本”；同一业务主键内容未变化时不新增版本，Viewer 查询在 SQL 层排除 `raw_json`，Admin/Operator 查看原文时写审计日志。
- 新增多账号隔离的 M3 数据模型、API、单 Worker、运行/失败/原始版本/审计查询，以及 Dashboard、任务、运行、原始数据和审计前端页面；未引入 Redis、Celery 或额外调度基础设施。
- 修复同步核心 checkpoint 对字典、字符串和字节 JSON 的兼容读取，并统一同步核心 UTC 时间写入；既有同步链路保持原目录与调用方式。
- 全量 `scripts/check.ps1` 通过：后端 38 个 pytest、同步核心 189 个 unittest、前端 28 个 Vitest，以及 Ruff、mypy、compileall、pip check、ESLint、Vite build 和 `git diff --check`。
- 应用内浏览器使用临时 SQLite 和虚构账号完成创建任务、任务详情与审计闭环；Worker 未启动，未调用真实积加 API，未执行 MySQL/PolarDB 迁移、部署、提交、推送或合并。

## 2026-08-26 Web M3 Gate 2：可靠性与增量闭环

- 复盘纠正了上一阶段“代码骨架即完整闭环”的表述；本轮补齐定时入队、失联恢复、CLI/Web 互斥、历史完成后的 `updateTime` 增量追赶和前端增量状态。
- 积加官方文档 9 已确认 `updateTimeBegin/updateTimeEnd` 为 `datetime`，格式为 `yyyy-MM-dd HH:mm:ss`；契约保存到现有生成目录并纳入离线测试，未调用真实业务接口。
- 历史扫描继续使用官方已验证的最大 31 天窗口，从 `2020-01-01` 连续覆盖；增量目标按策略时区与 `lag_days` 冻结，历史冻结日期不会污染增量任务。
- 调度器只在创建任务、确认同一槽位已存在或本槽已追平时推进计划；活动任务阻塞时保留 due，终态后补建同一槽且不重复。
- CLI 与 Web Core 使用同一个 MySQL named lock；锁忙时任务退回队列、5 秒退避且不消耗尝试次数，数据库锁错误不会伪装成锁争用。正常任务允许一次无批次失联恢复。
- MySQL 连接和在线迁移连接统一设置 UTC Session；`0003` 增加独立只读 preflight，旧数据保持 legacy 账号 `0`，未确认前不自动映射正数账号或补种版本基线。
- 前端任务与 Dashboard 已区分历史和增量状态，并展示“增量同步已追平”；无认证浏览器只验证登录跳转，未完成三角色保护页真实联调。
- 本地全量门禁通过；未执行真实 MySQL/PolarDB 迁移、真实积加 API、生产 SMTP、部署、提交、推送或合并。

## 2026-08-26 Web M3 Gate 2：三角色浏览器验收

- 使用临时 SQLite、Fake 邮件和虚构 Admin/Operator/Viewer 账号完成保护页验收；临时登录辅助只存在于仓库外的 QA 启动器，没有写入生产代码。
- Admin 可访问成员和审计页；Operator 可进入积加账号接入页，直接访问成员页会返回概览；Viewer 不显示管理入口和写入口，访问 `/accounts/new` 会返回账号列表，访问 `/audit` 会返回概览，任务页不显示发起任务按钮。
- 三个角色页面均正常渲染，前端与 API 临时服务日志无运行错误；没有提交任何账号、凭证、任务或业务数据写操作。
- 未发现需要修改代码的 P0/P1；浏览器验收后已关闭本次创建的临时页面和 8000/5177 服务。
- 本轮未改变数据库结构、认证、权限、配置、依赖或部署方式；真实 MySQL/PolarDB、积加 API、SMTP、ECS 仍未验证。

## 2026-08-26 Web M3 Gate 3：隔离副本预检代码门禁

- 三方审计发现升级 SQL 把 `first_observed_at` 设为无默认值的 NOT NULL，而快照写入未传该列；已同时补齐迁移默认值、SQLAlchemy server default 和应用首次观察时间参数，避免 MySQL 严格模式首次新增失败。
- 新增只读 `migration_preflight` 命令，显式要求确认目标为隔离副本；以单行脱敏 JSON 和 0/2/1 退出码区分通过、阻断和运行错误，不输出数据库 URL、异常正文或业务记录。
- preflight 现检查旧列类型、NULL、字符长度，旧索引唯一性和列顺序，半迁移目标列/表、UTC Session、同步 named lock、投影身份 NULL/重复及 checkpoint 重复；fake MySQL collector 覆盖全部 7 次只读查询。
- 删除了会丢失账号归属的破坏性 DDL down 指令；升级失败统一要求使用切换前副本快照/PITR 恢复，应用回滚继续兼容扩展表。
- 最终 `scripts/check.ps1` 通过：后端 69 个 pytest（87% 覆盖率）、同步核心 195 个 unittest、前端 17 个文件 37 个 Vitest，以及 Ruff、mypy、compileall、pip check、TypeScript、Vite build 和 `git diff --check`；真实 MySQL/PolarDB 副本仍未执行，因此 `PREFLIGHT_PASSED` 和迁移行为尚无真实数据库证据。
- legacy 数据映射到哪个正数积加账号、以及何时补种 `sale_return_order_page` 首次历史基线仍未确认；本轮未执行迁移、真实 API、部署、提交、推送或合并。

## 2026-08-26 Web M3 Gate 4：迁移执行器与历史链可靠性

- 新增受控 `0003` 迁移执行器：必须显式确认隔离副本与快照就绪，并在同一数据库连接中完成 named lock、持锁预检、20 条固定 DDL、升级后校验和锁释放；结果只输出稳定脱敏状态。
- 修复旧表 `updated_at ON UPDATE` 在迁移更新中被自动刷新、导致旧时间戳丢失的问题；DDL 显式自赋值保留原时间，并补齐历史表全部字段、索引和 `extra` 属性的升级后校验。
- 失败重试改为读取当前 checkpoint 后继续下一个连续窗口；历史切增量和回填 T0 都按策略时区换算本地日期，避免 UTC 跨日偏移。
- `commit_per_page` 模式在每页事务真正提交后持久化实时分页进度；整接口事务不提前报告未提交进度。任务列表和详情页展示阶段、窗口及已完成页数，并提供下一窗口导航。
- 最终完整 `scripts/check.ps1` 通过：后端 113 个 pytest、同步核心 196 个 unittest、前端 17 个文件 39 个 Vitest，以及 Ruff、mypy、compileall、pip check、TypeScript、Vite build 和 `git diff --check`；终审再运行迁移、预检和契约测试共 66 项，并通过 Ruff、格式检查与 mypy。
- 仍未连接隔离 MySQL/PolarDB、执行真实迁移、调用真实积加 API、部署、提交、推送或合并；legacy 账号映射和既有快照是否补种历史基线仍待业务确认。

## 2026-08-26 Web M3 Gate 5：本地可观测与数据库契约闭环

- Worker 领取任务时强制 `attempt_count < max_attempts`；达到上限的 queued 任务不会继续领取、创建批次或调用执行器。
- 任务响应新增同任务、同账号关联的 `syncRunId`，失败任务可直接进入对应运行日志；raw 列表支持当前快照 `sync_batch_no` 过滤并返回 `batchNo`，fake executor 已证明 job、batch、API log、checkpoint 和 raw 可串联回查。
- CLI 与 named lock 日志只保留固定上下文、HTTP 状态和异常类型，不再写任意异常正文、URL、请求参数、响应或数据库地址；既有锁失败测试同步改为断言敏感正文不出现。
- Core Table metadata、`init_tables.sql` 和迁移 postflight 对六张同步表执行全量命名索引相等校验；preflight/postflight 使用 `column_type` 拒绝 signed BIGINT，MySQL metadata 明确六表 id 与 observation count 为 `BIGINT UNSIGNED`。
- 新增 `/health/ready` 数据库探活和脱敏 503；Dashboard 在存在活动任务时自动刷新，任务详情轮询已有测试，运行详情一侧请求失败不会隐藏另一侧排障数据。
- 数据库首轮交叉审批因索引子集假绿和 unsigned 漏检被拒，修复后复审通过；后端、前端、readiness 和日志脱敏也均由非实施成员审批，无残余 P0/P1。
- 最终 `scripts/check.ps1` 通过：后端 193 个 pytest（87% 覆盖率）、同步核心 198 个 unittest、前端 17 个文件 45 个 Vitest，以及 Ruff、mypy、compileall、pip check、TypeScript、Vite build 和 `git diff --check`。
- 未连接真实 MySQL/PolarDB 或积加 API，未执行迁移、SMTP、部署、提交、推送或合并；真实副本演练、legacy 账号映射和首次历史基线仍是外部门禁。

## 2026-08-26 Web M4 Gate 6：ECS 原生部署 MVP

- 新增 ECS 原生 systemd API/单 Worker 与 Nginx 模板：API 只监听回环地址，Worker 使用 `flock` 防重复实例，Nginx 负责 TLS、SPA、API/健康检查代理、静态缓存和登录限流；没有引入 Docker、Redis 或 Celery。
- Worker 支持 SIGTERM/SIGINT 优雅停止，停止后不领取新任务；失联恢复每轮执行，systemd 最多等待当前任务 3 小时。API/Worker 日志进入 journald，只记录稳定错误码和异常类型。
- 运行 `.env` 与迁移 `.env.migration` 已分离。发布 preflight 只读检查生产配置、前端产物、API YAML、Alembic head、六张核心表精确结构和运行库可写；API/Worker 直启也执行 YAML 和生产运行目标门禁。
- 生产 readiness 在数据库不可用或只读时返回脱敏 503；完整 schema 校验只在启动和发布检查执行，健康检查不调用积加 API。生产 `PUBLIC_WEB_URL` 必须为 HTTPS 且具有主机名。
- 前端任意 API 401 会清理过期会话；初始 Session 的网络或 5xx 错误显示服务不可用并允许重试，不再错误显示为未登录。Nginx 保证 `/api/`、`/health/` 不落入 SPA fallback。
- 后端、数据库和前端实现均由非实施成员交叉审批；两轮发现的 SMTP TLS/Worker 时序、迁移凭据泄漏、schema 子集假绿、YAML 异常脱敏及启动调用点测试问题已修复，最终无残余 P0/P1。
- `release_preflight` 缺少显式确认时返回脱敏 `RELEASE_CONFIRMATION_REQUIRED` 和退出码 2，未读取配置或连接数据库。最终 `scripts/check.ps1` 通过：后端 252 个 pytest（89% 覆盖率）、同步核心 205 个 unittest、前端 19 个文件 52 个 Vitest，以及 Ruff、mypy、compileall、pip check、TypeScript、Vite build 和 `git diff --check`。
- 未执行真实 MySQL/PolarDB 副本检查、`0003`、恢复演练、积加 API、SMTP、ECS/systemd/Nginx 部署、提交、推送或合并；legacy 账号映射和首次历史基线仍需业务确认。

## 2026-08-26 Web M4 Gate 7：隔离浏览器 E2E 与会话并发修复

- 新增显式开关、独立临时目录启动的 fail-closed E2E 应用；只使用内存 SQLite、FakeMail 和合成凭据，不导入 Worker，并以禁网测试证明账号验证不会访问外部积加 API。
- 合成数据使用两个账号共享同一 `api_code`、业务主键和记录身份，分别保存独立 current/history、hash、批次和 marker；6 项子进程测试证明列表、详情、版本按账号隔离，Viewer 响应中完全不存在 `rawJson`。
- Vite 开发代理支持 `DEV_PROXY_TARGET`，默认目标仍为 `127.0.0.1:8000`，只用于把隔离浏览器实例定向到独立本地 API 端口，不进入客户端或生产产物。
- 应用内浏览器完成 Admin/Viewer 登录、会话恢复、账号与策略权限、Fake 邀请、受限路由、退货单当前快照和版本历史验证；Admin 可见合成 JSON，Viewer 只见元数据，控制台无 warn/error。
- 浏览器并发加载发现 `UserSession` ORM touch 在 MySQL 秒级 DATETIME 下可能抛出 `StaleDataError`。现改为带 `last_seen_at <= now` 条件的原子 UPDATE，既消除 500，也阻止乱序请求让活动时间倒退；相关认证测试 11 项及全新浏览器实例复验通过，请求均为 200。
- E2E、Vite 代理和会话修复均经非实施成员交叉审批，最终无 P0/P1。完整 `scripts/check.ps1` 通过：隔离 E2E 6 项、后端 254 个 pytest（89% 覆盖率）、同步核心 205 个 unittest、前端 19 个文件 52 个 Vitest，以及 Ruff、mypy、compileall、pip check、TypeScript、Vite build 和 `git diff --check`。
- 本阶段没有连接真实 MySQL/PolarDB、积加 API 或 SMTP，没有启动 Worker、执行迁移、部署、提交、推送或合并；SQLite/Fake 浏览器证据不能替代隔离副本和 ECS 验收。

## 2026-08-26 Web M4 Gate 8：运行追溯与可信合成链

- 新增 `GET /api/v1/sync-runs/{run_id}`；详情查询关联积加账号并复用运行列表响应契约，已覆盖认证、账号名称和 `SYNC_RUN_NOT_FOUND`。
- fail-closed E2E 现包含两个账号各自独立的 job、batch、API log、checkpoint、current raw 和 history。毒化日志使用第二账号与第一批次，运行日志仍只返回同账号、同批次的数据。
- 两个成功历史任务按真实 Worker 水位建模：从 `2020-01-01` 按 31 天窗口扫描，共 79 个窗口；T0 为 `2026-08-26`，Asia/Shanghai 时区、lag 1 天，历史完成到 `2026-08-25`。任务窗口、公开进度、内部水位和 checkpoint 已逐项核对。
- 前端异步页面使用 generation 标识丢弃旧请求结果，避免快速切换任务或运行后被迟到响应覆盖；Admin 和 Viewer 浏览器验收覆盖任务、运行、日志、当前记录与版本，Viewer 响应不含 `rawJson`。
- 新增并发回归：旧运行的 failed load-more 请求 reject 时，新运行请求仍保持 pending；generation 同时保护 success、catch 和 finally，旧请求不能写入错误或清除新运行的 loading，该 P2 已闭合。
- 后端、数据库、前端和浏览器链均完成非实施成员交叉审批；修复期间发现的运行详情缺口、批次语义、合成水位和账号隔离问题已进入回归测试。
- 全量本地门禁通过：隔离 E2E 6 项、后端 254 个 pytest（89% 覆盖率）、同步核心 205 个 unittest、前端 60 个 Vitest，并通过 Ruff、mypy、compileall、pip check、TypeScript、Vite build 和 `git diff --check`。
- 本轮仍未连接真实 MySQL/PolarDB、积加 API 或 SMTP，没有启动 Worker、执行 `0003`、部署、提交、推送或合并。

## 2026-08-26 Web M4 Gate 9：发布门禁与并发收口

- 迁移 preflight 现按列、默认值、`auto_increment`、`ON UPDATE` 和索引做精确对称检查；`0003` 的 20 条 DDL 顺序已由测试锁定。
- `0003 downgrade` 已改为明确拒绝，避免删除 `sync_job` 和 `audit_log` 证据；数据库回滚继续采用迁移前快照或 PITR，应用回滚保持兼容当前 schema。
- 创建任务时先锁定账号接口策略行，再锁定活动任务查询；同窗口重试保留冻结窗口和内部水位，但分页进度重置为 `0/0`。
- 旧运行追溯改用 `observed_sync_batch_no` 查询“该批次曾观察过的业务记录”，列表仍返回当前快照；详情版本明确展示各自 `batchNo`。
- 发布 preflight 不再只检查 `dist/index.html`，还要求真实 `script[type=module]` JS 入口非空，并验证全部本地静态资源存在。
- 前端已收口任务、运行、审计、概览、原始数据和详情页请求竞态；慢轮询改为请求完成后再等待 3 秒，账号与列表独立结算，StrictMode 会话恢复与重新登录使用认证代次隔离旧 401。
- 三轮交叉审批均为最终 `APPROVE`，未留 P0/P1/P2；任务弹窗还在提交端校验当前账号可用 API 白名单，避免“新账号 + 旧接口”。
- 串行 `scripts/check.ps1` 通过：隔离 E2E 6、后端 286（89% 覆盖率）、同步核心 205、前端 89，并通过 Ruff、mypy、compileall、pip check、TypeScript、Vite production build 和 `git diff --check`。
- 应用内浏览器使用隔离 SQLite/Fake 数据验证任务页、第二账号切换、接口选项、按钮状态、静态资源和控制台；未点击创建任务，控制台无相关 warn/error。
- 未连接真实 MySQL/PolarDB、积加 API、SMTP 或 ECS，未执行迁移、Worker、部署、提交、推送或合并。
- 真实隔离副本演练仍需用户确认 legacy `account_id=0` 映射到哪个正数账号，以及既有 `sale_return_order_page` 快照是否补种为首个历史版本。

## 2026-08-26 Web M4 Gate 10：MVP 完成度审计与本地收口

- 数据库、后端发布和前端三条线完成只读完成度审计；本轮只处理审计证明的 1 个 P1 和 3 组 P2，不扩展业务功能或基础设施。
- Nginx 静态目录与发布 preflight 统一为 `__PROJECT_ROOT__/frontend/dist`，并由正反契约禁止重新引入独立前端目录占位符。
- `0003` 迁移基线现对五张 legacy 表同时保存和比较 `created_at/updated_at` 的最小、最大时间；空表保持 `None`，任一时间边界漂移都会阻断 postflight。
- 活动任务轮询改为请求完成后再等待 3 秒，慢请求不重叠；账号已创建但 Token 验证失败时进入账号列表并明确提示，重新验证失败后刷新服务端真实状态。
- README 和交接说明已修正生产环境变量入口、readiness 的“实例非只读”精确语义、`observed_sync_batch_no`、唯一调度所有者、MySQL DDL 恢复边界和历史交接失效状态。
- 发布、迁移、前端和说明四条变更均由非实施成员独立复审，最终 `APPROVE`，无 P0/P1/P2。
- 串行 `scripts/check.ps1` 通过：隔离 E2E 6、后端 288（90% 覆盖率）、同步核心 205、前端 93；Ruff、mypy、compileall、pip check、TypeScript、Vite production build 和 `git diff --check` 全部通过。仅保留现有 Starlette/TestClient 弃用告警与 LF/CRLF 提示。
- 本轮未连接真实 MySQL/PolarDB、积加 API、SMTP 或 ECS，未执行迁移、Worker、部署、提交、推送或合并；外部验收仍需业务选择和单独授权。

## 2026-08-26 Web M4 Gate 11：数据归属与调度割接设计

- 复核确认 legacy CLI 的 `SyncContext` 默认持续写入 `jijia_account_id=0`；全量映射后若原 cron 不退役或不改造，下一次运行会再次产生账号 0 数据，不能把“映射目标账号”与“调度割接”分开决策。
- MVP 推荐只迁移 `sale_return_order_page`：其 YAML 继续保持 disabled，真实副本必须证明相关批次全部为单接口批次，再把 batch、log、failed request、raw/history 和 checkpoint 在一个事务内整体归属到指定正数账号；发现混合批次立即阻断。
- 首次历史基线推荐从迁移前当前快照补种，原样保留 identity、hash、JSON、批次和业务时间，并以 `last_observed_at` 作为 `observed_at`；是否补种仍等用户明确确认。
- 归属动作推荐使用独立受控命令，不修改固定 20 条结构 DDL、不新增 Alembic 数据迁移；命令必须支持只读 dry-run、同一 named lock、单事务、幂等、postflight、脱敏输出和快照/PITR 恢复边界。
- `sale_return_order_page` 推荐由 Web scheduler 独占历史追赶与后续增量；其他接口暂时继续由 legacy cron 以账号 0 运行，避免为了一个优先接口一次性迁移 47 个既有任务。
- 生产发布前还应增加 fail-closed 所有权门禁，阻止实际部署 YAML 把 Web 独占接口设为 enabled；legacy 单接口写入口的割接边界需与归属命令一并实现和测试。
- 前端无需新增页面；隔离副本后只需同一制品的 release preflight、systemd/Nginx/HTTPS 自动检查，以及 Admin/Operator/Viewer + SMTP 一次生产人工冒烟。
- 本轮只完成只读设计和纠正实施方案中过期的 `legacy_default`/迁移顺序说明；未修改运行逻辑，未连接外部，未执行迁移、API、Worker、部署、提交、推送或合并。

## 2026-08-26 Web M4 Gate 11：数据归属与调度割接实现

- `sale_return_order_page` 已设为 Web scheduler 独占接口；legacy 的 `--sync-api`、`--test-api`、`--sync-enabled` 和 `--mock-sync` 写入口均 fail-closed，release preflight 也会拒绝实际 YAML 启用冲突。只读 `--probe-api` 和仅同步配置元数据的 `--sync-api-configs` 保持可用。
- 新增受控历史归属命令与服务：必须显式指定正数账号 ID 或 `account_code`，默认仅 dry-run；执行还必须同时确认写入者已停止和快照已就绪，并使用迁移配置、共享 named lock、单连接和单事务。
- 归属计划只接受终态、账号 0、单接口、非 mock、无 Web 任务关联的纯批次；允许失败日志和 checkpoint 的空批次引用，非空引用必须可证明归属。发现混合批次、目标唯一键冲突或 mock 标记时以稳定错误码阻断。
- 执行顺序覆盖既有历史、缺失当前快照基线补种、当前 raw、API/失败日志、checkpoint 和 batch；完全相同基线不重复插入。提交前以精确行数和关联关系 postflight 复核，输出只包含脱敏计数和稳定状态。
- 独立复审先后发现 legacy `--mock-sync` 漏门禁、历史 mock 批次可误迁移和测试因果性不足，均已修复；最终后端、数据库和前端复审均为 `APPROVE`，无残余 P0/P1/P2。
- 完整 `scripts/check.ps1` 通过：隔离 E2E 6、后端 326（90% 覆盖率）、同步核心 212、前端 93，并通过 Ruff、格式、mypy、compileall、pip check、TypeScript、Vite build 和 `git diff --check`。仅保留既有 Starlette/TestClient 弃用告警、LF/CRLF 提示和 npm 更新提示。
- 本轮未连接真实 MySQL/PolarDB、积加 API、SMTP 或 ECS，未执行迁移、数据归属、Worker、部署、提交、推送或合并；目标账号与隔离副本授权仍是外部门禁。

## 2026-08-27 Web M4 Gate 12：停用边界、归属反向引用与发布密钥门禁

- Worker 在成功窗口准备自动衔接前，会按 `policy -> job` 的固定锁序重新验证账号 ACTIVE、策略 enabled、受控目录和官方只读属性；任一业务或目录条件失效时，当前 job/batch 仍正常记为 success，只停止创建后续任务。数据库异常继续传播，不会被业务失效分支吞掉。
- 新增策略停用、账号停用、目录失效、非法 YAML、YAML 顶层类型错误、生产配置路径自动派生，以及“checkpoint 已推进 -> 停用不衔接 -> 重新启用后从下一窗口恢复”的完整反例；跨日暴露的时间依赖测试已冻结业务时钟，专门的 history 到 incremental 契约保持独立覆盖。
- legacy 归属计划新增 `sync_job.sync_batch_no` 反向引用检查；候选批次被任意 Web job 引用时以 `LEGACY_BATCH_WEB_JOB_REFERENCE` 阻断，并只公开聚合计数，不泄露账号、批次或业务数据。
- 新增无第三方依赖的高置信敏感字面量扫描：覆盖全部 Git 候选文件和实际 `frontend/dist` 文本制品；真实 `.env*` 与 symlink 只阻断不读取；支持 UTF-8-SIG 和 BOM UTF-16；白名单绑定文件、规则、行指纹和次数；失败只输出 JSON 格式的规则、文件和行号。
- 三个工作单均由非实施成员审批。首轮审批拦下目录解析异常破坏成功收尾、生产路径/恢复组合证据不足，以及白名单、编码、symlink、Git 强制跟踪目录和控制字符绕过；修复后最终无 P0/P1/P2。
- 完整 `scripts/check.ps1` 通过：隔离 E2E 6、后端 336（90% 覆盖率）、同步核心 224、前端 93，并通过 Ruff、格式、mypy、compileall、pip check、TypeScript、Vite build、敏感字面量扫描和 `git diff --check`。仅保留既有 Starlette/TestClient 弃用告警、LF/CRLF 和 npm 更新提示。
- 本轮未连接真实 MySQL/PolarDB、积加 API、SMTP 或 ECS，未执行迁移、归属写入、Worker、部署、提交、推送或合并；项目总目标继续等待外部门禁，不标记完成。

### Gate 10～12 三轮工作单复盘

- 主要返工来自两类遗漏：按“已知入口”而不是“不变量”枚举写入路径，以及只跑独立测试没有及时覆盖日期滚动、异常格式和对抗性输入。
- 独立审批实际拦下了 `--mock-sync` 所有权绕过、mock/反向 Web job 数据误归属、目录异常让成功任务滞留、同文件白名单绕过、编码和 symlink 绕过，以及跨日测试假设。
- 下一轮工作单固定同时列出正常路径、反例、异常格式、并发/锁序、时间边界和脱敏输出；实现者先跑定向测试，负责人随后立即跑相邻组合，最后才跑全量门禁。
- MVP 边界保持不变：只修复能破坏数据归属、唯一写入者、任务连续性或发布安全证据的问题；没有新增页面、表、迁移、依赖或基础设施。

## 2026-08-27 Web M4 Gate 13：配置真实性与 SMTP 传输安全

- 按完成定义复核后确认两个本地真实缺口：日期窗口策略保存了 `lookback_days/start_date`，但 Worker 并未消费这两种语义；SMTP STARTTLS 未显式使用受验证的系统信任链。按 MVP 不猜测业务语义，当前日期窗口只开放已实现的 `checkpoint`。
- 后端对 `lookback_days`、`start_date` 以及 `checkpoint` 混带旧字段统一返回 `422/WINDOW_MODE_UNSUPPORTED`，并在任何赋值和提交前完成校验；四类拒绝路径均验证策略前后完全一致。纯 `checkpoint` 继续正常保存，官方目录字段和未知 API 仍不可改写。
- 前端对支持日期窗口的接口只展示和提交 `checkpoint`；旧策略读取后归一为 `checkpoint`，同时清空旧字段。不支持日期窗口的接口才显示“不适用”并提交 `null`，Viewer 只读边界保持不变。
- SMTP STARTTLS 现在显式传入 `ssl.create_default_context()`，并以 30 秒具名常量限制连接时间；禁网 Fake 验证 `CERT_REQUIRED`、主机名校验、host/port/timeout 和 `starttls -> login -> send` 顺序，非 TLS 分支不创建 SSL context。
- 三项首轮交叉审批分别发现混合载荷被静默丢弃、旧前端策略提交必然 422、SMTP 无应用级超时；修复后均由非实施成员复审 `APPROVE`，无 P0/P1/P2。
- 完整 `scripts/check.ps1` 通过：隔离 E2E 6、后端 343（91% 覆盖率）、同步核心 224、前端 96；Ruff、格式、mypy、compileall、pip check、TypeScript、Vite build、敏感字面量扫描和 `git diff --check` 均通过。仅保留既有 Starlette/TestClient 弃用告警和 LF/CRLF 提示。
- 本轮没有新增表、迁移、配置、依赖或部署变更；未连接真实 MySQL/PolarDB、积加 API、SMTP 或 ECS，未执行数据写入、迁移、Worker、部署、暂存、提交、推送或合并。真实浏览器链路、SMTP 投递、HTTPS 和副本恢复仍属于外部验收。

## 2026-08-27 Web M4 Gate 14：事务不变量、状态一致性与审计闭环

- `0003` 的六条既有表 UPDATE 现在逐条显式保留 `updated_at`，固定 20 条语句及顺序不变；legacy preflight 对五张迁移表、target/runtime/归属门禁对六张核心表逐表要求 InnoDB，任一 MyISAM 在结构变更或归属 DML 前阻断。
- 迁移 runner 将第 1 条 `SET SESSION` 与结构 DDL 分离：session setup 失败返回 `MIGRATION_SESSION_SETUP_FAILED` 且无需恢复，从第 2 条首个结构 DDL 起失败才要求快照/PITR 恢复。真实 SQLAlchemy 一次性 `MappingResult` 在采集时立即物化，避免合法 InnoDB 副本被二次消费误阻断。
- 登录按规范化邮箱使用锁定读串行化失败计数；成员更新先按主键顺序锁定完整 active admin 集合，确保并发降级后仍至少一名可用管理员。邀请重发按邀请 ID 锁定同用户全部邀请，并在持锁期间完成邮件发送，成功后才提交；邮件失败回滚，重复或并发重发最终只有最后送达令牌有效。
- 策略页按路由账号和请求代次隔离 load/save，切账号立即隐藏旧数据，旧请求的 success/catch/finally 均不能污染新账号；保存失败不再产生未处理拒绝。退出只有服务端成功或明确 401 才清本地会话，网络/5xx 保留用户并允许重试；新建任务提示提供不受列表筛选影响的详情链接。
- 新增只加入调用方事务、不自行提交的审计助手；补齐登录成功、每个连续失败锁定周期、登出、邀请创建/重发/撤销、成员角色/状态、积加账号创建/更新/验证成功与失败/停用、接口策略更新。任务和 raw 原文访问沿用既有生产者，不重复记录。审计只保存稳定动作、关联 ID、结果及脱敏枚举/布尔，CLI 明确使用空 request ID。
- 四个工作单均由非实施成员审批。审批实际拦下并发邀请“最后邮件却已失效”、真实 SQLAlchemy 结果集只能消费一次，以及第二个登录锁定周期漏审计；修复后最终无 P0/P1/P2。
- 完整 `scripts/check.ps1` 通过：隔离 E2E 6、后端 382（92% 覆盖率）、同步核心 224、前端 106；Ruff、格式、mypy、compileall、pip check、TypeScript、Vite build、敏感字面量扫描和 `git diff --check` 均通过。仅保留既有 Starlette/TestClient 弃用告警和 LF/CRLF 提示。
- 本轮没有新增表、迁移版本、配置、依赖、页面或部署结构；未连接真实 MySQL/PolarDB、积加 API、SMTP 或 ECS，未执行迁移、归属 DML、Worker、部署、暂存、提交、推送或合并。真实副本事务/恢复、邮件投递和 ECS 浏览器链仍属于外部验收。

## 2026-08-27 Web M4 Gate 15：本地完成定义反证审计

- 账号验证先冻结密文凭据和状态、结束读取事务，再调用外部 Token 接口；返回后重新锁定账号行。凭据或状态已被并发修改时返回 `409/ACCOUNT_VERIFY_STALE`，不覆盖新状态、不创建默认策略，也不写成功或失败验证审计。
- 邀请注册、重发和撤销统一采用“无锁定位用户 ID -> 锁定用户行 -> 按邀请 ID 升序锁定该用户全部邀请”的顺序；注册仍以完整条件 UPDATE 原子消费目标令牌。双向两会话模型证明等待方在用户锁前不持邀请锁，注册与重发、注册与撤销不会形成锁环或同时成功。
- 成员页的用户与邀请列表独立结算；写操作成功会先更新本地事实，随后刷新失败只提示“操作已成功、列表刷新失败”，不再误报业务写入失败。邀请弹窗使用实例代次隔离旧请求，旧 success/catch/finally 不能关闭、清空、提示、刷新或提前解锁新弹窗。
- 原始数据详情与版本历史独立加载、独立报错；一侧失败不再隐藏另一侧证据。资源 ID、首屏请求和加载更多均受请求代次保护，Viewer 继续只能查看元数据，当前及历史 `rawJson` 均不可见。
- 数据库、后端与前端实现均由非实施成员交叉审批。审批实际拦下账号验证覆盖并发凭据、注册与撤销同时成功、注册与重发锁序死锁、写成功被刷新失败误报，以及旧邀请请求污染新弹窗；修复后最终无 P0/P1/P2。
- 完整 `scripts/check.ps1` 通过：隔离 E2E 6、后端 393（92% 覆盖率）、同步核心 224、前端 114；Ruff、格式、mypy、compileall、pip check、TypeScript、Vite build、敏感字面量扫描和 `git diff --check` 均通过。仅保留既有 Starlette/TestClient 弃用告警和 LF/CRLF 提示。
- 本轮没有新增表、迁移、配置、依赖、页面或部署结构；未连接真实 MySQL/PolarDB、积加 API、SMTP 或 ECS，未执行迁移、归属 DML、Worker、部署、暂存、提交、推送或合并。项目总目标继续等待外部门禁。

### Gate 13～15 三轮工作单复盘

- 主要返工源于测试替身把真实系统简化得过头：可重复读取的假结果掩盖 SQLAlchemy 一次性结果集，单全局锁掩盖 InnoDB 多行部分持锁，顺序 Promise 掩盖跨实例和“写成功、刷新失败”的组合状态。
- 独立审批实际拦下 SMTP 传输边界、迁移时间证据与事务引擎假设、账号验证陈旧覆盖、邀请锁序环、旧弹窗请求污染，以及只覆盖 success/catch 却漏掉 finally 的弱测试。
- 后续工作单固定要求：外部调用与数据库写入之间必须冻结并重查事实；所有两阶段 UI 必须区分业务动作与后续刷新；并发不变量同时提供 MySQL 锁定 SQL 和双会话时序证据；SQLAlchemy 结果替身默认按一次性消费建模；异步代次测试必须覆盖 success、catch、finally 和卸载。
- MVP 边界保持不变：只修复会破坏数据一致性、权限、安全审计或用户真实反馈的问题；没有引入 outbox、队列、新迁移、新页面或基础设施。

## 2026-09-03 接口配置运行时与接口中心闭环

- `api_config` 已成为 Web、任务、调度器、Worker、查询服务和 legacy CLI 的唯一运行时配置源；YAML 只用于离线校验和受控发布，数据库失败时不回退。
- 新增配置哈希、版本、官方只读证据、Web 平台开关和发布时间；新任务冻结单接口配置快照，重试、恢复和后续窗口继承原快照。
- `--validate-api-configs` 负责离线核验，`--publish-api-configs` 持同步锁原子发布，并为所有现有账号补齐默认关闭策略；未核验为只读的接口不能启用 legacy 或 Web 平台开关。
- Web 新增 `/api-catalog` 接口中心，分别展示已发布接口和官方接口目录，可查看数据提取、主键、日期、存储、敏感性、平台/账号/运行/数据状态，以及受控新增接口步骤。
- 官方目录生成保留同一路径对应的多个本地 `api_code`，避免销售分析等多维配置在目录中互相覆盖。
- 完整 `scripts/check.ps1` 通过：隔离 E2E 6、后端 441（91% 覆盖率）、同步核心 231、前端 183，并通过 Ruff、mypy、compileall、pip check、TypeScript、Vite build、敏感字面量扫描和 `git diff --check`。Knip、Vulture 无死代码；jscpd 正常完成，本次新增的默认策略重复已清理。
- 应用内浏览器连接成功，但客户端阻止访问本机 localhost，未取得截图或真实交互证据。未连接真实 MySQL/PolarDB、积加 API、SMTP 或 ECS，未执行生产迁移、配置发布、部署、提交或推送。

## 2026-09-08 Seekway Codex V1.5.0 规范接入

- 以 `songtu2025/seekway-codex-standards` V1.5.0、提交 `f3bd25e2f134414a8b0348b7c7681aef312b7b0f` 为基准完成差异化接入；根 `AGENTS.md` 保持 100 行以内，并按触发条件索引 `docs/codex/` 细则。
- 新增工作流、代码质量、后端、前端、验证和同步项目专用规则；明确既有同步表继续由 `sql/init_tables.sql` 与 `sql/migrations/` 管理，Alembic 只管理 Web 身份域及已确认的 Web 增量表。
- 新增项目化 Web UI 标准和 `seekway-theme.css` 语义主题入口；沿用现有品牌色、React/CSS 组件和 `900px` 导航切换，不改变业务流程或页面结构。
- 前端补齐 Prettier、ESLint、TypeScript、Vitest、Vite build；项目检查脚本补齐重复代码、Knip、Vulture、敏感字面量与差异检查。新增依赖均为开发依赖，Python 运行依赖未变化。
- 完整 `scripts/check.ps1` 通过：隔离 E2E 6、后端 466（90% 覆盖率）、同步核心 234、前端 198；Ruff、格式、mypy、compileall、pip check、Prettier、ESLint、TypeScript、Vite build、Knip、Vulture、敏感字面量和 `git diff --check` 均通过。
- ESLint 保留 14 条既有 Hooks/Fast Refresh 告警且无错误；jscpd 正常完成，现有代码共 68 处克隆、重复行 2.64%，本轮未为清零指标进行无关重构。
- BrowserAct 合成环境视觉冒烟通过：登录页与概览页在 `1440 × 900` 和 `390 × 844` 均无页面级横向溢出；合成管理员登录、保护页跳转和退出成功。未发现 JavaScript 运行时异常；控制台只有访客会话探测的预期 `401` 和缺少 favicon 的 `404`。
- 未连接真实 MySQL/PolarDB、积加 API、SMTP 或 ECS，未执行迁移、配置发布、Worker、部署、提交或推送；浏览器会话及本地合成服务均已关闭。

## 2026-09-08 项目定位与阶段口径收口

- 用户确认最终产品只保留积加数据同步管理平台作为生产业务入口；第一阶段 CLI/cron 同步工具降级为历史基础，不再作为长期产品或生产日常调度方式。
- README、同步专项规范、内部平台架构、完整实施方案、历史交接和下一会话提示已统一为两个宏观阶段；M1～M4、Gate 和接口接入编号明确为阶段内部记录。
- 最终运行链路统一为 `Web -> account_api_policy -> Web Scheduler -> sync_job -> Worker -> app 同步内核 -> PolarDB`；全部接口割接后停用生产 `--sync-enabled` cron。
- `app/` 继续作为平台内部同步内核，受控配置校验、连接检查、只读探测、迁移和必要诊断能力可以保留，本轮不删除或修改任何代码。
- M4 已统一为“发布准备”，不再以“可上线”暗示生产完成；真实数据库迁移、legacy 数据归属、调度割接、SMTP、HTTPS、systemd/Nginx、ECS 和完整周期验证仍是外部门禁。
- 本轮只修改项目文档，没有连接外部系统、执行数据库写入、迁移、同步、部署、提交或推送。

## 2026-09-16 并发发布候选：运行状态与冷启动门禁收口

- 前端统一复用可见性轮询和刷新状态：页面隐藏时暂停、恢复后立即检查，同请求去重，旧请求的 success/catch/finally 不覆盖新上下文，刷新失败保留最后一次成功数据。
- Worker 状态增加配置、在线、忙碌、空闲、失联和队列容量摘要；账号、策略、计划、任务、运行、原始数据与成员页面补齐手动刷新和工作流连续性，不改变后端权限或业务状态。
- 本地隔离运行配置固定 `WORKER_PROCESSES=4`、`SYNC_LOCK_SCOPE=account`、`DB_POOL_SIZE=3` 和 `DB_MAX_OVERFLOW=2`，与生产连接预算及账号级互斥一致。
- 新增可重复的本地冷启动门禁：`canary` 按 1→2→4、`burst` 同时启动四个 Worker；启动前拒绝非隔离目标和非空队列，结束后清理自身运行时遥测，不启动 Scheduler。
- 隔离 MySQL 实测 10 轮 canary 和 10 轮 burst 全部通过，共 80 个 Worker 启动，0 个进程失败、0 次 `OperationalError`、Traceback 或 ERROR；最慢分别在 1.079 秒和 1.369 秒达到 4/4。补充 1 轮验证门禁清理后 `canary-worker-*` 行数为 0。
- 完整 `scripts/check.ps1` 通过：后端 565 个 pytest（91% 覆盖率）、同步核心 259 个 unittest、前端 392 个 Vitest；Ruff、Mypy、compileall、pip check、Prettier、ESLint、TypeScript、Vite build、jscpd、Knip、Vulture、敏感字面量和 `git diff --check` 均通过。
- 本轮只使用本机隔离 MySQL，没有调用真实积加 API、执行生产迁移或部署；真实 PolarDB、ECS/systemd 和两个完整调度周期仍是外部门禁。本轮形成范围受控的本地提交，不推送。

## 2026-09-16 SEEKWAY Data Hub 命名改造

- 产品中文名统一为 `SEEKWAY 数据接入中心`，英文名统一为 `SEEKWAY Data Hub`；积加继续作为首个数据源连接器，不改动 `JIJIA_*`、业务表和同步核心。
- 前端品牌文案和 npm 包名使用新名称；前后端分别集中维护产品展示名，邮件主题、OpenAPI 元数据和运维 CLI 不再使用旧产品名，未新增依赖。
- ECS 模板改用 `seekway-datahub-*` systemd 标识，运行目录改为 `seekway-data-hub`，Nginx upstream 改为 `seekway_datahub_api`，生产域名固定为 `datahub.seekwaygroup.com`。
- 部署契约调整为 API 和 Worker 按 1→2→4 金丝雀启动期间保持 Scheduler 关闭；启动新服务前只读枚举遗留 `jijia-*` unit，发现旧服务即停止发布并另行迁移；调度归属完成并单独授权后才能启用 Scheduler。
- 完整 `scripts/check.ps1` 通过：后端 568 个 pytest（91% 覆盖率）、同步核心 259 个 unittest、前端 391 个 Vitest；Ruff、Mypy、compileall、pip check、Prettier、ESLint、TypeScript、Vite build、jscpd、Knip、Vulture、敏感字面量和 `git diff --check` 均通过。Vite 仍有既有主包体积告警，本轮未做无关拆包。
- 本轮只在独立 worktree 修改本地仓库；未修改 GitHub 仓库名，未连接或改动生产 ECS、PolarDB、积加 API、DNS、TLS 和 Nginx。

## 2026-09-18 接入查询日期范围报告

- 按积加公开文档 `id=27` 接入 `POST /finance/asset/dateRangeReports/page`，配置编码为 `date_range_reports_page`，保持 `enabled=false`。
- 用户确认历史起点为 `2021-08-01`；配置按市场时间逐日回补，使用 `page/pagesize=100`、`data.rows/data.total`、行主键 `id`、业务日期 `marketDate` 和官方每秒 1 次限流。
- 不传店铺、费用、订单和报表类型等可选筛选，避免缩小业务范围；不设置猜测性的 `max_pages`，按实时 `total` 完成分页。响应包含订单、地区和金额字段，因此标记为敏感响应。
- 新增配置契约测试，离线配置校验通过，共加载 85 条配置、47 条 legacy enabled；同步核心 260 个 unittest 通过，Ruff、compileall、pip check、jscpd、Knip、Vulture、敏感字面量扫描和 `git diff --check` 通过。
- 本轮不修改数据库结构、认证、权限、依赖或前端，不调用真实业务接口，不发布生产配置，不创建同步任务，不部署、提交或推送。

## 2026-09-18 查询日期范围报告限流恢复

- 生产小流量诊断确认 `date_range_reports_page` 在连续分页时会收到 HTTP 509；冷却后单页只读请求可恢复，官方文档仍以每秒 1 次为基础频率。
- 同步客户端统一把 HTTP 429 和 509 识别为上游限流；该接口配置 65 秒共享冷却和最多 3 次同页重试，正常调用频率不变。
- 任务与失败请求只保存稳定错误码、HTTP 状态和纯数字业务码，不保存请求参数或响应正文；前端可直接展示“上游接口限流”，不再退化为笼统同步失败。
- 旧任务继续冻结业务接口快照，但限流与重试作为运行安全策略在执行时采用当前已发布配置，因此既有失败任务重试也能获得修复。
- 本轮不修改数据库结构、认证、权限、前端、依赖或交互流程。
- 完整门禁通过：后端 583 个 pytest、同步核心 262 个 unittest、前端 409 个 Vitest，并通过 Ruff、Mypy、compileall、pip check、前端格式/ESLint/TypeScript/build、jscpd、Knip、Vulture、敏感字面量扫描和 `git diff --check`。
- 提交 `ce2fb35` 已推送并部署到生产 API、Scheduler 和 Worker；配置发布成功，内外 readiness 与 Nginx 语法检查通过，前端镜像未变更。
- 生产单日金丝雀只执行 `2021-08-01`：53 页、5235 条、61 次 HTTP 尝试、0 个失败接口、0 条失败请求；批次成功，checkpoint 推进至 `2021-08-02`。
- 金丝雀任务设置为完成当前窗口后停止，因此任务终态为 `stopped`、批次终态为 `success`，当前无同接口排队或运行任务，未启动全量历史补录。

## 2026-09-18 同步任务预览生产兼容修复

- 单日金丝雀产生首条成功运行时间后，PolarDB 对 `MAX(COALESCE(DATETIME))` 返回字符串；任务预览仍按 `datetime` 读取 `.tzinfo`，导致 `/api/v1/sync-jobs/preview` 返回 500。
- UTC 时间序列化现在兼容 SQLAlchemy `datetime` 与 MySQL 聚合返回的 ISO 时间字符串，不改变接口字段、数据库结构或前端交互。
- 针对性 56 项和后端全量测试通过；Ruff、Mypy、compileall、pip check、jscpd、Knip、Vulture、敏感字面量扫描及 `git diff --check` 通过。
