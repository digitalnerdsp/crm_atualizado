import { Cron } from "croner";
import { runContractBilling } from "../finance/recurrence/billing";
import { generateRecurringTasks } from "../task/recurrence";
import { checkCrmActivityReminders, checkRottingDeals } from "./crm-reminders";
import { checkDueDateReminders } from "./due-date-reminders";
import { checkProjectWebhookReminders } from "./project-webhook-reminders";

const jobs: Cron[] = [];

export function initializeScheduler(): void {
  jobs.push(
    new Cron("17 * * * *", async () => {
      try {
        await runContractBilling();
      } catch (error) {
        console.error("Contract billing scheduler failed", error);
      }
    }),
  );
  void runContractBilling().catch((error) =>
    console.error("Contract billing startup failed", error),
  );
  jobs.push(new Cron("*/5 * * * *", checkDueDateReminders));
  jobs.push(new Cron("*/5 * * * *", checkProjectWebhookReminders));
  jobs.push(
    new Cron("*/5 * * * *", async () => {
      try {
        await checkCrmActivityReminders();
      } catch (error) {
        console.error("Failed to check CRM activity reminders", error);
      }
    }),
  );
  // Stalled deals change on a scale of days, so an hourly pass is enough and
  // keeps the 5-minute cycle free.
  jobs.push(
    new Cron("7 * * * *", async () => {
      try {
        await checkRottingDeals();
      } catch (error) {
        console.error("Failed to check rotting CRM deals", error);
      }
    }),
  );
  jobs.push(
    new Cron("*/5 * * * *", async () => {
      try {
        await generateRecurringTasks();
      } catch (error) {
        console.error("Failed to generate recurring tasks", error);
      }
    }),
  );
  void generateRecurringTasks().catch((error) => {
    console.error("Failed to generate recurring tasks at startup", error);
  });
  console.log(
    "⏰ Scheduler started (reminders and recurring tasks every 5 minutes)",
  );
}

export function isSchedulerRunning(): boolean {
  return jobs.length > 0;
}

export function shutdownScheduler(): void {
  for (const job of jobs) {
    job.stop();
  }
  jobs.length = 0;
}
