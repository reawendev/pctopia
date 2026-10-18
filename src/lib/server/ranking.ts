// Sektör sıralaması: lider tablosu, şampiyonlar ve profil sayfası aynı hesabı kullanır.
// Sıralama kurucunun payına düşen değere göredir: halka arz eden şirketin değerinin bir kısmı hissedarlarındır.

import { equityBoard } from "./equity";

export type Ranked = {
  id: string;
  ownerId: string;
  rank: number;
  name: string;
  founderName: string;
  logo: unknown;
  logoUrl: string | null;
  portraitUrl: string | null;
  character: unknown;
  createdAt: string;
  reputation: number;
  /** kurucunun payına düşen (sıralama ölçütü) */
  netWorth: number;
  /** şirketin toplam değeri */
  companyValue: number;
  ownership: number;
};

export async function rankCompanies(): Promise<Ranked[]> {
  const { rows } = await equityBoard(true);
  return Array.from(rows.values())
    .map((r) => ({
      id: r.id,
      ownerId: r.ownerId,
      rank: 0,
      name: r.name,
      founderName: r.founderName,
      logo: r.logo,
      logoUrl: r.logoUrl,
      portraitUrl: r.portraitUrl,
      character: r.character,
      createdAt: r.createdAt,
      reputation: r.reputation,
      netWorth: r.ownerWorth,
      companyValue: r.value,
      ownership: r.founder / r.total,
    }))
    .sort((a, b) => b.netWorth - a.netWorth)
    .map((c, i) => ({ ...c, rank: i + 1 }));
}
