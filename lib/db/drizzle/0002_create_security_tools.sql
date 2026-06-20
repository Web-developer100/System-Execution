-- Migration: 0002_create_security_tools
-- Description: Create the security_tools table with UUID PK and custom ENUMs

BEGIN;

-- Create ENUM types
DO $$ BEGIN
  CREATE TYPE tool_status_enum AS ENUM ('ACTIVE', 'BUILDING', 'WARNING', 'OFFLINE');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE execution_lang_enum AS ENUM ('PYTHON', 'GO', 'RUST', 'BINARY', 'DOCKER');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Create the security_tools table
CREATE TABLE IF NOT EXISTS security_tools (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    repository_url VARCHAR(2048) NOT NULL UNIQUE,
    description TEXT,
    execution_language execution_lang_enum NOT NULL,
    binary_path VARCHAR(2048),
    current_commit_sha VARCHAR(40) NOT NULL,
    installed_version VARCHAR(100),
    github_created_at TIMESTAMP WITH TIME ZONE,
    github_updated_at TIMESTAMP WITH TIME ZONE,
    status tool_status_enum DEFAULT 'BUILDING' NOT NULL,
    last_checked_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_security_tools_status ON security_tools(status);
CREATE INDEX IF NOT EXISTS idx_security_tools_language ON security_tools(execution_language);
CREATE INDEX IF NOT EXISTS idx_security_tools_created ON security_tools(created_at DESC);

COMMIT;
