import { Router, type IRouter } from "express";
import { spawnSync } from "node:child_process";
import path from "node:path";
import {
  ApproveTaskParams,
  ApproveTaskResponse,
  CreateTaskBody,
  CreateTaskResponse,
  GetDashboardResponse,
  ListActivityResponse,
  ListTasksResponse,
  RunTaskParams,
  RunTaskResponse,
} from "@workspace/api-zod";

type Category = "home" | "money" | "health" | "errands" | "family";
type Status = "ready" | "needs_approval" | "completed" | "paused";

type Task = {
  id: number;
  title: string;
  category: Category;
  cadence: string;
  status: Status;
  nextRun: string;
  owner: string;
  impact: string;
  detail?: string;
  action?: string | null;
};

type Activity = {
  id: number;
  label: string;
  time: string;
  tone: "positive" | "neutral" | "attention";
};

const tasks: Task[] = [
  {
    id: 1,
    title: "Restock the household staples",
    category: "home",
    cadence: "Every Sunday",
    status: "ready",
    nextRun: "Today, 6:00 PM",
    owner: "Everyday Agent",
    impact: "Saves 25 min",
    detail: "Check the shared list, group the essentials, and draft the cart.",
    action: null,
  },
  {
    id: 2,
    title: "Review the electricity bill",
    category: "money",
    cadence: "Monthly",
    status: "needs_approval",
    nextRun: "Waiting on you",
    owner: "Everyday Agent",
    impact: "Due tomorrow",
    detail: "The bill is ready. Confirm the amount before anything is paid.",
    action: "Approve ₹2,840 payment",
  },
  {
    id: 3,
    title: "Prepare the weekly wellness check-in",
    category: "health",
    cadence: "Every Monday",
    status: "completed",
    nextRun: "Next Monday",
    owner: "Everyday Agent",
    impact: "Saved 15 min",
    detail: "Summarize your notes and surface anything worth discussing.",
    action: null,
  },
  {
    id: 4,
    title: "Coordinate school pickup",
    category: "family",
    cadence: "Weekdays",
    status: "ready",
    nextRun: "Tomorrow, 3:30 PM",
    owner: "Everyday Agent",
    impact: "Saves 10 min",
    detail: "Check the family calendar and draft the pickup reminder.",
    action: null,
  },
];

const activity: Activity[] = [
  { id: 1, label: "Prepared your weekly wellness check-in", time: "12 min ago", tone: "positive" },
  { id: 2, label: "Found a lower-cost grocery option", time: "Yesterday", tone: "positive" },
  { id: 3, label: "Electricity bill is waiting for approval", time: "Yesterday", tone: "attention" },
  { id: 4, label: "Quiet hours started", time: "Yesterday", tone: "neutral" },
];

function addActivity(label: string, tone: Activity["tone"]): void {
  activity.unshift({ id: Date.now(), label, time: "Just now", tone });
}

function runStrands(task: Task): {
  summary: string;
  decision: "auto_completed" | "needs_approval";
  steps: string[];
  model: string;
  timestamp: string;
} {
  const script = path.join(process.cwd(), "agent_runtime", "agent.py");
  const result = spawnSync("python", [script, JSON.stringify(task)], {
    encoding: "utf8",
    timeout: 20_000,
  });

  if (result.status === 0 && result.stdout) {
    try {
      return JSON.parse(result.stdout.trim());
    } catch {
      // Fall through to the same explicit local-safe result used if Python is unavailable.
    }
  }

  const needsApproval = task.category === "money" || task.category === "health";
  return {
    summary: needsApproval
      ? `Prepared ${task.title.toLowerCase()} for your review.`
      : `Handled the quiet work for ${task.title.toLowerCase()}.`,
    decision: needsApproval ? "needs_approval" : "auto_completed",
    steps: ["Read the task context", "Prepared the next action", "Applied the approval boundary"],
    model: "Strands local-safe fallback",
    timestamp: new Date().toISOString(),
  };
}

const router: IRouter = Router();

router.get("/dashboard", (_req, res) => {
  const waiting = tasks.filter((task) => task.status === "needs_approval").length;
  const completed = tasks.filter((task) => task.status === "completed").length;
  res.json(
    GetDashboardResponse.parse({
      greeting: "Good evening, Ananya",
      quietHours: "Quiet hours · 10:00 PM – 7:00 AM",
      savedMinutes: 126,
      waiting,
      completed,
      taskCount: tasks.length,
      nextUp: tasks.filter((task) => task.status !== "completed").slice(0, 3),
    }),
  );
});

router.get("/tasks", (_req, res) => {
  res.json(ListTasksResponse.parse(tasks));
});

router.post("/tasks", (req, res) => {
  const input = CreateTaskBody.parse(req.body);
  const task: Task = {
    id: Math.max(...tasks.map((item) => item.id)) + 1,
    title: input.title,
    category: input.category,
    cadence: input.cadence,
    status: "ready",
    nextRun: "Tomorrow",
    owner: "Everyday Agent",
    impact: "Will save time",
    detail: input.detail,
    action: null,
  };
  tasks.unshift(task);
  addActivity(`Added ${task.title.toLowerCase()} to your quiet work`, "neutral");
  res.status(201).json(CreateTaskResponse.parse(task));
});

router.post("/tasks/:id/run", (req, res) => {
  const { id } = RunTaskParams.parse(req.params);
  const task = tasks.find((item) => item.id === id);
  if (!task) {
    res.status(404).json({ error: "Task not found" });
    return;
  }
  const run = runStrands(task);
  task.status = run.decision === "needs_approval" ? "needs_approval" : "completed";
  task.action = run.decision === "needs_approval" ? "Review the prepared action" : null;
  addActivity(
    run.decision === "needs_approval"
      ? `Prepared ${task.title.toLowerCase()} for your approval`
      : `Completed ${task.title.toLowerCase()} quietly`,
    run.decision === "needs_approval" ? "attention" : "positive",
  );
  res.json(RunTaskResponse.parse({ task, ...run }));
});

router.post("/tasks/:id/approve", (req, res) => {
  const { id } = ApproveTaskParams.parse(req.params);
  const task = tasks.find((item) => item.id === id);
  if (!task) {
    res.status(404).json({ error: "Task not found" });
    return;
  }
  task.status = "completed";
  task.action = null;
  task.nextRun = "Next cycle";
  addActivity(`Approved and completed ${task.title.toLowerCase()}`, "positive");
  res.json(ApproveTaskResponse.parse(task));
});

router.get("/activity", (_req, res) => {
  res.json(ListActivityResponse.parse(activity.slice(0, 20)));
});

export default router;