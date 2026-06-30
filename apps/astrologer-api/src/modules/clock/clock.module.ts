import { Module } from "@nestjs/common";
import { SystemClock } from "./system-clock.service";

@Module({
  providers: [SystemClock],
  exports: [SystemClock]
})
export class ClockModule {}
