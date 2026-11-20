import { createInsertSchema } from "drizzle-zod";
import {
  date,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const memberRoleEnum = pgEnum("member_role", ["admin", "member"]);
export const taskStatusEnum = pgEnum("task_status", [
  "todo",
  "in_progress",
  "done",
]);

export const appUsersTable = pgTable("app_users", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  name: text("name").notNull(),
  role: memberRoleEnum("role").notNull().default("member"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const tasksTable = pgTable("tasks", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  status: taskStatusEnum("status").notNull().default("todo"),
  assigneeId: text("assignee_id").references(() => appUsersTable.id, {
    onDelete: "set null",
  }),
  dueDate: date("due_date", { mode: "string" }),
  createdById: text("created_by_id")
    .notNull()
    .references(() => appUsersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertAppUserSchema = createInsertSchema(appUsersTable).omit({
  createdAt: true,
});
export const insertTaskSchema = createInsertSchema(tasksTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertAppUser = z.infer<typeof insertAppUserSchema>;
export type InsertTask = z.infer<typeof insertTaskSchema>;
export type AppUser = typeof appUsersTable.$inferSelect;
export type TaskRecord = typeof tasksTable.$inferSelect;
