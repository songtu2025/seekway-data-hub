import unittest
from types import SimpleNamespace

from requests import HTTPError

from app.api_client import JijiaApiClient
from app.auth import AccessToken


class FakeResponse:
    def __init__(self, status_code=200, payload=None, headers=None):
        self.status_code = status_code
        self._payload = payload or {"code": 200, "data": {"rows": []}}
        self.headers = headers or {}

    def raise_for_status(self):
        if self.status_code >= 400:
            error = HTTPError(f"{self.status_code} Client Error")
            error.response = self
            raise error
        return None

    def json(self):
        return self._payload


class FakeSession:
    def __init__(self, responses=None):
        self.responses = list(responses or [FakeResponse()])
        self.calls = []

    def post(self, url, json, headers, timeout):
        self.calls.append(
            {
                "url": url,
                "json": json,
                "headers": headers,
                "timeout": timeout,
            }
        )
        return self.responses.pop(0)


class FakeRefreshAuthClient:
    def __init__(self):
        self.calls = 0

    def get_access_token(self, force_refresh=False):
        self.calls += 1
        self.force_refresh = force_refresh
        return AccessToken("fresh-token")


class FakeRateLimiter:
    def __init__(self):
        self.acquisitions = []
        self.deferrals = []

    def acquire(self, method, path, policy):
        self.acquisitions.append((method, path, policy))

    def defer(self, method, path, seconds):
        self.deferrals.append((method, path, seconds))


class JijiaApiClientTimeoutTest(unittest.TestCase):
    def test_api_config_can_override_request_timeout(self):
        settings = SimpleNamespace(
            jijia_base_url="https://example.test",
            jijia_open_gateway_prefix="/api/open",
        )
        client = JijiaApiClient(settings, timeout_seconds=30)
        client.session = FakeSession()

        client.request(
            {
                "api_code": "slow_api",
                "method": "POST",
                "path": "/slow/page",
                "timeout_seconds": 90,
                "params": {"page": 1},
            },
            AccessToken("token"),
        )

        self.assertEqual(client.session.calls[0]["timeout"], 90)

    def test_unauthorized_response_refreshes_token_once(self):
        settings = SimpleNamespace(
            jijia_base_url="https://example.test",
            jijia_open_gateway_prefix="/api/open",
        )
        auth_client = FakeRefreshAuthClient()
        client = JijiaApiClient(settings, timeout_seconds=30, auth_client=auth_client)
        client.session = FakeSession([FakeResponse(status_code=401), FakeResponse()])

        client.request(
            {
                "api_code": "long_api",
                "method": "POST",
                "path": "/long/page",
                "params": {"page": 1},
            },
            AccessToken("stale-token"),
        )

        self.assertEqual(auth_client.calls, 1)
        self.assertTrue(auth_client.force_refresh)
        self.assertEqual(client.session.calls[0]["headers"]["accessToken"], "stale-token")
        self.assertEqual(client.session.calls[1]["headers"]["accessToken"], "fresh-token")

    def test_every_http_attempt_acquires_shared_endpoint_slot(self):
        settings = SimpleNamespace(
            jijia_base_url="https://example.test",
            jijia_open_gateway_prefix="/api/open",
        )
        limiter = FakeRateLimiter()
        auth_client = FakeRefreshAuthClient()
        client = JijiaApiClient(
            settings,
            auth_client=auth_client,
            rate_limiter=limiter,
        )
        client.session = FakeSession([FakeResponse(status_code=401), FakeResponse()])
        config = {
            "api_code": "limited_api",
            "method": "POST",
            "path": "/limited/page",
            "rate_limit": {"max_requests": 2, "period_seconds": 1},
        }

        client.request(config, AccessToken("stale-token"))

        self.assertEqual(len(limiter.acquisitions), 2)
        self.assertTrue(all(call[:2] == ("POST", "/limited/page") for call in limiter.acquisitions))

    def test_http_429_defers_endpoint_using_retry_after(self):
        settings = SimpleNamespace(
            jijia_base_url="https://example.test",
            jijia_open_gateway_prefix="/api/open",
        )
        limiter = FakeRateLimiter()
        client = JijiaApiClient(settings, rate_limiter=limiter)
        client.session = FakeSession([FakeResponse(status_code=429, headers={"Retry-After": "3"})])
        config = {
            "api_code": "limited_api",
            "method": "POST",
            "path": "/limited/page",
            "rate_limit": {"max_requests": 2, "period_seconds": 1},
        }

        with self.assertRaises(HTTPError):
            client.request(config, AccessToken("token"))

        self.assertEqual(limiter.deferrals, [("POST", "/limited/page", 3.0)])


if __name__ == "__main__":
    unittest.main()
