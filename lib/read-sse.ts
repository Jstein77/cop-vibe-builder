import type { ClientEvent } from "@/lib/types";

export async function readSse(
  response: Response,
  onEvent: (event: ClientEvent) => void,
  signal: AbortSignal,
) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("The agent stream did not start.");
  const decoder = new TextDecoder();
  let buffer = "";

  while (!signal.aborted) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() ?? "";
    for (const chunk of chunks) {
      const line = chunk.split("\n").find((item) => item.startsWith("data: "));
      if (!line) continue;
      onEvent(JSON.parse(line.slice(6)) as ClientEvent);
    }
  }
}
