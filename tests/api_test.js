import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import cors from 'cors';
import { Pool } from 'pg';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Test database configuration
const testDbConfig = {
  host: 'localhost',
  port: 5435, // Use a different port for API tests
  user: 'postgres',
  password: 'postgres',
  database: 'vpn_api_test_db'
};

// Initialize test database pool
let pool;
let app;
let server;

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

async function initializeSchema() {
  // Create tables
  await executeQuery(`
    CREATE TABLE IF NOT EXISTS vendor_urls (
      id SERIAL PRIMARY KEY,
      url TEXT NOT NULL
    )
  `);
  
  await executeQuery(`
    CREATE TABLE IF NOT EXISTS credentials (
      id SERIAL PRIMARY KEY,
      ip TEXT NOT NULL,
      username TEXT NOT NULL,
      password TEXT NOT NULL
    )
  `);
  
  await executeQuery(`
    CREATE TABLE IF NOT EXISTS proxies (
      id SERIAL PRIMARY KEY,
      address TEXT NOT NULL,
      username TEXT,
      password TEXT
    )
  `);
  
  await executeQuery(`
    CREATE TABLE IF NOT EXISTS tasks (
      id SERIAL PRIMARY KEY,
      vpn_type TEXT,
      vendor_url_id INT REFERENCES vendor_urls(id),
      server TEXT,
      status TEXT
    )
  `);
  
  await executeQuery(`
    CREATE TABLE IF NOT EXISTS logs (
      id SERIAL PRIMARY KEY,
      timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      level TEXT,
      message TEXT,
      source TEXT
    )
  `);
  
  await executeQuery(`
    CREATE TABLE IF NOT EXISTS scheduled_tasks (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      task_type TEXT NOT NULL,
      vpn_type TEXT,
      scheduled_at TIMESTAMPTZ NOT NULL,
      repeat TEXT NOT NULL,
      servers TEXT,
      active BOOLEAN DEFAULT TRUE,
      executed BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

// Setup mock API server
function setupApiServer() {
  app = express();
  
  // Middleware
  app.use(cors());
  app.use(express.json());
  
  // API endpoints
  
  // Credentials endpoints
  app.get('/api/credentials', async (req, res) => {
    try {
      const { rows } = await executeQuery('SELECT * FROM credentials');
      res.json({
        success: true,
        data: rows,
        meta: {
          currentPage: 1,
          totalPages: 1,
          totalItems: rows.length,
          pageSize: 10
        }
      });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });
  
  app.post('/api/credentials', async (req, res) => {
    try {
      const { ip, username, password } = req.body;
      
      if (!ip || !username || !password) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: ip, username, password'
        });
      }
      
      const { rows } = await executeQuery(
        'INSERT INTO credentials (ip, username, password) VALUES ($1, $2, $3) RETURNING *',
        [ip, username, password]
      );
      
      res.json({ success: true, data: rows[0] });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });
  
  app.put('/api/credentials/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { ip, username, password } = req.body;
      
      if (!ip && !username && !password) {
        return res.status(400).json({
          success: false,
          error: 'No fields to update'
        });
      }
      
      // Build dynamic update query
      const updates = [];
      const values = [];
      let paramIndex = 1;
      
      if (ip) {
        updates.push(`ip = $${paramIndex++}`);
        values.push(ip);
      }
      
      if (username) {
        updates.push(`username = $${paramIndex++}`);
        values.push(username);
      }
      
      if (password) {
        updates.push(`password = $${paramIndex++}`);
        values.push(password);
      }
      
      values.push(id);
      
      const { rows } = await executeQuery(
        `UPDATE credentials SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
        values
      );
      
      if (rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Credential not found'
        });
      }
      
      res.json({ success: true, data: rows[0] });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });
  
  app.delete('/api/credentials/:id', async (req, res) => {
    try {
      const { id } = req.params;
      
      const { rowCount } = await executeQuery(
        'DELETE FROM credentials WHERE id = $1',
        [id]
      );
      
      if (rowCount === 0) {
        return res.status(404).json({
          success: false,
          error: 'Credential not found'
        });
      }
      
      res.json({ success: true, data: { id } });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });
  
  app.post('/api/credentials/bulk_delete', async (req, res) => {
    try {
      const { ids } = req.body;
      
      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Invalid or empty ids array'
        });
      }
      
      const { rowCount } = await executeQuery(
        'DELETE FROM credentials WHERE id = ANY($1::int[])',
        [ids]
      );
      
      res.json({ success: true, data: { count: rowCount } });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });
  
  // Tasks endpoints
  app.get('/api/tasks', async (req, res) => {
    try {
      const { rows } = await executeQuery(`
        SELECT t.*, v.url
        FROM tasks t
        LEFT JOIN vendor_urls v ON t.vendor_url_id = v.id
      `);
      
      res.json({ success: true, data: rows });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });
  
  app.post('/api/tasks', async (req, res) => {
    try {
      const { vpn_type, vendor_url_id, server, status } = req.body;
      
      if (!vpn_type) {
        return res.status(400).json({
          success: false,
          error: 'Missing required field: vpn_type'
        });
      }
      
      const { rows } = await executeQuery(
        'INSERT INTO tasks (vpn_type, vendor_url_id, server, status) VALUES ($1, $2, $3, $4) RETURNING *',
        [vpn_type, vendor_url_id, server, status]
      );
      
      res.json({ success: true, data: rows[0] });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });
  
  // Vendor URLs endpoints
  app.get('/api/vendor_urls', async (req, res) => {
    try {
      const { rows } = await executeQuery('SELECT * FROM vendor_urls');
      res.json({ success: true, data: rows });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });
  
  app.post('/api/vendor_urls', async (req, res) => {
    try {
      const { url } = req.body;
      
      if (!url) {
        return res.status(400).json({
          success: false,
          error: 'Missing required field: url'
        });
      }
      
      const { rows } = await executeQuery(
        'INSERT INTO vendor_urls (url) VALUES ($1) RETURNING *',
        [url]
      );
      
      res.json({ success: true, data: rows[0] });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });
  
  // Logs endpoints
  app.get('/api/logs', async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit) : 100;
      
      const { rows } = await executeQuery(
        'SELECT * FROM logs ORDER BY timestamp DESC LIMIT $1',
        [limit]
      );
      
      res.json({ success: true, data: rows });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });
  
  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({
      success: true,
      data: {
        status: 'ok',
        timestamp: new Date().toISOString(),
        service: 'api-test-server'
      }
    });
  });
  
  // Stats endpoint (mock)
  app.get('/api/stats', (req, res) => {
    res.json({
      success: true,
      data: {
        goods: 89,
        bads: 1161,
        errors: 23,
        offline: 15,
        ipblock: 5,
        processed: 1250,
        rps: 42,
        avg_rps: 38,
        peak_rps: 65,
        threads: 100,
        uptime: 1800,
        success_rate: 7.12
      }
    });
  });
  
  // Start server
  server = app.listen(0); // Use any available port
  
  return server;
}

// Test suite setup
beforeAll(async () => {
  // Create test database
  await createTestDatabase();
  
  // Connect to test database
  pool = new Pool(testDbConfig);
  
  // Initialize schema
  await initializeSchema();
  
  // Setup API server
  setupApiServer();
});

afterAll(async () => {
  // Close server
  if (server) {
    server.close();
  }
  
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
      scheduled_tasks
    RESTART IDENTITY CASCADE;
  `);
  
  // Re-enable foreign key checks
  await executeQuery('SET session_replication_role = DEFAULT;');
});

// Test suites
describe('API Endpoints', () => {
  describe('Health Check', () => {
    it('should return 200 OK for health check', async () => {
      const response = await request(app).get('/api/health');
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('ok');
    });
  });
  
  describe('Credentials API', () => {
    it('should create a new credential', async () => {
      const credential = {
        ip: '192.168.1.1',
        username: 'admin',
        password: 'password123'
      };
      
      const response = await request(app)
        .post('/api/credentials')
        .send(credential);
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.ip).toBe(credential.ip);
      expect(response.body.data.username).toBe(credential.username);
      expect(response.body.data.password).toBe(credential.password);
      expect(response.body.data.id).toBeTruthy();
    });
    
    it('should return 400 for invalid credential data', async () => {
      const invalidCredential = {
        ip: '192.168.1.1',
        // Missing username and password
      };
      
      const response = await request(app)
        .post('/api/credentials')
        .send(invalidCredential);
      
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Missing required fields');
    });
    
    it('should get all credentials', async () => {
      // Insert test data
      await executeQuery(`
        INSERT INTO credentials (ip, username, password)
        VALUES 
          ('192.168.1.1', 'user1', 'pass1'),
          ('192.168.1.2', 'user2', 'pass2')
      `);
      
      const response = await request(app).get('/api/credentials');
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(2);
      expect(response.body.meta.totalItems).toBe(2);
      expect(response.body.meta.currentPage).toBe(1);
    });
    
    it('should update a credential', async () => {
      // Insert test data
      const { rows } = await executeQuery(`
        INSERT INTO credentials (ip, username, password)
        VALUES ('192.168.1.1', 'admin', 'password123')
        RETURNING id
      `);
      
      const id = rows[0].id;
      
      const updatedCredential = {
        username: 'newadmin',
        password: 'newpassword'
      };
      
      const response = await request(app)
        .put(`/api/credentials/${id}`)
        .send(updatedCredential);
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.username).toBe(updatedCredential.username);
      expect(response.body.data.password).toBe(updatedCredential.password);
      expect(response.body.data.ip).toBe('192.168.1.1'); // Unchanged
    });
    
    it('should delete a credential', async () => {
      // Insert test data
      const { rows } = await executeQuery(`
        INSERT INTO credentials (ip, username, password)
        VALUES ('192.168.1.1', 'admin', 'password123')
        RETURNING id
      `);
      
      const id = rows[0].id;
      
      const response = await request(app).delete(`/api/credentials/${id}`);
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      
      // Verify deletion
      const { rows: afterDelete } = await executeQuery(
        'SELECT * FROM credentials WHERE id = $1',
        [id]
      );
      
      expect(afterDelete.length).toBe(0);
    });
    
    it('should handle bulk delete', async () => {
      // Insert test data
      await executeQuery(`
        INSERT INTO credentials (ip, username, password)
        VALUES 
          ('192.168.1.1', 'user1', 'pass1'),
          ('192.168.1.2', 'user2', 'pass2'),
          ('192.168.1.3', 'user3', 'pass3')
      `);
      
      // Get IDs
      const { rows } = await executeQuery('SELECT id FROM credentials');
      const ids = rows.map(row => row.id);
      
      const response = await request(app)
        .post('/api/credentials/bulk_delete')
        .send({ ids });
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.count).toBe(3);
      
      // Verify deletion
      const { rows: afterDelete } = await executeQuery('SELECT * FROM credentials');
      expect(afterDelete.length).toBe(0);
    });
  });
  
  describe('Tasks API', () => {
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
      const task = {
        vpn_type: 'fortinet',
        vendor_url_id: vendorUrlId,
        server: 'server1.example.com',
        status: 'pending'
      };
      
      const response = await request(app)
        .post('/api/tasks')
        .send(task);
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.vpn_type).toBe(task.vpn_type);
      expect(response.body.data.vendor_url_id).toBe(task.vendor_url_id);
      expect(response.body.data.server).toBe(task.server);
      expect(response.body.data.status).toBe(task.status);
    });
    
    it('should return 400 for invalid task data', async () => {
      const invalidTask = {
        // Missing vpn_type
        vendor_url_id: vendorUrlId,
        server: 'server1.example.com'
      };
      
      const response = await request(app)
        .post('/api/tasks')
        .send(invalidTask);
      
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Missing required field');
    });
    
    it('should get all tasks with vendor URLs', async () => {
      // Insert test data
      await executeQuery(`
        INSERT INTO tasks (vpn_type, vendor_url_id, server, status)
        VALUES 
          ('fortinet', $1, 'server1.example.com', 'pending'),
          ('paloalto', $1, 'server2.example.com', 'running')
      `, [vendorUrlId]);
      
      const response = await request(app).get('/api/tasks');
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(2);
      expect(response.body.data[0].url).toBe('https://vpn.example.com');
      expect(response.body.data[1].url).toBe('https://vpn.example.com');
    });
  });
  
  describe('Vendor URLs API', () => {
    it('should create a new vendor URL', async () => {
      const vendorUrl = {
        url: 'https://vpn.example.com'
      };
      
      const response = await request(app)
        .post('/api/vendor_urls')
        .send(vendorUrl);
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.url).toBe(vendorUrl.url);
    });
    
    it('should return 400 for invalid vendor URL data', async () => {
      const invalidVendorUrl = {
        // Missing url
      };
      
      const response = await request(app)
        .post('/api/vendor_urls')
        .send(invalidVendorUrl);
      
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Missing required field');
    });
    
    it('should get all vendor URLs', async () => {
      // Insert test data
      await executeQuery(`
        INSERT INTO vendor_urls (url)
        VALUES 
          ('https://vpn1.example.com'),
          ('https://vpn2.example.com')
      `);
      
      const response = await request(app).get('/api/vendor_urls');
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(2);
    });
  });
  
  describe('Logs API', () => {
    it('should get logs with limit', async () => {
      // Insert test data
      await executeQuery(`
        INSERT INTO logs (level, message, source)
        VALUES 
          ('info', 'Info message 1', 'test'),
          ('info', 'Info message 2', 'test'),
          ('error', 'Error message', 'test')
      `);
      
      const response = await request(app).get('/api/logs?limit=2');
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(2);
    });
  });
  
  describe('Stats API', () => {
    it('should return mock stats data', async () => {
      const response = await request(app).get('/api/stats');
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('goods');
      expect(response.body.data).toHaveProperty('bads');
      expect(response.body.data).toHaveProperty('rps');
      expect(response.body.data).toHaveProperty('success_rate');
    });
  });
});

describe('API Error Handling', () => {
  it('should handle database errors gracefully', async () => {
    // Force a database error by querying a non-existent table
    const originalQuery = pool.query;
    pool.query = async () => {
      throw new Error('Database error');
    };
    
    const response = await request(app).get('/api/credentials');
    
    expect(response.status).toBe(500);
    expect(response.body.success).toBe(false);
    expect(response.body.error).toBeTruthy();
    
    // Restore original query function
    pool.query = originalQuery;
  });
  
  it('should handle invalid JSON in request body', async () => {
    const response = await request(app)
      .post('/api/credentials')
      .set('Content-Type', 'application/json')
      .send('{"invalid json');
    
    expect(response.status).toBe(400);
  });
  
  it('should handle not found resources', async () => {
    const response = await request(app).get('/api/nonexistent');
    
    expect(response.status).toBe(404);
  });
});

describe('API Performance', () => {
  it('should handle multiple concurrent requests', async () => {
    // Create 10 concurrent requests
    const requests = [];
    for (let i = 0; i < 10; i++) {
      requests.push(request(app).get('/api/health'));
    }
    
    const responses = await Promise.all(requests);
    
    // All requests should succeed
    responses.forEach(response => {
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });
});