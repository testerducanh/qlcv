import { Module } from "@nestjs/common";
import { AttachmentsModule } from "../attachments/attachments.module";
import { AuthModule } from "../auth/auth.module";
import { InternalEventsModule } from "./internal-events.module";
import { P16Controller } from "./p16.controller";
import { P16Service } from "./p16.service";

@Module({
  imports: [AuthModule, AttachmentsModule, InternalEventsModule],
  controllers: [P16Controller],
  providers: [P16Service],
  exports: [P16Service],
})
export class P16Module {}
