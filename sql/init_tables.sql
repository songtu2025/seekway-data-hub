-- 接口配置运行表：YAML 只作为受控发布输入，运行时统一从本表读取。
CREATE TABLE IF NOT EXISTS api_config (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  api_code VARCHAR(100) NOT NULL,
  api_name VARCHAR(255) NOT NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  platform_enabled TINYINT(1) NOT NULL DEFAULT 0,
  method VARCHAR(20) NOT NULL DEFAULT 'POST',
  path VARCHAR(500) NOT NULL,
  config_json JSON NOT NULL,
  config_version INT NOT NULL DEFAULT 1,
  config_hash CHAR(64) NOT NULL,
  read_only_verified TINYINT(1) NOT NULL DEFAULT 0,
  official_doc_id INT NULL,
  classification VARCHAR(64) NULL,
  execution_stage VARCHAR(64) NULL,
  published_at DATETIME NOT NULL,
  remark VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_api_config_api_code (api_code),
  KEY idx_api_config_enabled (enabled, platform_enabled, read_only_verified)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 全部账号和 Worker 按积加单接口共享下一次可请求时间。
CREATE TABLE IF NOT EXISTS api_rate_limit_state (
  rate_limit_key VARCHAR(600) NOT NULL,
  next_allowed_at DATETIME(6) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (rate_limit_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 批次表；jijia_account_id=0 表示历史/legacy CLI 数据，sync_job_id 由应用层关联。
CREATE TABLE IF NOT EXISTS sync_batch (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  sync_batch_no VARCHAR(64) NOT NULL,
  jijia_account_id INT NOT NULL DEFAULT 0,
  sync_job_id INT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'running',
  started_at DATETIME NOT NULL,
  finished_at DATETIME NULL,
  total_api_count INT NOT NULL DEFAULT 0,
  success_api_count INT NOT NULL DEFAULT 0,
  failed_api_count INT NOT NULL DEFAULT 0,
  message VARCHAR(1000) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_sync_batch_no (sync_batch_no),
  UNIQUE KEY uk_sync_batch_job (sync_job_id),
  KEY idx_sync_batch_account_status (jijia_account_id, status, started_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 单接口执行日志；账号维度由应用层校验，不依赖 Web 表外键。
CREATE TABLE IF NOT EXISTS sync_api_log (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  sync_batch_no VARCHAR(64) NOT NULL,
  jijia_account_id INT NOT NULL DEFAULT 0,
  api_code VARCHAR(100) NOT NULL,
  status VARCHAR(30) NOT NULL,
  request_count INT NOT NULL DEFAULT 0,
  success_count INT NOT NULL DEFAULT 0,
  failed_count INT NOT NULL DEFAULT 0,
  started_at DATETIME NOT NULL,
  finished_at DATETIME NULL,
  error_message TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_sync_api_log_batch (sync_batch_no),
  KEY idx_sync_api_log_account_api_status (jijia_account_id, api_code, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 原始数据最新快照；record_identity 是账号/API 范围内的稳定身份摘要。
CREATE TABLE IF NOT EXISTS raw_api_data (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  jijia_account_id INT NOT NULL DEFAULT 0,
  api_code VARCHAR(100) NOT NULL,
  source_primary_key VARCHAR(255) NULL,
  record_identity CHAR(64) NOT NULL,
  data_hash CHAR(64) NOT NULL,
  raw_json JSON NOT NULL,
  data_date DATE NULL,
  sync_batch_no VARCHAR(64) NOT NULL,
  first_observed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_observed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  observation_count BIGINT UNSIGNED NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_raw_account_api_identity (jijia_account_id, api_code, record_identity),
  KEY idx_raw_account_api_hash (jijia_account_id, api_code, data_hash),
  KEY idx_raw_account_api_source_pk (jijia_account_id, api_code, source_primary_key),
  KEY idx_raw_api_data_date (jijia_account_id, api_code, data_date),
  KEY idx_raw_api_batch (sync_batch_no),
  KEY idx_raw_created (created_at, id),
  KEY idx_raw_account_api_created (jijia_account_id, api_code, created_at, id),
  KEY idx_raw_last_observed (last_observed_at),
  KEY idx_raw_account_last_observed (jijia_account_id, last_observed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 接口中心读取的精确计数投影；可随时由 raw_api_data 重建。
CREATE TABLE IF NOT EXISTS raw_api_data_stat (
  jijia_account_id INT NOT NULL,
  api_code VARCHAR(100) NOT NULL,
  record_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (jijia_account_id, api_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 需要版本历史的接口使用本表；相同 hash 不重复新增 JSON 版本。
CREATE TABLE IF NOT EXISTS raw_api_data_history (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  jijia_account_id INT NOT NULL DEFAULT 0,
  api_code VARCHAR(100) NOT NULL,
  record_identity CHAR(64) NOT NULL,
  source_primary_key VARCHAR(255) NULL,
  data_hash CHAR(64) NOT NULL,
  raw_json JSON NOT NULL,
  data_date DATE NULL,
  sync_batch_no VARCHAR(64) NOT NULL,
  observed_at DATETIME NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_raw_history_version (jijia_account_id, api_code, record_identity, data_hash),
  KEY idx_raw_history_account_record (jijia_account_id, api_code, record_identity, observed_at),
  KEY idx_raw_history_date (jijia_account_id, api_code, data_date),
  KEY idx_raw_history_batch (sync_batch_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 退货订单当前查询投影；完整原文和变化历史仍以 raw 表为准。
CREATE TABLE IF NOT EXISTS sale_return_order (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  jijia_account_id INT NOT NULL,
  raw_data_id BIGINT UNSIGNED NOT NULL,
  source_primary_key VARCHAR(255) NOT NULL,
  record_identity CHAR(64) NOT NULL,
  market_id INT NULL,
  return_date_time DATETIME NULL,
  order_id VARCHAR(255) NULL,
  seller_order_id VARCHAR(255) NULL,
  asin VARCHAR(32) NULL,
  msku VARCHAR(255) NULL,
  fnsku VARCHAR(255) NULL,
  sku VARCHAR(255) NULL,
  product_name TEXT NULL,
  quantity INT NULL,
  fulfillment_center_id VARCHAR(100) NULL,
  disposition VARCHAR(100) NULL,
  reason TEXT NULL,
  status VARCHAR(100) NULL,
  source_created_at DATETIME NULL,
  source_updated_at DATETIME NULL,
  data_hash CHAR(64) NOT NULL,
  sync_batch_no VARCHAR(64) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_sale_return_account_source (jijia_account_id, source_primary_key),
  UNIQUE KEY uk_sale_return_raw_data (raw_data_id),
  KEY idx_sale_return_account_date (jijia_account_id, return_date_time, id),
  KEY idx_sale_return_account_status_date (jijia_account_id, status, return_date_time),
  KEY idx_sale_return_account_order (jijia_account_id, order_id),
  KEY idx_sale_return_account_sku (jijia_account_id, sku),
  KEY idx_sale_return_created (created_at, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 检查点；类型为 date_window/history_backfill/update_incremental 等受控字符串。
CREATE TABLE IF NOT EXISTS sync_checkpoint (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  jijia_account_id INT NOT NULL DEFAULT 0,
  api_code VARCHAR(100) NOT NULL,
  checkpoint_kind VARCHAR(32) NOT NULL DEFAULT 'date_window',
  checkpoint_value JSON NULL,
  checkpoint_time DATETIME NULL,
  last_sync_batch_no VARCHAR(64) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_sync_checkpoint_scope (jijia_account_id, api_code, checkpoint_kind)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 失败请求明细；不保存敏感 token/凭证，账号维度由应用层校验。
CREATE TABLE IF NOT EXISTS failed_request_log (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  sync_batch_no VARCHAR(64) NULL,
  jijia_account_id INT NOT NULL DEFAULT 0,
  api_code VARCHAR(100) NOT NULL,
  request_url VARCHAR(1000) NULL,
  request_method VARCHAR(20) NOT NULL DEFAULT 'POST',
  request_params JSON NULL,
  response_status_code INT NULL,
  response_body MEDIUMTEXT NULL,
  error_message TEXT NULL,
  retry_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_failed_request_account_api_created_at (jijia_account_id, api_code, created_at),
  KEY idx_failed_request_batch (sync_batch_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
