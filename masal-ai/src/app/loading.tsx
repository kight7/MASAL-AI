import { Skeleton } from "@/components/ui/skeleton";

/** Shown while a page loads (for example while a lead's detail page is fetched). */
export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:py-8" aria-busy="true" aria-label="Loading">
      <div className="max-w-4xl space-y-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-72" />
        <Skeleton className="mt-4 h-[52px] w-full" />
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    </div>
  );
}
