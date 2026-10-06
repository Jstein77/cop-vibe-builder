import type { ClientEvent } from "@/lib/types";

const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
};

export function sseResponse(start: (send: (event: ClientEvent) => void) => Promise<void>): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const send = (event: ClientEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          // The browser went away (refresh, closed tab). Stop writing instead of throwing
          // back into whoever published the event.
          closed = true;
        }
      };
      try {
        await start(send);
      } catch (error) {
        const message = error instanceof Error ? error.message : "The stream failed.";
        send({ type: "error", message, at: Date.now() });
      } finally {
        closed = true;
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}
