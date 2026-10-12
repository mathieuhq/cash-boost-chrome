/**
 * Rerun-style hero: the fact with a number, then the benefit in the brand gradient. One per view.
 * `inline` keeps the accent on the title's line and sizes the text to stay on one line.
 */
export function Headline({
  title,
  accent,
  inline = false,
  children,
}: {
  title: React.ReactNode
  accent?: React.ReactNode
  inline?: boolean
  children?: React.ReactNode
}) {
  return (
    <div>
      <h2 className={`${inline ? "text-display-fit" : "text-display"} text-foreground`}>
        {title}
        {accent && (
          <>
            {inline ? " " : <br />}
            <span className="sx-gradient-text">{accent}</span>
          </>
        )}
      </h2>
      {children && <p className="mt-2 text-[13px] leading-[18px] text-muted-foreground">{children}</p>}
    </div>
  )
}
