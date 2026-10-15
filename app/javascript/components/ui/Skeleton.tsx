export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" data-testid="skeleton" className={`animate-pulse rounded-card bg-subtle ${className}`} />
}
