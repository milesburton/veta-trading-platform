const userConnections = new Map<string, Set<WebSocket>>();
const anonymousClients = new Set<WebSocket>();

const MAX_BUFFERED_AMOUNT = 1_048_576;

export function addUserSocket(userId: string, ws: WebSocket): void {
  let sockets = userConnections.get(userId);
  if (!sockets) {
    sockets = new Set();
    userConnections.set(userId, sockets);
  }
  sockets.add(ws);
}

export function addAnonymousSocket(ws: WebSocket): void {
  anonymousClients.add(ws);
}

export function removeSocket(userId: string | null, ws: WebSocket): void {
  if (userId) {
    const sockets = userConnections.get(userId);
    if (sockets) {
      sockets.delete(ws);
      if (sockets.size === 0) userConnections.delete(userId);
    }
  } else {
    anonymousClients.delete(ws);
  }
}

export function totalConnections(): number {
  let n = anonymousClients.size;
  for (const s of userConnections.values()) n += s.size;
  return n;
}

function sendTo(ws: WebSocket, frame: string): void {
  try {
    if (ws.readyState !== WebSocket.OPEN) return;
    if (ws.bufferedAmount > MAX_BUFFERED_AMOUNT) return;
    ws.send(frame);
  } catch { /* ignore */ }
}

export function broadcastAll(msg: unknown): void {
  const frame = JSON.stringify(msg);
  for (const ws of anonymousClients) sendTo(ws, frame);
  for (const sockets of userConnections.values()) {
    for (const ws of sockets) sendTo(ws, frame);
  }
}

export function broadcastToUser(userId: string, msg: unknown): void {
  const sockets = userConnections.get(userId);
  if (!sockets) return;
  const frame = JSON.stringify(msg);
  for (const ws of sockets) sendTo(ws, frame);
}

export function broadcastToRoles(_roles: string[], msg: unknown): void {
  broadcastAll(msg);
}
