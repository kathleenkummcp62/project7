import { useState, useEffect, useRef, useCallback } from 'react';
import toast from 'react-hot-toast';
import { useAppDispatch, useAppSelector } from '../store';
import { setStats, setConnected, setError } from '../store/slices/scannerSlice';
import { setServers, updateServerHistory } from '../store/slices/serversSlice';
import { StatsData, ServerInfo } from '../types';
import { getAuthToken } from '../lib/auth';
import { addNotification } from '../store/slices/notificationsSlice';

interface WebSocketMessage {
  type: string;
  data: any;
  timestamp: number;
}

export function useWebSocket(url?: string) {
  const dispatch = useAppDispatch();
  const [logs, setLogs] = useState<string[]>([]);
  
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5; // Increased for better reconnection chances
  const isConnecting = useRef(false);
  const reconnectBackoff = useRef(1000);
  const pingIntervalRef = useRef<NodeJS.Timeout>();
  const mockDataIntervalRef = useRef<NodeJS.Timeout>();
  const lastPongTimeRef = useRef<number>(Date.now());
  const pingTimeoutRef = useRef<NodeJS.Timeout>();

  // Determine WebSocket URL based on environment
  const getWebSocketUrl = useCallback(() => {
    if (url) return url;
    
    const host = window.location.hostname;
    const port = import.meta.env.VITE_WS_PORT || window.location.port || '3000';
    
    // For WebContainer/StackBlitz environments, use the current host
    if (host.includes('webcontainer') || host.includes('stackblitz') || host.includes('local-credentialless')) {
      // Use the same host as the current page for WebContainer environments
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      return `${protocol}//${window.location.host}/ws`;
    }
    
    // For local development
    if (host === 'localhost' || host.includes('127.0.0.1')) {
      return `ws://${host}:${port}/ws`;
    }
    
    // For production - use secure WebSocket if page is loaded over HTTPS
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${host}:${port}/ws`;
  }, [url]);

  const connect = useCallback(() => {
    if (isConnecting.current || (wsRef.current && wsRef.current.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const wsUrl = getWebSocketUrl();
    console.log('🔌 Attempting WebSocket connection to:', wsUrl);
    
    try {
      isConnecting.current = true;
      
      // Add authentication token to URL if available
      const token = getAuthToken();
      const finalUrl = token ? `${wsUrl}?token=${token}` : wsUrl;
      
      wsRef.current = new WebSocket(finalUrl);
      
      // Set a connection timeout
      const connectionTimeout = setTimeout(() => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.CONNECTING) {
          console.log('🔌 WebSocket connection timeout, closing...');
          wsRef.current.close();
        }
      }, 5000); // 5 second timeout
      
      wsRef.current.onopen = () => {
        clearTimeout(connectionTimeout);
        dispatch(setConnected(true));
        dispatch(setError(null));
        reconnectAttempts.current = 0;
        reconnectBackoff.current = 1000;
        isConnecting.current = false;
        console.log('🔌 WebSocket connected successfully');
        
        // Start ping interval to keep connection alive
        if (pingIntervalRef.current) {
          clearInterval(pingIntervalRef.current);
        }
        
        pingIntervalRef.current = setInterval(() => {
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({
              type: 'ping',
              data: {},
              timestamp: Date.now()
            }));
            
            // Set a timeout to check for pong response
            if (pingTimeoutRef.current) {
              clearTimeout(pingTimeoutRef.current);
            }
            
            pingTimeoutRef.current = setTimeout(() => {
              const timeSinceLastPong = Date.now() - lastPongTimeRef.current;
              if (timeSinceLastPong > 10000) { // 10 seconds without pong
                console.log('🔌 No pong received, reconnecting...');
                if (wsRef.current) {
                  wsRef.current.close();
                }
              }
            }, 5000); // Wait 5 seconds for pong
          }
        }, 30000); // Send ping every 30 seconds
        
        // Show notification only on reconnection
        if (reconnectAttempts.current > 0) {
          toast.success('Reconnected to server');
          dispatch(addNotification({
            type: 'success',
            title: 'Connection Restored',
            message: 'WebSocket connection has been reestablished'
          }));
        }
      };
      
      wsRef.current.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          
          // Update last pong time for any message (treating any message as a pong)
          lastPongTimeRef.current = Date.now();
          
          handleMessage(message);
        } catch (err) {
          console.error('Failed to parse WebSocket message:', err);
        }
      };
      
      wsRef.current.onclose = (event) => {
        clearTimeout(connectionTimeout);
        dispatch(setConnected(false));
        isConnecting.current = false;
        console.log('🔌 WebSocket disconnected:', event.code, event.reason);
        
        // Clear ping interval
        if (pingIntervalRef.current) {
          clearInterval(pingIntervalRef.current);
          pingIntervalRef.current = undefined;
        }
        
        // Clear ping timeout
        if (pingTimeoutRef.current) {
          clearTimeout(pingTimeoutRef.current);
          pingTimeoutRef.current = undefined;
        }
        
        // Auto-reconnect only if not intentionally closed and haven't exceeded max attempts
        if (event.code !== 1000 && reconnectAttempts.current < maxReconnectAttempts) {
          const delay = Math.min(reconnectBackoff.current, 5000); // Cap at 5 seconds
          
          console.log(`🔌 Reconnecting in ${delay}ms (attempt ${reconnectAttempts.current + 1}/${maxReconnectAttempts})`);
          
          if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
          }
          
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectAttempts.current++;
            reconnectBackoff.current *= 1.5; // Exponential backoff
            connect();
          }, delay);
        } else if (reconnectAttempts.current >= maxReconnectAttempts) {
          console.log('🔌 Max reconnection attempts reached, starting mock data');
          dispatch(setError('Server not available. Using demo data.'));
          startMockDataGeneration();
          
          // After a while, try reconnecting again
          setTimeout(() => {
            console.log('🔌 Trying to reconnect after timeout...');
            reconnectAttempts.current = 0;
            reconnectBackoff.current = 1000;
            connect();
          }, 30000); // Try again after 30 seconds
        }
      };
      
      wsRef.current.onerror = (err) => {
        clearTimeout(connectionTimeout);
        isConnecting.current = false;
        console.error('🔌 WebSocket error:', err);
        
        // Immediately start mock data if connection fails
        if (reconnectAttempts.current === 0) {
          console.log('🔌 Initial connection failed, starting mock data immediately');
          dispatch(setError('Server not available. Using demo data.'));
          startMockDataGeneration();
        }
      };
    } catch (err) {
      isConnecting.current = false;
      console.error('🔌 WebSocket creation error:', err);
      dispatch(setError('Failed to create WebSocket connection. Using demo data.'));
      startMockDataGeneration();
    }
  }, [dispatch, getWebSocketUrl]);

  // Generate mock data for demo purposes when server is not available
  const startMockDataGeneration = () => {
    if (mockDataIntervalRef.current) {
      clearInterval(mockDataIntervalRef.current);
    }
    
    console.log('Starting mock data generation for demo purposes');
    
    // Initial mock data - create mutable objects
    let mockStats: StatsData = {
      goods: 120,
      bads: 1500,
      errors: 45,
      offline: 30,
      ipblock: 10,
      processed: 1705,
      rps: 25,
      avg_rps: 22,
      peak_rps: 35,
      threads: 100,
      uptime: 300,
      success_rate: 7.04
    };
    
    let mockServers: ServerInfo[] = [
      {
        ip: '192.0.2.10',
        status: 'online',
        uptime: '2h 15m',
        cpu: 45,
        memory: 67,
        disk: 32,
        speed: '25/s',
        processed: 450,
        goods: 32,
        bads: 398,
        errors: 20,
        progress: 65,
        current_task: 'Scanning Fortinet VPN'
      },
      {
        ip: '192.0.2.11',
        status: 'online',
        uptime: '1h 30m',
        cpu: 38,
        memory: 52,
        disk: 45,
        speed: '22/s',
        processed: 350,
        goods: 25,
        bads: 310,
        errors: 15,
        progress: 42,
        current_task: 'Scanning GlobalProtect VPN'
      }
    ];
    
    // Set initial mock data
    dispatch(setStats({ ...mockStats }));
    dispatch(setServers([...mockServers]));
    dispatch(updateServerHistory([...mockServers]));
    
    // Update mock data periodically
    mockDataIntervalRef.current = setInterval(() => {
      // Create new stats object to avoid mutation
      const newStats = {
        ...mockStats,
        goods: mockStats.goods + Math.floor(Math.random() * 5),
        bads: mockStats.bads + Math.floor(Math.random() * 50),
        errors: mockStats.errors + Math.floor(Math.random() * 2),
        rps: 20 + Math.floor(Math.random() * 15),
        uptime: mockStats.uptime + 5
      };
      
      // Calculate derived values
      newStats.processed = newStats.goods + newStats.bads + newStats.errors + newStats.offline + newStats.ipblock;
      newStats.success_rate = (newStats.goods / newStats.processed) * 100;
      
      // Update the reference for next iteration
      mockStats = newStats;
      
      // Create new servers array with updated values
      const newServers = mockServers.map(server => ({
        ...server,
        cpu: Math.min(95, Math.max(5, server.cpu + (Math.random() * 10 - 5))),
        memory: Math.min(95, Math.max(5, server.memory + (Math.random() * 10 - 5))),
        processed: server.processed + Math.floor(Math.random() * 20),
        goods: server.goods + Math.floor(Math.random() * 3),
        bads: server.bads + Math.floor(Math.random() * 15),
        progress: Math.min(100, server.progress + Math.floor(Math.random() * 5)),
        speed: `${20 + Math.floor(Math.random() * 10)}/s`
      }));
      
      // Update the reference for next iteration
      mockServers = newServers;
      
      dispatch(setStats(newStats));
      dispatch(setServers(newServers));
      dispatch(updateServerHistory(newServers));
    }, 5000);
    
    // Show notification about mock data
    dispatch(addNotification({
      type: 'info',
      title: 'Using Demo Data',
      message: 'Server connection not available. Using demo data for visualization purposes.'
    }));
  };

  const handleMessage = (message: WebSocketMessage) => {
    try {
      switch (message.type) {
        case 'initial_stats':
        case 'stats_update':
          dispatch(setStats(message.data as StatsData));
          break;
          
        case 'server_info': {
          const serverData = message.data as ServerInfo[];
          dispatch(setServers(serverData));
          dispatch(updateServerHistory(serverData));
          break;
        }
          
        case 'logs_data':
          setLogs(message.data as string[]);
          break;
          
        case 'scanner_started':
          console.log('🚀 Scanner started:', message.data);
          toast.success(`Scanner started: ${message.data.vpn_type || message.data.scanner || 'Unknown'}`);
          dispatch(addNotification({
            type: 'success',
            title: 'Scanner Started',
            message: `${message.data.vpn_type || message.data.scanner || 'Unknown'} scanner has been started`
          }));
          break;
          
        case 'scanner_stopped':
          console.log('🛑 Scanner stopped:', message.data);
          toast.success(`Scanner stopped: ${message.data.vpn_type || message.data.scanner || 'Unknown'}`);
          dispatch(addNotification({
            type: 'info',
            title: 'Scanner Stopped',
            message: `${message.data.vpn_type || message.data.scanner || 'Unknown'} scanner has been stopped`
          }));
          break;
          
        case 'scanner_command':
          console.log('📡 Scanner command:', message.data);
          break;
          
        case 'config_update':
          console.log('⚙️ Config updated:', message.data);
          toast.success('Configuration updated');
          break;
          
        case 'error':
          console.error('Server error:', message.data);
          toast.error(message.data.message || 'Server error occurred');
          dispatch(addNotification({
            type: 'error',
            title: 'Server Error',
            message: message.data.message || 'An error occurred on the server'
          }));
          break;
          
        case 'auth_required':
          console.log('🔒 Authentication required');
          break;
          
        case 'auth_success':
          console.log('🔓 Authentication successful');
          toast.success('WebSocket authentication successful');
          break;
          
        case 'auth_failure':
          console.error('🔒 Authentication failed:', message.data);
          toast.error('WebSocket authentication failed');
          dispatch(addNotification({
            type: 'error',
            title: 'Authentication Failed',
            message: 'Failed to authenticate WebSocket connection'
          }));
          break;
          
        case 'pong':
          console.log('📡 Received pong from server');
          lastPongTimeRef.current = Date.now();
          break;
          
        default:
          console.log('📨 Unknown message type:', message.type, message.data);
      }
    } catch (err) {
      console.error('Error handling message:', err);
    }
  };

  useEffect(() => {
    // Small delay before first connection
    const timer = setTimeout(() => {
      connect();
    }, 1000);
    
    return () => {
      clearTimeout(timer);
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
      }
      if (pingTimeoutRef.current) {
        clearTimeout(pingTimeoutRef.current);
      }
      if (mockDataIntervalRef.current) {
        clearInterval(mockDataIntervalRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close(1000);
      }
    };
  }, [connect]);

  const sendMessage = useCallback((type: string, data: any) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      try {
        const message: WebSocketMessage = {
          type,
          data,
          timestamp: Date.now()
        };
        wsRef.current.send(JSON.stringify(message));
        return true;
      } catch (err) {
        console.error('Failed to send message:', err);
        toast.error('Failed to send command to server');
        return false;
      }
    } else {
      console.warn('🔌 WebSocket not connected, simulating command for demo');
      
      // For demo purposes, simulate success
      if (type === 'start_scanner') {
        const vpnType = typeof data === 'string' ? data : data.vpn_type;
        setTimeout(() => {
          dispatch(addNotification({
            type: 'success',
            title: 'Scanner Started (Demo)',
            message: `${vpnType} scanner has been started in demo mode`
          }));
        }, 1000);
      } else if (type === 'stop_scanner') {
        const vpnType = typeof data === 'string' ? data : data.vpn_type;
        setTimeout(() => {
          dispatch(addNotification({
            type: 'info',
            title: 'Scanner Stopped (Demo)',
            message: `${vpnType} scanner has been stopped in demo mode`
          }));
        }, 1000);
      }
      
      return true;
    }
  }, [dispatch]);

  const startScanner = useCallback((vpnType: string) => {
    return sendMessage('start_scanner', { vpn_type: vpnType });
  }, [sendMessage]);

  const stopScanner = useCallback((vpnType: string) => {
    return sendMessage('stop_scanner', { vpn_type: vpnType });
  }, [sendMessage]);

  const getLogs = useCallback(() => {
    return sendMessage('get_logs', { limit: 100 });
  }, [sendMessage]);

  const reconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
    }
    reconnectAttempts.current = 0;
    reconnectBackoff.current = 1000;
    connect();
  }, [connect]);

  return {
    logs,
    sendMessage,
    startScanner,
    stopScanner,
    getLogs,
    reconnect,
    isConnected: useAppSelector(state => state.scanner.isConnected)
  };
}