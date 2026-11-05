import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AttachmentsController } from "./attachments.controller";
import { AttachmentsService } from "./attachments.service";
import { NoopVirusScanner, VIRUS_SCANNER } from "./virus-scanner";

@Module({
  imports: [AuthModule],
  controllers: [AttachmentsController],
  providers: [
    AttachmentsService,
    { provide: VIRUS_SCANNER, useClass: NoopVirusScanner },
  ],
  exports: [AttachmentsService],
})
export class AttachmentsModule {}
