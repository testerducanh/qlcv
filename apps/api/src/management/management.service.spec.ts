jest.mock("@nestjs/common", () => {
  class HttpError extends Error {}
  return {
    BadRequestException: HttpError,
    ConflictException: HttpError,
    ForbiddenException: HttpError,
    Inject: () => () => {},
    Injectable: () => () => {},
    Logger: class {
      error = jest.fn();
    },
    NotFoundException: HttpError,
  };
});

jest.mock("@aws-sdk/client-s3", () => ({
  CopyObjectCommand: class {
    constructor(readonly input: unknown) {}
  },
  DeleteObjectCommand: class {
    constructor(readonly input: unknown) {}
  },
}));

const mockSendMail = jest.fn();

jest.mock("nodemailer", () => ({
  __esModule: true,
  default: { createTransport: () => ({ sendMail: mockSendMail }) },
}));

jest.mock("../infra/infra.module", () => ({
  ENV: "ENV",
  REDIS: "REDIS",
  S3: "S3",
  PrismaService: class PrismaService {},
}));

import { ProjectRole } from "@prisma/client";
import type Redis from "ioredis";
import type { Env } from "../config/env";
import type { PrismaService } from "../infra/infra.module";
import { ManagementService } from "./management.service";

const actor = {
  id: "00000000-0000-4000-8000-000000000001",
  organizationId: "00000000-0000-4000-8000-000000000010",
  systemRole: "member" as const,
  branchId: "00000000-0000-4000-8000-000000000020",
  managedDepartmentIds: [],
  email: "member@example.com",
  name: "Member",
};

const projectId = "00000000-0000-4000-8000-000000000030";

function makePrisma() {
  const project = {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  };
  const projectMember = {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
    findMany: jest.fn(),
  };
  const task = { groupBy: jest.fn() };
  const taskDependency = { findMany: jest.fn(), createMany: jest.fn() };
  const label = { create: jest.fn() };
  const attachment = { create: jest.fn() };
  const user = {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };
  const txClient: { current?: unknown } = {};
  const prisma = {
    project,
    projectMember,
    branch: { findMany: jest.fn(), findFirst: jest.fn() },
    task,
    taskDependency,
    label,
    attachment,
    user,
    activityLog: { create: jest.fn(async () => ({})) },
    $transaction: jest.fn(async (work: unknown): Promise<unknown> => {
      if (Array.isArray(work)) return Promise.all(work);
      if (typeof work === "function")
        return (work as (tx: unknown) => Promise<unknown>)(txClient.current);
      throw new Error("Unsupported transaction");
    }),
  };
  txClient.current = prisma;
  return prisma;
}

describe("ManagementService project workflows", () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: ManagementService;
  let redis: {
    get: jest.Mock;
    set: jest.Mock;
    del: jest.Mock;
    eval: jest.Mock;
  };
  let s3: { send: jest.Mock };
  const env = {
    NODE_ENV: "test",
    API_PORT: 3000,
    DATABASE_URL: "postgresql://localhost/test",
    REDIS_URL: "redis://localhost:6379",
    JWT_ACCESS_SECRET: "test-access-secret-that-is-at-least-32-chars",
    WEB_BASE_URL: "http://localhost:5173",
    SMTP_HOST: "127.0.0.1",
    SMTP_PORT: 1025,
    SMTP_FROM: "no-reply@qlcv.local",
    SMTP_SECURE: false,
    S3_ENDPOINT: "http://localhost:9000",
    S3_REGION: "us-east-1",
    S3_ACCESS_KEY: "test",
    S3_SECRET_KEY: "test",
    S3_BUCKET: "test",
    S3_FORCE_PATH_STYLE: true,
    CORS_ORIGINS: ["http://localhost:5173"],
    BODY_LIMIT: "1mb",
  } as Env;

  beforeEach(() => {
    prisma = makePrisma();
    mockSendMail.mockReset().mockResolvedValue(undefined);
    redis = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      eval: jest.fn(),
    };
    s3 = { send: jest.fn() };
    service = new ManagementService(
      prisma as unknown as PrismaService,
      redis as unknown as Redis,
      env,
      s3 as never,
    );
  });

  it("calculates project statistics with bounded aggregate queries, not per-project queries", async () => {
    prisma.project.findMany.mockResolvedValue([
      {
        id: projectId,
        name: "A",
        _count: { tasks: 4 },
      },
      {
        id: "00000000-0000-4000-8000-000000000031",
        name: "B",
        _count: { tasks: 0 },
      },
    ]);
    prisma.project.count.mockResolvedValue(2);
    prisma.task.groupBy
      .mockResolvedValueOnce([
        { projectId, status: "done", _count: { _all: 2 } },
        { projectId, status: "todo", _count: { _all: 2 } },
      ])
      .mockResolvedValueOnce([{ projectId, _count: { _all: 1 } }]);

    const result = await service.listProjects(actor, {
      page: 1,
      pageSize: 20,
      sort: "createdAt",
      order: "desc",
    });

    expect(result.items.map((item) => item.stats)).toEqual([
      { taskCount: 4, overdueTaskCount: 1, completionPercent: 50 },
      { taskCount: 0, overdueTaskCount: 0, completionPercent: 0 },
    ]);
    expect(prisma.project.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.task.groupBy).toHaveBeenCalledTimes(2);
  });

  it("limits available branches to the caller's branch", async () => {
    const branchActor = {
      ...actor,
      systemRole: "branch_director" as const,
    };
    prisma.branch.findMany.mockResolvedValue([
      { id: actor.branchId, name: "Chi nhánh Bắc" },
    ]);

    await expect(service.listAvailableBranches(branchActor)).resolves.toEqual([
      { id: actor.branchId, name: "Chi nhánh Bắc" },
    ]);
    expect(prisma.branch.findMany).toHaveBeenCalledWith({
      where: {
        organizationId: actor.organizationId,
        isActive: true,
        id: actor.branchId,
      },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
  });

  it("does not query branch options for an actor without a branch", async () => {
    await expect(
      service.listAvailableBranches({ ...actor, branchId: null }),
    ).resolves.toEqual([]);
    expect(prisma.branch.findMany).not.toHaveBeenCalled();
  });

  it("limits project member candidates to active users in the project branch", async () => {
    prisma.project.findFirst.mockResolvedValue({
      id: projectId,
      branchId: actor.branchId,
      confidentiality: "normal",
      members: [{ role: ProjectRole.owner }],
    });
    prisma.user.findMany.mockResolvedValue([
      { id: "candidate", name: "Người mới", email: "new@example.com" },
    ]);

    const candidates = await service.listAvailableProjectMembers(
      actor,
      projectId,
      "new",
    );

    expect(candidates).toHaveLength(1);
    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: {
        organizationId: actor.organizationId,
        branchId: actor.branchId,
        status: "active",
        id: { not: actor.id },
        projectMemberships: { none: { projectId } },
        OR: [
          { name: { contains: "new", mode: "insensitive" } },
          { email: { contains: "new", mode: "insensitive" } },
        ],
      },
      select: { id: true, name: true, email: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take: 50,
    });
  });

  it("prevents removing or demoting the last project owner", async () => {
    prisma.project.findFirst.mockResolvedValue({
      id: projectId,
      ownerId: actor.id,
      branchId: actor.branchId,
      confidentiality: "normal",
      members: [{ role: ProjectRole.owner }],
    });
    prisma.projectMember.findUnique.mockResolvedValue({
      projectId,
      userId: actor.id,
      role: ProjectRole.owner,
    });
    prisma.projectMember.findFirst.mockResolvedValue(null);

    await expect(
      service.removeProjectMember(actor, projectId, actor.id),
    ).rejects.toThrow("Không thể gỡ chủ dự án cuối cùng");
    await expect(
      service.updateProjectMemberRole(
        actor,
        projectId,
        actor.id,
        ProjectRole.manager,
      ),
    ).rejects.toThrow("Không thể gỡ vai trò của chủ dự án cuối cùng");
    expect(prisma.projectMember.delete).not.toHaveBeenCalled();
    expect(prisma.projectMember.update).not.toHaveBeenCalled();
  });

  it("transfers the owner reference before removing an owner", async () => {
    const newOwnerId = "00000000-0000-4000-8000-000000000040";
    prisma.project.findFirst.mockResolvedValue({
      id: projectId,
      ownerId: actor.id,
      branchId: actor.branchId,
      confidentiality: "normal",
      members: [{ role: ProjectRole.owner }],
    });
    prisma.projectMember.findUnique.mockResolvedValue({
      projectId,
      userId: actor.id,
      role: ProjectRole.owner,
    });
    prisma.projectMember.findFirst.mockResolvedValue({
      projectId,
      userId: newOwnerId,
      role: ProjectRole.owner,
    });

    await expect(
      service.removeProjectMember(actor, projectId, actor.id),
    ).resolves.toEqual({ userId: actor.id, removed: true });

    expect(prisma.project.update).toHaveBeenCalledWith({
      where: { id: projectId },
      data: { ownerId: newOwnerId },
    });
    expect(prisma.projectMember.delete).toHaveBeenCalledWith({
      where: { projectId_userId: { projectId, userId: actor.id } },
    });
  });

  it("rejects member management by a project viewer", async () => {
    prisma.project.findFirst.mockResolvedValue({
      id: projectId,
      ownerId: "00000000-0000-4000-8000-000000000099",
      branchId: "00000000-0000-4000-8000-000000000099",
      confidentiality: "normal",
      members: [{ role: ProjectRole.viewer }],
    });

    await expect(
      service.addProjectMember(
        actor,
        projectId,
        "00000000-0000-4000-8000-000000000050",
        ProjectRole.member,
      ),
    ).rejects.toThrow();
    expect(prisma.projectMember.create).not.toHaveBeenCalled();
  });

  it("limits branch administrators to their own branch when creating a project", async () => {
    const director = { ...actor, systemRole: "branch_director" as const };
    const prismaService = prisma as unknown as PrismaService;
    const serviceForDirector = new ManagementService(
      prismaService,
      {} as Redis,
      env,
      { send: jest.fn() } as never,
    );
    const branchPrisma = prisma as unknown as {
      branch?: { findFirst: jest.Mock };
    };
    branchPrisma.branch = {
      findFirst: jest.fn().mockResolvedValue({ id: "branch-other" }),
    };

    await expect(
      serviceForDirector.createProject(director, {
        branchId: "branch-other",
        name: "Project",
      }),
    ).rejects.toThrow();
    expect(prisma.project.create).not.toHaveBeenCalled();
  });

  it("keeps an invitation usable when account activation transaction fails", async () => {
    redis.get.mockResolvedValue("invited-user");
    redis.set.mockResolvedValue("OK");
    prisma.user.findFirst.mockResolvedValue({
      id: "invited-user",
      status: "invited",
    });
    prisma.$transaction.mockRejectedValue(new Error("database unavailable"));

    await expect(
      service.completeInvitation("invitation-token", "a-strong-password"),
    ).rejects.toThrow("database unavailable");

    expect(redis.del).not.toHaveBeenCalled();
    expect(redis.eval).toHaveBeenCalledWith(
      expect.stringContaining("redis.call('del'"),
      1,
      expect.stringContaining("auth:invitation:claim:"),
      expect.any(String),
    );
  });

  it("consumes an invitation only after the account activation commits", async () => {
    redis.get.mockResolvedValue("invited-user");
    redis.set.mockResolvedValue("OK");
    prisma.user.findFirst.mockResolvedValue({
      id: "invited-user",
      status: "invited",
    });
    prisma.user.update.mockResolvedValue({
      id: "invited-user",
      email: "invited@example.com",
      name: "Invited User",
      status: "active",
    });
    redis.del.mockResolvedValue(1);

    await expect(
      service.completeInvitation("invitation-token", "a-strong-password"),
    ).resolves.toMatchObject({ id: "invited-user", status: "active" });

    expect(prisma.user.update).toHaveBeenCalled();
    expect(redis.del).toHaveBeenCalledWith(
      expect.stringContaining("auth:invitation:"),
    );
    expect(redis.eval).toHaveBeenCalled();
  });

  it("rejects concurrent invitation completion while another request owns the claim", async () => {
    redis.get.mockResolvedValue("invited-user");
    redis.set.mockResolvedValue(null);

    await expect(
      service.completeInvitation("invitation-token", "a-strong-password"),
    ).rejects.toThrow("Lời mời đang được xử lý");

    expect(prisma.user.findFirst).not.toHaveBeenCalled();
  });

  it("releases the invitation claim when the token is missing", async () => {
    redis.set.mockResolvedValue("OK");
    redis.get.mockResolvedValue(null);

    await expect(
      service.completeInvitation("expired-token", "a-strong-password"),
    ).rejects.toThrow("Lời mời không hợp lệ");

    expect(redis.eval).toHaveBeenCalled();
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
  });

  it("removes the invitation and provisional account when delivery fails", async () => {
    const adminActor = { ...actor, systemRole: "system_admin" as const };
    const mailError = new Error("SMTP unavailable");
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({
      id: "invited-user",
      email: "new@example.com",
      name: "New User",
      status: "invited",
      systemRole: "member",
    });
    redis.set.mockResolvedValue("OK");
    mockSendMail.mockRejectedValue(mailError);

    await expect(
      service.inviteUser(adminActor, {
        email: " New@Example.com ",
        name: "New User",
      }),
    ).rejects.toBe(mailError);

    expect(redis.del).toHaveBeenCalledWith(
      expect.stringContaining("auth:invitation:"),
    );
    expect(prisma.user.delete).toHaveBeenCalledWith({
      where: { id: "invited-user" },
    });
    expect(prisma.activityLog.create).not.toHaveBeenCalled();
  });

  it("copies project attachments to the cloned project", async () => {
    const cloneId = "00000000-0000-4000-8000-000000000060";
    const projectManager = {
      id: projectId,
      branchId: actor.branchId,
      confidentiality: "normal",
      members: [{ role: ProjectRole.owner }],
    };
    prisma.project.findFirst
      .mockResolvedValueOnce(projectManager)
      .mockResolvedValueOnce({
        id: projectId,
        branchId: actor.branchId,
        name: "Source",
        description: null,
        startDate: null,
        dueDate: null,
        workCalendar: { weeklyOff: [0], holidays: [] },
        progressMode: "manual",
        confidentiality: "normal",
        statusLabels: {},
        members: [],
        labels: [],
        tasks: [],
        attachments: [
          {
            taskId: null,
            checklistItemId: null,
            storageKey: "folder/file name.jpg",
            thumbKey: null,
            fileName: "file name.jpg",
            mime: "image/jpeg",
            size: 12,
            note: null,
            takenAt: null,
            lat: null,
            lng: null,
          },
        ],
      });
    prisma.project.create.mockResolvedValue({ id: cloneId });
    prisma.taskDependency.findMany.mockResolvedValue([]);

    await service.cloneProject(actor, projectId, { includeFiles: true });

    expect(s3.send).toHaveBeenCalledTimes(1);
    expect(s3.send.mock.calls[0][0].input).toMatchObject({
      Bucket: "test",
      CopySource: "/test/folder/file%20name.jpg",
      Key: expect.stringMatching(
        new RegExp(`^projects/${cloneId}/attachments/`),
      ),
    });
    expect(prisma.attachment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          projectId: cloneId,
          storageKey: expect.stringMatching(
            new RegExp(`^projects/${cloneId}/attachments/`),
          ),
        }),
      }),
    );
  });

  it("removes copied objects if a project clone transaction fails", async () => {
    const projectManager = {
      id: projectId,
      branchId: actor.branchId,
      confidentiality: "normal",
      members: [{ role: ProjectRole.owner }],
    };
    prisma.project.findFirst
      .mockResolvedValueOnce(projectManager)
      .mockResolvedValueOnce({
        id: projectId,
        branchId: actor.branchId,
        name: "Source",
        description: null,
        startDate: null,
        dueDate: null,
        workCalendar: { weeklyOff: [0], holidays: [] },
        progressMode: "manual",
        confidentiality: "normal",
        statusLabels: {},
        members: [],
        labels: [],
        tasks: [],
        attachments: [
          {
            taskId: null,
            checklistItemId: null,
            storageKey: "source/file.jpg",
            thumbKey: null,
            fileName: "file.jpg",
            mime: "image/jpeg",
            size: 12,
            note: null,
            takenAt: null,
            lat: null,
            lng: null,
          },
        ],
      });
    prisma.project.create.mockResolvedValue({
      id: "00000000-0000-4000-8000-000000000061",
    });
    prisma.taskDependency.findMany.mockResolvedValue([]);
    prisma.activityLog.create.mockRejectedValueOnce(
      new Error("audit write failed"),
    );

    await expect(
      service.cloneProject(actor, projectId, { includeFiles: true }),
    ).rejects.toThrow("audit write failed");

    expect(s3.send).toHaveBeenCalledTimes(2);
    expect(s3.send.mock.calls[1][0].input).toMatchObject({
      Bucket: "test",
      Key: expect.stringMatching(
        /^projects\/00000000-0000-4000-8000-000000000061\/attachments\//,
      ),
    });
  });
});
