import json
import unittest

from app.config import load_api_configs
from app.sync_engine import ApiRequestError, SyncEngine


class FakeResult:
    def __init__(self, rows):
        self.rows = rows

    def mappings(self):
        return self

    def all(self):
        return self.rows


class FakeConnection:
    def __init__(self, rows):
        self.rows = rows

    def execute(self, statement, params=None):
        return FakeResult(self.rows)


class CapturingConnection:
    def __init__(self):
        self.calls = []

    def execute(self, statement, params=None):
        self.calls.append((str(statement), params))
        return FakeResult([])


class FakeHttpResponse:
    status_code = 503
    text = '{"fictional":"file-url"}'


class FakeHttpError(RuntimeError):
    def __init__(self):
        super().__init__("fictional-file-url-error")
        self.response = FakeHttpResponse()


class FileFileUrlQueryConfigTest(unittest.TestCase):
    def test_file_file_url_query_uses_real_attachment_id_source_and_stays_disabled(self):
        apis = {api["api_code"]: api for api in load_api_configs("config/api_config.example.yaml")}

        self.assertIn("file_file_url_query", apis)
        api = apis["file_file_url_query"]

        self.assertFalse(api["enabled"])
        self.assertEqual(api["method"], "GET")
        self.assertEqual(api["path"], "/middle/base/fileFileUrl/query")
        self.assertFalse(api["page"]["enabled"])
        self.assertEqual(
            api["response"],
            {"scalar_field": "data", "scalar_target_field": "fileUrl"},
        )
        self.assertEqual(
            api["primary_key"],
            {"field": "", "param_field": "id", "required": False},
        )
        self.assertEqual(api["date_field"], "")
        self.assertTrue(api["sensitive_response"])
        self.assertEqual(api["rate_limit"], {"max_requests": 2, "period_seconds": 1})
        self.assertEqual(api["retry"], {"retries": 1, "delay_seconds": 1})
        self.assertEqual(api["params"], {})
        self.assertEqual(
            api["param_source"],
            {
                "source_api_code": "transfer_detail",
                "limit": 3,
                "auto_advance": False,
                "fields": [
                    {
                        "source_field": "raw_json.attachmentVOList[].id",
                        "target_field": "id",
                    }
                ],
            },
        )

    def test_attachment_id_becomes_request_primary_key_without_entering_raw_json(self):
        engine = SyncEngine([])
        connection = FakeConnection(
            [{"raw_json": json.dumps({"attachmentVOList": [{"id": 123456}]})}]
        )
        api = {
            "api_code": "file_file_url_query",
            "param_source": {
                "source_api_code": "transfer_detail",
                "limit": 3,
                "fields": [
                    {
                        "source_field": "raw_json.attachmentVOList[].id",
                        "target_field": "id",
                    }
                ],
            },
            "response": {"scalar_field": "data", "scalar_target_field": "fileUrl"},
            "primary_key": {"field": "", "param_field": "id", "required": False},
        }

        params = engine._source_param_sets(connection, api, offset=0)
        raw_items = engine._response_items({"data": "https://example.invalid/fictional-file"}, api)

        self.assertEqual(params, [{"id": "123456"}])
        self.assertEqual(engine._source_primary_key_from_params(api, params[0]), "123456")
        self.assertEqual(raw_items, [{"fileUrl": "https://example.invalid/fictional-file"}])
        self.assertIsNone(engine._data_date(api, raw_items[0]))

        writer = CapturingConnection()
        engine._insert_raw_items(
            writer,
            api,
            raw_items,
            "batch-file",
            source_primary_key=engine._source_primary_key_from_params(api, params[0]),
        )
        raw_write = next(call for call in writer.calls if "INSERT INTO raw_api_data (" in call[0])
        stored_raw_json = json.loads(raw_write[1][0]["raw_json"])
        self.assertEqual(stored_raw_json, raw_items[0])
        self.assertNotIn("id", stored_raw_json)

    def test_sensitive_failure_hides_fictional_file_url_details(self):
        engine = SyncEngine([{"api_code": "file_file_url_query", "sensitive_response": True}])
        connection = CapturingConnection()
        error = ApiRequestError(
            FakeHttpError(),
            "https://example.invalid/fileFileUrl/query",
            "GET",
            {"id": "123456"},
            1,
        )

        engine._insert_failed_request(
            connection,
            "batch-file",
            "file_file_url_query",
            error,
        )

        failed_params = connection.calls[-1][1]
        self.assertIsNone(failed_params["request_params"])
        self.assertIsNone(failed_params["response_body"])
        self.assertEqual(
            failed_params["error_message"],
            "sensitive response details redacted",
        )


if __name__ == "__main__":
    unittest.main()
