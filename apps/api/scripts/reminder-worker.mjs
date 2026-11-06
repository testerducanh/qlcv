import { Queue, Worker } from "bullmq";
import { randomUUID } from "node:crypto";
import Redis from "ioredis";
import { PrismaClient } from "@prisma/client";
import nodemailer from "nodemailer";
import process from "node:process";
import { URL } from "node:url";

const queueName = "qlcv-reminders";
const heartbeatKey = "qlcv:ops:worker:reminders:heartbeat";
const workerInstanceId = randomUUID();
const prisma = new PrismaClient();
const redisUrl = new URL(process.env.REDIS_URL);
const connection = {
  host: redisUrl.hostname,
  port: Number(redisUrl.port || 6379),
  ...(redisUrl.username
    ? { username: decodeURIComponent(redisUrl.username) }
    : {}),
  ...(redisUrl.password
    ? { password: decodeURIComponent(redisUrl.password) }
    : {}),
  ...(redisUrl.pathname.length > 1
    ? { db: Number(redisUrl.pathname.slice(1)) }
    : {}),
  ...(redisUrl.protocol === "rediss:" ? { tls: {} } : {}),
  maxRetriesPerRequest: null,
};
const queue = new Queue(queueName, { connection });
const lockRedis = new Redis(redisUrl.toString(), {
  maxRetriesPerRequest: null,
});
const mailer = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "127.0.0.1",
  port: Number(process.env.SMTP_PORT || 1025),
  secure: process.env.SMTP_SECURE === "true",
  connectionTimeout: 15000,
  greetingTimeout: 15000,
  socketTimeout: 30000,
  ...(process.env.SMTP_USER && process.env.SMTP_PASSWORD
    ? { auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } }
    : {}),
});
const dailyMessageLimit = Number(
  process.env.NOTIFICATION_DAILY_MESSAGE_LIMIT ?? 1000,
);
if (!Number.isSafeInteger(dailyMessageLimit) || dailyMessageLimit < 0) {
  throw new Error(
    "NOTIFICATION_DAILY_MESSAGE_LIMIT must be a non-negative integer",
  );
}
let heartbeatInterval;

async function writeHeartbeat() {
  await lockRedis.set(
    heartbeatKey,
    JSON.stringify({ instanceId: workerInstanceId, timestamp: Date.now() }),
    "EX",
    90,
  );
}

async function clearHeartbeat() {
  await lockRedis.eval(
    "local value = redis.call('get', KEYS[1]); if not value then return 0 end; local ok, parsed = pcall(cjson.decode, value); if ok and parsed.instanceId == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
    1,
    heartbeatKey,
    workerInstanceId,
  );
}

function localClock(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  return Number(
    `${parts.find((part) => part.type === "hour").value}${parts.find((part) => part.type === "minute").value}`,
  );
}

function localDate(date, timeZone) {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(date);
}

function isQuiet(now, preference) {
  if (!preference?.quietStart || !preference.quietEnd) return false;
  const current = localClock(now, preference.timeZone);
  const start = Number(preference.quietStart.replace(":", ""));
  const end = Number(preference.quietEnd.replace(":", ""));
  return start <= end
    ? current >= start && current < end
    : current >= start || current < end;
}

function utcDay(date) {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

async function createNotifications(task, recipients, eventKey, day) {
  const eligible = [...new Set(recipients.filter(Boolean))];
  if (!eligible.length) return;
  const preferences = await prisma.notificationPreference.findMany({
    where: { userId: { in: eligible } },
  });
  const preferenceByUser = new Map(
    preferences.map((item) => [item.userId, item]),
  );
  const now = new Date();
  const data = eligible.flatMap((userId) => {
    const preference = preferenceByUser.get(userId);
    const urgent = task.priority === "urgent";
    if (
      !urgent &&
      (preference?.disabledTypes.includes(eventKey) ||
        (!preference?.digestEnabled && isQuiet(now, preference)))
    ) {
      return [];
    }
    return [
      {
        userId,
        type: eventKey,
        dedupeKey: `${eventKey}:${task.id}:${day}:${userId}`,
        digestOnly: !urgent && (preference?.digestEnabled ?? false),
        payload: {
          projectId: task.projectId,
          taskId: task.id,
          ...(urgent ? { urgent: true } : {}),
        },
      },
    ];
  });
  if (data.length)
    await prisma.notification.createMany({ data, skipDuplicates: true });
}

async function notifyOverdueTask(task, now) {
  if (!task.dueDate || !task.assigneeId) return;
  const overdueDays = Math.floor(
    (utcDay(now) - utcDay(task.dueDate)) / 86400000,
  );
  const daysUntilDue = Math.floor(
    (utcDay(task.dueDate) - utcDay(now)) / 86400000,
  );
  if (daysUntilDue === 3 || daysUntilDue === 1) {
    await createNotifications(
      task,
      [task.assigneeId],
      "task_due_soon",
      daysUntilDue,
    );
  }
  if (overdueDays < 1) return;
  await createNotifications(
    task,
    [task.assigneeId],
    "task_overdue",
    overdueDays,
  );
  if (overdueDays >= 1) {
    await createNotifications(
      task,
      [task.assigneeId],
      "task_escalated_assignee",
      1,
    );
  }
  if (overdueDays >= 3 && task.assignerId) {
    await createNotifications(
      task,
      [task.assignerId],
      "task_escalated_assigner",
      3,
    );
  }
  if (overdueDays >= 5) {
    const heads = await prisma.user.findMany({
      where: {
        organizationId: task.project.branch.organizationId,
        branchId: task.project.branchId,
        systemRole: "department_head",
        status: "active",
        ...(task.assignee.departmentId
          ? { departmentId: task.assignee.departmentId }
          : {}),
      },
      select: { id: true },
    });
    await createNotifications(
      task,
      heads.map((head) => head.id),
      "task_escalated_department",
      5,
    );
    if (task.priority === "urgent") {
      const directors = await prisma.user.findMany({
        where: {
          organizationId: task.project.branch.organizationId,
          branchId: task.project.branchId,
          systemRole: "branch_director",
          status: "active",
        },
        select: { id: true },
      });
      await createNotifications(
        task,
        directors.map((director) => director.id),
        "task_escalated_director",
        5,
      );
    }
  }
}

function preferenceChannels(preference, type) {
  const configured = preference?.channels;
  const selected =
    configured && typeof configured === "object" ? configured[type] : undefined;
  return Array.isArray(selected)
    ? [
        ...new Set(
          selected.filter((channel) =>
            ["email", "zalo", "sms"].includes(channel),
          ),
        ),
      ]
    : [];
}

async function enqueueNotificationDeliveries(now) {
  const recent = await prisma.notification.findMany({
    where: {
      createdAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
      deliveries: { none: {} },
    },
    select: {
      id: true,
      type: true,
      user: {
        select: {
          status: true,
          notificationPreference: true,
        },
      },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: 500,
  });

  for (const notification of recent) {
    const preference = notification.user.notificationPreference;
    if (!preference || notification.user.status !== "active") continue;
    const channels = preferenceChannels(preference, notification.type);
    if (!channels.length) continue;
    await prisma.notificationDelivery.createMany({
      data: channels.map((channel) => ({
        notificationId: notification.id,
        channel,
        nextAttemptAt: new Date(),
      })),
      skipDuplicates: true,
    });
  }
}

const eventLabels = {
  "task.assigned": "Bạn có việc mới cần nhận",
  "task.status_changed": "Trạng thái một việc đã thay đổi",
  task_due_soon: "Bạn có việc sắp đến hạn",
  task_overdue: "Bạn có việc đã quá hạn",
  task_escalated_assignee: "Bạn có việc cần được ưu tiên xử lý",
  task_escalated_assigner: "Một việc bạn giao cần được chú ý",
  task_escalated_department: "Phòng ban có việc cần được chú ý",
  task_escalated_director: "Có việc khẩn cần được xử lý",
  daily_digest: "Tóm tắt công việc hằng ngày",
  weekly_digest: "Tóm tắt công việc hằng tuần",
};

const channelAdapters = {
  email: async (delivery, message) => {
    const info = await mailer.sendMail({
      from: process.env.SMTP_FROM || "no-reply@qlcv.local",
      to: delivery.notification.user.email,
      ...message,
    });
    return info.messageId;
  },
  zalo: async (delivery) => {
    if (!delivery.notification.user.notificationPreference?.zaloUserId) {
      const error = new Error("Zalo recipient is not configured");
      error.code = "ZALO_RECIPIENT_REQUIRED";
      throw error;
    }
    return `mock:zalo:${delivery.id}`;
  },
  sms: async (delivery) => {
    if (!delivery.notification.user.notificationPreference?.phoneNumber) {
      const error = new Error("SMS recipient is not configured");
      error.code = "SMS_RECIPIENT_REQUIRED";
      throw error;
    }
    return `mock:sms:${delivery.id}`;
  },
};

function notificationMessage(notification) {
  const label = eventLabels[notification.type] || "Bạn có thông báo mới";
  const payload =
    notification.payload && typeof notification.payload === "object"
      ? notification.payload
      : {};
  const taskUrl =
    typeof payload.projectId === "string" && typeof payload.taskId === "string"
      ? new URL(
          `/du-an/${encodeURIComponent(payload.projectId)}?task=${encodeURIComponent(payload.taskId)}`,
          process.env.WEB_BASE_URL || "http://localhost:5173",
        ).toString()
      : new URL(
          "/thong-bao",
          process.env.WEB_BASE_URL || "http://localhost:5173",
        ).toString();
  const digestCount =
    typeof payload.count === "number"
      ? payload.count
      : Array.isArray(payload.notifications)
        ? payload.notifications.length
        : null;
  const summary =
    digestCount === null
      ? ""
      : ` Có ${digestCount} thông báo trong bản tóm tắt.`;
  return {
    subject: `QLCV: ${label}`,
    text: `${label}.${summary} Mở QLCV để xem chi tiết: ${taskUrl}`,
    html: `<p>${label}.${summary}</p><p><a href="${taskUrl}">Mở trong QLCV</a></p>`,
  };
}

async function deliverNotification(delivery, now) {
  const notification = delivery.notification;
  const preferences = notification.user.notificationPreference;
  const urgent =
    notification.type === "task_escalated_director" ||
    (notification.payload &&
      typeof notification.payload === "object" &&
      notification.payload.urgent === true);
  if (!urgent && isQuiet(now, preferences)) {
    await prisma.notificationDelivery.update({
      where: { id: delivery.id },
      data: {
        status: "pending",
        lockedAt: null,
        nextAttemptAt: new Date(now.getTime() + 15 * 60 * 1000),
      },
    });
    return false;
  }
  if (preferences?.disabledTypes.includes(notification.type) && !urgent) {
    await prisma.notificationDelivery.update({
      where: { id: delivery.id },
      data: {
        status: "failed",
        lockedAt: null,
        lastError: "Notification type disabled",
      },
    });
    return false;
  }

  const message = notificationMessage(notification);
  const adapter = channelAdapters[delivery.channel];
  if (!adapter) throw new Error("Notification channel adapter is unavailable");
  const providerMessageId = await adapter(delivery, message);
  await prisma.notificationDelivery.update({
    where: { id: delivery.id },
    data: {
      status: "sent",
      sentAt: new Date(),
      lockedAt: null,
      providerMessageId,
      lastError: null,
    },
  });
  return true;
}

async function dispatchNotificationDeliveries(now) {
  const lockKey = "qlcv:notification-dispatch-lock";
  const lockValue = randomUUID();
  if ((await lockRedis.set(lockKey, lockValue, "PX", 120000, "NX")) !== "OK")
    return;

  const renewLock = async () => {
    const renewed = await lockRedis.eval(
      "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('pexpire', KEYS[1], ARGV[2]) else return 0 end",
      1,
      lockKey,
      lockValue,
      "120000",
    );
    if (renewed !== 1) throw new Error("Notification dispatch lock was lost");
  };
  try {
    await enqueueNotificationDeliveries(now);
    const dispatchNow = new Date();
    await prisma.notificationDelivery.updateMany({
      where: {
        status: "processing",
        lockedAt: { lt: new Date(dispatchNow.getTime() - 5 * 60 * 1000) },
      },
      data: { status: "pending", lockedAt: null, nextAttemptAt: dispatchNow },
    });
    const dayStart = new Date(dispatchNow);
    dayStart.setUTCHours(0, 0, 0, 0);
    const sentToday = await prisma.notificationDelivery.count({
      where: { status: "sent", sentAt: { gte: dayStart } },
    });
    const remaining = Math.max(0, dailyMessageLimit - sentToday);
    if (!remaining) return;

    const pending = await prisma.notificationDelivery.findMany({
      where: {
        status: "pending",
        nextAttemptAt: { lte: dispatchNow },
        notification: { user: { status: "active" } },
      },
      include: {
        notification: {
          include: {
            user: {
              select: {
                email: true,
                status: true,
                notificationPreference: true,
              },
            },
          },
        },
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: Math.min(remaining, 100),
    });

    for (const delivery of pending) {
      await renewLock();
      const claimed = await prisma.notificationDelivery.updateMany({
        where: {
          id: delivery.id,
          status: "pending",
          nextAttemptAt: { lte: dispatchNow },
        },
        data: {
          status: "processing",
          lockedAt: dispatchNow,
          attempts: { increment: 1 },
        },
      });
      if (!claimed.count) continue;
      const attempt = delivery.attempts + 1;
      try {
        await deliverNotification(delivery, dispatchNow);
      } catch (error) {
        const exhausted = attempt >= 5;
        const retryDelay = Math.min(60, 2 ** (attempt - 1)) * 60 * 1000;
        const permanent =
          error?.code === "SMS_RECIPIENT_REQUIRED" ||
          error?.code === "ZALO_RECIPIENT_REQUIRED";
        await prisma.notificationDelivery.update({
          where: { id: delivery.id },
          data: {
            status: exhausted || permanent ? "failed" : "pending",
            lockedAt: null,
            nextAttemptAt: new Date(dispatchNow.getTime() + retryDelay),
            lastError:
              error?.code === "SMS_RECIPIENT_REQUIRED"
                ? "Phone number is required for SMS"
                : error?.code === "ZALO_RECIPIENT_REQUIRED"
                  ? "Zalo recipient is required"
                  : typeof error?.code === "string"
                    ? `Email provider error: ${error.code}`.slice(0, 500)
                    : "Email provider delivery failed",
          },
        });
      }
    }
  } finally {
    await lockRedis.eval(
      "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
      1,
      lockKey,
      lockValue,
    );
  }
}

async function createWeeklyDigests(now) {
  for (const preference of await prisma.notificationPreference.findMany()) {
    if (
      preference.disabledTypes.includes("weekly_digest") ||
      !preferenceChannels(preference, "weekly_digest").length ||
      localClock(now, preference.timeZone) < 1700
    ) {
      continue;
    }
    const weekday = new Intl.DateTimeFormat("en-US", {
      timeZone: preference.timeZone,
      weekday: "short",
    }).format(now);
    if (weekday !== "Fri") continue;

    const endDate = localDate(now, preference.timeZone);
    const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const recent = await prisma.notification.findMany({
      where: {
        userId: preference.userId,
        readAt: null,
        createdAt: { gte: start, lt: now },
      },
      select: { id: true, type: true, createdAt: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    if (!recent.length) continue;
    await prisma.notification.createMany({
      data: [
        {
          userId: preference.userId,
          type: "weekly_digest",
          dedupeKey: `weekly_digest:${preference.userId}:${endDate}`,
          payload: { weekEnding: endDate, count: recent.length },
        },
      ],
      skipDuplicates: true,
    });
  }
}

async function processReminders() {
  const now = new Date();
  let cursor;
  for (;;) {
    const tasks = await prisma.task.findMany({
      where: {
        dueDate: { lte: new Date(utcDay(now) + 3 * 86400000) },
        status: { not: "done" },
        deletedAt: null,
        project: { deletedAt: null },
        assigneeId: { not: null },
      },
      include: {
        assignee: { select: { id: true, departmentId: true, status: true } },
        project: {
          select: {
            branchId: true,
            branch: { select: { id: true, organizationId: true } },
          },
        },
      },
      orderBy: { id: "asc" },
      take: 500,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (!tasks.length) break;
    for (const task of tasks) {
      if (task.assignee?.status === "active")
        await notifyOverdueTask(task, now);
    }
    cursor = tasks[tasks.length - 1].id;
  }
  await createDailyDigests(now);
  await createWeeklyDigests(now);
  await dispatchNotificationDeliveries(now);
}

async function createDailyDigests(now) {
  const preferences = await prisma.notificationPreference.findMany({
    where: { digestEnabled: true },
  });
  for (const preference of preferences) {
    if (
      preference.disabledTypes.includes("daily_digest") ||
      localClock(now, preference.timeZone) < 1700 ||
      isQuiet(now, preference)
    ) {
      continue;
    }
    const today = localDate(now, preference.timeZone);
    const pending = await prisma.notification.findMany({
      where: {
        userId: preference.userId,
        digestOnly: true,
        readAt: null,
        type: { not: "daily_digest" },
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true, type: true, payload: true, createdAt: true },
    });
    const forToday = pending.filter(
      (notification) =>
        localDate(notification.createdAt, preference.timeZone) === today,
    );
    if (!forToday.length) continue;
    await prisma.notification.createMany({
      data: [
        {
          userId: preference.userId,
          type: "daily_digest",
          dedupeKey: `daily_digest:${preference.userId}:${today}`,
          payload: {
            date: today,
            notifications: forToday.map(({ id, type, payload }) => ({
              id,
              type,
              payload,
            })),
          },
        },
      ],
      skipDuplicates: true,
    });
  }
}

const worker = new Worker(
  queueName,
  async (job) => {
    if (job.name !== "scan-reminders")
      throw new Error(`Unknown job: ${job.name}`);
    await processReminders();
  },
  { connection, concurrency: 1 },
);
worker.on("failed", (job, error) => {
  if (!job) return;
  void prisma.backgroundJobFailure
    .upsert({
      where: { queue_jobId: { queue: queueName, jobId: job.id } },
      create: {
        queue: queueName,
        jobId: job.id,
        jobName: job.name,
        attempts: job.attemptsMade,
        error: error.message.slice(0, 4000),
      },
      update: {
        attempts: job.attemptsMade,
        error: error.message.slice(0, 4000),
        failedAt: new Date(),
        resolvedAt: null,
      },
    })
    .catch((failure) => {
      globalThis.console.error(
        "Could not persist failed reminder job",
        failure,
      );
    });
});
worker.on("completed", (job) => {
  if (!job) return;
  void prisma.backgroundJobFailure
    .updateMany({
      where: { queue: queueName, jobId: job.id, resolvedAt: null },
      data: { resolvedAt: new Date() },
    })
    .catch((error) => {
      globalThis.console.error("Could not resolve reminder job failure", error);
    });
});

async function shutdown() {
  if (heartbeatInterval) globalThis.clearInterval(heartbeatInterval);
  await worker.close();
  await queue.close();
  await clearHeartbeat();
  await lockRedis.quit();
  mailer.close();
  await prisma.$disconnect();
}

if (process.env.NOTIFICATION_WORKER_ONCE === "true") {
  try {
    await writeHeartbeat();
    heartbeatInterval = globalThis.setInterval(() => {
      void writeHeartbeat().catch((error) => {
        globalThis.console.error(
          "Could not update reminder worker heartbeat",
          error,
        );
      });
    }, 30000);
    heartbeatInterval.unref();
    if (process.env.NOTIFICATION_DISPATCH_ONLY === "true") {
      await dispatchNotificationDeliveries(new Date());
    } else {
      await processReminders();
    }
  } finally {
    if (heartbeatInterval) globalThis.clearInterval(heartbeatInterval);
    await shutdown();
  }
  globalThis.console.info("Reminder worker run completed");
} else {
  process.once("SIGINT", () => void shutdown());
  process.once("SIGTERM", () => void shutdown());
  await writeHeartbeat();
  heartbeatInterval = globalThis.setInterval(() => {
    void writeHeartbeat().catch((error) => {
      globalThis.console.error(
        "Could not update reminder worker heartbeat",
        error,
      );
    });
  }, 30000);
  heartbeatInterval.unref();
  await queue.add(
    "scan-reminders",
    {},
    {
      jobId: "scan-reminders-initial",
      attempts: 5,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: 1000,
      removeOnFail: 5000,
    },
  );
  await queue.add(
    "scan-reminders",
    {},
    {
      jobId: "scan-reminders",
      repeat: { every: 15 * 60 * 1000 },
      attempts: 5,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: 1000,
      removeOnFail: 5000,
    },
  );
  globalThis.console.info("Reminder worker started");
}
