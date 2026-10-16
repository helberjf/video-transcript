"""Lacunas {{campo}} dos modelos de documento e o vinculo delas com os campos do formulario."""

import re


PLACEHOLDER_PATTERN = re.compile(r"\{\{\s*([^}]+?)\s*\}\}")
_FIELD_KEY_PATTERN = re.compile(r"[^a-z0-9_]+")
# A IA as vezes cria a lacuna com um sufixo de formatacao que o campo nao tem.
_FORMAT_SUFFIXES = ("_formatted", "_formatada", "_formatado", "_format", "_extenso", "_por_extenso", "_texto", "_valor")
_ACCENTS = str.maketrans("çãáàâéêíóôõúü", "caaaaeeiooouu")


def slugify_field_key(raw: str) -> str:
    simplified = raw.strip().lower().translate(_ACCENTS).replace(" ", "_").replace("-", "_")
    simplified = _FIELD_KEY_PATTERN.sub("_", simplified).strip("_")
    return simplified[:80] or "campo"


def match_placeholder_key(raw: str, keys: list[str] | set[str]) -> str | None:
    """Acha o campo de uma lacuna mesmo quando o nome nao bate exatamente."""
    known = set(keys)
    slug = slugify_field_key(raw)
    if slug in known:
        return slug
    for suffix in _FORMAT_SUFFIXES:
        if slug.endswith(suffix) and slug[: -len(suffix)] in known:
            return slug[: -len(suffix)]
    candidates = [key for key in known if slug.startswith(f"{key}_") or key.startswith(f"{slug}_")]
    return candidates[0] if len(candidates) == 1 else None


def reconcile_placeholders(example_output: str, form_fields: list[dict] | None) -> tuple[str, list[dict] | None]:
    """Reescreve as lacunas para as chaves dos campos e cria campo para lacuna que ficou sem nenhum."""
    fields = list(form_fields or [])
    keys = [field["key"] for field in fields if isinstance(field, dict) and isinstance(field.get("key"), str)]

    def replace(match: re.Match[str]) -> str:
        raw = match.group(1)
        return "{{" + (match_placeholder_key(raw, keys) or slugify_field_key(raw)) + "}}"

    reconciled = PLACEHOLDER_PATTERN.sub(replace, example_output)
    for match in PLACEHOLDER_PATTERN.finditer(reconciled):
        key = match.group(1).strip()
        if key not in keys:
            keys.append(key)
            fields.append(
                {
                    "key": key,
                    "label": key.replace("_", " ").capitalize(),
                    "type": "textarea" if len(key) > 24 else "text",
                    "placeholder": None,
                    "required": False,
                    "help": None,
                }
            )
    return reconciled, (fields or None)
