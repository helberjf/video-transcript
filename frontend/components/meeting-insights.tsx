"use client";

import { useEffect, useRef, useState } from "react";

import { addChecklistItem, askMeeting, regenerateInsights, setChecklistItem } from "@/services/api";
import type { MeetingInsights as Insights, UploadItem } from "@/types/api";

const QUESTION_SUGGESTIONS = [
  "Quais tarefas ficaram comigo?",
  "O que foi decidido sobre prazos?",
  "Quais pontos ficaram sem resposta?",
];

function checklistAsText(insights: Insights) {
  return insights.checklist
    .map((item) => {
      const details = [item.responsavel, item.prazo ? `até ${item.prazo}` : null].filter(Boolean).join(", ");
      return `${item.feito ? "[x]" : "[ ]"} ${item.tarefa}${details ? ` (${details})` : ""}`;
    })
    .join("\n");
}

function ListSection({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) {
    return null;
  }
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate">{title}</p>
      <ul className="mt-2 space-y-1.5 text-sm leading-6 text-ink">
        {items.map((item, index) => (
          <li key={index} className="flex gap-2">
            <span className="text-sand">•</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Resultado da reunião: resumo, decisões, checklist marcável e perguntas sobre o que foi dito. */
export function MeetingInsightsPanel({ upload, onUploadChange }: { upload: UploadItem; onUploadChange: (upload: UploadItem) => void }) {
  const insights = upload.meeting_insights ?? null;
  const [checklist, setChecklist] = useState(insights?.checklist ?? []);
  const [questions, setQuestions] = useState(insights?.perguntas ?? []);
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [newTask, setNewTask] = useState("");
  const [regenerating, setRegenerating] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const answersEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setChecklist(insights?.checklist ?? []);
    setQuestions(insights?.perguntas ?? []);
  }, [upload.meeting_insights]);

  useEffect(() => {
    answersEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [questions.length]);

  if (!insights) {
    return null;
  }

  const done = checklist.filter((item) => item.feito).length;

  const toggle = async (index: number) => {
    const next = !checklist[index].feito;
    setChecklist((current) => current.map((item, position) => (position === index ? { ...item, feito: next } : item)));
    try {
      await setChecklistItem(upload.id, index, next);
    } catch {
      setChecklist((current) => current.map((item, position) => (position === index ? { ...item, feito: !next } : item)));
    }
  };

  const addTask = async () => {
    const task = newTask.trim();
    if (!task) {
      return;
    }
    const updated = await addChecklistItem(upload.id, task);
    setChecklist(updated.checklist);
    setNewTask("");
  };

  const ask = async (text: string) => {
    const value = text.trim();
    if (!value || asking) {
      return;
    }
    setAsking(true);
    setQuestion("");
    setQuestions((current) => [...current, { pergunta: value, resposta: "", em: "" }]);
    try {
      const entry = await askMeeting(upload.id, value);
      setQuestions((current) => [...current.slice(0, -1), entry]);
    } catch (err) {
      setQuestions((current) => [
        ...current.slice(0, -1),
        { pergunta: value, resposta: err instanceof Error ? err.message : "Não consegui responder agora.", em: "" },
      ]);
    } finally {
      setAsking(false);
    }
  };

  const copyChecklist = async () => {
    await navigator.clipboard.writeText(checklistAsText({ ...insights, checklist }));
    setFeedback("Checklist copiado.");
    window.setTimeout(() => setFeedback(null), 2500);
  };

  const regenerate = async () => {
    setRegenerating(true);
    setFeedback(null);
    try {
      onUploadChange(await regenerateInsights(upload.id));
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : "Falha ao gerar de novo");
    } finally {
      setRegenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      {insights.erro && !insights.resumo ? (
        <div className="rounded-xl border border-rose-300/20 bg-rose-300/10 p-4 text-sm text-rose-200">
          {insights.erro}
          <button className="button-secondary ml-3 px-3 py-1 text-xs" type="button" disabled={regenerating} onClick={() => void regenerate()}>
            {regenerating ? "Gerando..." : "Tentar de novo"}
          </button>
        </div>
      ) : null}

      {insights.resumo ? (
        <div className="grid gap-6 xl:grid-cols-[1.1fr_1fr]">
          <div className="space-y-5 rounded-xl border border-white/10 bg-midnight/40 p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sand">Resumo</p>
                {insights.titulo ? <h3 className="mt-1 text-lg font-semibold text-ink">{insights.titulo}</h3> : null}
              </div>
              <button className="text-xs text-slate hover:text-sand" type="button" disabled={regenerating} onClick={() => void regenerate()}>
                {regenerating ? "Gerando..." : "Gerar de novo"}
              </button>
            </div>
            <p className="whitespace-pre-wrap text-sm leading-7 text-ink">{insights.resumo}</p>
            <ListSection title="Decisões" items={insights.decisoes} />
            <ListSection title="Pendências" items={insights.pendencias} />
            <ListSection title="Próximos passos" items={insights.proximos_passos} />
          </div>

          <div className="rounded-xl border border-sand/25 bg-sand/[0.04] p-5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sand">
                Checklist {checklist.length > 0 ? `· ${done}/${checklist.length}` : ""}
              </p>
              {checklist.length > 0 ? (
                <button className="text-xs text-slate hover:text-sand" type="button" onClick={() => void copyChecklist()}>
                  Copiar
                </button>
              ) : null}
            </div>
            {checklist.length === 0 ? (
              <p className="mt-3 text-sm text-slate">Nenhuma tarefa foi combinada nesta reunião.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {checklist.map((item, index) => (
                  <li key={index}>
                    <label className="flex cursor-pointer items-start gap-3 rounded-lg p-2 hover:bg-white/[0.04]">
                      <input className="mt-1" type="checkbox" checked={item.feito} onChange={() => void toggle(index)} />
                      <span className={`text-sm leading-6 ${item.feito ? "text-slate line-through" : "text-ink"}`}>
                        {item.tarefa}
                        {item.responsavel || item.prazo || item.minuto ? (
                          <span className="mt-0.5 block text-xs text-slate no-underline">
                            {[item.responsavel, item.prazo ? `prazo: ${item.prazo}` : null, item.minuto ? `combinado em ${item.minuto}` : null]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        ) : null}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-3 flex gap-2">
              <input
                className="field py-1.5 text-sm"
                value={newTask}
                placeholder="Adicionar tarefa"
                onChange={(event) => setNewTask(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    void addTask();
                  }
                }}
              />
              <button className="button-secondary shrink-0 px-3 py-1.5 text-sm" type="button" onClick={() => void addTask()}>
                Adicionar
              </button>
            </div>
            {feedback ? <p className="mt-2 text-xs text-slate">{feedback}</p> : null}
          </div>
        </div>
      ) : null}

      {upload.transcription_text ? (
        <div className="rounded-xl border border-white/10 bg-midnight/40 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sand">Tire dúvidas sobre a reunião</p>
          <div className="mt-3 max-h-[28rem] space-y-4 overflow-y-auto">
            {questions.map((item, index) => (
              <div key={index} className="space-y-2 text-sm">
                <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-sm bg-sand/15 px-4 py-2 text-ink">{item.pergunta}</p>
                <p className="w-fit max-w-[92%] whitespace-pre-wrap rounded-2xl rounded-bl-sm bg-white/[0.05] px-4 py-2 leading-6 text-ink">
                  {item.resposta || <span className="animate-pulse text-slate">Procurando na reunião...</span>}
                </p>
              </div>
            ))}
            <div ref={answersEndRef} />
          </div>
          {questions.length === 0 ? (
            <div className="mt-1 flex flex-wrap gap-2">
              {QUESTION_SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  className="rounded-full border border-white/10 px-3 py-1 text-xs text-slate hover:border-sand/40 hover:text-ink"
                  type="button"
                  onClick={() => void ask(suggestion)}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          ) : null}
          <form
            className="mt-3 flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void ask(question);
            }}
          >
            <input
              className="field text-sm"
              value={question}
              placeholder="Pergunte qualquer coisa sobre o que foi dito"
              onChange={(event) => setQuestion(event.target.value)}
            />
            <button className="button-primary shrink-0 px-4" type="submit" disabled={asking || !question.trim()}>
              {asking ? "..." : "Perguntar"}
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
