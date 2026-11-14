import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { JobStatus } from '../generated/prisma/enums.js';
import { CursorQuery } from '../common/http/pagination.js';

export class JobRefDto {
  @ApiProperty({ format: 'uuid' }) jobId!: string;
  @ApiProperty({ enum: JobStatus, enumName: 'JobStatus' }) status!: JobStatus;
  @ApiProperty({ type: String, nullable: true }) resourceType!: string | null;
  @ApiProperty({ type: String, nullable: true, format: 'uuid' }) resourceId!: string | null;
}

export class JobDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) workspaceId!: string;
  @ApiProperty({ example: 'system.ping' }) type!: string;
  @ApiProperty({ enum: JobStatus, enumName: 'JobStatus' }) status!: JobStatus;
  @ApiProperty({ type: Number, description: '0-100' }) progress!: number;
  @ApiProperty({ type: 'integer' }) attempt!: number;
  @ApiProperty({ type: 'integer' }) maxAttempts!: number;
  @ApiProperty() cancelRequested!: boolean;
  @ApiProperty({ type: String, nullable: true }) resourceType!: string | null;
  @ApiProperty({ type: String, nullable: true, format: 'uuid' }) resourceId!: string | null;
  @ApiProperty({ type: String, nullable: true }) errorCode!: string | null;
  @ApiProperty({ type: String, nullable: true }) errorMessage!: string | null;
  @ApiProperty({ type: 'object', nullable: true, additionalProperties: true }) result!: unknown;
  @ApiProperty({ format: 'uuid' }) createdBy!: string;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) startedAt!: Date | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) finishedAt!: Date | null;
}

export class JobPageDto {
  @ApiProperty({ type: [JobDto] }) items!: JobDto[];
  @ApiProperty({ type: String, nullable: true }) nextCursor!: string | null;
}

export class ListJobsQuery extends CursorQuery {
  @ApiPropertyOptional({ enum: JobStatus, enumName: 'JobStatus' })
  @IsOptional() @IsEnum(JobStatus)
  status?: JobStatus;

  @ApiPropertyOptional({ example: 'system.ping' })
  @IsOptional() @IsString() @MaxLength(100)
  type?: string;
}
