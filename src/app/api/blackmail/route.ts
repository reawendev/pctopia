import { blackmailInbox, markThreatsRead, resolveBlackmail, sendBlackmail, sweepBlackmails, targetView } from "@/lib/server/blackmail";
import { loadCompany, loadJournal, view } from "@/lib/server/company";
import { handle, HttpError, requireUser } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

/**
 * GET              → Posta: gelen tehditler, gönderdiğin zarflar, elindeki dosyalar
 * GET ?target=<id> → Profil: o şirkete ait dosyaların ve şantaj seçenekleri
 */
export const GET = handle(async (req) => {
  const user = await requireUser(req);
  const state = await loadCompany(user.id);
  if (!state) throw new HttpError(404, "Önce şirket kurmalısın");
  await sweepBlackmails();
  const target = new URL(req.url).searchParams.get("target");
  if (target) return targetView(state.company.id, target);
  return blackmailInbox(state.company.id);
});

/**
 * { action: "send", target, dossierId, kind: "cash"|"shares"|"tender", amount?, shares?, tenderId?, note? }
 * { action: "pay"|"refuse"|"report"|"counter", id }
 * { action: "read" }
 */
export const POST = handle(async (req) => {
  const user = await requireUser(req);
  const body = await req.json().catch(() => ({}));
  const state = await loadCompany(user.id);
  if (!state) throw new HttpError(404, "Önce şirket kurmalısın");
  const c = state.company;
  const action = String(body.action ?? "");

  if (action === "read") {
    await markThreatsRead(c.id);
    return { ok: true };
  }

  let message: string;
  let extra: object = {};
  if (action === "send") {
    const target = String(body.target ?? "");
    const r = await sendBlackmail({ id: c.id, name: c.name }, target, {
      dossierId: Number(body.dossierId),
      kind: String(body.kind ?? ""),
      amount: Number(body.amount ?? 0),
      shares: Number(body.shares ?? 0),
      tenderId: body.tenderId ? String(body.tenderId) : undefined,
      note: body.note ? String(body.note) : undefined,
    });
    message = r.message;
    extra = { caught: r.caught, view: await targetView(c.id, target) };
  } else {
    const r = await resolveBlackmail(c.id, String(body.id ?? ""), action);
    message = r.message;
    extra = { inbox: await blackmailInbox(c.id) };
  }
  const fresh = (await loadCompany(user.id))!;
  return { ...extra, message, state: view(fresh.company, fresh.owned, fresh.holdings), journal: await loadJournal(c.id) };
});
