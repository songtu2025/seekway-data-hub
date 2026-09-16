SET SESSION time_zone = '+00:00';

-- 迁移前停止 Scheduler、Worker 和 legacy cron，避免存在未受协调的真实请求。
CREATE TABLE IF NOT EXISTS api_rate_limit_state (
  rate_limit_key VARCHAR(600) NOT NULL,
  next_allowed_at DATETIME(6) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (rate_limit_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
