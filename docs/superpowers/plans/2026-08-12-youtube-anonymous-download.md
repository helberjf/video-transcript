# YouTube Anonymous Download Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Baixar vídeos públicos do YouTube sem ler cookies de navegador ou arquivo de cookies, preservando cookies somente para o Instagram.

**Architecture:** `_build_ydl_options` já recebe a origem remota e será a fronteira para separar a política de autenticação. As opções de YouTube conterão apenas opções de download anônimo; as de Instagram continuarão resolvendo `cookies.txt` e `*_COOKIES_FROM_BROWSER`. Os testes exercitarão essa fronteira com ambiente isolado, sem chamar serviços externos.

**Tech Stack:** Python 3.10, FastAPI, yt-dlp, pytest.

---

## Estrutura de arquivos

- Modificar: `backend/app/services/upload_service.py` — restringir a adição de cookies no `yt-dlp` ao Instagram e remover a retentativa de cookies do YouTube, que ficará inalcançável.
- Modificar: `backend/tests/test_remote_import_service.py` — regressões da montagem de opções para YouTube e Instagram.

### Task 1: Especificar a política anônima do YouTube

**Files:**
- Modify: `backend/tests/test_remote_import_service.py`

- [ ] **Step 1: Escrever o teste que impede cookies no YouTube**

```python
def test_build_ydl_options_for_youtube_ignores_cookie_configuration(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    cookie_file = tmp_path / "cookies.txt"
    cookie_file.write_text("# Netscape HTTP Cookie File\\n", encoding="utf-8")
    monkeypatch.setenv("INSTAGRAM_COOKIES_FILE", str(cookie_file))
    monkeypatch.setenv("YTDLP_COOKIES_FROM_BROWSER", "chrome:Default")

    options = upload_service._build_ydl_options("youtube", "remote.%(ext)s")

    assert options["format"] == "bv*[ext=mp4]+ba[ext=m4a]/bv*+ba/b[ext=mp4]/b"
    assert "cookiefile" not in options
    assert "cookiesfrombrowser" not in options
```

- [ ] **Step 2: Executar o teste para confirmar a regressão**

Run: `..\\venv\\Scripts\\python.exe -m pytest tests/test_remote_import_service.py::test_build_ydl_options_for_youtube_ignores_cookie_configuration -q`

Expected: FAIL porque `_build_ydl_options` atualmente adiciona o arquivo de cookies configurado a qualquer origem.

- [ ] **Step 3: Escrever o teste que preserva cookies para Instagram**

```python
def test_build_ydl_options_for_instagram_uses_configured_cookie_file(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    cookie_file = tmp_path / "cookies.txt"
    cookie_file.write_text("# Netscape HTTP Cookie File\\n", encoding="utf-8")
    monkeypatch.setenv("INSTAGRAM_COOKIES_FILE", str(cookie_file))
    monkeypatch.setenv("YTDLP_COOKIES_FROM_BROWSER", "chrome:Default")

    options = upload_service._build_ydl_options("instagram", "remote.%(ext)s")

    assert options["cookiefile"] == str(cookie_file)
    assert "cookiesfrombrowser" not in options
```

- [ ] **Step 4: Executar o teste de Instagram para estabelecer o comportamento existente**

Run: `..\\venv\\Scripts\\python.exe -m pytest tests/test_remote_import_service.py::test_build_ydl_options_for_instagram_uses_configured_cookie_file -q`

Expected: PASS antes da implementação, pois o arquivo existente já é aplicado.

### Task 2: Restringir cookies ao Instagram

**Files:**
- Modify: `backend/app/services/upload_service.py:77-105, 158-250`
- Test: `backend/tests/test_remote_import_service.py`

- [ ] **Step 1: Limitar a resolução de cookies em `_build_ydl_options`**

```python
    if source == "instagram":
        cookies_file = _resolve_cookies_file()
        cookies_from_browser = (
            os.environ.get("INSTAGRAM_COOKIES_FROM_BROWSER")
            or os.environ.get("YTDLP_COOKIES_FROM_BROWSER")
        )
        if cookies_file:
            ydl_options["cookiefile"] = cookies_file
        elif cookies_from_browser:
            parsed_cookies = _parse_cookies_from_browser(cookies_from_browser)
            if parsed_cookies:
                ydl_options["cookiesfrombrowser"] = parsed_cookies
```

Keep the existing source-specific format configuration unchanged. Do not add a YouTube cookie option or an alternative browser session path.

- [ ] **Step 2: Remover a retentativa de falha de cookies específica do YouTube**

Delete `_is_browser_cookie_error` and the `cookiesfrombrowser` branch in `extract_remote_info_with_ssl_fallback`. With YouTube options now anonymous from the start, this fallback is redundant. Leave the SSL fallback intact.

- [ ] **Step 3: Executar os dois testes de política de cookies**

Run: `..\\venv\\Scripts\\python.exe -m pytest tests/test_remote_import_service.py::test_build_ydl_options_for_youtube_ignores_cookie_configuration tests/test_remote_import_service.py::test_build_ydl_options_for_instagram_uses_configured_cookie_file -q`

Expected: PASS com duas confirmações: YouTube sem cookies e Instagram com `cookiefile`.

- [ ] **Step 4: Remover os testes da retentativa que deixou de existir**

Delete `test_extract_remote_info_retries_youtube_without_browser_cookies` and `test_extract_remote_info_does_not_retry_instagram_without_browser_cookies`. They verify the old comportamento de segunda tentativa, substituído por não configurar cookies para YouTube desde o início.

- [ ] **Step 5: Executar o arquivo de testes do serviço**

Run: `..\\venv\\Scripts\\python.exe -m pytest tests/test_remote_import_service.py -q`

Expected: PASS sem falhas.

### Task 3: Verificação integrada e entrega

**Files:**
- Modify: `docs/superpowers/plans/2026-08-12-youtube-anonymous-download.md`

- [ ] **Step 1: Executar a suíte completa do backend**

Run: `..\\venv\\Scripts\\python.exe -m pytest -q`

Expected: exit code 0 e nenhuma falha.

- [ ] **Step 2: Verificar as opções efetivas com as variáveis de ambiente locais**

Run:

```powershell
@'
from app.services.upload_service import _build_ydl_options
options = _build_ydl_options("youtube", "remote.%(ext)s")
print("cookiefile" in options)
print("cookiesfrombrowser" in options)
'@ | ..\\venv\\Scripts\\python.exe -
```

Expected: duas linhas `False`.

- [ ] **Step 3: Revisar o diff e registrar o resultado**

Run: `git diff --check; git diff -- backend/app/services/upload_service.py backend/tests/test_remote_import_service.py`

Expected: nenhum erro de whitespace e somente a política anônima do YouTube e os testes correspondentes.

- [ ] **Step 4: Commit**

```bash
git add backend/app/services/upload_service.py backend/tests/test_remote_import_service.py docs/superpowers/plans/2026-08-12-youtube-anonymous-download.md
git commit -m "fix: download public YouTube videos anonymously"
```
