/** Rerun's depth stack: the top card is sharp, up to two ghosts peek out behind, scaled and blurred. */
export function CardStack({ behind = 0, children }: { behind?: number; children: React.ReactNode }) {
  const depth = Math.min(Math.max(behind, 0), 2)
  return (
    <div className="relative" style={{ paddingTop: depth ? 20 : 0 }}>
      {depth > 1 && (
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-5 bottom-0 -translate-y-5 scale-90 rounded-xl bg-card opacity-40 shadow-card blur-[1.5px]"
        />
      )}
      {depth > 0 && (
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-5 bottom-0 -translate-y-2.5 scale-95 rounded-xl bg-card opacity-70 shadow-card blur-[0.5px]"
        />
      )}
      <div className="relative">{children}</div>
    </div>
  )
}
