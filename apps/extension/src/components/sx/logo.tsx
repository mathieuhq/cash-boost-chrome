import { Gem } from "./gem"

/** The Cash Boost mark: the "CB" monogram on the brand gem tile, as in docs/brand/cash-boost-icon.svg. */
export function Logo({ className }: { className?: string }) {
  return <Gem size="sm" glyph={<Monogram />} className={className} />
}

function Monogram() {
  return (
    <svg viewBox="11 13 72 72" fill="currentColor" fillRule="evenodd" style={{ width: "72%", height: "72%" }}>
      <path d="M54 17V31H36A12 12 0 0 0 36 55H39V66H36A24.5 24.5 0 0 1 36 17Z" />
      <path d="M54 31H69A10 10 0 0 1 79 41V47C79 50 78 52 76 54C80 55 83 59 83 64V69A12 12 0 0 1 71 81H42V42H54ZM54 43H63A4.5 4.5 0 0 1 63 52H54ZM54 62H65A4 4 0 0 1 65 70H54Z" />
    </svg>
  )
}
