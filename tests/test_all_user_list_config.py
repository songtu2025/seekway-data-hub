import json
import unittest
from datetime import date, datetime

from app.config import load_api_configs
from app.sync_engine import ApiRequestError, SyncEngine


class FakeResult:
    def mappings(self):
        return self

    def all(self):
        return []


class CapturingConnection:
    def __init__(self):
        self.calls = []

    def execute(self, statement, params=None):
        self.calls.append((str(statement), params))
        return FakeResult()


class FakeHttpResponse:
    status_code = 503
    text = '{"placeholder":"redacted-payload"}'


class FakeHttpError(RuntimeError):
    def __init__(self):
        super().__init__("fictional-sensitive-detail")
        self.response = FakeHttpResponse()


class FakeRateLimitResponse:
    status_code = 509
    text = '{"code":90008,"messages":["fictional-sensitive-message"]}'

    @staticmethod
    def json():
        return {"code": 90008, "messages": ["fictional-sensitive-message"]}


class FakeRateLimitError(RuntimeError):
    def __init__(self):
        super().__init__("fictional-sensitive-detail")
        self.response = FakeRateLimitResponse()


class AllUserListConfigTest(unittest.TestCase):
    def test_all_user_list_is_raw_only_and_stays_disabled(self):
        apis = {api["api_code"]: api for api in load_api_configs("config/api_config.example.yaml")}

        self.assertIn("all_user_list", apis)
        api = apis["all_user_list"]

        self.assertFalse(api["enabled"])
        self.assertEqual(api["method"], "GET")
        self.assertEqual(api["path"], "/middle/base/allUser/list")
        self.assertFalse(api["page"]["enabled"])
        self.assertEqual(api["page"]["list_field"], "data")
        self.assertEqual(api["primary_key"], {"field": "id", "required": True})
        self.assertEqual(api["date_field"], "createdTime")
        self.assertTrue(api["sensitive_response"])
        self.assertEqual(api["rate_limit"], {"max_requests": 1, "period_seconds": 1})
        self.assertEqual(api["retry"], {"retries": 1, "delay_seconds": 1})
        self.assertEqual(api["params"], {})
        self.assertNotIn(api, SyncEngine(list(apis.values()))._enabled_apis())

    def test_millisecond_timestamp_uses_shanghai_date_and_iso_stays_unchanged(self):
        engine = SyncEngine([])

        try:
            shanghai_date = engine._coerce_data_date(1704038400000)
        except Exception as error:
            self.fail(f"13-digit millisecond timestamp should be supported: {type(error).__name__}")

        self.assertEqual(shanghai_date, date(2024, 1, 1))
        self.assertEqual(
            engine._coerce_data_date("2026-07-20T23:59:59+08:00"),
            date(2026, 7, 20),
        )

    def test_sensitive_failure_records_redact_response_and_error_details(self):
        engine = SyncEngine([{"api_code": "all_user_list", "sensitive_response": True}])
        connection = CapturingConnection()
        request_error = ApiRequestError(
            FakeHttpError(),
            "https://example.invalid/allUser/list",
            "GET",
            {},
            1,
        )

        engine._insert_failed_request(
            connection,
            "batch-sensitive",
            "all_user_list",
            request_error,
        )
        failed_params = connection.calls[-1][1]
        business_error = ApiRequestError(
            ValueError("fictional-business-detail"),
            "https://example.invalid/allUser/list",
            "GET",
            {},
            1,
        )
        engine._insert_failed_request(
            connection, "batch-sensitive", "all_user_list", business_error
        )
        business_failed_params = connection.calls[-1][1]
        engine._insert_api_log(
            connection,
            "batch-sensitive",
            "all_user_list",
            "failed",
            1,
            0,
            1,
            datetime(2026, 7, 20, 10, 0, 0),
            "fictional-sensitive-detail",
        )
        api_log_params = connection.calls[-1][1]

        self.assertIsNone(failed_params["request_params"])
        self.assertIsNone(failed_params["response_body"])
        self.assertEqual(
            failed_params["error_message"],
            "sensitive response details redacted",
        )
        self.assertIsNone(business_failed_params["response_body"])
        self.assertEqual(
            business_failed_params["error_message"],
            "sensitive response details redacted",
        )
        self.assertEqual(
            api_log_params["error_message"],
            "sensitive response details redacted",
        )

    def test_success_raw_payload_keeps_fictional_person_fields(self):
        engine = SyncEngine([])
        connection = CapturingConnection()
        api = {
            "api_code": "all_user_list",
            "primary_key": {"field": "id", "required": True},
            "date_field": "createdTime",
        }
        item = {
            "id": 123456,
            "createdTime": 1704038400000,
            "name": "Fictional User",
            "phone": "00000000000",
            "email": "fictional@example.invalid",
            "org": {"name": "Fictional Org"},
            "roleList": [{"name": "Fictional Role"}],
        }

        engine._insert_raw_items(connection, api, [item], "batch-sensitive")

        raw_write = next(
            call for call in connection.calls if "INSERT INTO raw_api_data (" in call[0]
        )
        stored_item = json.loads(raw_write[1][0]["raw_json"])
        self.assertEqual(stored_item, item)

    def test_non_sensitive_failure_records_keep_existing_details(self):
        engine = SyncEngine([{"api_code": "ordinary_api"}])
        connection = CapturingConnection()
        request_error = ApiRequestError(
            FakeHttpError(),
            "https://example.invalid/ordinary",
            "GET",
            {},
            1,
        )

        engine._insert_failed_request(
            connection,
            "batch-ordinary",
            "ordinary_api",
            request_error,
        )
        failed_params = connection.calls[-1][1]

        self.assertEqual(failed_params["request_params"], "{}")
        self.assertEqual(
            failed_params["response_body"],
            '{"placeholder":"redacted-payload"}',
        )
        self.assertEqual(
            failed_params["error_message"],
            "fictional-sensitive-detail",
        )

    def test_sensitive_rate_limit_keeps_only_safe_error_envelope(self):
        engine = SyncEngine([{"api_code": "all_user_list", "sensitive_response": True}])
        connection = CapturingConnection()
        request_error = ApiRequestError(
            FakeRateLimitError(),
            "https://example.invalid/allUser/list",
            "GET",
            {"fictional": "secret"},
            1,
        )

        engine._insert_failed_request(
            connection,
            "batch-rate-limit",
            "all_user_list",
            request_error,
        )
        failed_params = connection.calls[-1][1]

        self.assertIsNone(failed_params["request_params"])
        self.assertIsNone(failed_params["response_body"])
        self.assertEqual(
            failed_params["error_message"],
            "上游接口限流（HTTP 509，业务码 90008），已达到调用频率限制",
        )
        self.assertNotIn("fictional-sensitive", failed_params["error_message"])


if __name__ == "__main__":
    unittest.main()
