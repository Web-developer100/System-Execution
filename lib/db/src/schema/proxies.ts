import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const proxiesTable = pgTable("proxies", {
  id: serial("id").primaryKey(),
  ip: text("ip").notNull(),
  port: integer("port").notNull(),
  protocol: text("protocol").notNull().default("http"),
  username: text("username"),
  password: text("password"),
  status: text("status").notNull().default("active"),
  latency: integer("latency"),
  country: text("country"),
  isp: text("isp"),
  healthScore: integer("health_score").default(100),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertProxySchema = createInsertSchema(proxiesTable).omit({ id: true, createdAt: true });
export type InsertProxy = z.infer<typeof insertProxySchema>;
export type Proxy = typeof proxiesTable.$inferSelect;
