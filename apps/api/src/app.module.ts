import { Module } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";
import { AuthModule } from "./auth/auth.module";
import { AttachmentsModule } from "./attachments/attachments.module";
import { ApiExceptionFilter } from "./common/api-exception.filter";
import { HealthController } from "./health/health.controller";
import { InfraModule } from "./infra/infra.module";
import { ManagementModule } from "./management/management.module";
import { MyWorkModule } from "./my-work/my-work.module";
import { PermissionsModule } from "./permissions/permissions.module";
import { P16Module } from "./p16/p16.module";
import { TasksModule } from "./tasks/tasks.module";
import { ApprovalsModule } from "./approvals/approvals.module";
import { TemplatesModule } from "./templates/templates.module";
import { ReportsModule } from "./reports/reports.module";
import { DashboardModule } from "./dashboard/dashboard.module";
import { GuestPortalModule } from "./guest-portal/guest-portal.module";
import { IntegrationsModule } from "./integrations/integrations.module";

@Module({
  imports: [
    InfraModule,
    AuthModule,
    AttachmentsModule,
    ManagementModule,
    MyWorkModule,
    P16Module,
    PermissionsModule,
    TasksModule,
    ApprovalsModule,
    TemplatesModule,
    ReportsModule,
    DashboardModule,
    GuestPortalModule,
    IntegrationsModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_FILTER, useClass: ApiExceptionFilter }],
})
export class AppModule {}
