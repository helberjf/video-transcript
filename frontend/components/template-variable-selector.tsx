"use client";

import { useEffect, useMemo, useState } from "react";

import {
  SelectableWords,
  tokenizeSelectableWords,
  type SelectableWordToken,
} from "@/components/selectable-words";
import type { FormFieldSpec } from "@/types/api";

export interface ManualTemplateDraft {
  exampleOutput: string;
  formFields: FormFieldSpec[];
  selectedCount: number;
}

type SelectedTokenGroup = {
  tokens: SelectableWordToken[];
  text: string;
  start: number;
  end: number;
};

function slugifyKey(raw: string): string {
  const normalized = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_\s-]/g, "")
    .trim()
    .replace(/[\s-]+/g, "_");
  return normalized.slice(0, 70) || "campo";
}

function inferFieldType(value: string): FormFieldSpec["type"] {
  if (/^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(value)) {
    return "date";
  }
  if (/^\d+(?:[.,]\d+)?$/.test(value)) {
    return "number";
  }
  return value.length > 28 ? "textarea" : "text";
}

function buildUniqueKey(value: string, usedKeys: Set<string>): string {
  const base = slugifyKey(value);
  let key = base;
  let suffix = 2;
  while (usedKeys.has(key)) {
    key = `${base}_${suffix}`;
    suffix += 1;
  }
  usedKeys.add(key);
  return key;
}

function buildSelectedTokenGroups(sourceText: string, tokens: SelectableWordToken[], selectedKeys: ReadonlySet<string>): SelectedTokenGroup[] {
  const selectedTokens = tokens.filter((token) => selectedKeys.has(token.key));
  const groups: SelectableWordToken[][] = [];

  for (const token of selectedTokens) {
    const currentGroup = groups[groups.length - 1];
    const previousToken = currentGroup?.[currentGroup.length - 1];
    const separator = previousToken ? sourceText.slice(previousToken.end, token.start) : "";
    const belongsToCurrentGroup =
      Boolean(previousToken) &&
      token.index === previousToken.index + 1 &&
      !separator.includes("\n");

    if (belongsToCurrentGroup && currentGroup) {
      currentGroup.push(token);
    } else {
      groups.push([token]);
    }
  }

  return groups.map((group) => {
    const first = group[0];
    const last = group[group.length - 1];
    return {
      tokens: group,
      text: sourceText.slice(first.start, last.end),
      start: first.start,
      end: last.end,
    };
  });
}

function buildManualDraft(sourceText: string, tokens: SelectableWordToken[], selectedKeys: ReadonlySet<string>): ManualTemplateDraft {
  const groups = buildSelectedTokenGroups(sourceText, tokens, selectedKeys);
  const fieldsByGroup = new Map<SelectedTokenGroup, FormFieldSpec>();
  const usedKeys = new Set<string>();

  for (const group of groups) {
    const value = group.text.trim();
    const key = buildUniqueKey(value, usedKeys);
    fieldsByGroup.set(group, {
      key,
      label: value,
      type: inferFieldType(value),
      placeholder: value,
      required: false,
      help: `Trecho selecionado no documento original: "${value}".`,
    });
  }

  let cursor = 0;
  let output = "";
  for (const group of groups) {
    const field = fieldsByGroup.get(group);
    if (!field) {
      continue;
    }
    output += sourceText.slice(cursor, group.start);
    output += `{{${field.key}}}`;
    cursor = group.end;
  }
  output += sourceText.slice(cursor);

  return {
    exampleOutput: output,
    formFields: groups.map((group) => fieldsByGroup.get(group)).filter((field): field is FormFieldSpec => Boolean(field)),
    selectedCount: groups.reduce((count, group) => count + group.tokens.length, 0),
  };
}

export function TemplateVariableSelector({
  sourceText,
  sourceLabel,
  keyPrefix = "template-variable",
  onDraftChange,
}: {
  sourceText: string;
  sourceLabel?: string;
  keyPrefix?: string;
  onDraftChange?: (draft: ManualTemplateDraft) => void;
}) {
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set());
  const tokens = useMemo(() => tokenizeSelectableWords(sourceText, keyPrefix), [keyPrefix, sourceText]);
  const draft = useMemo(() => buildManualDraft(sourceText, tokens, selectedKeys), [selectedKeys, sourceText, tokens]);

  useEffect(() => {
    setSelectedKeys(new Set());
  }, [sourceText]);

  useEffect(() => {
    onDraftChange?.(draft);
  }, [draft, onDraftChange]);

  const toggleWord = (token: SelectableWordToken) => {
    setSelectedKeys((current) => {
      const next = new Set(current);
      if (next.has(token.key)) {
        next.delete(token.key);
      } else {
        next.add(token.key);
      }
      return next;
    });
  };

  const clearSelection = () => {
    setSelectedKeys(new Set());
  };

  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sand">Selecao manual</p>
          {sourceLabel ? <p className="mt-2 text-sm leading-6 text-slate">{sourceLabel}</p> : null}
          <p className="mt-1 text-sm leading-6 text-slate">
            {draft.selectedCount} palavra(s) marcada(s), formando {draft.formFields.length} campo(s) alteravel(is).
          </p>
          <p className="mt-1 text-xs leading-5 text-slate">
            Palavras selecionadas em sequencia viram um unico campo do formulario.
          </p>
        </div>
        <button className="button-secondary" type="button" disabled={!draft.selectedCount} onClick={clearSelection}>
          Limpar selecao
        </button>
      </div>

      <div className="mt-4 max-h-96 overflow-auto whitespace-pre-wrap rounded-2xl border border-white/10 bg-midnight/45 p-4 text-sm leading-7 text-ink">
        <SelectableWords
          text={sourceText}
          keyPrefix={keyPrefix}
          selectedKeys={selectedKeys}
          onWordToggle={toggleWord}
        />
      </div>

      {draft.formFields.length ? (
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {draft.formFields.map((field) => (
            <div key={field.key} className="rounded-xl border border-white/10 bg-midnight/35 px-3 py-2 text-xs leading-5">
              <span className="font-semibold text-ink">{field.label}</span>
              <span className="ml-2 text-slate">vira {`{{${field.key}}}`}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
