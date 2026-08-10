import { logger } from "@veta/logger";
import type { OrderNew } from "@veta/schemas/orders";

export interface AuthIdentity {
  user: { id: string; role: string };
  limits: unknown;
}

export type OrderAck = OrderNew & { userId: string; userRole: string };

export interface OrderRejected {
  reason: string;
  clientOrderId?: string | null;
}

export interface OrderEvent {
  topic: string;
  data: Record<string, unknown>;
}

export interface GatewaySocketHandlers {
  onAuthIdentity?: (identity: AuthIdentity) => void;
  onAuthError?: (reason: string) => void;
  onOrderAck?: (ack: OrderAck) => void;
  onOrderRejected?: (rejection: OrderRejected) => void;
  onOrderEvent?: (event: OrderEvent) => void;
  onClose?: () => void;
}

interface ServerFrame {
  event?: string;
  data?: Record<string, unknown>;
  topic?: string;
  message?: string;
}

export class GatewaySocket {
  #url: string;
  #handlers: GatewaySocketHandlers;
  #socket: WebSocket | undefined;
  #ready = false;
  #reconnectDelayMs = 2000;
  #closedByUser = false;

  constructor(url: string, handlers: GatewaySocketHandlers) {
    this.#url = url;
    this.#handlers = handlers;
  }

  connect(): void {
    this.#closedByUser = false;
    const socket = new WebSocket(this.#url);
    this.#socket = socket;

    socket.onopen = () => {
      logger.info("synthetic-trader: gateway socket connected");
      this.#ready = true;
      this.#reconnectDelayMs = 2000;
    };

    socket.onmessage = (event) => {
      this.#handleFrame(event.data as string);
    };

    socket.onclose = () => {
      this.#ready = false;
      this.#handlers.onClose?.();
      if (this.#closedByUser) return;
      logger.warn(`synthetic-trader: gateway socket closed, reconnecting in ${this.#reconnectDelayMs}ms`);
      setTimeout(() => this.connect(), this.#reconnectDelayMs);
      this.#reconnectDelayMs = Math.min(this.#reconnectDelayMs * 2, 30_000);
    };

    socket.onerror = () => {
      logger.warn("synthetic-trader: gateway socket error");
    };
  }

  close(): void {
    this.#closedByUser = true;
    this.#socket?.close();
  }

  get isReady(): boolean {
    return this.#ready;
  }

  authenticate(token: string): void {
    this.#send({ type: "authenticate", payload: { token } });
  }

  submitOrder(order: OrderNew): void {
    this.#send({ type: "submitOrder", payload: order });
  }

  #send(msg: { type: string; payload: Record<string, unknown> }): void {
    if (!this.#ready || !this.#socket) {
      logger.warn("synthetic-trader: dropped message, socket not ready", { type: msg.type });
      return;
    }
    this.#socket.send(JSON.stringify(msg));
  }

  #handleFrame(raw: string): void {
    let frame: ServerFrame;
    try {
      frame = JSON.parse(raw);
    } catch {
      return;
    }
    switch (frame.event) {
      case "authIdentity":
        this.#handlers.onAuthIdentity?.(frame.data as unknown as AuthIdentity);
        break;
      case "authError":
        this.#handlers.onAuthError?.((frame.data?.reason as string) ?? "unknown auth error");
        break;
      case "orderAck":
        this.#handlers.onOrderAck?.(frame.data as unknown as OrderAck);
        break;
      case "orderRejected":
        this.#handlers.onOrderRejected?.(frame.data as unknown as OrderRejected);
        break;
      case "orderEvent":
        this.#handlers.onOrderEvent?.({
          topic: frame.topic ?? "",
          data: frame.data ?? {},
        });
        break;
      case "error":
        logger.warn("synthetic-trader: gateway error frame", { message: frame.message });
        break;
      default:
        break;
    }
  }
}
