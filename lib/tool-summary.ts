function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pickString(record: Record<string, unknown> | undefined, keys: string[]): string | undefined {
  if (!record) return undefined;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

export function summarizeTool(args: unknown, result: unknown): string | undefined {
  const record = isRecord(args) ? args : undefined;
  const command = pickString(record, ["command", "cmd"]);
  const file = pickString(record, ["path", "file_path", "filePath", "target_file"]);
  const query = pickString(record, ["pattern", "query", "glob_pattern", "glob"]);
  let detail = command || file || query;

  if (command && isRecord(result)) {
    const exit = result.exitCode ?? result.exit_code;
    if (typeof exit === "number") {
      detail = `${truncate(command, 120)} · exit ${exit}`;
    }
  }

  return detail ? truncate(detail, 180) : undefined;
}
