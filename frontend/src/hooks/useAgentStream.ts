import { useEffect, useRef, useState, useCallback } from 'react';

/**
 * OpenClaw Gateway WebSocket client for real-time agent chat.
 * 
 * This connects directly to the OpenClaw Gateway (not the Mission Control backend)
 * to receive streaming messages from agents as they happen, just like Telegram.
 */

export interface AgentStreamMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  isComplete: boolean;
}

export interface UseAgentStreamOptions {
  sessionKey: string;
  agentId?: string;
  onMessage?: (message: AgentStreamMessage) => void;
  onError?: (error: Error) => void;
}

export interface UseAgentStreamReturn {
  messages: AgentStreamMessage[];
  isConnected: boolean;
  isSending: boolean;
  sendMessage: (text: string) => Promise<void>;
  clearMessages: () => void;
}

// OpenClaw Gateway WebSocket URL
const GATEWAY_WS_URL = 'ws://127.0.0.1:18789';

export function useAgentStream(options: UseAgentStreamOptions): UseAgentStreamReturn {
  const { sessionKey, agentId = 'overmind-coordinator', onMessage, onError } = options;
  
  const [messages, setMessages] = useState<AgentStreamMessage[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isSending, setIsSending] = useState(false);
  
  const wsRef = useRef<WebSocket | null>(null);
  const pendingMessageRef = useRef<string | null>(null);
  const messageIdRef = useRef(0);

  // Generate unique message ID
  const generateId = useCallback(() => {
    messageIdRef.current += 1;
    return `msg-${Date.now()}-${messageIdRef.current}`;
  }, []);

  // Connect to Gateway WebSocket
  useEffect(() => {
    const ws = new WebSocket(GATEWAY_WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      console.log('[AgentStream] Connected to Gateway');
      
      // Send auth/init message if needed
      ws.send(JSON.stringify({
        type: 'subscribe',
        channel: 'agent',
        sessionKey,
        agentId,
      }));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        handleGatewayMessage(data);
      } catch (err) {
        console.error('[AgentStream] Failed to parse message:', err);
      }
    };

    ws.onerror = (err) => {
      console.error('[AgentStream] WebSocket error:', err);
      onError?.(new Error('WebSocket connection failed'));
      setIsConnected(false);
    };

    ws.onclose = () => {
      setIsConnected(false);
      console.log('[AgentStream] Disconnected from Gateway');
    };

    return () => {
      ws.close();
    };
  }, [sessionKey, agentId, onError]);

  // Handle incoming Gateway messages
  const handleGatewayMessage = useCallback((data: unknown) => {
    if (typeof data !== 'object' || data === null) return;
    
    const msg = data as Record<string, unknown>;
    const msgType = msg.type as string;

    switch (msgType) {
      case 'agent:message': {
        // Received a message from the agent
        const content = msg.content as string;
        const isPartial = msg.partial === true;
        
        const newMessage: AgentStreamMessage = {
          id: generateId(),
          role: 'assistant',
          content,
          timestamp: new Date().toISOString(),
          isComplete: !isPartial,
        };
        
        setMessages((prev) => {
          // If this is a partial update to the last message, update it
          const last = prev[prev.length - 1];
          if (isPartial && last && last.role === 'assistant' && !last.isComplete) {
            return [...prev.slice(0, -1), { ...last, content }];
          }
          return [...prev, newMessage];
        });
        
        onMessage?.(newMessage);
        break;
      }
      
      case 'agent:complete': {
        // Agent turn completed
        setIsSending(false);
        pendingMessageRef.current = null;
        break;
      }
      
      case 'agent:error': {
        const errorMsg = msg.error as string;
        onError?.(new Error(errorMsg));
        setIsSending(false);
        pendingMessageRef.current = null;
        break;
      }
      
      default:
        console.log('[AgentStream] Unknown message type:', msgType);
    }
  }, [generateId, onMessage, onError]);

  // Send message to agent
  const sendMessage = useCallback(async (text: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      throw new Error('Not connected to Gateway');
    }

    setIsSending(true);
    pendingMessageRef.current = text;

    // Add user message immediately
    const userMessage: AgentStreamMessage = {
      id: generateId(),
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
      isComplete: true,
    };
    
    setMessages((prev) => [...prev, userMessage]);

    // Send to Gateway
    wsRef.current.send(JSON.stringify({
      type: 'agent:send',
      sessionKey,
      agentId,
      message: text,
    }));
  }, [sessionKey, agentId, generateId]);

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  return {
    messages,
    isConnected,
    isSending,
    sendMessage,
    clearMessages,
  };
}
