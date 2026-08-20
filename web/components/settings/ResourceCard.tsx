import { LuCircleCheck, LuCircleX, LuTimer } from "react-icons/lu";
import type { ResourceStatus } from "@/lib/api";

export function ResourceCard({ resource }: { resource: ResourceStatus }) {
  return (
    <div
      className={`flex items-start gap-3 rounded-lg border p-4 transition ${
        resource.ok
          ? "border-emerald-200 bg-emerald-50/50 dark:border-emerald-900 dark:bg-emerald-950/20"
          : "border-red-200 bg-red-50/50 dark:border-red-900 dark:bg-red-950/20"
      }`}
    >
      <div
        className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full ${
          resource.ok
            ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-900 dark:text-emerald-400"
            : "bg-red-100 text-red-600 dark:bg-red-900 dark:text-red-400"
        }`}
      >
        {resource.ok ? <LuCircleCheck className="size-4" /> : <LuCircleX className="size-4" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
            {resource.label}
          </span>
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
              resource.ok
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300"
                : "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300"
            }`}
          >
            {resource.ok ? "Online" : "Offline"}
          </span>
        </div>
        {resource.detail && (
          <p className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400" title={resource.detail}>
            {resource.detail}
          </p>
        )}
        {resource.latencyMs !== undefined && (
          <div className="mt-1.5 flex items-center gap-1 text-[11px] text-zinc-400">
            <LuTimer className="size-3" />
            {resource.latencyMs}ms
          </div>
        )}
      </div>
    </div>
  );
}
