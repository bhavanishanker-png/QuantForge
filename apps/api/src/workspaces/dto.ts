import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsEnum, IsString, Length } from 'class-validator';
import { WorkspaceRole } from '../generated/prisma/enums.js';
import { PageMeta } from '../common/http/pagination.js';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateWorkspaceDto {
  @ApiProperty({ example: 'Momentum research' })
  @Transform(trim) @IsString() @Length(1, 80)
  name!: string;
}

export class UpdateWorkspaceDto extends CreateWorkspaceDto {}

export class WorkspaceDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() slug!: string;
  @ApiProperty({ enum: WorkspaceRole, enumName: 'WorkspaceRole', description: "The caller's role" })
  role!: WorkspaceRole;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
}

export class WorkspacePageDto extends PageMeta {
  @ApiProperty({ type: [WorkspaceDto] }) items!: WorkspaceDto[];
}

export class MemberDto {
  @ApiProperty({ format: 'uuid' }) userId!: string;
  @ApiProperty() email!: string;
  @ApiProperty() displayName!: string;
  @ApiProperty({ enum: WorkspaceRole, enumName: 'WorkspaceRole' }) role!: WorkspaceRole;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
}

export class AddMemberDto {
  @ApiProperty()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  email!: string;

  @ApiProperty({ enum: WorkspaceRole, enumName: 'WorkspaceRole' })
  @IsEnum(WorkspaceRole)
  role!: WorkspaceRole;
}

export class UpdateMemberDto {
  @ApiProperty({ enum: WorkspaceRole, enumName: 'WorkspaceRole' })
  @IsEnum(WorkspaceRole)
  role!: WorkspaceRole;
}
