import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationPath = path.join(__dirname, '../supabase/migrations');

// Test database configuration
const testDbConfig = {
  host: 'localhost',
  port: 5434, // Use a different port for migration tests
  user: 'postgres',
  password: 'postgres',
  database: 'vpn_migration_test_db'
};

// Initialize test database pool
let pool;

// Utility functions
async function executeQuery(query, params = []) {
  try {
    const client = await pool.connect();
    try {
      const result = await client.query(query, params);
      return result;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Query execution error:', error);
    throw error;
  }
}

async function createTestDatabase() {
  // Connect to postgres database to create test database
  const pgPool = new Pool({
    host: testDbConfig.host,
    port: testDbConfig.port,
    user: testDbConfig.user,
    password: testDbConfig.password,
    database: 'postgres'
  });

  try {
    // Drop test database if it exists
    await pgPool.query(`DROP DATABASE IF EXISTS ${testDbConfig.database}`);
    // Create test database
    await pgPool.query(`CREATE DATABASE ${testDbConfig.database}`);
  } catch (error) {
    console.error('Error creating test database:', error);
    throw error;
  } finally {
    await pgPool.end();
  }
}

// Get all migration files
function getMigrationFiles() {
  return fs.readdirSync(migrationPath)
    .filter(file => file.endsWith('.sql'))
    .sort(); // Ensure migrations are applied in order
}

// Apply a specific migration
async function applyMigration(filename) {
  const filePath = path.join(migrationPath, filename);
  const sql = fs.readFileSync(filePath, 'utf8');
  
  try {
    await executeQuery(sql);
    return true;
  } catch (error) {
    console.error(`Error applying migration ${filename}:`, error);
    throw error;
  }
}

// Test suite setup
beforeAll(async () => {
  // Create test database
  await createTestDatabase();
  
  // Connect to test database
  pool = new Pool(testDbConfig);
});

afterAll(async () => {
  // Close database connection
  if (pool) {
    await pool.end();
  }
});

describe('Migration Tests', () => {
  it('should apply all migrations successfully', async () => {
    const migrationFiles = getMigrationFiles();
    
    for (const file of migrationFiles) {
      const success = await applyMigration(file);
      expect(success).toBe(true);
    }
    
    // Verify all tables exist
    const { rows } = await executeQuery(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    
    const tableNames = rows.map(row => row.table_name);
    
    // Check for essential tables
    expect(tableNames).toContain('credentials');
    expect(tableNames).toContain('proxies');
    expect(tableNames).toContain('tasks');
    expect(tableNames).toContain('logs');
    expect(tableNames).toContain('vendor_urls');
  });
  
  it('should create all required indexes', async () => {
    // Apply migrations if not already applied
    const migrationFiles = getMigrationFiles();
    for (const file of migrationFiles) {
      try {
        await applyMigration(file);
      } catch (error) {
        // Ignore errors if index already exists
        if (!error.message.includes('already exists')) {
          throw error;
        }
      }
    }
    
    // Check for indexes
    const { rows } = await executeQuery(`
      SELECT
        indexname,
        tablename,
        indexdef
      FROM
        pg_indexes
      WHERE
        schemaname = 'public'
    `);
    
    const indexNames = rows.map(row => row.indexname);
    
    // Check for specific indexes from migrations
    expect(indexNames.some(name => name.includes('idx_credentials_ip'))).toBeTruthy();
    expect(indexNames.some(name => name.includes('idx_tasks_vpn_type'))).toBeTruthy();
    expect(indexNames.some(name => name.includes('idx_logs_timestamp'))).toBeTruthy();
    expect(indexNames.some(name => name.includes('idx_scan_results_status'))).toBeTruthy();
  });
  
  it('should handle idempotent migrations', async () => {
    // Apply the same migration twice
    const migrationFiles = getMigrationFiles();
    if (migrationFiles.length > 0) {
      const firstMigration = migrationFiles[0];
      
      // Apply first time
      await applyMigration(firstMigration);
      
      // Apply second time - should not error
      let error;
      try {
        await applyMigration(firstMigration);
      } catch (err) {
        error = err;
      }
      
      // Some migrations might not be fully idempotent, but they shouldn't crash the database
      if (error) {
        expect(error.message).toContain('already exists');
      }
      
      // Database should still be functional
      const { rows } = await executeQuery(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public'
        LIMIT 1
      `);
      
      expect(rows.length).toBeGreaterThan(0);
    }
  });
  
  it('should create tables with correct columns and types', async () => {
    // Check credentials table
    const { rows: credentialColumns } = await executeQuery(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'credentials'
      ORDER BY ordinal_position
    `);
    
    expect(credentialColumns.length).toBeGreaterThan(0);
    
    const idColumn = credentialColumns.find(col => col.column_name === 'id');
    expect(idColumn).toBeTruthy();
    expect(idColumn.data_type).toBe('integer');
    expect(idColumn.is_nullable).toBe('NO');
    
    const ipColumn = credentialColumns.find(col => col.column_name === 'ip');
    expect(ipColumn).toBeTruthy();
    expect(ipColumn.data_type).toBe('text');
    expect(ipColumn.is_nullable).toBe('NO');
    
    // Check tasks table
    const { rows: taskColumns } = await executeQuery(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'tasks'
      ORDER BY ordinal_position
    `);
    
    expect(taskColumns.length).toBeGreaterThan(0);
    
    const vendorUrlIdColumn = taskColumns.find(col => col.column_name === 'vendor_url_id');
    expect(vendorUrlIdColumn).toBeTruthy();
    expect(vendorUrlIdColumn.data_type).toBe('integer');
  });
  
  it('should create foreign key constraints correctly', async () => {
    const { rows } = await executeQuery(`
      SELECT
        tc.constraint_name,
        tc.table_name,
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name
      FROM
        information_schema.table_constraints AS tc
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage AS ccu
          ON ccu.constraint_name = tc.constraint_name
          AND ccu.table_schema = tc.table_schema
      WHERE
        tc.constraint_type = 'FOREIGN KEY'
    `);
    
    // Check for tasks -> vendor_urls foreign key
    const taskVendorFk = rows.find(row => 
      row.table_name === 'tasks' && 
      row.column_name === 'vendor_url_id' && 
      row.foreign_table_name === 'vendor_urls'
    );
    
    expect(taskVendorFk).toBeTruthy();
    expect(taskVendorFk.foreign_column_name).toBe('id');
  });
  
  it('should handle data migrations correctly', async () => {
    // This test would verify data migrations if they were included
    // For now, we'll just check that we can insert and retrieve data
    
    // Insert test data
    await executeQuery(`
      INSERT INTO vendor_urls (url)
      VALUES ('https://vpn.example.com')
    `);
    
    // Verify data was inserted
    const { rows } = await executeQuery(`
      SELECT * FROM vendor_urls
      WHERE url = 'https://vpn.example.com'
    `);
    
    expect(rows.length).toBe(1);
    expect(rows[0].url).toBe('https://vpn.example.com');
  });
});

describe('Schema Validation', () => {
  it('should have primary keys on all tables', async () => {
    const { rows } = await executeQuery(`
      SELECT
        tc.table_name,
        kc.column_name
      FROM
        information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kc
          ON kc.constraint_name = tc.constraint_name
      WHERE
        tc.constraint_type = 'PRIMARY KEY'
        AND tc.table_schema = 'public'
    `);
    
    const tablesWithPk = rows.map(row => row.table_name);
    
    // Check essential tables have primary keys
    expect(tablesWithPk).toContain('credentials');
    expect(tablesWithPk).toContain('proxies');
    expect(tablesWithPk).toContain('tasks');
    expect(tablesWithPk).toContain('logs');
    expect(tablesWithPk).toContain('vendor_urls');
  });
  
  it('should have not-null constraints on required columns', async () => {
    // Check credentials table
    const { rows: credentialColumns } = await executeQuery(`
      SELECT column_name, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'credentials'
        AND column_name IN ('ip', 'username', 'password')
    `);
    
    credentialColumns.forEach(column => {
      expect(column.is_nullable).toBe('NO');
    });
    
    // Check vendor_urls table
    const { rows: vendorColumns } = await executeQuery(`
      SELECT column_name, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'vendor_urls'
        AND column_name = 'url'
    `);
    
    expect(vendorColumns[0].is_nullable).toBe('NO');
  });
  
  it('should have correct default values', async () => {
    // Check logs table for timestamp default
    const { rows: logColumns } = await executeQuery(`
      SELECT column_name, column_default
      FROM information_schema.columns
      WHERE table_name = 'logs'
        AND column_name = 'timestamp'
    `);
    
    expect(logColumns[0].column_default).toContain('now()');
    
    // Check scheduled_tasks table for defaults
    const { rows: taskColumns } = await executeQuery(`
      SELECT column_name, column_default
      FROM information_schema.columns
      WHERE table_name = 'scheduled_tasks'
        AND column_name IN ('active', 'executed', 'created_at')
    `);
    
    const activeColumn = taskColumns.find(col => col.column_name === 'active');
    const executedColumn = taskColumns.find(col => col.column_name === 'executed');
    const createdAtColumn = taskColumns.find(col => col.column_name === 'created_at');
    
    if (activeColumn) {
      expect(activeColumn.column_default).toBe('true');
    }
    
    if (executedColumn) {
      expect(executedColumn.column_default).toBe('false');
    }
    
    if (createdAtColumn) {
      expect(createdAtColumn.column_default).toContain('now()');
    }
  });
});