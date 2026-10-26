/** İçerik gelene kadar, geleceği şekilde gri bloklarla yer tutar; metin ekran okuyucuya söylenir. */
export function SkeletonCard({ label, rows = 4, className = "" }: { label: string; rows?: number; className?: string }) {
  return (
    <div className={`card overflow-hidden ${className}`} role="status" aria-busy="true">
      <span className="sr-only">{label}</span>
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <span className="skeleton h-4 w-32" />
        <span className="skeleton h-3 w-16" />
      </div>
      <ul className="divide-y divide-line" aria-hidden>
        {Array.from({ length: rows }, (_, i) => (
          <li key={i} className="flex items-center gap-3 px-4 py-3">
            <span className="skeleton h-9 w-9 shrink-0 rounded-sm" />
            <span className="min-w-0 flex-1 space-y-2">
              <span className="skeleton block h-3.5" style={{ width: `${70 - ((i * 13) % 30)}%` }} />
              <span className="skeleton block h-3" style={{ width: `${45 - ((i * 7) % 20)}%` }} />
            </span>
            <span className="skeleton h-8 w-16 shrink-0" />
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SkeletonLines({ label, rows = 4 }: { label: string; rows?: number }) {
  return (
    <div className="space-y-3 px-4 py-4" role="status" aria-busy="true">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, i) => (
        <span key={i} aria-hidden className="skeleton block h-3.5" style={{ width: `${88 - ((i * 17) % 40)}%` }} />
      ))}
    </div>
  );
}
