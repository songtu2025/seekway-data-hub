import json

import pytest
from sqlalchemy import insert, select

from app.api_config_registry import publication_records
from app.config import load_api_configs
from backend.app.models.account_api_policy import AccountApiPolicy
from backend.app.models.sync_job import SyncJob
from backend.app.models.sync_records import api_config_table, raw_api_data_stat_table
from backend.app.models.user import UserRole
from backend.app.services.api_config_publish_service import publish_api_configs
from backend.tests.conftest import AuthHarness
from backend.tests.test_api_policies_api import create_active_account
from backend.tests.test_auth_api import register_user


def test_publication_rejects_rate_limit_not_matching_official_catalog(tmp_path) -> None:
    catalog_path = tmp_path / "catalog.json"
    catalog_path.write_text(
        json.dumps(
            {
                "apis": [
                    {
                        "api_url": "/example/page",
                        "classification": "direct_read_candidate",
                        "execution_stage": "configured_disabled",
                        "rate_limit": {
                            "max_requests": 1,
                            "period_seconds": 5,
                            "dimension": "接口维度",
                        },
                    }
                ]
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )

    with pytest.raises(ValueError, match="does not match official catalog"):
        publication_records(
            [
                {
                    "api_code": "example_page",
                    "enabled": False,
                    "platform_enabled": False,
                    "method": "POST",
                    "path": "/example/page",
                    "rate_limit": {"max_requests": 2, "period_seconds": 1},
                }
            ],
            catalog_path,
        )


def test_publication_rejects_unverified_platform_enabled_config(
    harness: AuthHarness,
) -> None:
    with pytest.raises(ValueError, match="not verified read-only"):
        publication_records(
            [
                {
                    "api_code": "unsafe_candidate",
                    "name": "未核验接口",
                    "enabled": False,
                    "platform_enabled": True,
                    "method": "POST",
                    "path": "/not/in/official/catalog",
                }
            ],
            harness.settings.api_catalog_path,
        )


def test_catalog_exposes_connected_status_and_official_mapping(
    harness: AuthHarness,
) -> None:
    client, _, _ = register_user(harness, "catalog-viewer@example.com", UserRole.VIEWER)

    connected_response = client.get("/api/v1/api-catalog")
    official_response = client.get("/api/v1/api-catalog/official")

    assert connected_response.status_code == 200
    connected = connected_response.json()["data"]
    sale_return = next(item for item in connected if item["apiCode"] == "sale_return_order_page")
    assert sale_return["systemConfigured"] is True
    assert sale_return["platformEnabled"] is True
    assert sale_return["catalogEnabled"] is True
    assert sale_return["officialExists"] is True
    assert sale_return["readOnlyVerified"] is True
    assert sale_return["configVersion"] == 1
    assert sale_return["dataSummary"]
    sales_analysis_connected = next(
        item for item in connected if item["apiCode"] == "sales_analysis_asin_page"
    )
    assert sales_analysis_connected["domain"] == "operation"
    assert sales_analysis_connected["officialDomain"] == "统计"
    unmapped = next(item for item in connected if item["apiCode"] == "order_list")
    assert unmapped["officialDomain"] is None

    assert official_response.status_code == 200
    official = official_response.json()["data"]
    sales_analysis = next(
        item for item in official if item["path"] == "/operation/sts/salesAnalysis/page"
    )
    assert set(sales_analysis["configuredApiCodes"]) == {
        "sales_analysis_seller_sku_page",
        "sales_analysis_asin_page",
        "sales_analysis_variation_asin_page",
        "sales_analysis_sku_page",
        "sales_analysis_spu_page",
        "sales_analysis_country_page",
        "sales_analysis_market_page",
    }


def test_catalog_account_state_and_job_freeze_published_config(
    harness: AuthHarness,
    monkeypatch,
) -> None:
    client, auth, account = create_active_account(harness, monkeypatch)
    policy_response = client.put(
        f"/api/v1/jijia-accounts/{account['id']}/api-policies/amazon_shop_page",
        json={
            "enabled": True,
            "schedule_mode": "manual_only",
            "timezone": "Asia/Shanghai",
        },
        headers={"X-CSRF-Token": auth["csrfToken"]},
    )
    assert policy_response.status_code == 200

    catalog_response = client.get(f"/api/v1/api-catalog?jijia_account_id={account['id']}")
    amazon_shop = next(
        item for item in catalog_response.json()["data"] if item["apiCode"] == "amazon_shop_page"
    )
    assert amazon_shop["accountPolicyExists"] is True
    assert amazon_shop["accountEnabled"] is True
    assert amazon_shop["hasData"] is False

    job_response = client.post(
        "/api/v1/sync-jobs",
        json={
            "jijia_account_id": account["id"],
            "api_code": "amazon_shop_page",
        },
        headers={"X-CSRF-Token": auth["csrfToken"]},
    )
    assert job_response.status_code == 202
    job_id = job_response.json()["data"]["jobId"]
    with harness.session_factory() as db:
        job = db.get(SyncJob, job_id)
        assert job is not None
        assert job.api_config_version == amazon_shop["configVersion"]
        assert job.api_config_hash == amazon_shop["configHash"]
        assert job.api_config_snapshot_json["api_code"] == "amazon_shop_page"


def test_catalog_reads_account_and_global_counts_from_stat(
    harness: AuthHarness,
    monkeypatch,
) -> None:
    client, _, account = create_active_account(harness, monkeypatch)
    with harness.session_factory() as db:
        db.execute(
            insert(raw_api_data_stat_table),
            [
                {
                    "jijia_account_id": account["id"],
                    "api_code": "amazon_shop_page",
                    "record_count": 4,
                },
                {
                    "jijia_account_id": 0,
                    "api_code": "amazon_shop_page",
                    "record_count": 3,
                },
            ],
        )
        db.commit()

    account_response = client.get(f"/api/v1/api-catalog?jijia_account_id={account['id']}")
    global_response = client.get("/api/v1/api-catalog")

    account_item = next(
        item for item in account_response.json()["data"] if item["apiCode"] == "amazon_shop_page"
    )
    global_item = next(
        item for item in global_response.json()["data"] if item["apiCode"] == "amazon_shop_page"
    )
    assert account_item["rawRecordCount"] == 4
    assert account_item["hasData"] is True
    assert global_item["rawRecordCount"] == 7
    assert global_item["hasData"] is True


def test_publish_reconciles_new_api_and_versions_changes(
    harness: AuthHarness,
    monkeypatch,
) -> None:
    _, _, account = create_active_account(harness, monkeypatch)
    api_configs = load_api_configs(harness.settings.api_config_path)
    new_config = {
        **next(item for item in api_configs if item["api_code"] == "org_manage_query"),
        "api_code": "org_manage_query_variant",
        "name": "部门列表变体",
        "enabled": False,
    }

    with harness.session_factory() as db:
        first = publish_api_configs(
            db,
            [*api_configs, new_config],
            harness.settings.api_catalog_path,
        )
        assert first["created"] == 1
        assert first["policiesCreated"] == 1
        policy = db.scalar(
            select(AccountApiPolicy).where(
                AccountApiPolicy.jijia_account_id == account["id"],
                AccountApiPolicy.api_code == "org_manage_query_variant",
            )
        )
        assert policy is not None
        assert policy.enabled is False

        changed = {**new_config, "name": "部门列表变体二"}
        publish_api_configs(
            db,
            [*api_configs, changed],
            harness.settings.api_catalog_path,
        )
        version = db.scalar(
            select(api_config_table.c.config_version).where(
                api_config_table.c.api_code == "org_manage_query_variant"
            )
        )
        assert version == 2

        publish_api_configs(
            db,
            api_configs,
            harness.settings.api_catalog_path,
        )
        removed = db.execute(
            select(
                api_config_table.c.enabled,
                api_config_table.c.platform_enabled,
                api_config_table.c.config_version,
            ).where(api_config_table.c.api_code == "org_manage_query_variant")
        ).one()
        assert removed.enabled is False
        assert removed.platform_enabled is False
        assert removed.config_version == 3
