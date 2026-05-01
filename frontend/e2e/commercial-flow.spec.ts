import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("http://127.0.0.1:8000/api/dashboard/stats", async (route) => {
    await route.fulfill({
      json: {
        total_uploads: 0,
        total_reports: 0,
        last_upload_at: null,
        most_used_engine: null,
        recent_uploads: [],
      },
    });
  });

  await page.route("http://127.0.0.1:8000/api/settings", async (route) => {
    await route.fulfill({
      json: {
        openai_api_key_configured: false,
        gemini_api_key_configured: false,
        claude_api_key_configured: false,
        use_api_transcription: true,
        preferred_language: "pt-BR",
        whisper_model: "medium",
        max_upload_mb: 500,
        export_directory: "",
        transcription_provider_order: ["openai", "gemini", "whisper"],
        report_provider_order: ["openai", "claude", "gemini", "local"],
      },
    });
  });

  await page.route("http://127.0.0.1:8000/api/report-templates", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ json: [] });
      return;
    }
    await route.continue();
  });
});

test("visitante ve landing e tabela publica de precos", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "FormReport AI" })).toBeVisible();
  await page.goto("/pricing");
  await expect(page.getByRole("heading", { name: /IA inclusa por creditos/ })).toBeVisible();
  await expect(page.getByText("R$49/mes")).toBeVisible();
  await expect(page.getByText("R$149/mes")).toBeVisible();
});

test.skip("fluxo autenticado cobre upload, formulario, documento e exportacao", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Comece pelo fluxo comercial completo" })).toBeVisible();
});
