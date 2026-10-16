/** Aviso mostrado sempre que a pessoa digita a própria chave de IA na web. */
export function AiKeyNotice() {
  return (
    <div className="rounded-lg border border-tide/25 bg-tide/10 p-4 text-sm leading-6 text-slate">
      <p className="font-semibold text-aqua">Sua chave fica criptografada</p>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>Antes de ser salva, a chave é criptografada (AES-256-GCM). No banco fica só o texto cifrado.</li>
        <li>
          Ninguém tem acesso a ela pela plataforma: nem outros usuários nem o administrador. Depois de salva, a tela mostra
          só o começo e o fim dela.
        </li>
        <li>Ela é usada apenas para processar os seus pedidos. O custo de uso é cobrado direto pelo provedor da IA.</li>
        <li>Você pode trocar ou apagar a chave quando quiser em Ajustes.</li>
      </ul>
    </div>
  );
}

/** Conta liberada pelo admin: processa com a chave dele, sem vê-la. */
export function SharedAiKeyNotice() {
  return (
    <div className="rounded-lg border border-emerald-300/20 bg-emerald-300/10 p-4 text-sm leading-6 text-emerald-200">
      <p className="font-semibold">Sua conta usa a chave de IA liberada pelo administrador.</p>
      <p className="mt-1">Não é preciso cadastrar uma chave.</p>
    </div>
  );
}
