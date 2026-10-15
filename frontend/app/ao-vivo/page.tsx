"use client";

import { useEffect, useRef, useState } from "react";

import { LiveFeed } from "@/components/live-feed";
import { LIVE_CHANNEL, type LiveMessage, type LiveState } from "@/lib/recording/live-assistant";

const EMPTY_STATE: LiveState = { lines: [], suggestions: [], active: false, error: null };

/** Janela flutuante: espelha o assistente que roda na página de gravação. */
export default function AoVivoPage() {
  const [state, setState] = useState<LiveState>(EMPTY_STATE);
  const channelRef = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    const channel = new BroadcastChannel(LIVE_CHANNEL);
    channelRef.current = channel;
    channel.onmessage = (event: MessageEvent<LiveMessage>) => {
      if (event.data.type === "state") {
        setState(event.data.state);
      }
    };
    channel.postMessage({ type: "request-state" } satisfies LiveMessage);
    return () => channel.close();
  }, []);

  return (
    <div className="flex h-screen flex-col p-3">
      <div className="mb-3 flex items-center gap-2 text-xs text-slate">
        <span className={`h-2 w-2 rounded-full ${state.active ? "animate-pulse bg-rose-400" : "bg-slate"}`} />
        {state.active ? "Gravando · modo ao vivo" : "Nenhuma gravação ao vivo agora"}
      </div>
      <div className="min-h-0 flex-1">
        <LiveFeed
          compact
          state={state}
          onSuggest={(focus) => channelRef.current?.postMessage({ type: "suggest", focus } satisfies LiveMessage)}
        />
      </div>
    </div>
  );
}
