import { ChevronRightIcon } from "lucide-react";
import { cn } from "~/lib/utils";

function WavyRule() {
  return (
    <span aria-hidden className="min-w-6 flex-1">
      <svg
        className="h-1 w-full overflow-visible opacity-50"
        preserveAspectRatio="none"
        viewBox="0 0 48 6"
      >
        <path
          d="M0 3C2 2.25 4 2.25 6 3S10 3.75 12 3S16 2.25 18 3S22 3.75 24 3S28 2.25 30 3S34 3.75 36 3S40 2.25 42 3S46 3.75 48 3"
          fill="none"
          stroke="currentColor"
          strokeWidth="0.75"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </span>
  );
}

export function HiddenProjectsShelfLabel({
  count,
  expanded,
}: {
  count: number;
  expanded: boolean;
}) {
  return (
    <>
      <WavyRule />
      <span className="flex shrink-0 items-center gap-1">
        <span>hidden ({count})</span>
        <ChevronRightIcon
          aria-hidden
          className={cn("size-3 transition-transform", expanded && "rotate-90")}
        />
      </span>
      <WavyRule />
    </>
  );
}
