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

  await page.route("http://127.0.0.1:8000/api/document-models", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        json: [
          {
            id: "document-model-1",
            workspace_id: "local-workspace",
            name: "Modelo documental",
            description: "Documento base para testes",
            category: "documento",
            source_filename: "modelo.txt",
            source_mime_type: "text/plain",
            source_path: "storage/document_models/document-model-1/modelo.txt",
            source_text: "Texto do documento base",
            base_instructions: "Use a estrutura do documento.",
            default_context: "Contexto padrao salvo",
            created_at: "2026-07-25T00:00:00",
            updated_at: "2026-07-25T00:00:00",
          },
        ],
      });
      return;
    }
    await route.fulfill({
      json: {
        id: "document-model-created",
        workspace_id: "local-workspace",
        name: "Modelo criado",
        description: "Documento criado",
        category: "documento",
        source_filename: "modelo.txt",
        source_mime_type: "text/plain",
        source_path: "storage/document_models/document-model-created/modelo.txt",
        source_text: "Texto do documento base",
        base_instructions: "Use a estrutura do documento.",
        default_context: "Contexto padrao salvo",
        created_at: "2026-07-25T00:00:00",
        updated_at: "2026-07-25T00:00:00",
      },
    });
  });

  await page.route("http://127.0.0.1:8000/api/uploads/upload-1", async (route) => {
    await route.fulfill({
      json: {
        id: "upload-1",
        original_filename: "audio.mp3",
        stored_filename: "audio.mp3",
        file_type: "audio",
        mime_type: "audio/mpeg",
        original_path: "storage/uploads/audio.mp3",
        converted_path: null,
        transcription_text: "Transcricao pronta para relatorio.",
        transcription_engine: "openai",
        language_detected: "pt-BR",
        status: "completed",
        upload_size_bytes: 1024,
        duration_seconds: 12,
        error_message: null,
        report_count: 0,
        created_at: "2026-07-25T00:00:00",
        updated_at: "2026-07-25T00:00:00",
      },
    });
  });

  await page.route("http://127.0.0.1:8000/api/uploads/upload-1/reports", async (route) => {
    await route.fulfill({ json: [] });
  });
});

test("visitante ve landing e tabela publica de precos", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "ModeloIA" })).toBeVisible();
  await page.goto("/pricing");
  await expect(page.getByRole("heading", { name: /IA inclusa por creditos/ })).toBeVisible();
  await expect(page.getByText("R$49/mes")).toBeVisible();
  await expect(page.getByText("R$149/mes")).toBeVisible();
});

test("login publico mostra acesso de cliente ModeloIA sem cadastro imobiliario", async ({ page }) => {
  await page.goto("/login");

  if (await page.getByRole("heading", { name: "Workspace local do desktop" }).isVisible()) {
    await expect(page.getByRole("heading", { name: "Workspace local do desktop" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Usar demo local" })).toBeVisible();
  } else {
    await expect(page.getByRole("heading", { name: "Acesse o ModeloIA" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Entrar como cliente demo" })).toBeVisible();
    await expect(page.getByText("cliente@modeloia.com")).toBeVisible();
    await expect(page.getByText("Cliente@2026")).toBeVisible();
  }
  await expect(page.getByRole("link", { name: "Cadastrar imovel" })).toHaveCount(0);
  await expect(page.getByText(/imovel/i)).toHaveCount(0);
});

test("relatorios mostra aba de modelos de documentos", async ({ page }) => {
  await page.goto("/uploads");

  await expect(page.getByRole("button", { name: /Arquivo local/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Gravar audio/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Modelos de documentos/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /YouTube/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Instagram/ })).toBeVisible();

  await page.getByRole("button", { name: /Modelos de documentos/ }).click();
  await expect(page.getByText("Documento base")).toBeVisible();
  await expect(page.getByRole("button", { name: "Salvar modelo de documento" })).toBeVisible();
});

test("detalhe envia modelo documental e contexto temporario", async ({ page }) => {
  let reportPayload: Record<string, unknown> | null = null;

  await page.route("http://127.0.0.1:8000/api/reports/generate", async (route) => {
    reportPayload = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      json: {
        id: "report-1",
        upload_id: "upload-1",
        template_id: null,
        title: "Relatorio gerado",
        request_prompt: "Prompt",
        content: "# Relatorio",
        output_format: "markdown",
        generator_engine: "openai",
        created_at: "2026-07-25T00:00:00",
      },
    });
  });

  await page.goto("/uploads/upload-1");
  await expect(page.getByLabel("Modelo de documentos")).toBeVisible();
  await expect(page.getByLabel("Template de relatório")).toBeVisible();

  await page.getByLabel("Ativar").check();
  await page.getByPlaceholder("Contexto temporário para esta geração específica").fill("Contexto desta execucao");
  await page.getByRole("button", { name: "Gerar relatório" }).click();

  await expect.poll(() => reportPayload).not.toBeNull();
  expect(reportPayload).toMatchObject({
    upload_id: "upload-1",
    document_model_id: "document-model-1",
    report_context: "Contexto desta execucao",
  });
});

test.skip("fluxo autenticado cobre upload, formulario, documento e exportacao", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Comece pelo fluxo comercial completo" })).toBeVisible();
});
