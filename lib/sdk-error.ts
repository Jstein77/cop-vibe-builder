import { AgentBusyError, CursorSdkError, IntegrationNotConnectedError } from "@cursor/sdk";

export type FormattedSdkError = {
  message: string;
  helpUrl?: string;
  code?: string;
};

export function formatSdkError(error: unknown): FormattedSdkError {
  if (error instanceof IntegrationNotConnectedError) {
    console.error(
      `[vibe] ${error.provider} integration is not connected. Reconnect at ${error.helpUrl}`,
    );
    return {
      message: `${error.provider} is not connected to Cursor. Reconnect it, then try the request again.`,
      helpUrl: error.helpUrl,
      code: error.code,
    };
  }

  if (error instanceof AgentBusyError) {
    return {
      message: "This agent is still working. Wait for the current run to finish, then send the follow-up.",
      code: error.code ?? "agent_busy",
    };
  }

  if (error instanceof CursorSdkError) {
    return { message: error.message, code: error.code };
  }

  if (error instanceof Error) {
    const extra = error as Error & { helpUrl?: string; code?: string };
    return { message: extra.message, helpUrl: extra.helpUrl, code: extra.code };
  }
  return { message: "The agent request failed." };
}
