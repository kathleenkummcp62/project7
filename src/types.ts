export interface StatsData {
  goods: number;
  bads: number;
  errors: number;
  offline: number;
  ipblock: number;
  processed: number;
  rps: number;
  avg_rps: number;
  peak_rps: number;
  threads: number;
  uptime: number;
  success_rate: number;
}

export interface ServerInfo {
  ip: string;
  status: string;
  uptime: string;
  cpu: number;
  memory: number;
  disk: number;
  speed: string;
  processed: number;
  goods: number;
  bads: number;
  errors: number;
  progress: number;
  current_task?: string;
}

export interface ServerHistoryPoint {
  ip: string;
  cpu: number;
  memory: number;
  rps: number;
  timestamp: number;
}

export interface CredentialPair {
  id?: number;
  ip: string;
  username: string;
  password: string;
}

export interface ProxySetting {
  id?: number;
  host: string;
  port: number;
  username?: string;
  password?: string;
}

export interface VendorURL {
  id: number;
  url: string;
  description?: string;
}

export interface Attachment {
  name: string;
  size: number;
  type: string;
  lastModified: string;
}

export interface Task {
  id: string;
  name: string;
  description: string;
  vpnType: string;
  priority: 'low' | 'medium' | 'high';
  deadline: string;
  targets: string[];
  workers: string[];
  status: 'pending' | 'running' | 'completed' | 'error';
  createdAt: string;
  attachments: Attachment[];
}
