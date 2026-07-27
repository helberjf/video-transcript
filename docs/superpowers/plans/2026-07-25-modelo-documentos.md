# Modelo de documentos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new persistent document-model workflow for reports, separate from form templates, with stored default context, temporary context, and report generation wiring that uses transcription as the primary source.

**Architecture:** Introduce a new backend entity and storage path for document models, keep report templates unchanged, and extend report generation to combine transcription, document-model guidance, report templates, and temporary context in one prompt. On the frontend, add a dedicated tab to create document models and extend the upload detail page so users can pick one before generating a report.

**Tech Stack:** FastAPI, SQLAlchemy, SQLite/Alembic, Pydantic, Next.js App Router, React, Playwright, pytest.

---

## Task 1: Add backend document-model persistence

**Files:**

- Create: `backend/app/models/document_model.py`
- Create: `backend/app/repositories/document_model_repository.py`
- Create: `backend/app/schemas/document_model.py`
- Create: `backend/app/services/document_model_service.py`
- Modify: `backend/app/core/database.py`
- Modify: `backend/app/models/__init__.py`
- Modify: `backend/app/api/router.py`
- Modify: `backend/app/core/config.py`
- Modify: `backend/tests/conftest.py` if the shared test session needs the new model imported
- Test: `backend/tests/test_document_models.py`

- [ ] **Step 1: Write the failing test**

Add `backend/tests/test_document_models.py` with a test that creates a document model from a PDF or DOCX upload and asserts that the repository stores `name`, `default_context`, `source_filename`, `source_text`, and `source_path`. Include a second test that rejects duplicate names in the same workspace.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend; pytest tests/test_document_models.py -v`

Expected: FAIL because `DocumentModel` / repository / service do not exist yet.

- [ ] **Step 3: Write minimal implementation**

Implement the new SQLAlchemy model, repository, schema, and service helpers. Add the SQLite startup migration in `backend/app/core/database.py` and register the model import so table creation works in tests. Keep the service focused on create/list/get/update/delete and on saving the original file plus extracted text.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend; pytest tests/test_document_models.py -v`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/models/document_model.py backend/app/repositories/document_model_repository.py backend/app/schemas/document_model.py backend/app/services/document_model_service.py backend/app/core/database.py backend/app/models/__init__.py backend/app/api/router.py backend/tests/test_document_models.py
git commit -m "feat: add document model persistence"
```

## Task 2: Expose document-model API and report prompt wiring

**Files:**

- Create: `backend/app/api/routes/document_models.py`
- Modify: `backend/app/api/router.py`
- Modify: `backend/app/schemas/report.py`
- Modify: `backend/app/services/report_service.py`
- Modify: `backend/app/api/routes/reports.py`
- Modify: `backend/app/services/report_template_service.py` only if a helper can be reused for file extraction without duplication
- Test: `backend/tests/test_document_models.py`
- Test: `backend/tests/test_templates_and_reports.py`

- [ ] **Step 1: Write the failing test**

Add one test to `backend/tests/test_document_models.py` that posts a document upload to the new route and expects a 200 response with the created model payload. Add one test to `backend/tests/test_templates_and_reports.py` that calls `generate_report` with `document_model_id` and `report_context` and asserts the generated prompt includes the model base instructions, the default context, and the temporary context in that order.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend; pytest tests/test_document_models.py tests/test_templates_and_reports.py -v`

Expected: FAIL because the new route and request fields are not wired yet.

- [ ] **Step 3: Write minimal implementation**

Implement `backend/app/api/routes/document_models.py` with CRUD endpoints. Extend `GenerateReportRequest` in `backend/app/schemas/report.py` with `document_model_id: str | None` and `report_context: str | None`. Update `generate_report` so it fetches the document model, builds the prompt with transcription first, then document-model instructions/default context, then the report template, then the temporary context.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend; pytest tests/test_document_models.py tests/test_templates_and_reports.py -v`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/routes/document_models.py backend/app/api/router.py backend/app/schemas/report.py backend/app/services/report_service.py backend/app/api/routes/reports.py backend/tests/test_document_models.py backend/tests/test_templates_and_reports.py
git commit -m "feat: wire document models into report generation"
```

## Task 3: Extend the frontend API and types

**Files:**

- Modify: `frontend/types/api.ts`
- Modify: `frontend/services/api.ts`
- Test: `frontend/e2e/commercial-flow.spec.ts`

- [ ] **Step 1: Write the failing test**

Add an assertion to `frontend/e2e/commercial-flow.spec.ts` that checks the upload page can display the new `Modelos de documentos` tab label once the page renders. Add a second assertion that the report generation request includes `document_model_id` and `report_context` when the upload detail page submits the form.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend; npx playwright test e2e/commercial-flow.spec.ts -g "Modelos de documentos|document_model_id"`

Expected: FAIL because the frontend types and API helpers do not expose the new payload yet.

- [ ] **Step 3: Write minimal implementation**

Extend `frontend/types/api.ts` with `DocumentModel`, `DocumentModelCreatePayload`, `DocumentModelUpdatePayload`, `DocumentModelRead`, and the extra report generation request fields. Add matching helper functions in `frontend/services/api.ts` for list/create/update/delete document models and extend `generateReport` to send the new fields.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend; npx playwright test e2e/commercial-flow.spec.ts -g "Modelos de documentos|document_model_id"`

Expected: PASS once the UI uses the new API helpers.

- [ ] **Step 5: Commit**

```bash
git add frontend/types/api.ts frontend/services/api.ts frontend/e2e/commercial-flow.spec.ts
git commit -m "feat: add document model api contracts"
```

## Task 4: Build the document-model creation UI on the upload page

**Files:**

- Modify: `frontend/app/uploads/page.tsx`
- Modify: `frontend/app/uploads/page.tsx` may need a small local helper extraction if the form becomes too large
- Test: `frontend/e2e/commercial-flow.spec.ts`

- [ ] **Step 1: Write the failing test**

Update `frontend/e2e/commercial-flow.spec.ts` to navigate to `/uploads` and assert that the tab row contains `Arquivo local`, `Gravar audio`, `Modelos de documentos`, `YouTube`, and `Instagram`. Add a second test that opens the `Modelos de documentos` tab, toggles the default-context field, uploads a small DOCX or TXT fixture, and expects the create action to hit the new endpoint without starting transcrição.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend; npx playwright test e2e/commercial-flow.spec.ts -g "Modelos de documentos|default-context|create document model"`

Expected: FAIL because the tab and form do not exist yet.

- [ ] **Step 3: Write minimal implementation**

Extend `TAB_CONTENT` in `frontend/app/uploads/page.tsx` with the new tab. Add a dedicated form state for the document-model upload, including `default_context`. Reuse the existing file-upload UX style, but keep this action separate from the transcrição flow. Save the model with the new API helper and surface success/error feedback.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend; npx playwright test e2e/commercial-flow.spec.ts -g "Modelos de documentos|default-context|create document model"`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/app/uploads/page.tsx frontend/e2e/commercial-flow.spec.ts
git commit -m "feat: add document model creation tab"
```

## Task 5: Add document-model selection and temporary context on the upload detail page

**Files:**

- Modify: `frontend/app/uploads/[id]/page.tsx`
- Modify: `frontend/services/api.ts` if the page needs a dedicated `getDocumentModels` helper import
- Test: `frontend/e2e/commercial-flow.spec.ts`

- [ ] **Step 1: Write the failing test**

Add a Playwright check that the upload detail page shows a `Modelo de documentos` selector above the report template selector and that a visible temporary-context toggle reveals a textarea. Add a request assertion that `generateReport` receives `document_model_id` and `report_context`.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend; npx playwright test e2e/commercial-flow.spec.ts -g "Modelo de documentos|report_context|document_model_id"`

Expected: FAIL because the upload detail page does not know about document models yet.

- [ ] **Step 3: Write minimal implementation**

Load document models on page mount, add a selector for them, add a temporary-context toggle and textarea, and pass both values into the existing `generateReport` call. Keep the report template selector intact and ordered after the new selector.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend; npx playwright test e2e/commercial-flow.spec.ts -g "Modelo de documentos|report_context|document_model_id"`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/app/uploads/[id]/page.tsx frontend/services/api.ts frontend/e2e/commercial-flow.spec.ts
git commit -m "feat: select document models when generating reports"
```

## Task 6: Add migration and end-to-end validation

**Files:**

- Create or modify: `backend/alembic/versions/*_document_models.py` if Alembic is used for the tracked schema
- Modify: `backend/app/core/database.py` if SQLite startup migration needs to stay in sync
- Modify: `backend/tests/test_api_smoke.py`
- Modify: `frontend/e2e/commercial-flow.spec.ts`

- [ ] **Step 1: Write the failing test**

Add a smoke test in `backend/tests/test_api_smoke.py` that lists document models and generates a report with a document model id. Add a frontend end-to-end assertion that the tab labels and selectors still render after the backend migration is applied.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend; pytest tests/test_api_smoke.py -v`

Expected: FAIL until the migration and startup schema are aligned.

- [ ] **Step 3: Write minimal implementation**

Create the Alembic migration for the new table, keep the SQLite startup migrations aligned, and update smoke-test fixtures so the new endpoints are covered in the default app boot path.

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
cd backend; pytest tests/test_api_smoke.py tests/test_document_models.py tests/test_templates_and_reports.py -v
cd frontend; npx playwright test e2e/commercial-flow.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/alembic/versions/*_document_models.py backend/app/core/database.py backend/tests/test_api_smoke.py frontend/e2e/commercial-flow.spec.ts
git commit -m "chore: finalize document model workflow"
```

### Self-check before merge

- Confirm the prompt order in `backend/app/services/report_service.py` matches the spec exactly.
- Confirm `report_templates` remains unchanged except for the new request fields used in report generation.
- Confirm the upload page and upload-detail page both reference the new document-model API, not the lateral template flow.
- Confirm every new field has a test that fails before implementation and passes after implementation.
