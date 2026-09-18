# SEEKWAY Data Hub

公司内部的数据接入与同步平台。当前接入积加开放平台，通过 Web 管理账号、接口策略和任务，将原始数据同步到 PolarDB MySQL。

- 生产地址：<https://datahub.seekwaygroup.com>
- 使用范围：SEEKWAY 内部

## 功能

- 管理积加账号、接口策略、定时计划和运行记录。
- 通过 Scheduler、数据库任务队列和 Worker 执行同步。
- 处理鉴权、分页、限流、重试、幂等写入和 checkpoint。
- 保存原始 JSON、批次、失败请求和数据变更历史。
- 提供成员角色、邀请注册、会话管理和审计日志。

平台不负责 BI 报表。Web 只管理运行策略，不修改接口路径、分页和限流等底层契约。

## 架构

```text
浏览器
  └─ HTTPS → Nginx
                ├─ Frontend（React）
                └─ API（FastAPI）
                     ├─ PolarDB MySQL
                     ├─ SMTP
                     └─ Scheduler → 任务队列 → Worker → 积加 API
```

`app/` 是积加同步内核；`backend/` 提供 API、Scheduler 和 Worker；`frontend/` 提供管理界面。

## 技术栈

| 范围     | 技术                                         |
| -------- | -------------------------------------------- |
| 前端     | React 19、TypeScript、Vite、Ant Design       |
| 后端     | Python 3.11、FastAPI、Pydantic、SQLAlchemy   |
| 数据库   | MySQL 8.0 / PolarDB MySQL、Alembic           |
| 质量工具 | pytest、Vitest、Ruff、Mypy、ESLint、Prettier |

## 目录

```text
seekway-data-hub/
├── app/                 # 积加同步内核和受控 CLI
├── backend/             # API、Scheduler、Worker、迁移和测试
├── frontend/            # React 管理界面
├── config/              # 接口配置和官方目录证据
├── sql/                 # 同步表初始化和增量 SQL
├── scripts/             # 项目脚本
├── tests/               # 同步内核及隔离 E2E 测试
├── docs/                # 架构、决策、进度和专项规范
├── Dockerfile
└── compose.yaml
```

## 配置与数据库

运行变量见 [.env.example](.env.example)，迁移变量见 [.env.migration.example](.env.migration.example)。

数据库结构分为两部分：

- `sql/init_tables.sql` 和 `sql/migrations/` 管理同步域表。
- Alembic 管理 Web 身份域和已确认的 Web 增量表。

Alembic 不接管既有同步表。迁移顺序和数据边界见 [同步项目专项规范](docs/codex/sync-project.md) 与 [平台架构](docs/internal-web-platform-architecture.md)。

## 接口配置

`api_config` 数据库表是 Web、Scheduler、Worker 和 legacy CLI 的运行时配置源。

| 文件                                      | 用途               |
| ----------------------------------------- | ------------------ |
| `config/api_config.example.yaml`          | 接口评审和发布输入 |
| `config/jijia_api_catalog.generated.json` | 官方接口目录证据   |
| `config/api_review_overrides.yaml`        | 人工审核结果       |

接入接口前必须核对官方文档中的方法、路径、参数、分页、限流、响应结构和读写性质。没有稳定业务主键时使用 `data_hash` 去重，成功后才推进 checkpoint。详见 [积加官方文档访问说明](docs/jijia_api_document_access.md)。

## 文档

- [同步项目专项规范](docs/codex/sync-project.md)
- [平台架构](docs/internal-web-platform-architecture.md)
- [积加官方文档访问说明](docs/jijia_api_document_access.md)
- [Web 界面规范](docs/web-ui-standard.md)
- [技术决策](docs/decisions.md)
- [项目进度](docs/progress.md)

接口数量和阶段进度以数据库、接口中心和 `docs/progress.md` 为准。

## 开发规范

- 公司规范：[SEEKWAY Codex 开发规范 V1.8.1](https://github.com/songtu2025/seekway-codex-standards/)
- 上游基准提交：`181397ca1510db153f77695e820dcf1907062bb4`
- 接入日期：2026-09-09
- 项目规则：[AGENTS.md](AGENTS.md)

项目保留 `app/` 同步核心；同步域表由 SQL 管理，Web 身份域和已确认的增量表由 Alembic 管理。
