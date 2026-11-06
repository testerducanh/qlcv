import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { TasksModule } from "../tasks/tasks.module";
import { IntegrationsController } from "./integrations.controller";
import { IntegrationsService } from "./integrations.service";

@Module({
  imports: [AuthModule, TasksModule],
  controllers: [IntegrationsController],
  providers: [IntegrationsService],
})
export class IntegrationsModule {}
