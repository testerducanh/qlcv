jest.mock("@nestjs/common", () => {
  class HttpError extends Error {
    constructor(
      message: string,
      readonly status: number,
    ) {
      super(message);
    }
  }
  const decorator = () => () => {};
  return {
    BadRequestException: class extends HttpError {
      constructor(message = "Bad request") {
        super(
          typeof message === "string" ? message : JSON.stringify(message),
          400,
        );
      }
    },
    ForbiddenException: class extends HttpError {
      constructor(message = "Forbidden") {
        super(message, 403);
      }
    },
    Global: decorator,
    Inject: decorator,
    Injectable: decorator,
    Module: decorator,
    NotFoundException: class extends HttpError {
      constructor(message = "Not found") {
        super(message, 404);
      }
    },
  };
});

import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Prisma, PrismaClient } from "@prisma/client";
import type { AuthenticatedUser } from "../auth/auth.service";
import type { PrismaService } from "../infra/infra.module";
import type { ApprovalsService } from "../approvals/approvals.service";
import { TemplatesService } from "./templates.service";

const prisma = new PrismaClient();
class Rollback extends Error {}

async function inRollback(
  work: (tx: Prisma.TransactionClient) => Promise<void>,
) {
  try {
    await prisma.$transaction(async (tx) => {
      await work(tx);
      throw new Rollback();
    });
  } catch (error) {
    if (!(error instanceof Rollback)) throw error;
  }
}

afterAll(async () => prisma.$disconnect());

describe("TemplatesService database workflows", () => {
  it("validates all eight generic starter template files as unpublished drafts", async () => {
    await inRollback(async (tx) => {
      const suffix = randomUUID();
      const organization = await tx.organization.create({
        data: { name: `Starter templates ${suffix}` },
      });
      const branch = await tx.branch.create({
        data: { organizationId: organization.id, name: `Branch ${suffix}` },
      });
      const user = await tx.user.create({
        data: {
          organizationId: organization.id,
          branchId: branch.id,
          email: `starter-${suffix}@example.test`,
          name: "Template administrator",
          status: "active",
        },
      });
      const project = await tx.project.create({
        data: {
          branchId: branch.id,
          ownerId: user.id,
          name: `Starter template rehearsal ${suffix}`,
        },
      });
      await tx.projectMember.create({
        data: { projectId: project.id, userId: user.id, role: "owner" },
      });
      const actor: AuthenticatedUser = {
        id: user.id,
        organizationId: organization.id,
        systemRole: "system_admin",
        branchId: branch.id,
        managedDepartmentIds: [],
        email: user.email,
        name: user.name,
      };
      const txPrisma = {
        template: tx.template,
        templateVersion: tx.templateVersion,
        templateUsage: tx.templateUsage,
        project: tx.project,
        projectMember: tx.projectMember,
        task: tx.task,
        checklistItem: tx.checklistItem,
        $transaction: async (
          work: (client: Prisma.TransactionClient) => Promise<unknown>,
        ) => work(tx),
      } as unknown as PrismaService;
      const service = new TemplatesService(txPrisma, {
        createTemplateRequest: jest.fn(),
      } as unknown as ApprovalsService);
      const directory = resolve(process.cwd(), "../../seed/templates");
      const files = (await readdir(directory))
        .filter((file) => file.endsWith(".json"))
        .sort();
      expect(files).toHaveLength(8);
      const createdTemplateIds: string[] = [];
      for (const file of files) {
        const seed = JSON.parse(
          await readFile(resolve(directory, file), "utf8"),
        ) as {
          name: string;
          description: string;
          kind: "project" | "task";
          ownership: "company";
          tags: string[];
          content: unknown;
        };
        expect(seed.description).toMatch(/Gợi ý, cần .* rà soát/i);
        expect(seed.description).toMatch(/không phải/i);
        expect(seed.tags).toContain("Gợi ý, cần phòng chuyên môn rà soát");
        const serialized = JSON.stringify(seed);
        expect(serialized).not.toMatch(
          /(Điều\s+\d+|Nghị định\s+\d|Luật\s+số\s+\d|hạn\s+\d+\s+ngày)/i,
        );
        expect(serialized).not.toMatch(
          /\b\d{4}-\d{2}-\d{2}\b|\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/,
        );
        const content = seed.content as {
          tasks: Array<{
            title: string;
            type?: string;
            durationDays?: number;
            role?: string;
            suggestedAssignmentLevel?: string;
            checklist?: string[];
            children?: unknown[];
          }>;
          customFieldDefinitions?: unknown[];
        };
        expect(content.customFieldDefinitions?.length).toBeGreaterThan(0);
        const leaves: typeof content.tasks = [];
        const groups: typeof content.tasks = [];
        const visit = (nodes: typeof content.tasks) => {
          for (const node of nodes) {
            if (node.type === "group" && node.children?.length) {
              groups.push(node);
              visit(node.children as typeof content.tasks);
            } else if (node.type !== "milestone") {
              leaves.push(node);
            }
          }
        };
        visit(content.tasks);
        expect(groups.length).toBeGreaterThan(0);
        expect(leaves.length).toBeGreaterThan(0);
        expect(leaves.some((task) => (task.checklist?.length ?? 0) > 0)).toBe(
          true,
        );
        for (const task of leaves) {
          expect(task.durationDays).toBeGreaterThan(0);
          expect(task.role).toBeTruthy();
          expect(["light", "standard", "strict"]).toContain(
            task.suggestedAssignmentLevel,
          );
        }
        for (const gate of content.tasks.filter(
          (task) => task.type === "milestone",
        )) {
          expect(gate.checklist?.length).toBeGreaterThan(0);
        }
        const created = await service.create(actor, seed);
        expect(created).toMatchObject({ status: "draft", currentVersion: 1 });
        createdTemplateIds.push(created.id);
      }

      const appliedTemplates = [];
      for (const templateId of createdTemplateIds) {
        appliedTemplates.push(
          await service.apply(actor, templateId, { projectId: project.id }),
        );
      }
      expect(appliedTemplates).toHaveLength(8);
      expect(appliedTemplates.every((result) => result.taskCount > 0)).toBe(
        true,
      );
      const createdTasks = await tx.task.findMany({
        where: { projectId: project.id, deletedAt: null },
        select: {
          title: true,
          type: true,
          durationDays: true,
          assignmentLevel: true,
        },
      });
      expect(
        createdTasks
          .filter((task) => task.type === "task")
          .every(
            (task) =>
              task.durationDays !== null && task.assignmentLevel !== null,
          ),
      ).toBe(true);
      expect(
        await tx.checklistItem.count({
          where: {
            task: { projectId: project.id, deletedAt: null },
          },
        }),
      ).toBeGreaterThan(0);
      for (const gate of ["G0", "G1", "G2", "G3", "G4", "G5", "G6"]) {
        expect(
          createdTasks.some(
            (task) => task.type === "milestone" && task.title.startsWith(gate),
          ),
        ).toBe(true);
      }
    });
  });

  it("versions templates and applies a clean task tree using the project work calendar", async () => {
    await inRollback(async (tx) => {
      const suffix = randomUUID();
      const organization = await tx.organization.create({
        data: { name: `Templates ${suffix}` },
      });
      const branch = await tx.branch.create({
        data: { organizationId: organization.id, name: `Branch ${suffix}` },
      });
      const user = await tx.user.create({
        data: {
          organizationId: organization.id,
          branchId: branch.id,
          email: `template-${suffix}@example.test`,
          name: "Template owner",
          status: "active",
        },
      });
      const project = await tx.project.create({
        data: {
          branchId: branch.id,
          ownerId: user.id,
          name: `Project ${suffix}`,
          startDate: new Date("2027-01-01T00:00:00.000Z"),
          workCalendar: { weeklyOff: [0, 6], holidays: ["2027-01-04"] },
        },
      });
      await tx.projectMember.create({
        data: { projectId: project.id, userId: user.id, role: "owner" },
      });
      const actor: AuthenticatedUser = {
        id: user.id,
        organizationId: organization.id,
        systemRole: "member",
        branchId: branch.id,
        managedDepartmentIds: [],
        email: user.email,
        name: user.name,
      };
      const txPrisma = {
        template: tx.template,
        templateVersion: tx.templateVersion,
        templateUsage: tx.templateUsage,
        project: tx.project,
        projectMember: tx.projectMember,
        task: tx.task,
        checklistItem: tx.checklistItem,
        $transaction: async (
          work: (client: Prisma.TransactionClient) => Promise<unknown>,
        ) => work(tx),
      } as unknown as PrismaService;
      const approvals = {
        createTemplateRequest: jest.fn(),
      } as unknown as ApprovalsService;
      const service = new TemplatesService(txPrisma, approvals);
      const template = await service.create(actor, {
        name: "Generic project plan",
        kind: "project",
        ownership: "personal",
        content: {
          tasks: [
            {
              title: "Preparation",
              type: "group",
              children: [
                {
                  title: "Review documents",
                  type: "task",
                  startOffsetWorkdays: 1,
                  dueOffsetWorkdays: 2,
                  role: "Reviewer",
                  checklist: ["Confirm project scope"],
                },
              ],
            },
          ],
        },
      });
      expect(template.currentVersion).toBe(1);
      const otherUser = await tx.user.create({
        data: {
          organizationId: organization.id,
          branchId: branch.id,
          email: `other-${suffix}@example.test`,
          name: "Another user",
          status: "active",
        },
      });
      await expect(
        service.requestPublication(
          {
            ...actor,
            id: otherUser.id,
            email: otherUser.email,
            name: otherUser.name,
          },
          template.id,
          {},
        ),
      ).rejects.toMatchObject({ status: 404 });
      await expect(
        service.create(actor, {
          name: "Unsafe template",
          kind: "project",
          ownership: "personal",
          content: {
            tasks: [{ title: "Has real date", dueDate: "2027-01-01" }],
          },
        }),
      ).rejects.toMatchObject({ status: 400 });

      const applied = await service.apply(actor, template.id, {
        projectId: project.id,
        startDate: "2027-01-01",
      });
      expect(applied).toEqual({ projectId: project.id, taskCount: 2 });
      const createdTasks = await tx.task.findMany({
        where: { projectId: project.id, deletedAt: null },
        orderBy: { depth: "asc" },
      });
      expect(createdTasks[1]).toMatchObject({
        title: "Review documents",
        startDate: new Date("2027-01-05T00:00:00.000Z"),
        dueDate: new Date("2027-01-06T00:00:00.000Z"),
        assigneeId: null,
      });
      await expect(
        tx.checklistItem.findMany({
          where: { taskId: createdTasks[1].id },
          select: { title: true },
        }),
      ).resolves.toEqual([{ title: "Confirm project scope" }]);

      const updated = await service.update(actor, template.id, {
        name: "Revised generic plan",
        content: {
          tasks: [{ title: "Revised task", type: "task" }],
        },
      });
      expect(updated.currentVersion).toBe(2);
      expect(
        await tx.templateVersion.findMany({
          where: { templateId: template.id },
          orderBy: { version: "asc" },
          select: { version: true },
        }),
      ).toEqual([{ version: 1 }, { version: 2 }]);
      expect(
        await tx.task.findUniqueOrThrow({ where: { id: createdTasks[1].id } }),
      ).toMatchObject({ title: "Review documents" });
      expect(
        await tx.templateUsage.count({ where: { templateId: template.id } }),
      ).toBe(1);
    });
  });
});
