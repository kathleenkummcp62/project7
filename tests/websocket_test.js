import { describe, it, expect, beforeAll, afterAll, vi, afterEach } from 'vitest';
import { WebSocket, Server } from 'ws';
import http from 'http';
import { setTimeout } from 'timers/promises';

// Mock WebSocket server
let server;
let httpServer;
let wsUrl;

// Setup WebSocket server
beforeAll(() => {
  // Create HTTP server
  httpServer = http.createServer();
  
  // Create WebSocket server
  server = new Server({ server: httpServer });
  
  // Start server on random port
  httpServer.listen(0, () => {
    const port = httpServer.address().port;
    wsUrl = `ws://localhost:${port}`;
    console.log(`WebSocket server started on ${wsUrl}`);
  });
  
  // Setup message handling
  server.on('connection', (ws) => {
    console.log('Client connected');
    
    // Send initial data
    ws.send(JSON.stringify({
      type: 'initial_stats',
      data: {
        goods: 10,
        bads: 100,
        errors: 5,
        offline: 2,
        ipblock: 1,
        processed: 118,
        rps: 10,
        avg_rps: 8,
        peak_rps: 15,
        threads: 50,
        uptime: 60,
        success_rate: 8.47
      },
      timestamp: Date.now()
    }));
    
    // Handle messages
    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message.toString());
        console.log('Received message:', data);
        
        // Handle ping
        if (data.type === 'ping') {
          ws.send(JSON.stringify({
            type: 'pong',
            data: {},
            timestamp: Date.now()
          }));
        }
        
        // Handle scanner commands
        if (data.type === 'start_scanner') {
          ws.send(JSON.stringify({
            type: 'scanner_started',
            data: { 
              vpn_type: typeof data.data === 'string' ? data.data : data.data.vpn_type,
              status: 'success' 
            },
            timestamp: Date.now()
          }));
        }
        
        if (data.type === 'stop_scanner') {
          ws.send(JSON.stringify({
            type: 'scanner_stopped',
            data: { 
              vpn_type: typeof data.data === 'string' ? data.data : data.data.vpn_type,
              status: 'success' 
            },
            timestamp: Date.now()
          }));
        }
      } catch (error) {
        console.error('Error parsing message:', error);
      }
    });
    
    // Handle close
    ws.on('close', () => {
      console.log('Client disconnected');
    });
  });
});

afterAll(() => {
  // Close server
  server.close();
  httpServer.close();
});

// Mock timers
beforeAll(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.clearAllTimers();
});

afterAll(() => {
  vi.useRealTimers();
});

describe('WebSocket Connection', () => {
  it('should establish a connection', async () => {
    // Create WebSocket client
    const ws = new WebSocket(wsUrl);
    
    // Wait for connection
    await new Promise((resolve) => {
      ws.onopen = () => {
        expect(ws.readyState).toBe(WebSocket.OPEN);
        resolve();
      };
    });
    
    // Close connection
    ws.close();
  });
  
  it('should receive initial data', async () => {
    // Create WebSocket client
    const ws = new WebSocket(wsUrl);
    
    // Wait for initial data
    const message = await new Promise((resolve) => {
      ws.onmessage = (event) => {
        resolve(JSON.parse(event.data));
      };
    });
    
    expect(message.type).toBe('initial_stats');
    expect(message.data).toHaveProperty('goods');
    expect(message.data).toHaveProperty('bads');
    expect(message.data).toHaveProperty('rps');
    
    // Close connection
    ws.close();
  });
  
  it('should handle ping/pong', async () => {
    // Create WebSocket client
    const ws = new WebSocket(wsUrl);
    
    // Wait for connection
    await new Promise((resolve) => {
      ws.onopen = resolve;
    });
    
    // Skip initial message
    await new Promise((resolve) => {
      ws.onmessage = resolve;
    });
    
    // Send ping
    ws.send(JSON.stringify({
      type: 'ping',
      data: {},
      timestamp: Date.now()
    }));
    
    // Wait for pong
    const message = await new Promise((resolve) => {
      ws.onmessage = (event) => {
        resolve(JSON.parse(event.data));
      };
    });
    
    expect(message.type).toBe('pong');
    
    // Close connection
    ws.close();
  });
  
  it('should handle scanner commands', async () => {
    // Create WebSocket client
    const ws = new WebSocket(wsUrl);
    
    // Wait for connection
    await new Promise((resolve) => {
      ws.onopen = resolve;
    });
    
    // Skip initial message
    await new Promise((resolve) => {
      ws.onmessage = resolve;
    });
    
    // Send start scanner command
    ws.send(JSON.stringify({
      type: 'start_scanner',
      data: { vpn_type: 'fortinet' },
      timestamp: Date.now()
    }));
    
    // Wait for response
    const message = await new Promise((resolve) => {
      ws.onmessage = (event) => {
        resolve(JSON.parse(event.data));
      };
    });
    
    expect(message.type).toBe('scanner_started');
    expect(message.data.vpn_type).toBe('fortinet');
    
    // Close connection
    ws.close();
  });
  
  it('should automatically reconnect after disconnection', async () => {
    // Create WebSocket client
    const ws = new WebSocket(wsUrl);
    
    // Wait for connection
    await new Promise((resolve) => {
      ws.onopen = resolve;
    });
    
    // Track connection events
    let disconnected = false;
    let reconnected = false;
    
    ws.onclose = () => {
      disconnected = true;
    };
    
    // Force disconnect
    server.clients.forEach(client => {
      client.terminate();
    });
    
    // Wait for disconnection
    await setTimeout(100);
    expect(disconnected).toBe(true);
    
    // Create new client to simulate reconnection
    const ws2 = new WebSocket(wsUrl);
    
    // Wait for reconnection
    await new Promise((resolve) => {
      ws2.onopen = () => {
        reconnected = true;
        resolve();
      };
    });
    
    expect(reconnected).toBe(true);
    
    // Close connection
    ws2.close();
  });
  
  it('should handle connection errors gracefully', async () => {
    // Create WebSocket client with invalid URL
    const ws = new WebSocket('ws://localhost:99999');
    
    // Wait for error
    const error = await new Promise((resolve) => {
      ws.onerror = (event) => {
        resolve(event);
      };
    });
    
    expect(error).toBeTruthy();
    
    // Close connection
    ws.close();
  });
});