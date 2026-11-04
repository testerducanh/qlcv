import { Prisma, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type Tx = Prisma.TransactionClient;

class Rollback extends Error {}

/**
 * Vi phạm index duy nhất: Prisma 6 chuyển lỗi Postgres thành P2002 với
 * meta.target là danh sách cột của index (không phải tên index), kể cả index
 * tạo bằng SQL thủ công trong migration.
 */
function viPhamDuyNhat(promise: Promise<unknown>, target: string[]) {
  return expect(promise).rejects.toMatchObject({ code: 'P2002', meta: { target } });
}

/** Chạy trong transaction rồi luôn hủy, để mỗi test sạch và không để lại dữ liệu. */
async function inRollback(fn: (tx: Tx) => Promise<void>) {
  try {
    await prisma.$transaction(
      async (tx) => {
        await fn(tx);
        throw new Rollback();
      },
      { timeout: 20000, maxWait: 10000 },
    );
  } catch (error) {
    if (!(error instanceof Rollback)) throw error;
  }
}

async function fixtures(tx: Tx) {
  const org = await tx.organization.create({ data: { name: 'Công ty thử' } });
  const branch = await tx.branch.create({ data: { organizationId: org.id, name: 'Chi nhánh 1' } });
  const user = await tx.user.create({
    data: {
      organizationId: org.id,
      email: 'nguoi.thu@example.com',
      name: 'Người thử',
      status: 'active',
      branchId: branch.id,
    },
  });
  const project = await tx.project.create({
    data: { branchId: branch.id, ownerId: user.id, name: 'Dự án thử' },
  });
  return { org, branch, user, project };
}

type Fixtures = Awaited<ReturnType<typeof fixtures>>;

const taskData = (
  f: Fixtures,
  over: Partial<Prisma.TaskUncheckedCreateInput> = {},
): Prisma.TaskUncheckedCreateInput => ({
  projectId: f.project.id,
  creatorId: f.user.id,
  title: 'Việc thử',
  position: 'a0',
  ...over,
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('cây việc: độ sâu', () => {
  it('tự tính độ sâu từ 1 đến 5 và từ chối cấp thứ 6', async () => {
    await inRollback(async (tx) => {
      const f = await fixtures(tx);
      let parentId: string | undefined;
      for (let level = 1; level <= 5; level += 1) {
        const task = await tx.task.create({ data: taskData(f, { parentId }) });
        expect(task.depth).toBe(level);
        parentId = task.id;
      }
      await expect(tx.task.create({ data: taskData(f, { parentId }) })).rejects.toThrow(
        /QLCV_TASK_DEPTH_EXCEEDED/,
      );
    });
  });

  it('việc cha phải cùng dự án', async () => {
    await inRollback(async (tx) => {
      const f = await fixtures(tx);
      const other = await tx.project.create({
        data: { branchId: f.branch.id, ownerId: f.user.id, name: 'Dự án khác' },
      });
      const parent = await tx.task.create({ data: taskData(f) });
      await expect(
        tx.task.create({ data: taskData(f, { projectId: other.id, parentId: parent.id }) }),
      ).rejects.toThrow(/QLCV_TASK_PARENT_PROJECT/);
    });
  });

  it('không cho việc làm cha của chính nó', async () => {
    await inRollback(async (tx) => {
      const f = await fixtures(tx);
      const task = await tx.task.create({ data: taskData(f) });
      await expect(
        tx.$executeRaw`UPDATE "task" SET "parent_id" = "id" WHERE "id" = ${task.id}::uuid`,
      ).rejects.toThrow(/task_no_self_parent/);
    });
  });

  it('không cho chuyển việc cha vào việc con của nó (chu trình)', async () => {
    await inRollback(async (tx) => {
      const f = await fixtures(tx);
      const a = await tx.task.create({ data: taskData(f) });
      const b = await tx.task.create({ data: taskData(f, { parentId: a.id }) });
      await expect(
        tx.task.update({ where: { id: a.id }, data: { parentId: b.id } }),
      ).rejects.toThrow(/QLCV_TASK_CYCLE/);
    });
  });

  it('chuyển cây con làm vượt 5 cấp thì bị chặn', async () => {
    await inRollback(async (tx) => {
      const f = await fixtures(tx);
      const y1 = await tx.task.create({ data: taskData(f, { position: 'a0' }) });
      const y2 = await tx.task.create({ data: taskData(f, { parentId: y1.id }) });
      const y3 = await tx.task.create({ data: taskData(f, { parentId: y2.id }) });
      const x1 = await tx.task.create({ data: taskData(f, { position: 'a1' }) });
      const x2 = await tx.task.create({ data: taskData(f, { parentId: x1.id }) });
      await tx.task.create({ data: taskData(f, { parentId: x2.id }) });
      // x1 có 3 cấp. Đặt dưới y3 (cấp 3) thì cấp cuối là 6.
      await expect(
        tx.task.update({ where: { id: x1.id }, data: { parentId: y3.id } }),
      ).rejects.toThrow(/QLCV_TASK_DEPTH_EXCEEDED/);
    });
  });

  it('sau khi chuyển, độ sâu của cả cây con được cập nhật', async () => {
    await inRollback(async (tx) => {
      const f = await fixtures(tx);
      const z = await tx.task.create({ data: taskData(f, { position: 'a0' }) });
      const x1 = await tx.task.create({ data: taskData(f, { position: 'a1' }) });
      const x2 = await tx.task.create({ data: taskData(f, { parentId: x1.id }) });
      const x3 = await tx.task.create({ data: taskData(f, { parentId: x2.id }) });
      await tx.task.update({ where: { id: x1.id }, data: { parentId: z.id } });
      const depths = await Promise.all(
        [x1, x2, x3].map(async (t) => (await tx.task.findUniqueOrThrow({ where: { id: t.id } })).depth),
      );
      expect(depths).toEqual([2, 3, 4]);
    });
  });

  it('truy vấn đệ quy lấy được cả cây theo thứ tự', async () => {
    await inRollback(async (tx) => {
      const f = await fixtures(tx);
      const root = await tx.task.create({ data: taskData(f, { title: 'Gốc' }) });
      const c1 = await tx.task.create({ data: taskData(f, { title: 'Con 1', parentId: root.id, position: 'a0' }) });
      await tx.task.create({ data: taskData(f, { title: 'Con 2', parentId: root.id, position: 'a1' }) });
      await tx.task.create({ data: taskData(f, { title: 'Cháu', parentId: c1.id }) });
      const rows = await tx.$queryRaw<{ title: string; depth: number }[]>`
        WITH RECURSIVE tree AS (
          SELECT "id", "title", "depth", ARRAY["position"] AS path
          FROM "task" WHERE "id" = ${root.id}::uuid
          UNION ALL
          SELECT t."id", t."title", t."depth", tree.path || t."position"
          FROM "task" t JOIN tree ON t."parent_id" = tree."id"
        )
        SELECT "title", "depth" FROM tree ORDER BY path`;
      expect(rows.map((r) => r.title)).toEqual(['Gốc', 'Con 1', 'Cháu', 'Con 2']);
    });
  });
});

describe('việc: các ràng buộc khác', () => {
  it('progress ngoài 0 đến 100 bị chặn', async () => {
    await inRollback(async (tx) => {
      const f = await fixtures(tx);
      await expect(tx.task.create({ data: taskData(f, { progress: 101 }) })).rejects.toThrow(
        /task_progress_range/,
      );
    });
  });

  it('trạng thái blocked bắt buộc có lý do', async () => {
    await inRollback(async (tx) => {
      const f = await fixtures(tx);
      const ok = await tx.task.create({
        data: taskData(f, { status: 'blocked', blockedReason: 'Chờ giấy phép', position: 'a0' }),
      });
      expect(ok.status).toBe('blocked');
      await expect(
        tx.task.create({ data: taskData(f, { status: 'blocked', position: 'a1' }) }),
      ).rejects.toThrow(/task_blocked_needs_reason/);
    });
  });

  it('hạn không được trước ngày bắt đầu', async () => {
    await inRollback(async (tx) => {
      const f = await fixtures(tx);
      await expect(
        tx.task.create({
          data: taskData(f, { startDate: new Date('2026-11-10'), dueDate: new Date('2026-11-01') }),
        }),
      ).rejects.toThrow(/task_dates_order/);
    });
  });
});

describe('vị trí anh em (chỉ mục phân số)', () => {
  it('trùng vị trí ở cấp gốc bị từ chối', async () => {
    await inRollback(async (tx) => {
      const f = await fixtures(tx);
      await tx.task.create({ data: taskData(f, { position: 'a0' }) });
      await viPhamDuyNhat(tx.task.create({ data: taskData(f, { position: 'a0' }) }), [
        'project_id',
        'parent_id',
        'position',
      ]);
    });
  });

  it('trùng vị trí dưới cùng một cha bị từ chối', async () => {
    await inRollback(async (tx) => {
      const f = await fixtures(tx);
      const parent = await tx.task.create({ data: taskData(f) });
      await tx.task.create({ data: taskData(f, { parentId: parent.id, position: 'a0' }) });
      await viPhamDuyNhat(
        tx.task.create({ data: taskData(f, { parentId: parent.id, position: 'a0' }) }),
        ['project_id', 'parent_id', 'position'],
      );
    });
  });

  it("trùng vị trí trong cùng một checklist bị từ chối", async () => {
    await inRollback(async (tx) => {
      const f = await fixtures(tx);
      const task = await tx.task.create({ data: taskData(f) });
      await tx.checklistItem.create({ data: { taskId: task.id, title: "Chụp ảnh mặt bằng", position: "a0" } });
      await viPhamDuyNhat(
        tx.checklistItem.create({ data: { taskId: task.id, title: "Ghi chú hiện trạng", position: "a0" } }),
        ['task_id', 'position'],
      );
    });
  });

  it("cùng vị trí dưới cha khác, hoặc khi việc kia đã xóa mềm, thì được", async () => {
    await inRollback(async (tx) => {
      const f = await fixtures(tx);
      const p1 = await tx.task.create({ data: taskData(f, { position: 'a0' }) });
      const p2 = await tx.task.create({ data: taskData(f, { position: 'a1' }) });
      await tx.task.create({ data: taskData(f, { parentId: p1.id, position: 'a0' }) });
      await tx.task.create({ data: taskData(f, { parentId: p2.id, position: 'a0' }) });
      await tx.task.update({ where: { id: p1.id }, data: { deletedAt: new Date() } });
      const reused = await tx.task.create({ data: taskData(f, { position: 'a0' }) });
      expect(reused.position).toBe('a0');
    });
  });

  it('thứ tự so sánh theo byte (chữ hoa đứng trước chữ thường)', async () => {
    await inRollback(async (tx) => {
      const f = await fixtures(tx);
      for (const position of ['a0', 'B0', 'Zz']) {
        await tx.task.create({ data: taskData(f, { position }) });
      }
      const rows = await tx.$queryRaw<{ position: string }[]>`
        SELECT "position" FROM "task" WHERE "project_id" = ${f.project.id}::uuid ORDER BY "position"`;
      expect(rows.map((r) => r.position)).toEqual(['B0', 'Zz', 'a0']);
    });
  });
});

describe('nhật ký hoạt động chỉ ghi thêm', () => {
  const insertLog = (tx: Tx) =>
    tx.$executeRaw`INSERT INTO "activity_log" ("entity_type", "entity_id", "action")
                   VALUES ('task', gen_random_uuid(), 'created')`;

  it('ghi thêm được', async () => {
    await inRollback(async (tx) => {
      expect(await insertLog(tx)).toBe(1);
    });
  });

  it('UPDATE bị từ chối', async () => {
    await inRollback(async (tx) => {
      await insertLog(tx);
      await expect(tx.$executeRaw`UPDATE "activity_log" SET "action" = 'sua'`).rejects.toThrow(
        /QLCV_ACTIVITY_LOG_IMMUTABLE/,
      );
    });
  });

  it('DELETE bị từ chối', async () => {
    await inRollback(async (tx) => {
      await insertLog(tx);
      await expect(tx.$executeRaw`DELETE FROM "activity_log"`).rejects.toThrow(
        /QLCV_ACTIVITY_LOG_IMMUTABLE/,
      );
    });
  });

  it('TRUNCATE bị từ chối', async () => {
    await inRollback(async (tx) => {
      await expect(tx.$executeRawUnsafe('TRUNCATE "activity_log"')).rejects.toThrow(
        /QLCV_ACTIVITY_LOG_IMMUTABLE/,
      );
    });
  });
});

describe('người dùng, nhãn, tệp', () => {
  it('email phải viết thường', async () => {
    await inRollback(async (tx) => {
      const f = await fixtures(tx);
      await expect(
        tx.user.create({ data: { organizationId: f.org.id, email: 'Viet.Hoa@Example.com', name: 'X' } }),
      ).rejects.toThrow(/app_user_email_lowercase/);
    });
  });

  it('màu nhãn phải dạng #RRGGBB và tên nhãn không trùng không phân biệt hoa thường', async () => {
    await inRollback(async (tx) => {
      const f = await fixtures(tx);
      await tx.label.create({ data: { organizationId: f.org.id, name: 'Pháp lý', color: '#112723' } });
      await viPhamDuyNhat(
        tx.label.create({ data: { organizationId: f.org.id, name: 'PHÁP LÝ', color: '#ffffff' } }),
        ['organization_id', 'project_id', 'lower(name)'],
      );
    });
  });

  it('màu nhãn sai dạng bị chặn', async () => {
    await inRollback(async (tx) => {
      const f = await fixtures(tx);
      await expect(
        tx.label.create({ data: { organizationId: f.org.id, name: 'Đỏ', color: 'red' } }),
      ).rejects.toThrow(/label_color_format/);
    });
  });

  it('phụ thuộc không được nối việc với chính nó', async () => {
    await inRollback(async (tx) => {
      const f = await fixtures(tx);
      const task = await tx.task.create({ data: taskData(f) });
      await expect(
        tx.taskDependency.create({ data: { predecessorId: task.id, successorId: task.id } }),
      ).rejects.toThrow(/task_dependency_no_self/);
    });
  });

  it('mỗi nhóm phiên bản của tệp chỉ có một bản hiện hành', async () => {
    await inRollback(async (tx) => {
      const f = await fixtures(tx);
      const task = await tx.task.create({ data: taskData(f) });
      const base = {
        projectId: f.project.id,
        taskId: task.id,
        uploaderId: f.user.id,
        fileName: 'ban-ve.pdf',
        mime: 'application/pdf',
        size: 1024,
      };
      const first = await tx.attachment.create({
        data: { ...base, storageKey: 'k/1', versionNo: 1 },
      });
      await viPhamDuyNhat(
        tx.attachment.create({
          data: { ...base, storageKey: 'k/2', versionGroupId: first.versionGroupId, versionNo: 2 },
        }),
        ['version_group_id'],
      );
    });
  });
});