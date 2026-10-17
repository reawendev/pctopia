import type { CharacterSpec, LogoSpec } from "@/lib/game/config";
import { Avatar } from "./Avatar";
import { Logo } from "./Logo";

/** PixelLab portresi varsa onu, yoksa SVG karakteri gösterir. */
export function Portrait({ spec, url, size, className = "" }: { spec: CharacterSpec; url?: string | null; size: number; className?: string }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} width={size} height={size} alt="Kurucu portresi" className={`pixel block bg-raised object-cover ${className}`} style={{ width: size, height: size }} />;
  }
  return (
    <div className={className} style={{ width: size, height: size }}>
      <Avatar spec={spec} size={size} />
    </div>
  );
}

/** PixelLab arması varsa onu, yoksa SVG logoyu gösterir. */
export function CompanyMark({ spec, url, size, title }: { spec: LogoSpec; url?: string | null; size: number; title?: string }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} width={size} height={size} alt={title ?? "Şirket arması"} className="pixel block shrink-0 object-contain" style={{ width: size, height: size }} />;
  }
  return <Logo spec={spec} size={size} title={title} />;
}
