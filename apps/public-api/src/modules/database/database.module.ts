import { Module } from "@nestjs/common";
import { PostgresRuntimeService } from "./postgres-runtime.service";

@Module({
  providers: [PostgresRuntimeService],
  exports: [PostgresRuntimeService]
})
export class DatabaseModule {}
