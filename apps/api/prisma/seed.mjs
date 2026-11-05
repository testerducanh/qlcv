import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { hash } from "@node-rs/argon2";
import { PrismaClient } from "@prisma/client";
import sharp from "sharp";

if (process.env.NODE_ENV === "production") {
  throw new Error("Demo seed is disabled in production.");
}

const prisma = new PrismaClient();
const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION ?? "us-east-1",
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "false",
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY,
    secretAccessKey: process.env.S3_SECRET_KEY,
  },
});
const password = "Demo-Only-2026!";
const organizationId = "10000000-0000-4000-8000-000000000001";
const branchIds = {
  north: "10000000-0000-4000-8000-000000000011",
  south: "10000000-0000-4000-8000-000000000012",
};
const departmentIds = {
  engineering: "10000000-0000-4000-8000-000000000021",
  operations: "10000000-0000-4000-8000-000000000022",
  finance: "10000000-0000-4000-8000-000000000023",
};
const projectIds = {
  normal: "10000000-0000-4000-8000-000000000031",
  restricted: "10000000-0000-4000-8000-000000000032",
};
const labelIds = {
  normal: "10000000-0000-4000-8000-000000000041",
  urgent: "10000000-0000-4000-8000-000000000042",
};

const users = [
  {
    email: "demo.admin@qlcv.local",
    name: "Quản trị hệ thống",
    role: "system_admin",
    branch: null,
    department: null,
  },
  {
    email: "demo.executive@qlcv.local",
    name: "Lãnh đạo",
    role: "executive",
    branch: null,
    department: null,
  },
  {
    email: "demo.director.north@qlcv.local",
    name: "Giám đốc chi nhánh Bắc",
    role: "branch_director",
    branch: "north",
    department: null,
  },
  {
    email: "demo.director.south@qlcv.local",
    name: "Giám đốc chi nhánh Nam",
    role: "branch_director",
    branch: "south",
    department: null,
  },
  {
    email: "demo.head.engineering@qlcv.local",
    name: "Trưởng phòng Kỹ thuật",
    role: "department_head",
    branch: "north",
    department: "engineering",
  },
  {
    email: "demo.head.operations@qlcv.local",
    name: "Trưởng phòng Vận hành",
    role: "department_head",
    branch: "south",
    department: "operations",
  },
  {
    email: "demo.member.one@qlcv.local",
    name: "Thành viên An",
    role: "member",
    branch: "north",
    department: "engineering",
  },
  {
    email: "demo.member.two@qlcv.local",
    name: "Thành viên Bình",
    role: "member",
    branch: "south",
    department: "finance",
  },
];

const dateOnly = (offsetDays) => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
};
const asDate = (value) => new Date(`${value}T00:00:00.000Z`);
const position = (index) => String(index).padStart(6, "0");

async function main() {
  const passwordHash = await hash(password);
  const organization = await prisma.organization.upsert({
    where: { id: organizationId },
    create: { id: organizationId, name: "Công ty Demo QLCV" },
    update: { name: "Công ty Demo QLCV" },
  });

  const branches = {};
  for (const [key, name] of [
    ["north", "Chi nhánh Bắc"],
    ["south", "Chi nhánh Nam"],
  ]) {
    branches[key] = await prisma.branch.upsert({
      where: { id: branchIds[key] },
      create: {
        id: branchIds[key],
        organizationId,
        name,
        code: key === "north" ? "DEMO-BAC" : "DEMO-NAM",
      },
      update: { name, isActive: true },
    });
  }

  const departments = {};
  for (const [key, name, branchKey] of [
    ["engineering", "Kỹ thuật", "north"],
    ["operations", "Vận hành", "south"],
    ["finance", "Tài chính", "south"],
  ]) {
    departments[key] = await prisma.department.upsert({
      where: { id: departmentIds[key] },
      create: {
        id: departmentIds[key],
        organizationId,
        branchId: branches[branchKey].id,
        name,
      },
      update: { branchId: branches[branchKey].id, name, isActive: true },
    });
  }

  const seededUsers = [];
  for (const user of users) {
    const saved = await prisma.user.upsert({
      where: { email: user.email },
      create: {
        organizationId,
        email: user.email,
        name: user.name,
        passwordHash,
        status: "active",
        systemRole: user.role,
        branchId: user.branch ? branches[user.branch].id : null,
        departmentId: user.department ? departments[user.department].id : null,
      },
      update: {
        name: user.name,
        passwordHash,
        status: "active",
        systemRole: user.role,
        branchId: user.branch ? branches[user.branch].id : null,
        departmentId: user.department ? departments[user.department].id : null,
      },
    });
    seededUsers.push(saved);
    if (user.department) {
      await prisma.userDepartment.upsert({
        where: {
          userId_departmentId: {
            userId: saved.id,
            departmentId: departments[user.department].id,
          },
        },
        create: {
          userId: saved.id,
          departmentId: departments[user.department].id,
          isHead: user.role === "department_head",
        },
        update: { isHead: user.role === "department_head" },
      });
    }
  }

  const admin = seededUsers[0];
  const demoProjects = [
    {
      id: projectIds.normal,
      branch: "north",
      name: "Dự án Demo - Quy trình nội bộ",
      confidentiality: "normal",
    },
    {
      id: projectIds.restricted,
      branch: "south",
      name: "Dự án Demo - Kế hoạch mật",
      confidentiality: "restricted",
    },
  ];
  const savedProjects = [];
  for (const [projectIndex, projectData] of demoProjects.entries()) {
    const project = await prisma.project.upsert({
      where: { id: projectData.id },
      create: {
        id: projectData.id,
        branchId: branches[projectData.branch].id,
        ownerId: admin.id,
        name: projectData.name,
        description: "Dữ liệu giả phục vụ thử nghiệm môi trường phát triển.",
        startDate: asDate(dateOnly(-10)),
        dueDate: asDate(dateOnly(30)),
        confidentiality: projectData.confidentiality,
      },
      update: {
        branchId: branches[projectData.branch].id,
        ownerId: admin.id,
        name: projectData.name,
        confidentiality: projectData.confidentiality,
        deletedAt: null,
      },
    });
    savedProjects.push(project);
    for (let index = 0; index < seededUsers.length; index += 1) {
      const membershipRoles = [
        "owner",
        "manager",
        "manager",
        "member",
        "member",
        "restricted",
        "commenter",
        "viewer",
      ];
      await prisma.projectMember.upsert({
        where: {
          projectId_userId: {
            projectId: project.id,
            userId: seededUsers[index].id,
          },
        },
        create: {
          projectId: project.id,
          userId: seededUsers[index].id,
          role: membershipRoles[index],
        },
        update: { role: membershipRoles[index] },
      });
    }
  }

  const oldAttachments = await prisma.attachment.findMany({
    where: { projectId: { in: savedProjects.map((project) => project.id) } },
    select: {
      storageKey: true,
      uploadStorageKey: true,
      thumbKey: true,
      previewKey: true,
    },
  });
  for (const attachment of oldAttachments) {
    for (const key of [
      attachment.storageKey,
      attachment.uploadStorageKey,
      attachment.thumbKey,
      attachment.previewKey,
    ]) {
      if (key)
        await s3.send(
          new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }),
        );
    }
  }
  await prisma.task.deleteMany({
    where: { projectId: { in: savedProjects.map((project) => project.id) } },
  });
  await prisma.notification.deleteMany({
    where: {
      userId: { in: seededUsers.map((user) => user.id) },
      type: "mentioned",
    },
  });

  const labels = [
    {
      id: labelIds.normal,
      name: "Demo",
      color: "#2563EB",
      project: savedProjects[0],
    },
    {
      id: labelIds.urgent,
      name: "Ưu tiên",
      color: "#DC2626",
      project: savedProjects[1],
    },
  ];
  for (const label of labels) {
    await prisma.label.upsert({
      where: { id: label.id },
      create: {
        id: label.id,
        organizationId,
        projectId: label.project.id,
        name: label.name,
        color: label.color,
      },
      update: {
        projectId: label.project.id,
        name: label.name,
        color: label.color,
      },
    });
  }

  const firstTasks = [];
  for (const [projectIndex, project] of savedProjects.entries()) {
    const projectTasks = [];
    for (let groupIndex = 0; groupIndex < 3; groupIndex += 1) {
      const group = await prisma.task.create({
        data: {
          projectId: project.id,
          type: "group",
          position: position(groupIndex + 1),
          title: `Nhóm demo ${groupIndex + 1}`,
          creatorId: admin.id,
        },
      });
      for (let taskIndex = 0; taskIndex < 9; taskIndex += 1) {
        const serial = groupIndex * 9 + taskIndex;
        const status = ["todo", "doing", "done", "blocked"][serial % 4];
        const task = await prisma.task.create({
          data: {
            projectId: project.id,
            parentId: group.id,
            type: "task",
            position: position(taskIndex + 1),
            title: `Công việc demo ${serial + 1}`,
            description:
              "Nội dung hoàn toàn giả, dùng để kiểm tra luồng dự án và phân quyền.",
            status,
            blockedReason:
              status === "blocked" ? "Đang chờ thông tin giả lập." : null,
            priority: serial % 7 === 0 ? "urgent" : "normal",
            startDate: asDate(dateOnly(serial - 2)),
            durationDays: 2 + (serial % 5),
            dueDate: asDate(dateOnly(serial + 2)),
            progress: status === "done" ? 100 : status === "doing" ? 50 : 0,
            completedAt: status === "done" ? new Date() : null,
            assigneeId: seededUsers[6 + (serial % 2)].id,
            creatorId: admin.id,
          },
        });
        projectTasks.push(task);
        if (serial % 3 === 0) {
          await prisma.checklistItem.createMany({
            data: [
              {
                taskId: task.id,
                title: "Bước demo đã xong",
                done: true,
                position: position(1),
              },
              {
                taskId: task.id,
                title: "Bước demo tiếp theo",
                position: position(2),
              },
            ],
          });
        }
        await prisma.taskLabel.create({
          data: {
            taskId: task.id,
            labelId: labels[projectIndex].id,
          },
        });
      }
    }
    firstTasks.push(projectTasks[0]);
  }

  for (const [index, task] of firstTasks.entries()) {
    const mentionedUser = seededUsers[6 + index];
    const comment = await prisma.comment.create({
      data: {
        taskId: task.id,
        authorId: admin.id,
        body: "Bình luận demo; dữ liệu này không chứa thông tin thật.",
        mentions: { create: { userId: mentionedUser.id } },
      },
    });
    await prisma.notification.create({
      data: {
        userId: mentionedUser.id,
        type: "mentioned",
        payload: {
          commentId: comment.id,
          taskId: task.id,
          projectId: savedProjects[index].id,
        },
      },
    });
  }

  const png = await sharp({
    create: { width: 1, height: 1, channels: 3, background: "#2563EB" },
  })
    .png()
    .toBuffer();
  for (const [index, task] of firstTasks.entries()) {
    const storageKey = `demo/${savedProjects[index].id}/sample-${index + 1}.png`;
    await s3.send(
      new PutObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: storageKey,
        Body: png,
        ContentType: "image/png",
      }),
    );
    await prisma.attachment.create({
      data: {
        projectId: savedProjects[index].id,
        taskId: task.id,
        uploaderId: admin.id,
        fileName: `anh-demo-${index + 1}.png`,
        mime: "image/png",
        size: png.length,
        storageKey,
        versionGroupId: `10000000-0000-4000-8000-00000000005${index + 1}`,
        confirmedAt: new Date(),
      },
    });
  }

  console.log(
    `Đã tạo dữ liệu demo: ${users.length} người dùng, 2 dự án, 60 việc, 2 ảnh giả. Mật khẩu chung: ${password}`,
  );
}

try {
  await main();
} finally {
  s3.destroy();
  await prisma.$disconnect();
}
