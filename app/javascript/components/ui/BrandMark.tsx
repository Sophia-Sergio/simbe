/** The committed brand mark (`public/brand/simbe-mark.png`); never recolored or tiled. */
export function BrandMark({ size = 28, className = "" }: { size?: number; className?: string }) {
  return (
    <img
      src="/brand/simbe-mark.png"
      alt="Simbe"
      width={size}
      height={size}
      className={`block shrink-0 ${className}`}
    />
  )
}
