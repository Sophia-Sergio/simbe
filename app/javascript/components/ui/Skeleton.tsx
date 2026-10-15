export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      data-testid="skeleton"
      className={`animate-pulse motion-reduce:animate-none rounded-card bg-subtle ${className}`}
    />
  )
}
