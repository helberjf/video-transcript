import type { ProcessingStatus } from "@/types/api";

const styles: Record<ProcessingStatus, string> = {
  uploaded: "border-sand/30 bg-sand/10 text-sand",
  converting: "border-amber-300/30 bg-amber-300/10 text-amber-200",
  transcribing: "border-sky-300/30 bg-sky-300/10 text-sky-200",
  generating_report: "border-indigo-300/30 bg-indigo-300/10 text-indigo-200",
  completed: "border-emerald-300/30 bg-emerald-300/10 text-emerald-200",
  error: "border-rose-300/30 bg-rose-300/10 text-rose-200",
};

export function StatusBadge({ status }: { status: ProcessingStatus }) {
  return <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${styles[status]}`}>{status}</span>;
}
