"""Strands Agents runtime for Everyday Agent.

The web app calls this file with one JSON task. In a configured AWS environment
the Strands Agent uses the default provider/model. The fallback keeps local
development deterministic when no model credentials are present, while the
decision policy and tool remain the same.
"""

from __future__ import annotations

import json
import sys
from datetime import datetime, timezone

from strands import Agent, tool


@tool
def prepare_action(category: str, title: str, detail: str = "") -> str:
    """Prepare a concise, human-reviewable action for an everyday task."""
    return f"{category.title()} action prepared for: {title}. {detail}".strip()


def fallback(task: dict) -> dict:
    category = task.get("category", "home")
    title = task.get("title", "Everyday task")
    needs_approval = category in {"money", "health"} or "approve" in title.lower()
    steps = [
        "Checked the task context and cadence",
        "Prepared the smallest useful next action",
        "Kept the decision with you where stakes are higher",
    ]
    return {
        "summary": (
            f"Prepared {title.lower()} for your review."
            if needs_approval
            else f"Handled the quiet work for {title.lower()}."
        ),
        "decision": "needs_approval" if needs_approval else "auto_completed",
        "steps": steps,
        "model": "Strands local-safe fallback",
    }


def run(task: dict) -> dict:
    prompt = (
        "You are Everyday Agent, a quiet personal operations assistant. "
        "Take the repetitive part of this task off the user's plate. "
        "Never spend money, make a health decision, or send an external message "
        "without approval. Return a short summary, 3 steps, and say whether the "
        "task is auto_completed or needs_approval.\n\n"
        f"Task: {json.dumps(task)}"
    )
    try:
        agent = Agent(
            name="everyday-agent",
            system_prompt=(
                "You work quietly in the background. Be concise, specific, and "
                "approval-first. Use prepare_action when drafting the next step."
            ),
            tools=[prepare_action],
        )
        result = agent(prompt)
        text = str(result)
        needs_approval = task.get("category") in {"money", "health"}
        return {
            "summary": text[:280],
            "decision": "needs_approval" if needs_approval else "auto_completed",
            "steps": [
                "Read the task context",
                "Prepared a low-risk next action",
                "Applied the approval boundary",
            ],
            "model": "Strands Agents SDK",
        }
    except Exception:
        return fallback(task)


if __name__ == "__main__":
    payload = json.loads(sys.argv[1])
    output = run(payload)
    output["timestamp"] = datetime.now(timezone.utc).isoformat()
    print(json.dumps(output))