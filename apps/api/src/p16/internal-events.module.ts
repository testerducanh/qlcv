import { Global, Module } from "@nestjs/common";
import { EventEmitter } from "node:events";

export const INTERNAL_EVENTS = "INTERNAL_EVENTS";

@Global()
@Module({
  providers: [
    { provide: INTERNAL_EVENTS, useFactory: () => new EventEmitter() },
  ],
  exports: [INTERNAL_EVENTS],
})
export class InternalEventsModule {}
