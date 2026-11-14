import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/** Offset pagination for small collections (API_DESIGN.md §2). */
export class OffsetQuery {
  @ApiPropertyOptional({ type: 'integer', default: 1, minimum: 1 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page = 1;

  @ApiPropertyOptional({ type: 'integer', default: 25, minimum: 1, maximum: 100 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  pageSize = 25;
}

/** Cursor pagination for large or append-only collections. */
export class CursorQuery {
  @ApiPropertyOptional({ type: 'integer', default: 50, minimum: 1, maximum: 200 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200)
  limit = 50;

  @ApiPropertyOptional({ description: 'Opaque cursor from a previous response' })
  @IsOptional() @IsString() @MaxLength(200)
  cursor?: string;
}

export class PageMeta {
  @ApiProperty({ type: 'integer' }) page!: number;
  @ApiProperty({ type: 'integer' }) pageSize!: number;
  @ApiProperty({ type: 'integer' }) total!: number;
}

export function encodeCursor(parts: (string | Date)[]): string {
  return Buffer.from(JSON.stringify(parts.map((p) => (p instanceof Date ? p.toISOString() : p)))).toString('base64url');
}

export function decodeCursor(cursor: string, arity: number): string[] | undefined {
  try {
    const v: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (Array.isArray(v) && v.length === arity && v.every((x) => typeof x === 'string')) return v as string[];
  } catch {
    /* fallthrough */
  }
  return undefined;
}
