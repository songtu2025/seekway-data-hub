import unittest
from datetime import datetime, timedelta

from sqlalchemy import create_engine, select

from app.api_rate_limiter import (
    MySqlApiRateLimiter,
    RateLimitPolicy,
    api_rate_limit_metadata,
    api_rate_limit_state_table,
    normalize_rate_limit_key,
    rate_limit_policy,
    retry_after_seconds,
)


class FakeClock:
    def __init__(self) -> None:
        self.now = datetime(2026, 9, 15, 8, 0, 0)
        self.sleeps: list[float] = []

    def sleep(self, seconds: float) -> None:
        self.sleeps.append(seconds)
        self.now += timedelta(seconds=seconds)


class ApiRateLimiterTest(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine("sqlite+pysqlite:///:memory:")
        api_rate_limit_metadata.create_all(self.engine)
        self.clock = FakeClock()
        self.limiter = MySqlApiRateLimiter(
            self.engine,
            utilization=0.9,
            sleeper=self.clock.sleep,
            now_provider=lambda _connection: self.clock.now,
        )

    def tearDown(self) -> None:
        self.engine.dispose()

    def test_same_endpoint_aliases_share_one_request_timeline(self) -> None:
        policy = RateLimitPolicy(max_requests=2, period_seconds=1)

        self.limiter.acquire("post", "/operation/sts/salesAnalysis/page", policy)
        self.limiter.acquire("POST", "operation/sts/salesAnalysis/page", policy)

        self.assertEqual(len(self.clock.sleeps), 1)
        self.assertAlmostEqual(self.clock.sleeps[0], 1 / 2 / 0.9, places=6)
        with self.engine.connect() as connection:
            keys = list(connection.scalars(select(api_rate_limit_state_table.c.rate_limit_key)))
        self.assertEqual(keys, ["POST /operation/sts/salesAnalysis/page"])

    def test_different_endpoints_can_acquire_without_waiting(self) -> None:
        policy = RateLimitPolicy(max_requests=1, period_seconds=1)

        self.limiter.acquire("POST", "/first", policy)
        self.limiter.acquire("POST", "/second", policy)

        self.assertEqual(self.clock.sleeps, [])

    def test_defer_extends_shared_cooldown(self) -> None:
        policy = RateLimitPolicy(max_requests=5, period_seconds=1)
        self.limiter.acquire("POST", "/limited", policy)

        self.limiter.defer("POST", "/limited", 3)
        self.limiter.acquire("POST", "/limited", policy)

        self.assertEqual(self.clock.sleeps, [3])

    def test_defer_logs_only_safe_endpoint_cooldown_fields(self) -> None:
        with self.assertLogs("app.api_rate_limiter", level="WARNING") as captured:
            self.limiter.defer("post", "/limited", 3)

        message = captured.output[0]
        self.assertIn("method=POST", message)
        self.assertIn("path=/limited", message)
        self.assertIn("cooldown_seconds=3.000", message)
        self.assertNotIn("accessToken", message)
        self.assertNotIn("account", message)

    def test_policy_and_retry_after_validation(self) -> None:
        policy = rate_limit_policy({"rate_limit": {"max_requests": 2, "period_seconds": 1}})

        self.assertEqual(policy, RateLimitPolicy(max_requests=2, period_seconds=1.0))
        self.assertEqual(normalize_rate_limit_key(" get ", "items"), "GET /items")
        self.assertEqual(retry_after_seconds("2.5", 1), 2.5)
        self.assertEqual(retry_after_seconds("invalid", 3), 3)
        with self.assertRaises(ValueError):
            rate_limit_policy({"rate_limit": {"max_requests": 0, "period_seconds": 1}})


if __name__ == "__main__":
    unittest.main()
