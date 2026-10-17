// PixelLab API istemcisi — YALNIZCA SUNUCU. Anahtar PIXELLAB_API_KEY ortam değişkeninden okunur.
// API: https://api.pixellab.ai/v1  (resmi JS SDK @pixellab-code/pixellab ile aynı uç noktalar)

import { HttpError } from "./supabase";

const BASE = process.env.PIXELLAB_BASE_URL || "https://api.pixellab.ai/v1";

export function pixellabEnabled(): boolean {
  return !!process.env.PIXELLAB_API_KEY;
}

function headers() {
  const key = process.env.PIXELLAB_API_KEY;
  if (!key) throw new HttpError(503, "Görsel üretimi kapalı (PIXELLAB_API_KEY tanımlı değil)");
  return { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
}

async function fail(res: Response): Promise<never> {
  let detail = "";
  try {
    const j = await res.json();
    detail = typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail ?? j);
  } catch {}
  console.error("PixelLab hata", res.status, detail);
  if (res.status === 401) throw new HttpError(502, "PixelLab anahtarı geçersiz");
  if (res.status === 402) throw new HttpError(502, "PixelLab bakiyesi yetersiz");
  if (res.status === 429) throw new HttpError(429, "Görsel servisi yoğun, biraz sonra tekrar dene");
  throw new HttpError(502, `Görsel üretilemedi (PixelLab ${res.status})`);
}

async function call(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (e) {
    console.error("PixelLab bağlantı hatası", e);
    throw new HttpError(502, "PixelLab'e bağlanılamadı");
  }
}

export type PixfluxInput = {
  description: string;
  negative?: string;
  width: number;
  height: number;
  noBackground?: boolean;
  seed?: number;
};

/** Senkron pixflux üretimi. PNG baytlarını ve maliyeti (USD) döndürür. */
export async function generatePixflux(input: PixfluxInput): Promise<{ png: Buffer; usd: number | null }> {
  const res = await call(`${BASE}/generate-image-pixflux`, {
    method: "POST",
    headers: headers(),
    cache: "no-store",
    body: JSON.stringify({
      description: input.description,
      negative_description: input.negative ?? "",
      image_size: { width: input.width, height: input.height },
      text_guidance_scale: 8,
      outline: "selective outline",
      shading: "detailed shading",
      detail: "highly detailed",
      no_background: !!input.noBackground,
      seed: input.seed ?? Math.floor(Math.random() * 1_000_000),
    }),
  });
  if (!res.ok) await fail(res);
  const data = await res.json();
  const b64: string | undefined = data?.image?.base64;
  if (!b64) throw new HttpError(502, "PixelLab beklenmeyen yanıt döndürdü");
  const clean = b64.includes(",") ? b64.slice(b64.indexOf(",") + 1) : b64;
  return { png: Buffer.from(clean, "base64"), usd: typeof data?.usage?.usd === "number" ? data.usage.usd : null };
}

export async function getBalance(): Promise<number> {
  const res = await call(`${BASE}/balance`, { headers: headers(), cache: "no-store" });
  if (!res.ok) await fail(res);
  const data = await res.json();
  return Number(data?.usd ?? 0);
}
