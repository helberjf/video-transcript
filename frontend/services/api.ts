import type {
  DashboardStats,
  FormDetectFieldsPayload,
  FormDetectFieldsResponse,
  FormExportPayload,
  FormFillFieldsPayload,
  FormFillPayload,
  FormFillResponse,
  ReportExportExtension,
  ReportExportRead,
  ReportRenamePayload,
  ReportRead,
  RemoteImportPayload,
  ReportTemplate,
  SettingsRead,
  StartProcessingPayload,
  TemplateReferenceAnalysis,
  TemplateReferenceText,
  TranscriptionRead,
  UploadCreateResponse,
  UploadItem,
  UploadListResponse,
} from "@/types/api";
import { getWorkspaceRequestHeader } from "@/lib/workspace-store";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000/api";
const isDesktopMode = process.env.NEXT_PUBLIC_DESKTOP_MODE === "1";

let cachedBackendToken: { token: string; expiresAt: number; workspaceId: string } | null = null;

async function getApiAuthHeaders(): Promise<Record<string, string>> {
  const workspaceId = getWorkspaceRequestHeader();
  const fallbackHeaders = { "X-Workspace-Id": workspaceId };

  if (isDesktopMode) {
    return fallbackHeaders;
  }

  if (cachedBackendToken && cachedBackendToken.expiresAt > Date.now() + 30_000) {
    return {
      "X-Workspace-Id": cachedBackendToken.workspaceId,
      Authorization: `Bearer ${cachedBackendToken.token}`,
    };
  }

  try {
    const response = await fetch("/api/backend-token", { cache: "no-store" });
    if (!response.ok) {
      return fallbackHeaders;
    }
    const payload = (await response.json()) as { token?: string; workspaceId?: string };
    if (!payload.token || !payload.workspaceId) {
      return fallbackHeaders;
    }
    cachedBackendToken = {
      token: payload.token,
      workspaceId: payload.workspaceId,
      expiresAt: Date.now() + 4 * 60 * 1000,
    };
    return {
      "X-Workspace-Id": payload.workspaceId,
      Authorization: `Bearer ${payload.token}`,
    };
  } catch {
    return fallbackHeaders;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const authHeaders = await getApiAuthHeaders();
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...authHeaders,
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

function parseErrorMessage(data: unknown): string {
  if (data && typeof data === "object" && "detail" in data && typeof data.detail === "string") {
    return data.detail;
  }

  return "Falha na comunicaÃ§Ã£o com o backend";
}

function parseFilenameFromDisposition(headerValue: string | null): string | null {
  if (!headerValue) {
    return null;
  }

  const utf8Match = /filename\*=UTF-8''([^;]+)/i.exec(headerValue);
  if (utf8Match) {
    return decodeURIComponent(utf8Match[1]);
  }

  const asciiMatch = /filename="?([^";]+)"?/i.exec(headerValue);
  return asciiMatch?.[1] ?? null;
}

export function uploadFile(file: File, onProgress: (value: number) => void): Promise<UploadCreateResponse> {
  return new Promise((resolve, reject) => {
    void getApiAuthHeaders()
      .then((authHeaders) => {
        const formData = new FormData();
        formData.append("file", file);
        const xhr = new XMLHttpRequest();
        xhr.open("POST", `${API_BASE}/uploads`);
        Object.entries(authHeaders).forEach(([key, value]) => xhr.setRequestHeader(key, value));
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
      })
      .catch(() => reject(new Error("Falha ao preparar autenticacao do upload")));
  });
}

export function importRemoteMedia(payload: RemoteImportPayload) {
  return request<UploadCreateResponse>("/uploads/import", {
    method: "POST",
    body: JSON.stringify(payload),
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

export async function createTemplateFromReference(
  file: File,
  fields: { name?: string; description?: string; category?: string },
): Promise<ReportTemplate> {
  const formData = new FormData();
  formData.append("file", file);
  if (fields.name?.trim()) {
    formData.append("name", fields.name.trim());
  }
  if (fields.description?.trim()) {
    formData.append("description", fields.description.trim());
  }
  if (fields.category?.trim()) {
    formData.append("category", fields.category.trim());
  }

  const response = await fetch(`${API_BASE}/report-templates/analyze-reference`, {
    method: "POST",
    headers: await getApiAuthHeaders(),
    body: formData,
    cache: "no-store",
  });

  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as unknown;
    throw new Error(parseErrorMessage(data));
  }

  return (await response.json()) as ReportTemplate;
}

export async function analyzeTemplateReference(
  file: File,
  fields: { name?: string; description?: string; category?: string },
): Promise<TemplateReferenceAnalysis> {
  const formData = new FormData();
  formData.append("file", file);
  if (fields.name?.trim()) {
    formData.append("name", fields.name.trim());
  }
  if (fields.description?.trim()) {
    formData.append("description", fields.description.trim());
  }
  if (fields.category?.trim()) {
    formData.append("category", fields.category.trim());
  }

  const response = await fetch(`${API_BASE}/report-templates/analyze-reference-preview`, {
    method: "POST",
    headers: await getApiAuthHeaders(),
    body: formData,
    cache: "no-store",
  });

  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as unknown;
    throw new Error(parseErrorMessage(data));
  }

  return (await response.json()) as TemplateReferenceAnalysis;
}

export async function extractTemplateReferenceText(file: File): Promise<TemplateReferenceText> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${API_BASE}/report-templates/extract-reference-text`, {
    method: "POST",
    headers: await getApiAuthHeaders(),
    body: formData,
    cache: "no-store",
  });

  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as unknown;
    throw new Error(parseErrorMessage(data));
  }

  return (await response.json()) as TemplateReferenceText;
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

export function getReportExports(reportId: string) {
  return request<ReportExportRead[]>(`/reports/${reportId}/exports`);
}

export function generateReport(payload: Record<string, unknown>) {
  return request<ReportRead>("/reports/generate", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function fillForm(payload: FormFillPayload) {
  return request<FormFillResponse>("/forms/fill", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function fillFormByFields(payload: FormFillFieldsPayload) {
  return request<FormFillResponse>("/forms/fill-fields", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function detectFormFields(payload: FormDetectFieldsPayload) {
  return request<FormDetectFieldsResponse>("/forms/detect-fields", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function exportForm(payload: FormExportPayload): Promise<{ blob: Blob; filename: string | null }> {
  const authHeaders = await getApiAuthHeaders();
  const response = await fetch(`${API_BASE}/forms/export`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as unknown;
    throw new Error(parseErrorMessage(data));
  }

  return {
    blob: await response.blob(),
    filename: parseFilenameFromDisposition(response.headers.get("content-disposition")),
  };
}

export function updateReport(reportId: string, payload: ReportRenamePayload) {
  return request<ReportRead>(`/reports/${reportId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function downloadReportExport(
  reportId: string,
  extension: ReportExportExtension,
): Promise<{ blob: Blob; filename: string | null }> {
  const response = await fetch(`${API_BASE}/reports/${reportId}/exports/${extension}`, {
    headers: await getApiAuthHeaders(),
    cache: "no-store",
  });

  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as unknown;
    throw new Error(parseErrorMessage(data));
  }

  return {
    blob: await response.blob(),
    filename: parseFilenameFromDisposition(response.headers.get("content-disposition")),
  };
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
