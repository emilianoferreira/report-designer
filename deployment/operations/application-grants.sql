-- Run explicitly as database owner after a restore; app_role must already exist.
-- Usage: psql --set=app_role=reviewed_application_role --file=application-grants.sql
\set ON_ERROR_STOP on
BEGIN;
GRANT USAGE ON SCHEMA public TO :"app_role";
GRANT SELECT ON companies, branches, contacts, currencies, invoice_types, articles,
    invoices, invoice_lines, invoice_taxes TO :"app_role";
GRANT SELECT, INSERT, UPDATE, DELETE ON report_templates TO :"app_role";
GRANT SELECT ON auth_users, auth_memberships TO :"app_role";
GRANT SELECT, INSERT, DELETE ON auth_sessions TO :"app_role";
GRANT SELECT, INSERT, UPDATE ON auth_login_limits TO :"app_role";
GRANT EXECUTE ON FUNCTION build_invoice_data(uuid) TO :"app_role";
COMMIT;
