-- Runs only on the NEW PostgreSQL volume. No access to the previous Go database.
SELECT 'CREATE DATABASE hoslink_ts_test OWNER hoslink'
WHERE NOT EXISTS(SELECT 1 FROM pg_database WHERE datname='hoslink_ts_test')\gexec
