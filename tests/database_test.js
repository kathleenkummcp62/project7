import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { Pool } from 'pg';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationPath = path.join(__dirname, '../supabase/migrations');

// Test database configuration
const testDbConfig = {
  host: 'localhost',
  port: 5433, // Use a different port for testing
  user: 'postgres',
  password: 'postgres',
  database: 'vpn_test_db'
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

async function applyMigrations() {
  // Get all migration files
  const migrationFiles = fs.readdirSync(migrationPath)
    .filter(file => file.endsWith('.sql'))
    .sort(); // Ensure migrations are applied in order

  // Apply each migration
  for (const file of migrationFiles) {
    const filePath = path.join(migrationPath, file);
    const sql = fs.readFileSync(filePath, 'utf8');
    
    try {
      await executeQuery(sql);
      console.log(`Applied migration: ${file}`);
    } catch (error) {
      console.error(`Error applying migration ${file}:`, error);
      throw error;
    }
  }
}

// Test suite setup
beforeAll(async () => {
  // Create test database
  await createTestDatabase();
  
  // Connect to test database
  pool = new Pool(testDbConfig);
  
  // Apply migrations
  await applyMigrations();
});

afterAll(async () => {
  // Close database connection
  if (pool) {
    await pool.end();
  }
});

// Clean up tables between tests
beforeEach(async () => {
  // Disable foreign key checks for clean up
  await executeQuery('SET session_replication_role = replica;');
  
  // Truncate all tables
  await executeQuery(`
    TRUNCATE 
      credentials, 
      proxies, 
      tasks, 
      logs, 
      vendor_urls,
      scheduled_tasks,
      workers
    RESTART IDENTITY CASCADE;
  `);
  
  // Re-enable foreign key checks
  await executeQuery('SET session_replication_role = DEFAULT;');
});

// Test suites
describe('Database Schema', () => {
  it('should have all required tables', async () => {
    const { rows } = await executeQuery(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    
    const tableNames = rows.map(row => row.table_name);
    
    expect(tableNames).toContain('credentials');
    expect(tableNames).toContain('proxies');
    expect(tableNames).toContain('tasks');
    expect(tableNames).toContain('logs');
    expect(tableNames).toContain('vendor_urls');
    expect(tableNames).toContain('scheduled_tasks');
  });
  
  it('should have correct columns in credentials table', async () => {
    const { rows } = await executeQuery(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'credentials'
    `);
    
    const columns = rows.reduce((acc, row) => {
      acc[row.column_name] = row.data_type;
      return acc;
    }, {});
    
    expect(columns).toHaveProperty('id');
    expect(columns).toHaveProperty('ip');
    expect(columns).toHaveProperty('username');
    expect(columns).toHaveProperty('password');
  });
  
  it('should have correct columns in tasks table', async () => {
    const { rows } = await executeQuery(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'tasks'
    `);
    
    const columns = rows.reduce((acc, row) => {
      acc[row.column_name] = row.data_type;
      return acc;
    }, {});
    
    expect(columns).toHaveProperty('id');
    expect(columns).toHaveProperty('vpn_type');
    expect(columns).toHaveProperty('vendor_url_id');
    expect(columns).toHaveProperty('server');
    expect(columns).toHaveProperty('status');
  });
  
  it('should have correct foreign key constraints', async () => {
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
        AND tc.table_name = 'tasks';
    `);
    
    expect(rows.length).toBeGreaterThan(0);
    
    const foreignKey = rows.find(row => 
      row.column_name === 'vendor_url_id' && 
      row.foreign_table_name === 'vendor_urls'
    );
    
    expect(foreignKey).toBeTruthy();
    expect(foreignKey.foreign_column_name).toBe('id');
  });
  
  it('should have indexes on frequently queried columns', async () => {
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
    
    // Check for primary key indexes
    expect(indexNames).toContain('credentials_pkey');
    expect(indexNames).toContain('tasks_pkey');
    expect(indexNames).toContain('vendor_urls_pkey');
    
    // Check for custom indexes from migrations
    expect(indexNames.some(name => name.includes('idx_credentials_ip'))).toBeTruthy();
    expect(indexNames.some(name => name.includes('idx_tasks_vpn_type'))).toBeTruthy();
    expect(indexNames.some(name => name.includes('idx_logs_timestamp'))).toBeTruthy();
  });
});

describe('Credentials CRUD Operations', () => {
  it('should create a new credential', async () => {
    const { rows } = await executeQuery(`
      INSERT INTO credentials (ip, username, password)
      VALUES ('192.168.1.1', 'admin', 'password123')
      RETURNING *
    `);
    
    expect(rows.length).toBe(1);
    expect(rows[0].ip).toBe('192.168.1.1');
    expect(rows[0].username).toBe('admin');
    expect(rows[0].password).toBe('password123');
  });
  
  it('should read credentials', async () => {
    // Insert test data
    await executeQuery(`
      INSERT INTO credentials (ip, username, password)
      VALUES 
        ('192.168.1.1', 'admin', 'password123'),
        ('192.168.1.2', 'user', 'pass456')
    `);
    
    // Read all credentials
    const { rows } = await executeQuery('SELECT * FROM credentials');
    
    expect(rows.length).toBe(2);
    expect(rows[0].ip).toBe('192.168.1.1');
    expect(rows[1].ip).toBe('192.168.1.2');
  });
  
  it('should update a credential', async () => {
    // Insert test data
    const { rows: inserted } = await executeQuery(`
      INSERT INTO credentials (ip, username, password)
      VALUES ('192.168.1.1', 'admin', 'password123')
      RETURNING id
    `);
    
    const id = inserted[0].id;
    
    // Update credential
    await executeQuery(`
      UPDATE credentials
      SET username = 'newadmin', password = 'newpass'
      WHERE id = $1
    `, [id]);
    
    // Verify update
    const { rows } = await executeQuery('SELECT * FROM credentials WHERE id = $1', [id]);
    
    expect(rows.length).toBe(1);
    expect(rows[0].username).toBe('newadmin');
    expect(rows[0].password).toBe('newpass');
    expect(rows[0].ip).toBe('192.168.1.1'); // Unchanged field
  });
  
  it('should delete a credential', async () => {
    // Insert test data
    const { rows: inserted } = await executeQuery(`
      INSERT INTO credentials (ip, username, password)
      VALUES ('192.168.1.1', 'admin', 'password123')
      RETURNING id
    `);
    
    const id = inserted[0].id;
    
    // Delete credential
    await executeQuery('DELETE FROM credentials WHERE id = $1', [id]);
    
    // Verify deletion
    const { rows } = await executeQuery('SELECT * FROM credentials WHERE id = $1', [id]);
    
    expect(rows.length).toBe(0);
  });
  
  it('should handle bulk operations', async () => {
    // Bulk insert
    const { rows } = await executeQuery(`
      INSERT INTO credentials (ip, username, password)
      VALUES 
        ('192.168.1.1', 'admin1', 'pass1'),
        ('192.168.1.2', 'admin2', 'pass2'),
        ('192.168.1.3', 'admin3', 'pass3')
      RETURNING id
    `);
    
    expect(rows.length).toBe(3);
    
    // Bulk update
    await executeQuery(`
      UPDATE credentials
      SET password = 'newpass'
      WHERE ip LIKE '192.168.1.%'
    `);
    
    // Verify bulk update
    const { rows: updated } = await executeQuery(`
      SELECT * FROM credentials WHERE ip LIKE '192.168.1.%'
    `);
    
    expect(updated.length).toBe(3);
    expect(updated.every(row => row.password === 'newpass')).toBe(true);
    
    // Bulk delete
    await executeQuery(`
      DELETE FROM credentials
      WHERE ip LIKE '192.168.1.%'
    `);
    
    // Verify bulk delete
    const { rows: afterDelete } = await executeQuery(`
      SELECT * FROM credentials WHERE ip LIKE '192.168.1.%'
    `);
    
    expect(afterDelete.length).toBe(0);
  });
});

describe('Tasks CRUD Operations', () => {
  let vendorUrlId;
  
  // Create a vendor URL before each test
  beforeEach(async () => {
    const { rows } = await executeQuery(`
      INSERT INTO vendor_urls (url)
      VALUES ('https://vpn.example.com')
      RETURNING id
    `);
    
    vendorUrlId = rows[0].id;
  });
  
  it('should create a new task', async () => {
    const { rows } = await executeQuery(`
      INSERT INTO tasks (vpn_type, vendor_url_id, server, status)
      VALUES ('fortinet', $1, 'server1.example.com', 'pending')
      RETURNING *
    `, [vendorUrlId]);
    
    expect(rows.length).toBe(1);
    expect(rows[0].vpn_type).toBe('fortinet');
    expect(rows[0].vendor_url_id).toBe(vendorUrlId);
    expect(rows[0].server).toBe('server1.example.com');
    expect(rows[0].status).toBe('pending');
  });
  
  it('should read tasks', async () => {
    // Insert test data
    await executeQuery(`
      INSERT INTO tasks (vpn_type, vendor_url_id, server, status)
      VALUES 
        ('fortinet', $1, 'server1.example.com', 'pending'),
        ('paloalto', $1, 'server2.example.com', 'running')
    `, [vendorUrlId]);
    
    // Read all tasks
    const { rows } = await executeQuery('SELECT * FROM tasks');
    
    expect(rows.length).toBe(2);
    expect(rows[0].vpn_type).toBe('fortinet');
    expect(rows[1].vpn_type).toBe('paloalto');
  });
  
  it('should update a task', async () => {
    // Insert test data
    const { rows: inserted } = await executeQuery(`
      INSERT INTO tasks (vpn_type, vendor_url_id, server, status)
      VALUES ('fortinet', $1, 'server1.example.com', 'pending')
      RETURNING id
    `, [vendorUrlId]);
    
    const id = inserted[0].id;
    
    // Update task
    await executeQuery(`
      UPDATE tasks
      SET status = 'running', server = 'server2.example.com'
      WHERE id = $1
    `, [id]);
    
    // Verify update
    const { rows } = await executeQuery('SELECT * FROM tasks WHERE id = $1', [id]);
    
    expect(rows.length).toBe(1);
    expect(rows[0].status).toBe('running');
    expect(rows[0].server).toBe('server2.example.com');
    expect(rows[0].vpn_type).toBe('fortinet'); // Unchanged field
  });
  
  it('should delete a task', async () => {
    // Insert test data
    const { rows: inserted } = await executeQuery(`
      INSERT INTO tasks (vpn_type, vendor_url_id, server, status)
      VALUES ('fortinet', $1, 'server1.example.com', 'pending')
      RETURNING id
    `, [vendorUrlId]);
    
    const id = inserted[0].id;
    
    // Delete task
    await executeQuery('DELETE FROM tasks WHERE id = $1', [id]);
    
    // Verify deletion
    const { rows } = await executeQuery('SELECT * FROM tasks WHERE id = $1', [id]);
    
    expect(rows.length).toBe(0);
  });
  
  it('should enforce foreign key constraints', async () => {
    // Try to insert a task with non-existent vendor_url_id
    let error;
    try {
      await executeQuery(`
        INSERT INTO tasks (vpn_type, vendor_url_id, server, status)
        VALUES ('fortinet', 9999, 'server1.example.com', 'pending')
      `);
    } catch (err) {
      error = err;
    }
    
    expect(error).toBeTruthy();
    expect(error.message).toContain('foreign key constraint');
  });
  
  it('should join with vendor_urls table', async () => {
    // Insert test data
    await executeQuery(`
      INSERT INTO tasks (vpn_type, vendor_url_id, server, status)
      VALUES ('fortinet', $1, 'server1.example.com', 'pending')
    `, [vendorUrlId]);
    
    // Join query
    const { rows } = await executeQuery(`
      SELECT t.*, v.url
      FROM tasks t
      JOIN vendor_urls v ON t.vendor_url_id = v.id
    `);
    
    expect(rows.length).toBe(1);
    expect(rows[0].vpn_type).toBe('fortinet');
    expect(rows[0].url).toBe('https://vpn.example.com');
  });
});

describe('Proxies CRUD Operations', () => {
  it('should create a new proxy', async () => {
    const { rows } = await executeQuery(`
      INSERT INTO proxies (address, username, password)
      VALUES ('127.0.0.1:8080', 'proxyuser', 'proxypass')
      RETURNING *
    `);
    
    expect(rows.length).toBe(1);
    expect(rows[0].address).toBe('127.0.0.1:8080');
    expect(rows[0].username).toBe('proxyuser');
    expect(rows[0].password).toBe('proxypass');
  });
  
  it('should read proxies', async () => {
    // Insert test data
    await executeQuery(`
      INSERT INTO proxies (address, username, password)
      VALUES 
        ('127.0.0.1:8080', 'user1', 'pass1'),
        ('127.0.0.1:8081', 'user2', 'pass2')
    `);
    
    // Read all proxies
    const { rows } = await executeQuery('SELECT * FROM proxies');
    
    expect(rows.length).toBe(2);
    expect(rows[0].address).toBe('127.0.0.1:8080');
    expect(rows[1].address).toBe('127.0.0.1:8081');
  });
  
  it('should update a proxy', async () => {
    // Insert test data
    const { rows: inserted } = await executeQuery(`
      INSERT INTO proxies (address, username, password)
      VALUES ('127.0.0.1:8080', 'proxyuser', 'proxypass')
      RETURNING id
    `);
    
    const id = inserted[0].id;
    
    // Update proxy
    await executeQuery(`
      UPDATE proxies
      SET address = '127.0.0.1:9090', password = 'newpass'
      WHERE id = $1
    `, [id]);
    
    // Verify update
    const { rows } = await executeQuery('SELECT * FROM proxies WHERE id = $1', [id]);
    
    expect(rows.length).toBe(1);
    expect(rows[0].address).toBe('127.0.0.1:9090');
    expect(rows[0].password).toBe('newpass');
    expect(rows[0].username).toBe('proxyuser'); // Unchanged field
  });
  
  it('should delete a proxy', async () => {
    // Insert test data
    const { rows: inserted } = await executeQuery(`
      INSERT INTO proxies (address, username, password)
      VALUES ('127.0.0.1:8080', 'proxyuser', 'proxypass')
      RETURNING id
    `);
    
    const id = inserted[0].id;
    
    // Delete proxy
    await executeQuery('DELETE FROM proxies WHERE id = $1', [id]);
    
    // Verify deletion
    const { rows } = await executeQuery('SELECT * FROM proxies WHERE id = $1', [id]);
    
    expect(rows.length).toBe(0);
  });
});

describe('Logs CRUD Operations', () => {
  it('should create a new log entry', async () => {
    const { rows } = await executeQuery(`
      INSERT INTO logs (level, message, source)
      VALUES ('info', 'Test message', 'test')
      RETURNING *
    `);
    
    expect(rows.length).toBe(1);
    expect(rows[0].level).toBe('info');
    expect(rows[0].message).toBe('Test message');
    expect(rows[0].source).toBe('test');
    expect(rows[0].timestamp).toBeTruthy(); // Should have a timestamp
  });
  
  it('should read log entries', async () => {
    // Insert test data
    await executeQuery(`
      INSERT INTO logs (level, message, source)
      VALUES 
        ('info', 'Info message', 'test'),
        ('error', 'Error message', 'test')
    `);
    
    // Read all logs
    const { rows } = await executeQuery('SELECT * FROM logs ORDER BY timestamp DESC');
    
    expect(rows.length).toBe(2);
    expect(rows.some(row => row.level === 'info')).toBe(true);
    expect(rows.some(row => row.level === 'error')).toBe(true);
  });
  
  it('should filter logs by level', async () => {
    // Insert test data
    await executeQuery(`
      INSERT INTO logs (level, message, source)
      VALUES 
        ('info', 'Info message', 'test'),
        ('warning', 'Warning message', 'test'),
        ('error', 'Error message', 'test')
    `);
    
    // Filter by level
    const { rows } = await executeQuery('SELECT * FROM logs WHERE level = $1', ['error']);
    
    expect(rows.length).toBe(1);
    expect(rows[0].level).toBe('error');
    expect(rows[0].message).toBe('Error message');
  });
  
  it('should filter logs by source', async () => {
    // Insert test data
    await executeQuery(`
      INSERT INTO logs (level, message, source)
      VALUES 
        ('info', 'System message', 'system'),
        ('info', 'Database message', 'database')
    `);
    
    // Filter by source
    const { rows } = await executeQuery('SELECT * FROM logs WHERE source = $1', ['system']);
    
    expect(rows.length).toBe(1);
    expect(rows[0].source).toBe('system');
    expect(rows[0].message).toBe('System message');
  });
  
  it('should filter logs by time range', async () => {
    // Insert test data with specific timestamps
    await executeQuery(`
      INSERT INTO logs (level, message, source, timestamp)
      VALUES 
        ('info', 'Old message', 'test', NOW() - INTERVAL '2 days'),
        ('info', 'New message', 'test', NOW())
    `);
    
    // Filter by time range (last day)
    const { rows } = await executeQuery(`
      SELECT * FROM logs 
      WHERE timestamp > NOW() - INTERVAL '1 day'
    `);
    
    expect(rows.length).toBe(1);
    expect(rows[0].message).toBe('New message');
  });
});

describe('Scheduled Tasks CRUD Operations', () => {
  it('should create a new scheduled task', async () => {
    const { rows } = await executeQuery(`
      INSERT INTO scheduled_tasks (
        title, 
        description, 
        task_type, 
        vpn_type, 
        scheduled_at, 
        repeat, 
        servers, 
        active, 
        executed
      )
      VALUES (
        'Test Task', 
        'Test Description', 
        'scan', 
        'fortinet', 
        NOW() + INTERVAL '1 day', 
        'once', 
        '192.168.1.1,192.168.1.2', 
        true, 
        false
      )
      RETURNING *
    `);
    
    expect(rows.length).toBe(1);
    expect(rows[0].title).toBe('Test Task');
    expect(rows[0].task_type).toBe('scan');
    expect(rows[0].vpn_type).toBe('fortinet');
    expect(rows[0].repeat).toBe('once');
    expect(rows[0].servers).toBe('192.168.1.1,192.168.1.2');
    expect(rows[0].active).toBe(true);
    expect(rows[0].executed).toBe(false);
  });
  
  it('should read scheduled tasks', async () => {
    // Insert test data
    await executeQuery(`
      INSERT INTO scheduled_tasks (
        title, task_type, vpn_type, scheduled_at, repeat, servers, active, executed
      )
      VALUES 
        ('Task 1', 'scan', 'fortinet', NOW() + INTERVAL '1 day', 'once', '192.168.1.1', true, false),
        ('Task 2', 'collect', NULL, NOW() + INTERVAL '2 days', 'daily', '192.168.1.2', true, false)
    `);
    
    // Read all tasks
    const { rows } = await executeQuery('SELECT * FROM scheduled_tasks');
    
    expect(rows.length).toBe(2);
    expect(rows[0].title).toBe('Task 1');
    expect(rows[1].title).toBe('Task 2');
  });
  
  it('should update a scheduled task', async () => {
    // Insert test data
    const { rows: inserted } = await executeQuery(`
      INSERT INTO scheduled_tasks (
        title, task_type, vpn_type, scheduled_at, repeat, servers, active, executed
      )
      VALUES (
        'Task 1', 'scan', 'fortinet', NOW() + INTERVAL '1 day', 'once', '192.168.1.1', true, false
      )
      RETURNING id
    `);
    
    const id = inserted[0].id;
    
    // Update task
    await executeQuery(`
      UPDATE scheduled_tasks
      SET title = 'Updated Task', active = false
      WHERE id = $1
    `, [id]);
    
    // Verify update
    const { rows } = await executeQuery('SELECT * FROM scheduled_tasks WHERE id = $1', [id]);
    
    expect(rows.length).toBe(1);
    expect(rows[0].title).toBe('Updated Task');
    expect(rows[0].active).toBe(false);
    expect(rows[0].task_type).toBe('scan'); // Unchanged field
  });
  
  it('should delete a scheduled task', async () => {
    // Insert test data
    const { rows: inserted } = await executeQuery(`
      INSERT INTO scheduled_tasks (
        title, task_type, vpn_type, scheduled_at, repeat, servers, active, executed
      )
      VALUES (
        'Task 1', 'scan', 'fortinet', NOW() + INTERVAL '1 day', 'once', '192.168.1.1', true, false
      )
      RETURNING id
    `);
    
    const id = inserted[0].id;
    
    // Delete task
    await executeQuery('DELETE FROM scheduled_tasks WHERE id = $1', [id]);
    
    // Verify deletion
    const { rows } = await executeQuery('SELECT * FROM scheduled_tasks WHERE id = $1', [id]);
    
    expect(rows.length).toBe(0);
  });
  
  it('should filter tasks by status', async () => {
    // Insert test data
    await executeQuery(`
      INSERT INTO scheduled_tasks (
        title, task_type, vpn_type, scheduled_at, repeat, servers, active, executed
      )
      VALUES 
        ('Active Task', 'scan', 'fortinet', NOW() + INTERVAL '1 day', 'once', '192.168.1.1', true, false),
        ('Inactive Task', 'scan', 'fortinet', NOW() + INTERVAL '1 day', 'once', '192.168.1.1', false, false)
    `);
    
    // Filter by active status
    const { rows } = await executeQuery('SELECT * FROM scheduled_tasks WHERE active = true');
    
    expect(rows.length).toBe(1);
    expect(rows[0].title).toBe('Active Task');
  });
});

describe('Complex Queries and Transactions', () => {
  it('should handle transactions correctly', async () => {
    const client = await pool.connect();
    
    try {
      // Begin transaction
      await client.query('BEGIN');
      
      // Insert vendor URL
      const { rows: vendorRows } = await client.query(`
        INSERT INTO vendor_urls (url)
        VALUES ('https://vpn.example.com')
        RETURNING id
      `);
      
      const vendorId = vendorRows[0].id;
      
      // Insert task
      await client.query(`
        INSERT INTO tasks (vpn_type, vendor_url_id, server, status)
        VALUES ('fortinet', $1, 'server1.example.com', 'pending')
      `, [vendorId]);
      
      // Commit transaction
      await client.query('COMMIT');
      
      // Verify both inserts succeeded
      const { rows: tasks } = await executeQuery(`
        SELECT t.*, v.url
        FROM tasks t
        JOIN vendor_urls v ON t.vendor_url_id = v.id
      `);
      
      expect(tasks.length).toBe(1);
      expect(tasks[0].vpn_type).toBe('fortinet');
      expect(tasks[0].url).toBe('https://vpn.example.com');
      
    } catch (error) {
      // Rollback on error
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });
  
  it('should rollback transactions on error', async () => {
    const client = await pool.connect();
    
    try {
      // Begin transaction
      await client.query('BEGIN');
      
      // Insert vendor URL
      const { rows: vendorRows } = await client.query(`
        INSERT INTO vendor_urls (url)
        VALUES ('https://vpn.example.com')
        RETURNING id
      `);
      
      // Try to insert task with invalid vendor_url_id
      try {
        await client.query(`
          INSERT INTO tasks (vpn_type, vendor_url_id, server, status)
          VALUES ('fortinet', 9999, 'server1.example.com', 'pending')
        `);
      } catch (error) {
        // Expected error due to foreign key constraint
        await client.query('ROLLBACK');
      }
      
      // Verify the vendor URL was not inserted (transaction was rolled back)
      const { rows: vendors } = await executeQuery('SELECT * FROM vendor_urls');
      expect(vendors.length).toBe(0);
      
    } finally {
      // Ensure transaction is rolled back if still active
      try {
        await client.query('ROLLBACK');
      } catch (e) {
        // Ignore error if transaction is already closed
      }
      client.release();
    }
  });
  
  it('should handle complex joins and filters', async () => {
    // Insert test data
    const { rows: vendorRows } = await executeQuery(`
      INSERT INTO vendor_urls (url)
      VALUES 
        ('https://vpn1.example.com'),
        ('https://vpn2.example.com')
      RETURNING id
    `);
    
    const vendorId1 = vendorRows[0].id;
    const vendorId2 = vendorRows[1].id;
    
    await executeQuery(`
      INSERT INTO tasks (vpn_type, vendor_url_id, server, status)
      VALUES 
        ('fortinet', $1, 'server1.example.com', 'pending'),
        ('fortinet', $1, 'server2.example.com', 'running'),
        ('paloalto', $2, 'server3.example.com', 'completed')
    `, [vendorId1, vendorId2]);
    
    // Complex query with joins and filters
    const { rows } = await executeQuery(`
      SELECT t.*, v.url
      FROM tasks t
      JOIN vendor_urls v ON t.vendor_url_id = v.id
      WHERE t.vpn_type = 'fortinet'
      AND t.status IN ('pending', 'running')
      ORDER BY t.status
    `);
    
    expect(rows.length).toBe(2);
    expect(rows[0].status).toBe('pending');
    expect(rows[1].status).toBe('running');
    expect(rows[0].url).toBe('https://vpn1.example.com');
    expect(rows[1].url).toBe('https://vpn1.example.com');
  });
  
  it('should handle pagination correctly', async () => {
    // Insert test data
    await executeQuery(`
      INSERT INTO credentials (ip, username, password)
      VALUES 
        ('192.168.1.1', 'user1', 'pass1'),
        ('192.168.1.2', 'user2', 'pass2'),
        ('192.168.1.3', 'user3', 'pass3'),
        ('192.168.1.4', 'user4', 'pass4'),
        ('192.168.1.5', 'user5', 'pass5')
    `);
    
    // Paginated query - page 1, page size 2
    const { rows: page1 } = await executeQuery(`
      SELECT * FROM credentials
      ORDER BY id
      LIMIT 2 OFFSET 0
    `);
    
    expect(page1.length).toBe(2);
    expect(page1[0].username).toBe('user1');
    expect(page1[1].username).toBe('user2');
    
    // Paginated query - page 2, page size 2
    const { rows: page2 } = await executeQuery(`
      SELECT * FROM credentials
      ORDER BY id
      LIMIT 2 OFFSET 2
    `);
    
    expect(page2.length).toBe(2);
    expect(page2[0].username).toBe('user3');
    expect(page2[1].username).toBe('user4');
    
    // Paginated query - page 3, page size 2
    const { rows: page3 } = await executeQuery(`
      SELECT * FROM credentials
      ORDER BY id
      LIMIT 2 OFFSET 4
    `);
    
    expect(page3.length).toBe(1);
    expect(page3[0].username).toBe('user5');
  });
});

describe('Error Handling', () => {
  it('should handle duplicate key violations', async () => {
    // Insert initial record
    await executeQuery(`
      INSERT INTO vendor_urls (url)
      VALUES ('https://vpn.example.com')
    `);
    
    // Try to insert duplicate
    let error;
    try {
      await executeQuery(`
        INSERT INTO vendor_urls (url)
        VALUES ('https://vpn.example.com')
      `);
    } catch (err) {
      error = err;
    }
    
    expect(error).toBeTruthy();
    expect(error.code).toBe('23505'); // PostgreSQL unique violation error code
  });
  
  it('should handle foreign key violations', async () => {
    // Try to insert task with non-existent vendor_url_id
    let error;
    try {
      await executeQuery(`
        INSERT INTO tasks (vpn_type, vendor_url_id, server, status)
        VALUES ('fortinet', 9999, 'server1.example.com', 'pending')
      `);
    } catch (err) {
      error = err;
    }
    
    expect(error).toBeTruthy();
    expect(error.code).toBe('23503'); // PostgreSQL foreign key violation error code
  });
  
  it('should handle not-null constraint violations', async () => {
    // Try to insert credential with null username
    let error;
    try {
      await executeQuery(`
        INSERT INTO credentials (ip, username, password)
        VALUES ('192.168.1.1', NULL, 'password123')
      `);
    } catch (err) {
      error = err;
    }
    
    expect(error).toBeTruthy();
    expect(error.code).toBe('23502'); // PostgreSQL not-null violation error code
  });
});

describe('Data Integrity', () => {
  it('should maintain referential integrity on delete', async () => {
    // Insert vendor URL
    const { rows: vendorRows } = await executeQuery(`
      INSERT INTO vendor_urls (url)
      VALUES ('https://vpn.example.com')
      RETURNING id
    `);
    
    const vendorId = vendorRows[0].id;
    
    // Insert task referencing vendor URL
    await executeQuery(`
      INSERT INTO tasks (vpn_type, vendor_url_id, server, status)
      VALUES ('fortinet', $1, 'server1.example.com', 'pending')
    `, [vendorId]);
    
    // Try to delete the vendor URL
    let error;
    try {
      await executeQuery(`
        DELETE FROM vendor_urls
        WHERE id = $1
      `, [vendorId]);
    } catch (err) {
      error = err;
    }
    
    // Should fail due to foreign key constraint
    expect(error).toBeTruthy();
    expect(error.code).toBe('23503'); // PostgreSQL foreign key violation error code
  });
  
  it('should allow cascading deletes when configured', async () => {
    // This test would verify cascading deletes if they were configured
    // For now, we'll just check that the foreign key constraint is enforced
    
    // Insert vendor URL
    const { rows: vendorRows } = await executeQuery(`
      INSERT INTO vendor_urls (url)
      VALUES ('https://vpn.example.com')
      RETURNING id
    `);
    
    const vendorId = vendorRows[0].id;
    
    // Insert task referencing vendor URL
    const { rows: taskRows } = await executeQuery(`
      INSERT INTO tasks (vpn_type, vendor_url_id, server, status)
      VALUES ('fortinet', $1, 'server1.example.com', 'pending')
      RETURNING id
    `, [vendorId]);
    
    const taskId = taskRows[0].id;
    
    // Delete the task
    await executeQuery(`
      DELETE FROM tasks
      WHERE id = $1
    `, [taskId]);
    
    // Verify task is deleted
    const { rows: tasksAfterDelete } = await executeQuery(`
      SELECT * FROM tasks WHERE id = $1
    `, [taskId]);
    
    expect(tasksAfterDelete.length).toBe(0);
    
    // Verify vendor URL still exists
    const { rows: vendorsAfterDelete } = await executeQuery(`
      SELECT * FROM vendor_urls WHERE id = $1
    `, [vendorId]);
    
    expect(vendorsAfterDelete.length).toBe(1);
  });
});

describe('Performance Tests', () => {
  it('should handle bulk inserts efficiently', async () => {
    // Generate a large number of credentials
    const values = [];
    for (let i = 1; i <= 100; i++) {
      values.push(`('192.168.1.${i}', 'user${i}', 'pass${i}')`);
    }
    
    // Bulk insert
    const startTime = Date.now();
    
    await executeQuery(`
      INSERT INTO credentials (ip, username, password)
      VALUES ${values.join(',')}
    `);
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    // Verify all records were inserted
    const { rows } = await executeQuery('SELECT COUNT(*) FROM credentials');
    
    expect(parseInt(rows[0].count)).toBe(100);
    
    // Performance assertion - should be fast
    expect(duration).toBeLessThan(1000); // Less than 1 second
  });
  
  it('should use indexes for efficient queries', async () => {
    // Insert test data
    const values = [];
    for (let i = 1; i <= 100; i++) {
      values.push(`('192.168.1.${i}', 'user${i}', 'pass${i}')`);
    }
    
    await executeQuery(`
      INSERT INTO credentials (ip, username, password)
      VALUES ${values.join(',')}
    `);
    
    // Query with WHERE clause on indexed column
    const startTime = Date.now();
    
    const { rows } = await executeQuery(`
      SELECT * FROM credentials
      WHERE ip = '192.168.1.50'
    `);
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    expect(rows.length).toBe(1);
    expect(rows[0].username).toBe('user50');
    
    // Performance assertion - should be fast due to index
    expect(duration).toBeLessThan(100); // Less than 100ms
  });
});