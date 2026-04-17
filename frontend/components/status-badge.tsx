import type { ProcessingStatus } from "@/types/api";

const styles: Record<ProcessingStatus, string> = {
  uploaded: "bg-sand/70 text-ink",
  converting: "bg-amber-100 text-amber-900",
  transcribing: "bg-sky-100 text-sky-900",
  generating_report: "bg-violet-100 text-violet-900",
  completed: "bg-emerald-100 text-emerald-900",
  error: "bg-rose-100 text-rose-900",
};

export function StatusBadge({ status }: { status: ProcessingStatus }) {
  return <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${styles[status]}`}>{status}</span>;
}
