import type {
  DashboardStats,
  ReportRenamePayload,
  ReportRead,
  ReportTemplate,
  SettingsRead,
  StartProcessingPayload,
  TranscriptionRead,
  UploadCreateResponse,
  UploadItem,
  UploadListResponse,
} from "@/types/api";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000/api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { detail?: string } | null;
    throw new Error(data?.detail ?? "Falha na comunicação com o backend");
  }

  return (await response.json()) as T;
}

export function uploadFile(file: File, onProgress: (value: number) => void): Promise<UploadCreateResponse> {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append("file", file);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_BASE}/uploads`);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText) as UploadCreateResponse);
        return;
      }
      try {
        const data = JSON.parse(xhr.responseText) as { detail?: string };
        reject(new Error(data.detail ?? "Falha no upload"));
      } catch {
        reject(new Error("Falha no upload"));
      }
    };
    xhr.onerror = () => reject(new Error("Erro de rede durante o upload"));
    xhr.send(formData);
  });
}

export function startProcessing(uploadId: string, payload: StartProcessingPayload) {
  return request<{ id: string; status: string; message: string }>(`/process/${uploadId}`, {
    method: "POST",
    body: JSON.stringify({
      language: payload.language,
      force_reprocess: payload.force_reprocess ?? false,
      use_api: payload.use_api ?? true,
      whisper_model: payload.whisper_model ?? null,
      transcription_provider: payload.transcription_provider ?? null,
    }),
  });
}

export function getDashboardStats() {
  return request<DashboardStats>("/dashboard/stats");
}

export function getUploads() {
  return request<UploadListResponse>("/uploads");
}

export function getUpload(uploadId: string) {
  return request<UploadItem>(`/uploads/${uploadId}`);
}

export function deleteUpload(uploadId: string) {
  return request<{ success: boolean }>(`/uploads/${uploadId}`, { method: "DELETE" });
}

export function getHistory() {
  return request<UploadItem[]>("/history");
}

export function getTranscription(uploadId: string) {
  return request<TranscriptionRead>(`/transcriptions/${uploadId}`);
}

export function getTemplates() {
  return request<ReportTemplate[]>("/report-templates");
}

export function createTemplate(payload: Record<string, unknown>) {
  return request<ReportTemplate>("/report-templates", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateTemplate(templateId: string, payload: Record<string, unknown>) {
  return request<ReportTemplate>(`/report-templates/${templateId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function deleteTemplate(templateId: string) {
  return request<{ success: boolean }>(`/report-templates/${templateId}`, { method: "DELETE" });
}

export function duplicateTemplate(templateId: string) {
  return request<ReportTemplate>(`/report-templates/${templateId}/duplicate`, { method: "POST" });
}

export function getReportsByUpload(uploadId: string) {
  return request<ReportRead[]>(`/uploads/${uploadId}/reports`);
}

export function generateReport(payload: Record<string, unknown>) {
  return request<ReportRead>("/reports/generate", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateReport(reportId: string, payload: ReportRenamePayload) {
  return request<ReportRead>(`/reports/${reportId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function getSettings() {
  return request<SettingsRead>("/settings");
}

export function updateSettings(payload: Record<string, unknown>) {
  return request<SettingsRead>("/settings", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}
