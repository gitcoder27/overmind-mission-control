/** Type definitions for the system metrics WebSocket payload. */

export interface CpuFrequency {
  current: number;
  min: number;
  max: number;
}

export interface CpuMetrics {
  percent: number;
  perCore: number[];
  coreCount: number;
  loadAvg: number[];
  frequency: CpuFrequency | null;
}

export interface SwapMetrics {
  total: number;
  used: number;
  percent: number;
}

export interface MemoryMetrics {
  total: number;
  available: number;
  used: number;
  percent: number;
  swap: SwapMetrics;
}

export interface DiskPartition {
  device: string;
  mountpoint: string;
  fstype: string;
  total: number;
  used: number;
  free: number;
  percent: number;
}

export interface DiskIO {
  readBytes: number;
  writeBytes: number;
  readCount: number;
  writeCount: number;
}

export interface DiskMetrics {
  partitions: DiskPartition[];
  io: DiskIO;
}

export interface NetworkMetrics {
  bytesSent: number;
  bytesRecv: number;
  packetsSent: number;
  packetsRecv: number;
  connections: number;
}

export interface SystemInfo {
  hostname: string;
  platform: string;
  platformVersion: string;
  kernelVersion: string;
  architecture: string;
  uptime: number;
  bootTime: string;
  pythonVersion: string;
}

export interface ProcessInfo {
  pid: number;
  name: string;
  cpu: number;
  memory: number;
}

export interface ProcessMetrics {
  total: number;
  running: number;
  sleeping: number;
  zombie: number;
  topCpu: ProcessInfo[];
  topMemory: ProcessInfo[];
}

export interface TemperatureReading {
  label: string;
  current: number;
  high: number | null;
  critical: number | null;
}

export interface SystemMetricsSnapshot {
  type: 'metrics';
  timestamp: string;
  cpu: CpuMetrics;
  memory: MemoryMetrics;
  disk: DiskMetrics;
  network: NetworkMetrics;
  system: SystemInfo;
  processes: ProcessMetrics;
  temperatures: TemperatureReading[];
}
