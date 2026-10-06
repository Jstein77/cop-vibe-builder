#!/usr/bin/env python3
"""Deny shell commands that deploy or touch cloud credentials.

Project hooks run from the repository root. Exit 0 and print a deny decision
so the agent keeps going with an explanation. failClosed on the hook definition
blocks the command if this script crashes.
"""

import json
import re
import sys

BLOCKED = re.compile(
    r"""
    \baws\b
    | \bkubectl\b
    | \bterraform\b
    | \bpulumi\b
    | \bhelm\b
    | \bgcloud\b
    | \bvercel\b
    | \bfly(?:ctl)?\b
    | \bwrangler\b
    | \bserverless\b
    | \baz\s+(?:webapp|container|deployment)\b
    | docker\s+push
    | npm\s+publish
    | pnpm\s+publish
    | \bdeploy\b
    """,
    re.IGNORECASE | re.VERBOSE,
)


def main() -> int:
    raw = sys.stdin.read()
    try:
        payload = json.loads(raw) if raw.strip() else {}
    except json.JSONDecodeError:
        payload = {}

    command = payload.get("command") or ""
    if not isinstance(command, str):
        command = str(command)

    if BLOCKED.search(command):
        json.dump(
            {
                "continue": True,
                "permission": "deny",
                "user_message": "Deploy and cloud commands are blocked in generated apps.",
                "agent_message": (
                    f"The command {command!r} was blocked by the template hook. "
                    "Do not deploy and do not call Azure or AWS. Open a pull request and let "
                    "GitHub Actions ship it."
                ),
            },
            sys.stdout,
        )
        return 0

    json.dump({"continue": True, "permission": "allow"}, sys.stdout)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
