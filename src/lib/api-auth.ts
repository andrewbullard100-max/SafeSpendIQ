import "server-only";

import type { User } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "./supabase-admin";

export async function requireApiUser(request: Request): Promise<User> {
  const authorization = request.headers.get("authorization");
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;
  if (!token) throw new ApiAuthError("Missing authentication token", 401);

  const { data, error } = await getSupabaseAdmin().auth.getUser(token);
  if (error || !data.user) throw new ApiAuthError("Invalid or expired session", 401);
  return data.user;
}

export class ApiAuthError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}
