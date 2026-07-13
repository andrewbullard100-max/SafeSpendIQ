import { CountryCode, DepositoryAccountSubtype, Products } from "plaid";
import { ApiAuthError, requireApiUser } from "@/lib/api-auth";
import { publicAppUrl } from "@/lib/env";
import { getPlaidClient } from "@/lib/plaid";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const user = await requireApiUser(request);
    const response = await getPlaidClient().linkTokenCreate({
      user: { client_user_id: user.id },
      client_name: "SafeSpend Register",
      products: [Products.Transactions],
      country_codes: [CountryCode.Us],
      language: "en",
      webhook: `${publicAppUrl()}/api/plaid/webhook`,
      transactions: { days_requested: 90 },
      account_filters: {
        depository: { account_subtypes: [DepositoryAccountSubtype.Checking, DepositoryAccountSubtype.CashManagement] },
      },
    });
    return Response.json({ link_token: response.data.link_token });
  } catch (error) {
    const status = error instanceof ApiAuthError ? error.status : 500;
    return Response.json({ error: error instanceof Error ? error.message : "Unable to create Plaid Link token" }, { status });
  }
}
