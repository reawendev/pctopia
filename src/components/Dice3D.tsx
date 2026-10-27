"use client";

import { useEffect, useRef, useState } from "react";

export const DICE_MS = 1500;

// Yüzlerin küp üzerindeki yeri (karşılıklı yüzlerin toplamı 7) ve o yüzü öne getiren dönüş
const FACES: { n: number; place: string }[] = [
  { n: 1, place: "rotateY(0deg)" },
  { n: 6, place: "rotateY(180deg)" },
  { n: 3, place: "rotateY(90deg)" },
  { n: 4, place: "rotateY(-90deg)" },
  { n: 2, place: "rotateX(90deg)" },
  { n: 5, place: "rotateX(-90deg)" },
];
const SHOW: Record<number, [number, number]> = { 1: [0, 0], 6: [0, 180], 3: [0, -90], 4: [0, 90], 2: [-90, 0], 5: [90, 0] };

// 3×3 ızgarada noktaların yerleri
const PIPS: Record<number, number[]> = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };

function Die({ value, roll, size, delay }: { value: number; roll: number; size: number; delay: number }) {
  // Her atışta ileri doğru birkaç tam tur ekle; son açı istenen yüzü öne getirir
  const turns = useRef({ x: 0, y: 0 });
  const [rot, setRot] = useState<[number, number]>(SHOW[value] ?? [0, 0]);
  useEffect(() => {
    if (!roll) return;
    const [tx, ty] = SHOW[value];
    turns.current = { x: turns.current.x + 2 + Math.floor(Math.random() * 2), y: turns.current.y + 2 + Math.floor(Math.random() * 2) };
    setRot([tx + turns.current.x * 360, ty + turns.current.y * 360]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roll]);
  const half = size / 2;
  return (
    <div className="dice-hop" data-roll={roll ? roll % 2 : undefined} style={{ width: size, height: size, perspective: size * 5, animationDelay: `${delay}ms` }}>
      <div
        className="relative h-full w-full"
        style={{
          transformStyle: "preserve-3d",
          transform: `rotateX(${rot[0]}deg) rotateY(${rot[1]}deg)`,
          transition: roll ? `transform ${DICE_MS - delay}ms cubic-bezier(0.18, 0.9, 0.28, 1) ${delay}ms` : "none",
        }}
      >
        {FACES.map((f) => (
          <div
            key={f.n}
            className="absolute inset-0 grid grid-cols-3 grid-rows-3 rounded-[18%] border border-[#C9BFA8] bg-[#F3EEE2] p-[14%] shadow-[inset_0_0_8px_rgba(0,0,0,0.18)]"
            style={{ transform: `${f.place} translateZ(${half}px)`, backfaceVisibility: "hidden" }}
          >
            {Array.from({ length: 9 }, (_, i) => (
              <span key={i} className="flex items-center justify-center">
                {PIPS[f.n].includes(i) && <span className={`block rounded-full ${f.n === 1 ? "bg-[#A8322A]" : "bg-[#16233A]"}`} style={{ width: size * 0.16, height: size * 0.16 }} />}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** İki 3B zar. `roll` her yeni atışta artar; zarlar yuvarlanıp `values` yüzleriyle durur. */
export function Dice3D({ values, roll, size = 52 }: { values: [number, number]; roll: number; size?: number }) {
  return (
    <div className="flex items-center justify-center gap-5 py-2" aria-label={roll ? `Zarlar ${values[0]} ve ${values[1]}` : "Zarlar"} role="img">
      <Die value={values[0]} roll={roll} size={size} delay={0} />
      <Die value={values[1]} roll={roll} size={size} delay={90} />
    </div>
  );
}
