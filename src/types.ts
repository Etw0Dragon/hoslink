import type { Context } from "hono";
export interface Identity {
  ID: number;
  AuthID: string;
  Name: string;
  Email: string;
  Verified: boolean;
  Admin: boolean;
  TwoFactor: boolean;
  EstID: number;
  EstName: string;
  Status: string;
  Role: string;
}
export type Env = { Variables: { user: Identity | null; csrf: string } };
export type AppContext = Context<Env>;
