"use client";

import { useEffect, useMemo, useState } from "react";

export interface SelectableWordToken {
  key: string;
  value: string;
  index: number;
  start: number;
  end: number;
}

type TextSegment = { type: "text"; key: string; text: string };
type WordSegment = { type: "word"; key: string; token: SelectableWordToken };
type Segment = TextSegment | WordSegment;

const WORD_PATTERN_SOURCE = String.raw`[\p{L}\p{N}]+(?:[.'_-][\p{L}\p{N}]+)*`;

function buildWordSegments(text: string, keyPrefix: string): Segment[] {
  const matcher = new RegExp(WORD_PATTERN_SOURCE, "gu");
  const segments: Segment[] = [];
  let cursor = 0;
  let wordIndex = 0;

  for (const match of text.matchAll(matcher)) {
    const value = match[0];
    const start = match.index ?? 0;
    const end = start + value.length;

    if (start > cursor) {
      segments.push({
        type: "text",
        key: `${keyPrefix}-text-${segments.length}`,
        text: text.slice(cursor, start),
      });
    }

    const token: SelectableWordToken = {
      key: `${keyPrefix}-word-${wordIndex}`,
      value,
      index: wordIndex,
      start,
      end,
    };

    segments.push({
      type: "word",
      key: token.key,
      token,
    });

    cursor = end;
    wordIndex += 1;
  }

  if (cursor < text.length) {
    segments.push({
      type: "text",
      key: `${keyPrefix}-text-${segments.length}`,
      text: text.slice(cursor),
    });
  }

  return segments;
}

export function tokenizeSelectableWords(text: string, keyPrefix = "word"): SelectableWordToken[] {
  return buildWordSegments(text, keyPrefix)
    .filter((segment): segment is WordSegment => segment.type === "word")
    .map((segment) => segment.token);
}

export function normalizeSelectableWord(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

export function SelectableWords({
  text,
  keyPrefix = "word",
  selectedKeys,
  onWordToggle,
  className = "",
  wordClassName = "",
  selectedWordClassName = "",
}: {
  text: string;
  keyPrefix?: string;
  selectedKeys?: ReadonlySet<string>;
  onWordToggle?: (token: SelectableWordToken) => void;
  className?: string;
  wordClassName?: string;
  selectedWordClassName?: string;
}) {
  const segments = useMemo(() => buildWordSegments(text, keyPrefix), [keyPrefix, text]);

  return (
    <span className={className}>
      {segments.map((segment) => {
        if (segment.type === "text") {
          return <span key={segment.key}>{segment.text}</span>;
        }

        const selected = selectedKeys?.has(segment.token.key) ?? false;
        const stateClassName = selected
          ? `text-sand underline decoration-2 decoration-sand ${selectedWordClassName}`
          : "text-inherit decoration-transparent hover:text-sand hover:underline hover:decoration-sand/50";

        if (!onWordToggle) {
          return (
            <span key={segment.key} className={`inline rounded px-0.5 underline-offset-4 ${stateClassName} ${wordClassName}`}>
              {segment.token.value}
            </span>
          );
        }

        return (
          <button
            key={segment.key}
            type="button"
            aria-pressed={selected}
            className={`inline rounded px-0.5 text-left align-baseline underline-offset-4 transition focus:outline-none focus:ring-1 focus:ring-sand/50 ${stateClassName} ${wordClassName}`}
            onClick={() => onWordToggle(segment.token)}
          >
            {segment.token.value}
          </button>
        );
      })}
    </span>
  );
}

export function ManualSelectableDocument({
  text,
  keyPrefix = "document",
  className = "",
  emptyText = "Nada disponivel para leitura.",
}: {
  text: string;
  keyPrefix?: string;
  className?: string;
  emptyText?: string;
}) {
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setSelectedKeys(new Set());
  }, [text]);

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

  if (!text.trim()) {
    return <div className={className}>{emptyText}</div>;
  }

  return (
    <div className={className}>
      <SelectableWords text={text} keyPrefix={keyPrefix} selectedKeys={selectedKeys} onWordToggle={toggleWord} />
    </div>
  );
}
