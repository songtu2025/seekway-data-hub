import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

from app.auth import JijiaAuthClient, JijiaCredentials
from app.config import AppSettings


class FakeRateLimiter:
    def __init__(self):
        self.acquisitions = []

    def acquire(self, method, path, policy):
        self.acquisitions.append((method, path, policy))

    def defer(self, method, path, seconds):
        raise AssertionError((method, path, seconds))


class ExplicitCredentialsTest(unittest.TestCase):
    def test_web_credentials_do_not_use_global_values_or_disk_cache(self):
        with tempfile.TemporaryDirectory() as directory:
            cache_path = Path(directory) / "token.json"
            cache_path.write_text(
                '{"accessToken":"shared-token","expiresAt":9999999999}',
                encoding="utf-8",
            )
            settings = AppSettings(
                _env_file=None,
                jijia_app_id="legacy-app",
                jijia_app_key="legacy-key",
                jijia_token_cache_path=cache_path,
            )
            response = Mock()
            response.raise_for_status.return_value = None
            response.json.return_value = {
                "code": 200,
                "data": {"accessToken": "temporary-token", "expiresIn": 3600},
            }

            with patch("app.auth.requests.post", return_value=response) as post:
                client = JijiaAuthClient(
                    settings,
                    credentials=JijiaCredentials("web-app", "web-key"),
                )
                client.get_access_token()

            self.assertEqual(
                post.call_args.kwargs["json"], {"appId": "web-app", "appKey": "web-key"}
            )
            self.assertEqual(
                cache_path.read_text(encoding="utf-8"),
                '{"accessToken":"shared-token","expiresAt":9999999999}',
            )

    def test_explicit_credentials_repr_does_not_contain_secrets(self):
        credentials = JijiaCredentials("sensitive-app", "sensitive-key")

        self.assertNotIn("sensitive-app", repr(credentials))
        self.assertNotIn("sensitive-key", repr(credentials))

    def test_token_request_acquires_shared_token_endpoint_slot(self):
        settings = AppSettings(
            _env_file=None,
            jijia_app_id="legacy-app",
            jijia_app_key="legacy-key",
        )
        response = Mock()
        response.raise_for_status.return_value = None
        response.json.return_value = {
            "code": 200,
            "data": {"accessToken": "temporary-token", "expiresIn": 3600},
        }
        limiter = FakeRateLimiter()

        with patch("app.auth.requests.post", return_value=response):
            client = JijiaAuthClient(
                settings,
                credentials=JijiaCredentials("web-app", "web-key"),
                rate_limiter=limiter,
            )
            client.get_access_token(force_refresh=True)

        self.assertEqual(len(limiter.acquisitions), 1)
        method, path, policy = limiter.acquisitions[0]
        self.assertEqual((method, path), ("POST", "/api_token"))
        self.assertEqual(policy.max_requests, 10)
        self.assertEqual(policy.period_seconds, 1)


if __name__ == "__main__":
    unittest.main()
