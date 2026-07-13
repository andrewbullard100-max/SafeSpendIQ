import "server-only";

import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";
import { requireEnv } from "./env";

let plaidClient: PlaidApi | null = null;

export function getPlaidClient(): PlaidApi {
  if (plaidClient) return plaidClient;
  const environment = process.env.PLAID_ENV ?? "sandbox";
  const basePath = environment === "production"
    ? PlaidEnvironments.production
    : environment === "development"
      ? PlaidEnvironments.development
      : PlaidEnvironments.sandbox;

  plaidClient = new PlaidApi(new Configuration({
    basePath,
    baseOptions: {
      headers: {
        "PLAID-CLIENT-ID": requireEnv("PLAID_CLIENT_ID"),
        "PLAID-SECRET": requireEnv("PLAID_SECRET"),
      },
    },
  }));
  return plaidClient;
}
