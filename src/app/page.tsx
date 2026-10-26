"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { Logo } from "@/components/Logo";
import { DEFAULT_LOGO } from "@/lib/game/config";
import { formatCompactMoney } from "@/lib/game/economy";
import { STAGES } from "@/lib/game/stages";
import { Splash } from "@/components/Splash";
import { DotLoader } from "@/components/DotLoader";

export default function Home() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [checked, setChecked] = useState(false); // oturum kontrolü bitti, giriş formu gösterilecek
  const [revealed, setRevealed] = useState(false);
  const [entering, setEntering] = useState(false); // giriş başarılı, oyuna geçiliyor

  useEffect(() => {
    try {
      supabaseBrowser()
        .auth.getSession()
        .then(({ data }) => {
          // Oturum varsa perde açılmadan oyuna geç; /oyun aynı perdeyle devam eder
          if (data.session) router.replace("/oyun");
          else setChecked(true);
        })
        .catch(() => setChecked(true));
    } catch (e: any) {
      setError(e.message);
      setChecked(true);
    }
  }, [router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const sb = supabaseBrowser();
      if (mode === "signup") {
        const { data, error } = await sb.auth.signUp({ email, password });
        if (error) throw error;
        if (!data.session) {
          setNotice("Kayıt alındı. E-postana gelen doğrulama bağlantısına tıkla, sonra giriş yap.");
          setMode("login");
          setBusy(false);
          return;
        }
      } else {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      await new Promise((r) => setTimeout(r, 450)); // hap animasyonu görünsün
      setEntering(true);
      router.replace("/oyun");
      return;
    } catch (err: any) {
      setError(translate(err.message));
      setBusy(false);
    }
  }

  return (
    <>
    <Splash done={checked} onLift={() => setRevealed(true)} />
    {entering && <Splash done={false} appear="fade" />}
    <main className="mx-auto grid min-h-screen max-w-5xl items-center gap-10 px-5 py-10 lg:grid-cols-[1fr_380px] lg:gap-16">
      <section className="reveal" data-on={revealed ? "" : undefined}>
        <div className="mb-10 flex items-center gap-3" style={{ "--i": 0 } as React.CSSProperties}>
          <Logo spec={DEFAULT_LOGO} size={36} />
          <span className="font-serif text-xl font-semibold">PCTopia</span>
        </div>

        <h1 className="heading max-w-xl text-4xl leading-[1.1] sm:text-5xl" style={{ "--i": 1 } as React.CSSProperties}>Bir garajda, ikinci el bir bilgisayarla başla.</h1>
        <p className="mt-5 max-w-lg text-lg leading-relaxed text-mute" style={{ "--i": 2 } as React.CSSProperties}>
          Şirketini kur, donanım parkını büyüt, borsada yatırım yap. Arkadaşlarınla aynı piyasada, sektörün zirvesi için yarış.
        </p>

        <ol className="mt-10 hidden max-w-md sm:block" aria-label="Kariyer basamakları" style={{ "--i": 3 } as React.CSSProperties}>
          {STAGES.map((s, i) => (
            <li key={s.level} className="flex items-baseline gap-4 border-l border-line py-1.5 pl-5" style={{ opacity: 1 - i * 0.1 }}>
              <span className={`font-serif ${i === 0 ? "text-amber" : "text-white"}`}>{s.title}</span>
              <span className="num text-sm text-mute">{s.from === 0 ? "başlangıç" : `${formatCompactMoney(s.from)} net değer`}</span>
            </li>
          ))}
        </ol>
      </section>

      <form onSubmit={submit} className="card reveal space-y-4 p-6" data-on={revealed ? "" : undefined}>
        <div className="grid grid-cols-2 border-b border-line text-sm" style={{ "--i": 2 } as React.CSSProperties}>
          {(["login", "signup"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              aria-pressed={mode === m}
              className={`-mb-px border-b-2 pb-2.5 font-medium ${mode === m ? "border-amber text-white" : "border-transparent text-mute"}`}
            >
              {m === "login" ? "Giriş yap" : "Yeni hesap"}
            </button>
          ))}
        </div>

        <div style={{ "--i": 3 } as React.CSSProperties}>
          <label className="label" htmlFor="email">E-posta</label>
          <input id="email" className="input" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div style={{ "--i": 4 } as React.CSSProperties}>
          <label className="label" htmlFor="pw">Şifre</label>
          <input
            id="pw"
            className="input"
            type="password"
            required
            minLength={6}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        {error && <p className="text-sm text-loss" role="alert">{error}</p>}
        {notice && <p className="text-sm text-gain">{notice}</p>}

        <div style={{ "--i": 5 } as React.CSSProperties}>
          <button className="btn btn-primary btn-morph" disabled={busy} data-busy={busy ? "" : undefined} aria-busy={busy}>
            <span className="btn-label">{mode === "login" ? "Giriş yap" : "Hesap oluştur"}</span>
            <span className="btn-dots">
              <DotLoader />
            </span>
            {busy && <span className="sr-only">Bekle…</span>}
          </button>
        </div>
      </form>
    </main>
    </>
  );
}

function translate(msg: string) {
  if (/invalid login/i.test(msg)) return "E-posta veya şifre hatalı.";
  if (/already registered/i.test(msg)) return "Bu e-posta zaten kayıtlı. Giriş yap sekmesini kullan.";
  if (/at least 6/i.test(msg)) return "Şifre en az 6 karakter olmalı.";
  if (/not confirmed/i.test(msg)) return "E-postanı henüz doğrulamadın.";
  return msg;
}
