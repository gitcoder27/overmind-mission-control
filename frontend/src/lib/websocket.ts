export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'reconnecting';

export interface WebSocketManagerOptions {
  url: string;
  onMessage: (data: unknown) => void;
  onStatusChange: (status: ConnectionStatus) => void;
  reconnectIntervalMs?: number;
  maxReconnectMs?: number;
}

export class WebSocketManager {
  private ws: WebSocket | null = null;
  private url: string;
  private onMessage: (data: unknown) => void;
  private onStatusChange: (status: ConnectionStatus) => void;
  private reconnectInterval: number;
  private maxReconnect: number;
  private currentDelay: number;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private alive = false;
  private _status: ConnectionStatus = 'disconnected';

  constructor(options: WebSocketManagerOptions) {
    this.url = options.url;
    this.onMessage = options.onMessage;
    this.onStatusChange = options.onStatusChange;
    this.reconnectInterval = options.reconnectIntervalMs ?? 1000;
    this.maxReconnect = options.maxReconnectMs ?? 30000;
    this.currentDelay = this.reconnectInterval;
  }

  get status(): ConnectionStatus {
    return this._status;
  }

  private setStatus(s: ConnectionStatus): void {
    this._status = s;
    this.onStatusChange(s);
  }

  connect(): void {
    if (this.ws) {
      this.ws.close();
    }
    this.setStatus('connecting');
    try {
      this.ws = new WebSocket(this.url);
    } catch {
      this.setStatus('disconnected');
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.setStatus('connected');
      this.currentDelay = this.reconnectInterval;
      this.alive = true;
      this.startPing();
    };

    this.ws.onmessage = (event: MessageEvent) => {
      this.alive = true;
      try {
        const data: unknown = JSON.parse(event.data as string);
        if (typeof data === 'object' && data !== null && 'type' in data && (data as Record<string, unknown>).type === 'PONG') {
          return;
        }
        this.onMessage(data);
      } catch {
        // ignore parse errors
      }
    };

    this.ws.onclose = () => {
      this.stopPing();
      if (this._status !== 'disconnected') {
        this.setStatus('reconnecting');
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = () => {
      this.ws?.close();
    };
  }

  disconnect(): void {
    this.setStatus('disconnected');
    this.stopPing();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  private scheduleReconnect(): void {
    if (this._status === 'disconnected') return;
    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, this.currentDelay);
    this.currentDelay = Math.min(this.currentDelay * 1.5, this.maxReconnect);
  }

  private startPing(): void {
    this.pingTimer = setInterval(() => {
      if (!this.alive) {
        this.ws?.close();
        return;
      }
      this.alive = false;
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'PING' }));
      }
    }, 15000);
  }

  private stopPing(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }
}
