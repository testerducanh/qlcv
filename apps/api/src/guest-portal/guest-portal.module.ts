import { Module } from "@nestjs/common";
import { ApprovalsModule } from "../approvals/approvals.module";
import { AttachmentsModule } from "../attachments/attachments.module";
import { AuthModule } from "../auth/auth.module";
import { GuestPortalController } from "./guest-portal.controller";
import { GuestPortalService } from "./guest-portal.service";

@Module({
  imports: [AuthModule, AttachmentsModule, ApprovalsModule],
  controllers: [GuestPortalController],
  providers: [GuestPortalService],
})
export class GuestPortalModule {}
