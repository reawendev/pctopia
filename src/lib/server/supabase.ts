import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

let admin: SupabaseClient | null = null;

/** Service role istemcisi — yalnızca sunucuda. */
export function db(): SupabaseClient {
  if (admin) return admin;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new HttpError(500, "Sunucu ayarları eksik (SUPABASE_SERVICE_ROLE_KEY)");
  admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return admin;
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export type AuthedUser = { id: string; email?: string; isAdmin: boolean };

export async function requireUser(req: Request): Promise<AuthedUser> {
  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) throw new HttpError(401, "Giriş yapmalısın");

  const client = db();
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, "Oturum geçersiz");

  const { data: profile } = await client
    .from("profiles")
    .select("is_admin, banned")
    .eq("id", data.user.id)
    .maybeSingle();

  if (profile?.banned) throw new HttpError(403, "Hesabın askıya alınmış");
  return { id: data.user.id, email: data.user.email, isAdmin: !!profile?.is_admin };
}

export async function requireAdmin(req: Request): Promise<AuthedUser> {
  const user = await requireUser(req);
  if (!user.isAdmin) throw new HttpError(403, "Yönetici yetkisi gerekli");
  return user;
}

/** Route handler sarmalayıcı: hataları JSON'a çevirir. */
export function handle(fn: (req: Request) => Promise<unknown>) {
  return async (req: Request) => {
    try {
      const body = await fn(req);
      return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
    } catch (e: any) {
      const status = e instanceof HttpError ? e.status : 500;
      if (status === 500) console.error(e);
      return NextResponse.json(
        { error: status === 500 && !(e instanceof HttpError) ? "Sunucu hatası" : e.message },
        { status }
      );
    }
  };
}
