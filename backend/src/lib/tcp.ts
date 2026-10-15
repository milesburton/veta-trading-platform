import { connect, type Socket } from "node:net";

export function connectTcp(host: string, port: number): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = connect({ host, port }, () => {
      socket.off("error", reject);
      resolve(socket);
    });
    socket.once("error", reject);
  });
}
