export interface ManagedContainer {
  containerId: string;
  teardown(): Promise<void>;
}

export interface ManagedPostgres extends ManagedContainer {
  url: string;
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

export interface ManagedRedpanda extends ManagedContainer {
  brokers: string;
  host: string;
  port: number;
}
