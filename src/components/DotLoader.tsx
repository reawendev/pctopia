/** İki noktanın yer değiştirdiği küçük yükleme göstergesi. Rengi `currentColor`dan alır. */
export function DotLoader({ className = "" }: { className?: string }) {
  return (
    <span className={`dot-loader ${className}`} aria-hidden="true">
      <span />
      <span />
    </span>
  );
}
