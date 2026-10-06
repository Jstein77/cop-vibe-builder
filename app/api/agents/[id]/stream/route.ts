import { isTerminalEvent } from "@/lib/reduce";
import { catchUp } from "@/lib/store";
import { sseResponse } from "@/lib/sse";
import type { ClientEvent } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const afterParam = Number(new URL(request.url).searchParams.get("after") ?? "0");
  const after = Number.isFinite(afterParam) && afterParam > 0 ? Math.floor(afterParam) : 0;

  return sseResponse(async (send) => {
    let resolveDone: () => void = () => {};
    const finished = new Promise<void>((resolve) => {
      resolveDone = resolve;
    });

    // Stop waiting as soon as the browser disconnects so the listener is released.
    request.signal.addEventListener("abort", () => resolveDone(), { once: true });

    const mark = (event: ClientEvent) => {
      if (isTerminalEvent(event)) resolveDone();
    };

    const { request: stored, events, unsubscribe } = await catchUp(id, after, (event) => {
      send(event);
      mark(event);
    });

    if (!stored) {
      unsubscribe();
      send({ type: "error", message: "No request with that id.", at: Date.now() });
      return;
    }

    for (const event of events) {
      send(event);
      mark(event);
    }

    const sawTerminal = events.some(isTerminalEvent);
    const spendKnown = stored.chargedCents != null;
    const closed =
      stored.status === "error" ||
      stored.status === "cancelled" ||
      sawTerminal ||
      (stored.status === "finished" && spendKnown);
    if (closed || stored.status !== "running") {
      if (!sawTerminal && stored.status === "finished" && !spendKnown) {
        const timer = setTimeout(() => resolveDone(), 4000);
        await finished;
        clearTimeout(timer);
      }
      unsubscribe();
      return;
    }

    await finished;
    unsubscribe();
  });
}
