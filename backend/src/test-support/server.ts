import type { AddressInfo } from "node:net";
import type { ServerType } from "@hono/node-server";

export async function listeningPort(server: ServerType): Promise<number> {
  if (!server.listening) {
    await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  }
  return (server.address() as AddressInfo).port;
}

export async function closeServer(server: ServerType): Promise<void> {
  if (!server.listening) return;
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
