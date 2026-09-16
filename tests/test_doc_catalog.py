import unittest

from app.doc_catalog import classify_api_detail, execution_plan_for_api, official_rate_limit


class DocCatalogClassificationTest(unittest.TestCase):
    def test_extracts_effective_official_rate_limit(self):
        detail = {
            "limitTimes": None,
            "limitPeriod": None,
            "limitTypeName": "秒",
            "defaultLimitTimes": 10,
            "defaultLimitPeriod": 1,
            "dimensionTypeName": "接口维度",
        }

        self.assertEqual(
            official_rate_limit(detail),
            {
                "max_requests": 10,
                "period_seconds": 1,
                "dimension": "接口维度",
            },
        )

    def test_prefers_custom_official_rate_limit(self):
        detail = {
            "limitTimes": 1,
            "limitPeriod": 5,
            "limitTypeName": "秒",
            "defaultLimitTimes": 10,
            "defaultLimitPeriod": 1,
            "dimensionTypeName": "接口维度",
        }

        self.assertEqual(official_rate_limit(detail)["period_seconds"], 5)

    def test_classifies_page_api_without_business_required_fields_as_direct_candidate(self):
        detail = {
            "apiUrl": "/purchase/goods/brand/page",
            "erpMethod": "Post",
            "opType": "page",
            "requestBody": [
                {"name": "page", "must": True, "children": []},
                {"name": "pagesize", "must": True, "children": []},
                {"name": "name", "must": False, "children": []},
            ],
            "responseBody": [
                {
                    "name": "data",
                    "type": "object",
                    "children": [
                        {"name": "rows", "type": "array<object>", "children": []},
                        {"name": "total", "type": "int", "children": []},
                    ],
                }
            ],
        }

        result = classify_api_detail(detail)

        self.assertEqual(result["classification"], "direct_read_candidate")
        self.assertEqual(result["business_required_fields"], [])
        self.assertIs(result["has_page_response"], True)

    def test_classifies_query_api_with_business_required_fields_as_dependency(self):
        detail = {
            "apiUrl": "/middle/base/warehouseIds/query",
            "erpMethod": "Get",
            "opType": "query",
            "requestBody": [
                {"name": "marketIdList", "must": True, "children": []},
            ],
            "responseBody": [
                {"name": "data", "type": "array<object>", "children": []},
            ],
        }

        result = classify_api_detail(detail)

        self.assertEqual(result["classification"], "requires_upstream_params")
        self.assertEqual(result["business_required_fields"], ["marketIdList"])

    def test_classifies_response_with_sensitive_fields_for_review(self):
        detail = {
            "apiUrl": "/middle/base/allUser/list",
            "erpMethod": "Get",
            "opType": "list",
            "requestBody": [],
            "responseBody": [
                {
                    "name": "data",
                    "type": "array<object>",
                    "children": [
                        {"name": "email", "type": "string", "description": "邮箱", "children": []},
                    ],
                }
            ],
        }

        result = classify_api_detail(detail)

        self.assertEqual(result["classification"], "sensitive_review")
        self.assertIs(result["has_sensitive_response_fields"], True)

    def test_classifies_mutation_api_as_write_or_mutation(self):
        detail = {
            "apiUrl": "/middle/base/rate/update",
            "erpMethod": "Post",
            "opType": "update",
            "requestBody": [
                {"name": "currency", "must": True, "children": []},
            ],
            "responseBody": [
                {"name": "data", "type": "object", "children": []},
            ],
        }

        result = classify_api_detail(detail)

        self.assertEqual(result["classification"], "write_or_mutation")

    def test_classifies_confirm_api_as_write_or_mutation(self):
        detail = {
            "apiUrl": "/purchase/srm/quickInbound/confirm/V2",
            "erpMethod": "Post",
            "opType": "query",
            "requestBody": [],
            "responseBody": [
                {"name": "data", "type": "array<object>", "children": []},
            ],
        }

        result = classify_api_detail(detail)

        self.assertEqual(result["classification"], "write_or_mutation")

    def test_execution_plan_marks_configured_enabled_api(self):
        item = {
            "classification": "direct_read_candidate",
            "configured_api_code": "brand_page",
            "configured_enabled": True,
            "menu_path": "产品",
            "api_url": "/purchase/goods/brand/page",
            "api_name": "查询品牌资料",
            "has_sensitive_response_fields": False,
        }

        result = execution_plan_for_api(item)

        self.assertEqual(result["execution_stage"], "configured_enabled")
        self.assertEqual(result["execution_bucket"], "configured")

    def test_execution_plan_defers_high_risk_direct_read(self):
        item = {
            "classification": "direct_read_candidate",
            "configured_api_code": "",
            "configured_enabled": False,
            "menu_path": "财务",
            "api_url": "/finance/asset/paymentbill/page",
            "api_name": "查询付款单列表",
            "has_sensitive_response_fields": False,
        }

        result = execution_plan_for_api(item)

        self.assertEqual(result["execution_stage"], "risk_review_before_probe")
        self.assertEqual(result["execution_bucket"], "defer_or_review")

    def test_execution_plan_allows_low_risk_unconfigured_direct_read(self):
        item = {
            "classification": "direct_read_candidate",
            "configured_api_code": "",
            "configured_enabled": False,
            "menu_path": "基础数据",
            "api_url": "/middle/base/example/page",
            "api_name": "查询示例配置",
            "has_sensitive_response_fields": False,
        }

        result = execution_plan_for_api(item)

        self.assertEqual(result["execution_stage"], "can_probe_next")
        self.assertEqual(result["execution_bucket"], "can_probe")

    def test_execution_plan_defers_known_unstable_direct_read(self):
        item = {
            "classification": "direct_read_candidate",
            "configured_api_code": "",
            "configured_enabled": False,
            "menu_path": "库存",
            "api_url": "/purchase/inventory/purchaseSaleStorageSelf/page",
            "api_name": "查询自营仓进销存列表(旧)",
            "has_sensitive_response_fields": False,
        }

        result = execution_plan_for_api(item)

        self.assertEqual(result["execution_stage"], "known_risk_review")
        self.assertEqual(result["execution_bucket"], "defer_or_review")

    def test_execution_plan_routes_dependency_sensitive_and_write(self):
        dependency = {
            "classification": "requires_upstream_params",
            "configured_api_code": "",
            "configured_enabled": False,
            "menu_path": "基础数据",
            "api_url": "/middle/base/warehouseIds/query",
            "api_name": "根据亚马逊店铺id查询仓库信息",
            "has_sensitive_response_fields": False,
        }
        sensitive = {
            "classification": "sensitive_review",
            "configured_api_code": "",
            "configured_enabled": False,
            "menu_path": "仓库",
            "api_url": "/purchase/inventory/supplierWarehouse/page",
            "api_name": "查询仓库-供应商仓",
            "has_sensitive_response_fields": True,
        }
        write = {
            "classification": "write_or_mutation",
            "configured_api_code": "",
            "configured_enabled": False,
            "menu_path": "采购",
            "api_url": "/purchase/srm/order/create",
            "api_name": "创建采购订单",
            "has_sensitive_response_fields": False,
        }

        self.assertEqual(
            execution_plan_for_api(dependency)["execution_bucket"],
            "needs_upstream_params",
        )
        self.assertEqual(
            execution_plan_for_api(sensitive)["execution_bucket"],
            "needs_sensitive_review",
        )
        self.assertEqual(execution_plan_for_api(write)["execution_bucket"], "defer_or_review")
