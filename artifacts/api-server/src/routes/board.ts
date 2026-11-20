import { getAuth } from "@clerk/express";
import { asc, count, eq, sql } from "drizzle-orm";
import {
  type Request,
  type Response,
  Router,
  type IRouter,
} from "express";
import {
  appUsersTable,
  db,
  tasksTable,
  type AppUser,
} from "@workspace/db";
import {
  CreateTaskBody,
  CreateTaskResponse,
  DeleteTaskParams,
  EnsureCurrentUserBody,
  EnsureCurrentUserResponse,
  GetBoardSummaryResponse,
  ListTasksQueryParams,
  ListTasksResponse,
  ListTeamMembersResponse,
  UpdateTaskBody,
  UpdateTaskParams,
  UpdateTaskResponse,
  UpdateTeamMemberRoleBody,
  UpdateTeamMemberRoleParams,
  UpdateTeamMemberRoleResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();
const eventClients = new Set<Response>();

function clerkUserId(req: Request): string | undefined {
  return getAuth(req as Parameters<typeof getAuth>[0]).userId ?? undefined;
}

async function requireBoardUser(
  req: Request,
  res: Response,
): Promise<AppUser | null> {
  const id = clerkUserId(req);
  if (!id) {
    res.status(401).json({ error: "Authentication required" });
    return null;
  }

  const [user] = await db
    .select()
    .from(appUsersTable)
    .where(eq(appUsersTable.id, id))
    .limit(1);

  if (!user) {
    res.status(409).json({ error: "Complete your profile before using the board" });
    return null;
  }

  return user;
}

function serializeMember<T extends { createdAt: Date }>(member: T) {
  return { ...member, createdAt: member.createdAt.toISOString() };
}

function serializeTask<
  T extends { createdAt: Date; updatedAt: Date },
>(task: T) {
  return {
    ...task,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  };
}

function broadcastBoardChange(): void {
  const message = `event: board-change\ndata: {"changedAt":"${new Date().toISOString()}"}\n\n`;
  for (const client of eventClients) {
    client.write(message);
  }
}

async function assigneeExists(assigneeId: string | null | undefined) {
  if (!assigneeId) return true;
  const [member] = await db
    .select({ id: appUsersTable.id })
    .from(appUsersTable)
    .where(eq(appUsersTable.id, assigneeId))
    .limit(1);
  return Boolean(member);
}

router.post("/users/me", async (req, res): Promise<void> => {
  const id = clerkUserId(req);
  if (!id) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const parsed = EnsureCurrentUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const email = parsed.data.email.trim().toLowerCase();
  const name = parsed.data.name.trim();
  if (!email || !name) {
    res.status(400).json({ error: "Email and name are required" });
    return;
  }

  const result = await db.transaction(async (tx) => {
    // Serialize first-user provisioning so simultaneous signups cannot both
    // claim the first-admin role.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(84729103)`);

    const [existing] = await tx
      .select()
      .from(appUsersTable)
      .where(eq(appUsersTable.id, id))
      .limit(1);

    if (existing) {
      const [updated] = await tx
        .update(appUsersTable)
        .set({ email, name })
        .where(eq(appUsersTable.id, id))
        .returning();
      return { user: updated, isNew: false };
    }

    const [{ total }] = await tx
      .select({ total: count() })
      .from(appUsersTable);
    const [created] = await tx
      .insert(appUsersTable)
      .values({
        id,
        email,
        name,
        role: Number(total) === 0 ? "admin" : "member",
      })
      .returning();
    return { user: created, isNew: true };
  });

  if (result.isNew) broadcastBoardChange();
  res.json(EnsureCurrentUserResponse.parse(serializeMember(result.user)));
});

router.get("/team", async (req, res): Promise<void> => {
  const currentUser = await requireBoardUser(req, res);
  if (!currentUser) return;

  const members = await db
    .select()
    .from(appUsersTable)
    .orderBy(asc(appUsersTable.createdAt));
  res.json(ListTeamMembersResponse.parse(members.map(serializeMember)));
});

router.patch("/team/:userId/role", async (req, res): Promise<void> => {
  const currentUser = await requireBoardUser(req, res);
  if (!currentUser) return;
  if (currentUser.role !== "admin") {
    res.status(403).json({ error: "Admin role required" });
    return;
  }

  const params = UpdateTeamMemberRoleParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = UpdateTeamMemberRoleBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const updateResult = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(84729103)`);
    const [target] = await tx
      .select()
      .from(appUsersTable)
      .where(eq(appUsersTable.id, params.data.userId))
      .limit(1);
    if (!target) return { kind: "missing" as const };

    if (target.role === "admin" && body.data.role === "member") {
      const [{ totalAdmins }] = await tx
        .select({ totalAdmins: count() })
        .from(appUsersTable)
        .where(eq(appUsersTable.role, "admin"));
      if (Number(totalAdmins) <= 1) {
        return { kind: "last-admin" as const };
      }
    }

    const [updated] = await tx
      .update(appUsersTable)
      .set({ role: body.data.role })
      .where(eq(appUsersTable.id, target.id))
      .returning();
    return { kind: "updated" as const, user: updated };
  });

  if (updateResult.kind === "missing") {
    res.status(404).json({ error: "Team member not found" });
    return;
  }
  if (updateResult.kind === "last-admin") {
    res.status(409).json({ error: "The board must keep at least one admin" });
    return;
  }

  broadcastBoardChange();
  res.json(
    UpdateTeamMemberRoleResponse.parse(serializeMember(updateResult.user)),
  );
});

router.get("/tasks", async (req, res): Promise<void> => {
  const currentUser = await requireBoardUser(req, res);
  if (!currentUser) return;

  const parsed = ListTasksQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const rows = await db
    .select({
      id: tasksTable.id,
      title: tasksTable.title,
      description: tasksTable.description,
      status: tasksTable.status,
      assigneeId: tasksTable.assigneeId,
      assigneeName: appUsersTable.name,
      dueDate: tasksTable.dueDate,
      createdById: tasksTable.createdById,
      createdAt: tasksTable.createdAt,
      updatedAt: tasksTable.updatedAt,
    })
    .from(tasksTable)
    .leftJoin(appUsersTable, eq(tasksTable.assigneeId, appUsersTable.id))
    .where(
      parsed.data.assigneeId
        ? eq(tasksTable.assigneeId, parsed.data.assigneeId)
        : undefined,
    )
    .orderBy(asc(tasksTable.createdAt));

  res.json(ListTasksResponse.parse(rows.map(serializeTask)));
});

router.get("/tasks/summary", async (req, res): Promise<void> => {
  const currentUser = await requireBoardUser(req, res);
  if (!currentUser) return;

  const rows = await db
    .select({
      status: tasksTable.status,
      dueDate: tasksTable.dueDate,
    })
    .from(tasksTable);
  const today = new Date().toISOString().slice(0, 10);
  const byStatus = { todo: 0, in_progress: 0, done: 0 };
  let overdue = 0;

  for (const task of rows) {
    byStatus[task.status] += 1;
    if (task.status !== "done" && task.dueDate && task.dueDate < today) {
      overdue += 1;
    }
  }

  res.json(
    GetBoardSummaryResponse.parse({
      total: rows.length,
      overdue,
      byStatus,
    }),
  );
});

router.post("/tasks", async (req, res): Promise<void> => {
  const currentUser = await requireBoardUser(req, res);
  if (!currentUser) return;

  const parsed = CreateTaskBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (!parsed.data.title.trim()) {
    res.status(400).json({ error: "Task title is required" });
    return;
  }
  if (!(await assigneeExists(parsed.data.assigneeId))) {
    res.status(400).json({ error: "Choose a current team member as assignee" });
    return;
  }

  const [task] = await db
    .insert(tasksTable)
    .values({
      ...parsed.data,
      dueDate: parsed.data.dueDate ?? null,
      title: parsed.data.title.trim(),
      createdById: currentUser.id,
    })
    .returning();
  const [withAssignee] = await db
    .select({
      id: tasksTable.id,
      title: tasksTable.title,
      description: tasksTable.description,
      status: tasksTable.status,
      assigneeId: tasksTable.assigneeId,
      assigneeName: appUsersTable.name,
      dueDate: tasksTable.dueDate,
      createdById: tasksTable.createdById,
      createdAt: tasksTable.createdAt,
      updatedAt: tasksTable.updatedAt,
    })
    .from(tasksTable)
    .leftJoin(appUsersTable, eq(tasksTable.assigneeId, appUsersTable.id))
    .where(eq(tasksTable.id, task.id));

  broadcastBoardChange();
  res.status(201).json(CreateTaskResponse.parse(serializeTask(withAssignee)));
});

router.patch("/tasks/:taskId", async (req, res): Promise<void> => {
  const currentUser = await requireBoardUser(req, res);
  if (!currentUser) return;

  const params = UpdateTaskParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = UpdateTaskBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  if (Object.keys(body.data).length === 0) {
    res.status(400).json({ error: "Provide at least one task field to update" });
    return;
  }
  if (
    Object.hasOwn(body.data, "assigneeId") &&
    !(await assigneeExists(body.data.assigneeId))
  ) {
    res.status(400).json({ error: "Choose a current team member as assignee" });
    return;
  }

  if (body.data.title !== undefined && !body.data.title.trim()) {
    res.status(400).json({ error: "Task title is required" });
    return;
  }

  const { dueDate, ...fields } = body.data;
  const updateValues = {
    ...fields,
    ...(Object.hasOwn(body.data, "dueDate")
      ? { dueDate: dueDate ?? null }
      : {}),
    ...(fields.title !== undefined
      ? { title: fields.title.trim() }
      : {}),
    updatedAt: new Date(),
  };
  const [updatedTask] = await db
    .update(tasksTable)
    .set(updateValues)
    .where(eq(tasksTable.id, params.data.taskId))
    .returning();
  if (!updatedTask) {
    res.status(404).json({ error: "Task not found" });
    return;
  }

  const [withAssignee] = await db
    .select({
      id: tasksTable.id,
      title: tasksTable.title,
      description: tasksTable.description,
      status: tasksTable.status,
      assigneeId: tasksTable.assigneeId,
      assigneeName: appUsersTable.name,
      dueDate: tasksTable.dueDate,
      createdById: tasksTable.createdById,
      createdAt: tasksTable.createdAt,
      updatedAt: tasksTable.updatedAt,
    })
    .from(tasksTable)
    .leftJoin(appUsersTable, eq(tasksTable.assigneeId, appUsersTable.id))
    .where(eq(tasksTable.id, updatedTask.id));

  broadcastBoardChange();
  res.json(UpdateTaskResponse.parse(serializeTask(withAssignee)));
});

router.delete("/tasks/:taskId", async (req, res): Promise<void> => {
  const currentUser = await requireBoardUser(req, res);
  if (!currentUser) return;
  if (currentUser.role !== "admin") {
    res.status(403).json({ error: "Admin role required" });
    return;
  }

  const params = DeleteTaskParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [deleted] = await db
    .delete(tasksTable)
    .where(eq(tasksTable.id, params.data.taskId))
    .returning({ id: tasksTable.id });
  if (!deleted) {
    res.status(404).json({ error: "Task not found" });
    return;
  }

  broadcastBoardChange();
  res.sendStatus(204);
});

router.get("/events", async (req, res): Promise<void> => {
  const currentUser = await requireBoardUser(req, res);
  if (!currentUser) return;

  res.status(200);
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();
  res.write("event: connected\ndata: {}\n\n");
  eventClients.add(res);

  const heartbeat = setInterval(() => {
    res.write(": keep-alive\n\n");
  }, 25_000);

  res.on("close", () => {
    clearInterval(heartbeat);
    eventClients.delete(res);
  });
});

export default router;
