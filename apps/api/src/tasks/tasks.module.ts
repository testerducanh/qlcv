import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { TasksController } from "./tasks.controller";
import { TaskResourceGuard } from "./task-resource.guard";
import { TasksService } from "./tasks.service";
import { InternalEventsModule } from "../p16/internal-events.module";

@Module({
  imports: [AuthModule, InternalEventsModule],
  controllers: [TasksController],
  providers: [TasksService, TaskResourceGuard],
  exports: [TasksService],
})
export class TasksModule {}
