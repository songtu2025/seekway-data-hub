# SEEKWAY Data Hub 同步项目专项规范

本文件保存当前项目的业务事实、同步契约和交付要求，是根目录 `AGENTS.md` 的强制扩展。通用开发流程、代码质量和验证规则分别以同目录对应的专项规范为准。

## 1. 项目目标与技术边界

本项目最终交付公司内部使用的 SEEKWAY Data Hub（SEEKWAY 数据接入中心）。积加是首个数据源连接器；生产业务通过 Web、账号策略、Scheduler、数据库任务队列和 Worker 获取当前账号可访问的数据并同步到阿里云 PolarDB MySQL，用于原始数据备份、查询、分析和二次开发。

项目分为两个宏观阶段：第一阶段 CLI/cron 同步工具是历史基础，第二阶段 SEEKWAY 数据接入中心是当前且唯一目标。第一阶段 `app/` 继续作为平台内部积加同步内核；平台完成生产割接后，legacy CLI/cron 不再承担日常业务同步，只保留受控的配置校验、连接检查、只读探测、迁移和必要诊断能力。M1～M4、Gate 和接口接入编号都属于这两个阶段内部记录，不得作为新的宏观阶段。

1. 同步核心保持在 `app/`，支持鉴权、分页、限流、重试、日志、批次和 checkpoint。
2. API 清单继续使用 YAML 和数据库发布配置；敏感凭据只从 `.env` 或环境变量读取。
3. Web 服务位于 `backend/` 和 `frontend/`，只通过既有边界调用同步能力。
4. 数据访问优先复用现有 SQLAlchemy 实现，部署保持 ECS、systemd/cron 和 Nginx。
5. 原始 JSON 备份是第一优先级；订单、商品和库存等 transformer 只能按已确认需求增加。

## 2. 积加接口接入规则

接入任何真实积加 API 前，必须查看并核对官方接口文档，确认请求方式、路径、参数类型、分页规则、官方上限、`total` 语义、限流、响应结构、读写性质和敏感字段。

1. 配置和代码必须以官方规范为依据，不得凭经验猜测或把文档示例值当成真实规则。
2. 文档不可访问，或字段、参数语义和分页行为不明确时，只能继续开发通用框架。
3. 未取得官方依据或用户确认前，不得把具体接口作为真实配置接入，也不得进行真实探测或同步。
4. 对未知字段不得在代码、注释、测试或文档中编造确定含义。
5. accessToken、数据库密码和 API 凭据不得写入代码、日志、README、示例配置或业务表。

## 3. 数据库与幂等契约

`sql/init_tables.sql` 继续管理以下同步表：

- `api_config`
- `sync_batch`
- `sync_api_log`
- `raw_api_data`
- `sync_checkpoint`
- `failed_request_log`

所有表包含 `created_at` 和 `updated_at`。`raw_api_data.raw_json` 使用 MySQL `JSON`，并至少包含：

- `api_code`
- `source_primary_key`
- `data_hash`
- `raw_json`
- `data_date`
- `sync_batch_no`
- `created_at`
- `updated_at`

幂等写入优先使用接口业务主键，建立 `api_code + source_primary_key` 唯一索引；没有稳定主键时使用 `data_hash`，并为 `api_code + data_hash` 建索引或唯一索引。表结构应支持长期同步和问题追踪。

既有同步表不得交给 Alembic 接管、删除或重建。Alembic 只管理 Web 身份域和已经确认的 Web 增量表；生产迁移不得自动执行。

## 4. 同步行为

同步任务必须按以下链路工作：

1. 读取环境配置和 API 配置。
2. 获取或刷新积加 `accessToken`。
3. 创建 `sync_batch`。
4. 加载启用的 API 配置并逐个执行。
5. 按配置生成参数、分页请求并遵守限流。
6. 将每条原始 JSON 写入 `raw_api_data`。
7. 将接口结果写入 `sync_api_log`。
8. 成功后更新 `sync_checkpoint`。
9. 请求失败时重试；重试后仍失败则写入 `failed_request_log`。
10. 全部接口结束后更新同步批次状态。

## 5. 代码与注释

1. 代码保持模块化，不得把同步流程堆在 `main.py`。
2. 主要类、主要函数和复杂私有方法使用中文 docstring，说明职责、输入输出、场景和关键边界。
3. 行内注释只解释认证、分页、限流、重试、幂等、批次日志、checkpoint、失败记录和敏感信息不落库等关键决策。
4. 注释必须与真实行为同步，不得把计划或未知接口字段写成已经实现的事实。
5. 修改时优先复用现有函数、组件、Hook、Service 和工具类；删除本次修改产生的失效代码和未使用依赖。

## 6. 项目验证与阶段交付

涉及同步核心的 Python 变更至少执行相关 `unittest`、`python -m compileall app tests` 和 `pip check`；配置变更执行对应配置测试和 dry-run。涉及 Web 的变更按 README 的统一检查入口执行。

完成阶段时必须：

1. 说明创建或修改的文件、验证结果、未完成内容和下一步。
2. 更新 `docs/progress.md`、`docs/decisions.md` 和 `docs/next_prompt.md`。
3. 检查 `.env.example` 不含真实凭据、README 与实际运行方式一致、SQL 保持 MySQL 8/PolarDB MySQL 兼容。
4. 执行 `npx jscpd frontend/src backend/app`、`cd frontend && npx knip`、`vulture backend/app --min-confidence 100` 和 `git diff --check`。
5. 检查敏感信息、意外文件、修改范围，并保留用户已有的未提交改动。
