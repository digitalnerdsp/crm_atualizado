CREATE INDEX "calendar_event_workspace_startAt_idx" ON "calendar_event" USING btree ("workspace_id","start_at");--> statement-breakpoint
CREATE INDEX "calendar_event_workspace_endAt_idx" ON "calendar_event" USING btree ("workspace_id","end_at");--> statement-breakpoint
CREATE INDEX "task_calendar_start_idx" ON "task" USING btree (COALESCE("start_date", "due_date"));--> statement-breakpoint
CREATE INDEX "task_calendar_end_idx" ON "task" USING btree (COALESCE("due_date", "start_date"));