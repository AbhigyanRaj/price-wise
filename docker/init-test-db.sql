-- Runs once, on first container start, from /docker-entrypoint-initdb.d.
--
-- The postgres image creates exactly one database, from POSTGRES_DB. The test
-- suite needs a second one, and without this a reviewer following the README
-- hits "P1003: Database pricewise_test does not exist" the first time they run
-- the tests, with no documented step that would have created it.
CREATE DATABASE pricewise_test;
