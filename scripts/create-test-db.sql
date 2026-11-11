-- Réexécutable sans effacer une base ou ses données.
SELECT 'CREATE DATABASE partenaires_test OWNER partenaires'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'partenaires_test')
\gexec
