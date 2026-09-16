SET SESSION time_zone = '+00:00';

-- 仅删除限流协调状态；执行前必须恢复全局锁和单 Worker。
DROP TABLE api_rate_limit_state;
