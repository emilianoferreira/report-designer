-- A5, explicit schema-owner operation after 001-schema.sql. Never run at API startup.
-- MySQL JSON_VALID rejects JSON numbers such as 1e400 that PostgreSQL JSONB accepts.
-- LONGTEXT keeps precision; template writes now validate/canonicalize in StoredJson.
-- Remove only these two parser-dependent checks, retaining NOT NULL, FK and tag checks.
DELIMITER $$
CREATE PROCEDURE a5_json_precision_migration()
BEGIN
    DECLARE finished BOOLEAN DEFAULT FALSE;
    DECLARE target_table VARCHAR(64);
    DECLARE target_check VARCHAR(64);
    DECLARE checks_cursor CURSOR FOR
        SELECT t.TABLE_NAME,t.CONSTRAINT_NAME
        FROM information_schema.TABLE_CONSTRAINTS t
        JOIN information_schema.CHECK_CONSTRAINTS c
          ON c.CONSTRAINT_SCHEMA=t.CONSTRAINT_SCHEMA AND c.CONSTRAINT_NAME=t.CONSTRAINT_NAME
        WHERE t.CONSTRAINT_SCHEMA=DATABASE() AND t.CONSTRAINT_TYPE='CHECK'
          AND c.CHECK_CLAUSE LIKE '%json_valid%'
          AND ((t.TABLE_NAME='companies' AND c.CHECK_CLAUSE LIKE '%parametros%')
            OR (t.TABLE_NAME='report_templates' AND c.CHECK_CLAUSE LIKE '%template_json%'));
    DECLARE CONTINUE HANDLER FOR NOT FOUND SET finished=TRUE;
    OPEN checks_cursor;
    migration_loop: LOOP
        FETCH checks_cursor INTO target_table,target_check;
        IF finished THEN LEAVE migration_loop; END IF;
        SET @a5_ddl=CONCAT('ALTER TABLE `',target_table,'` DROP CHECK `',target_check,'`');
        PREPARE a5_statement FROM @a5_ddl;
        EXECUTE a5_statement;
        DEALLOCATE PREPARE a5_statement;
    END LOOP;
    CLOSE checks_cursor;
END$$
DELIMITER ;
CALL a5_json_precision_migration();
DROP PROCEDURE a5_json_precision_migration;
