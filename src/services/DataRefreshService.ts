import { useEffect, useRef, useState } from 'react';
import { useAppDispatch } from '../store';
import { addNotification } from '../store/slices/notificationsSlice';
import debounce from 'lodash.debounce';

interface RefreshConfig {
  interval: number; // in milliseconds
  enabled: boolean;
  onRefresh: () => Promise<void>;
  onError?: (error: Error) => void;
  retryCount?: number;
  retryDelay?: number; // in milliseconds
  notifyOnRefresh?: boolean;
  notifyOnError?: boolean;
}

interface RefreshState {
  lastRefresh: Date | null;
  isRefreshing: boolean;
  error: Error | null;
  retries: number;
}

export function useDataRefresh(config: RefreshConfig) {
  const dispatch = useAppDispatch();
  const [state, setState] = useState<RefreshState>({
    lastRefresh: null,
    isRefreshing: false,
    error: null,
    retries: 0
  });
  
  const configRef = useRef(config);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const retryTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  // Update config ref when config changes
  useEffect(() => {
    configRef.current = config;
  }, [config]);
  
  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
      }
    };
  }, []);
  
  // Setup refresh interval
  useEffect(() => {
    if (config.enabled && config.interval > 0) {
      // Clear existing timer
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      
      // Initial refresh
      refresh();
      
      // Setup interval
      timerRef.current = setInterval(() => {
        refresh();
      }, config.interval);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [config.enabled, config.interval]);
  
  // Debounced refresh function to prevent multiple rapid refreshes
  const debouncedRefresh = debounce(async () => {
    if (state.isRefreshing) return;
    
    setState(prev => ({ ...prev, isRefreshing: true, error: null }));
    
    try {
      await configRef.current.onRefresh();
      
      setState(prev => ({ 
        ...prev, 
        lastRefresh: new Date(),
        isRefreshing: false,
        error: null,
        retries: 0
      }));
      
      if (configRef.current.notifyOnRefresh) {
        dispatch(addNotification({
          type: 'info',
          title: 'Data Refreshed',
          message: `Data was successfully refreshed at ${new Date().toLocaleTimeString()}`
        }));
      }
    } catch (error: any) {
      console.error('Error refreshing data:', error);
      
      setState(prev => ({ 
        ...prev, 
        isRefreshing: false,
        error: error,
        retries: prev.retries + 1
      }));
      
      if (configRef.current.notifyOnError) {
        dispatch(addNotification({
          type: 'error',
          title: 'Refresh Error',
          message: `Failed to refresh data: ${error.message}`
        }));
      }
      
      if (configRef.current.onError) {
        configRef.current.onError(error);
      }
      
      // Retry if configured
      const { retryCount = 3, retryDelay = 5000 } = configRef.current;
      
      if (state.retries < retryCount) {
        if (retryTimerRef.current) {
          clearTimeout(retryTimerRef.current);
        }
        
        retryTimerRef.current = setTimeout(() => {
          refresh();
        }, retryDelay);
      }
    }
  }, 300);
  
  const refresh = () => {
    debouncedRefresh();
  };
  
  return {
    ...state,
    refresh,
    stopRefresh: () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    },
    startRefresh: () => {
      if (!timerRef.current && configRef.current.enabled && configRef.current.interval > 0) {
        refresh();
        timerRef.current = setInterval(() => {
          refresh();
        }, configRef.current.interval);
      }
    },
    setInterval: (interval: number) => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      
      if (interval > 0 && configRef.current.enabled) {
        timerRef.current = setInterval(() => {
          refresh();
        }, interval);
      }
    }
  };
}

// Singleton service for managing global refresh settings
class DataRefreshService {
  private static instance: DataRefreshService;
  private refreshIntervals: Record<string, number> = {};
  private refreshCallbacks: Record<string, (() => Promise<void>)[]> = {};
  private timers: Record<string, NodeJS.Timeout> = {};
  private isEnabled: boolean = true;
  
  private constructor() {
    // Initialize default refresh intervals
    this.refreshIntervals = {
      'dashboard': 30000, // 30 seconds
      'servers': 15000,   // 15 seconds
      'monitoring': 5000, // 5 seconds
      'results': 60000,   // 1 minute
      'logs': 10000       // 10 seconds
    };
  }
  
  public static getInstance(): DataRefreshService {
    if (!DataRefreshService.instance) {
      DataRefreshService.instance = new DataRefreshService();
    }
    
    return DataRefreshService.instance;
  }
  
  public registerRefreshCallback(key: string, callback: () => Promise<void>): void {
    if (!this.refreshCallbacks[key]) {
      this.refreshCallbacks[key] = [];
    }
    
    this.refreshCallbacks[key].push(callback);
    
    // Start timer if not already running
    this.startTimer(key);
  }
  
  public unregisterRefreshCallback(key: string, callback: () => Promise<void>): void {
    if (this.refreshCallbacks[key]) {
      this.refreshCallbacks[key] = this.refreshCallbacks[key].filter(cb => cb !== callback);
      
      // Stop timer if no callbacks left
      if (this.refreshCallbacks[key].length === 0) {
        this.stopTimer(key);
      }
    }
  }
  
  public setRefreshInterval(key: string, interval: number): void {
    this.refreshIntervals[key] = interval;
    
    // Restart timer with new interval
    if (this.timers[key]) {
      this.stopTimer(key);
      this.startTimer(key);
    }
  }
  
  public getRefreshInterval(key: string): number {
    return this.refreshIntervals[key] || 30000; // Default to 30 seconds
  }
  
  public enableRefresh(): void {
    this.isEnabled = true;
    
    // Start all timers
    Object.keys(this.refreshCallbacks).forEach(key => {
      if (this.refreshCallbacks[key].length > 0) {
        this.startTimer(key);
      }
    });
  }
  
  public disableRefresh(): void {
    this.isEnabled = false;
    
    // Stop all timers
    Object.keys(this.timers).forEach(key => {
      this.stopTimer(key);
    });
  }
  
  public isRefreshEnabled(): boolean {
    return this.isEnabled;
  }
  
  public refreshNow(key: string): void {
    if (this.refreshCallbacks[key]) {
      this.refreshCallbacks[key].forEach(callback => {
        callback().catch(error => {
          console.error(`Error refreshing ${key}:`, error);
        });
      });
    }
  }
  
  public refreshAll(): void {
    Object.keys(this.refreshCallbacks).forEach(key => {
      this.refreshNow(key);
    });
  }
  
  private startTimer(key: string): void {
    if (this.isEnabled && !this.timers[key] && this.refreshCallbacks[key]?.length > 0) {
      const interval = this.refreshIntervals[key] || 30000;
      
      this.timers[key] = setInterval(() => {
        this.refreshNow(key);
      }, interval);
    }
  }
  
  private stopTimer(key: string): void {
    if (this.timers[key]) {
      clearInterval(this.timers[key]);
      delete this.timers[key];
    }
  }
}

export default DataRefreshService;