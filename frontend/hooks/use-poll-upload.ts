"use client";

import { useEffect, useState } from "react";

import { getReportsByUpload, getUpload } from "@/services/api";
import type { ReportRead, UploadItem } from "@/types/api";

const POLL_INTERVAL_MS = 3500;

export function usePollUpload(uploadId: string) {
  const [upload, setUpload] = useState<UploadItem | null>(null);
  const [reports, setReports] = useState<ReportRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timeoutId: number | undefined;

    const scheduleNextPoll = () => {
      if (cancelled) {
        return;
      }
      timeoutId = window.setTimeout(() => {
        void load();
      }, POLL_INTERVAL_MS);
    };

    const load = async () => {
      try {
        const [uploadData, reportData] = await Promise.all([getUpload(uploadId), getReportsByUpload(uploadId)]);
        if (cancelled) {
          return;
        }

        setUpload(uploadData);
        setReports(reportData);
        setError(null);
        setLoading(false);

        if (uploadData.status !== "completed" && uploadData.status !== "error") {
          scheduleNextPoll();
        }
      } catch (err) {
        if (cancelled) {
          return;
        }

        setError(err instanceof Error ? err.message : "Falha ao consultar processo");
        setLoading(false);
        scheduleNextPoll();
      }
    };

    void load();

    return () => {
      cancelled = true;
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [uploadId]);

  return { upload, reports, loading, error, setReports };
}
