import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import {
  BranchesController,
  AvailableBranchesController,
  DepartmentsController,
  InvitationsController,
  ProjectsController,
  UsersController,
} from "./management.controller";
import { ManagementService } from "./management.service";
import { SystemAdminGuard } from "./system-admin.guard";

@Module({
  imports: [AuthModule],
  controllers: [
    BranchesController,
    AvailableBranchesController,
    DepartmentsController,
    UsersController,
    InvitationsController,
    ProjectsController,
  ],
  providers: [ManagementService, SystemAdminGuard],
})
export class ManagementModule {}
