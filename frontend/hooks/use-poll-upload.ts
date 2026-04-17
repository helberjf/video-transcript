"use client";

import { useEffect, useState } from "react";

import { getReportsByUpload, getUpload } from "@/services/api";
import type { ReportRead, UploadItem } from "@/types/api";

export function usePollUpload(uploadId: string) {
  const [upload, setUpload] = useState<UploadItem | null>(null);
  const [reports, setReports] = useState<ReportRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let intervalId: number | undefined;

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
        if (uploadData.status === "completed" || uploadData.status === "error") {
          if (intervalId) {
            window.clearInterval(intervalId);
          }
        }
      } catch (err) {
        if (cancelled) {
          return;
        }
        setError(err instanceof Error ? err.message : "Falha ao consultar processo");
        setLoading(false);
      }
    };

    void load();
    intervalId = window.setInterval(() => {
      void load();
    }, 3500);

    return () => {
      cancelled = true;
      if (intervalId) {
        window.clearInterval(intervalId);
      }
    };
  }, [uploadId]);

  return { upload, reports, loading, error, setReports };
}
