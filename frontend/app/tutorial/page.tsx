import Link from "next/link";

import { SectionHeader } from "@/components/section-header";

const providers = [
  {
    name: "OpenAI",
    keyName: "OpenAI API key",
    directUrl: "https://platform.openai.com/api-keys",
    docsUrl: "https://platform.openai.com/docs/quickstart",
    prefix: "Normalmente comeca com sk-",
    steps: [
      "Entre na plataforma da OpenAI.",
      "Abra API keys e crie uma nova chave.",
      "Copie a chave uma unica vez e cole em Ajustes.",
      "Salve as configuracoes e teste gerando uma transcricao ou relatorio.",
    ],
  },
  {
    name: "Gemini",
    keyName: "Gemini API key",
    directUrl: "https://aistudio.google.com/app/apikey",
    docsUrl: "https://ai.google.dev/gemini-api/docs/api-key",
    prefix: "Normalmente comeca com AIza",
    steps: [
      "Entre no Google AI Studio.",
      "Abra a pagina de API keys.",
      "Crie ou escolha um projeto e gere a chave.",
      "Cole a chave em Ajustes e salve.",
    ],
  },
  {
    name: "Claude",
    keyName: "Claude API key",
    directUrl: "https://platform.claude.com/settings/keys",
    docsUrl: "https://platform.claude.com/docs/en/api/overview",
    prefix: "Normalmente comeca com sk-ant-",
    steps: [
      "Entre no Claude Console.",
      "Abra Settings > API Keys.",
      "Crie uma chave no workspace correto.",
      "Cole a chave em Ajustes e salve.",
    ],
  },
];

export default function TutorialPage() {
  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Tutorial"
        title="Como pegar as APIs das IAs"
        description="Links oficiais e passos rapidos para configurar OpenAI, Gemini e Claude no app."
        action={
          <Link className="button-primary px-4 py-2" href="/settings">
            Abrir ajustes
          </Link>
        }
      />

      <section className="grid gap-5 xl:grid-cols-3">
        {providers.map((provider) => (
          <article key={provider.name} className="panel p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sand">{provider.name}</p>
                <h2 className="mt-2 text-xl font-semibold text-ink">{provider.keyName}</h2>
              </div>
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-slate">
                {provider.prefix}
              </span>
            </div>

            <ol className="mt-5 list-decimal space-y-3 pl-5 text-sm leading-6 text-slate">
              {provider.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>

            <div className="mt-5 flex flex-wrap gap-2">
              <a className="button-primary px-4 py-2" href={provider.directUrl} target="_blank" rel="noreferrer">
                Criar chave
              </a>
              <a className="button-secondary px-4 py-2" href={provider.docsUrl} target="_blank" rel="noreferrer">
                Ver docs
              </a>
            </div>
          </article>
        ))}
      </section>

      <section className="panel p-5">
        <h2 className="text-xl font-semibold text-ink">Cuidados importantes</h2>
        <div className="mt-4 grid gap-3 text-sm leading-6 text-slate md:grid-cols-3">
          <p>Use as chaves apenas no backend ou nesta tela de Ajustes. Nunca cole uma chave em codigo publico.</p>
          <p>Se uma chave vazar, apague na plataforma original e gere outra. Remover no app so limpa a copia local.</p>
          <p>Depois de salvar uma nova chave, ela fica mascarada no estado atual para evitar exposicao acidental.</p>
        </div>
      </section>
    </div>
  );
}
