\echo 'Delete and recreate gnh db?'
\prompt 'Return for yes or control-C to cancel > ' foo

DROP DATABASE gnh;
CREATE DATABASE gnh;
\connect gnh

\i basic-schema.sql
\i basic-seed.sql

\echo 'Delete and recreate gnh_test db?'
\prompt 'Return for yes or control-C to cancel > ' foo

DROP DATABASE gnh_test;
CREATE DATABASE gnh_test;
\connect gnh_test

\i basic-schema.sql
