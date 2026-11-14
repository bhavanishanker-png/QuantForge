import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiProperty, ApiTags } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, Length } from 'class-validator';
import { UserDto } from '../auth/dto.js';
import { type AuthUser, CurrentUser } from '../common/auth/decorators.js';
import { PrismaService } from '../common/database/prisma.service.js';
import { ApiError } from '../common/http/error.filter.js';

export class UpdateMeDto {
  @ApiProperty()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 80)
  displayName!: string;
}

@ApiTags('users')
@ApiBearerAuth()
@Controller({ path: 'users', version: '1' })
export class UsersController {
  constructor(private readonly db: PrismaService) {}

  @Get('me')
  @ApiOkResponse({ type: UserDto })
  async me(@CurrentUser() user: AuthUser): Promise<UserDto> {
    const u = await this.db.withContext({ userId: user.userId }, (tx) =>
      tx.user.findUnique({ where: { id: user.userId }, select: { id: true, email: true, displayName: true } }),
    );
    if (!u) throw new ApiError(401, 'UNAUTHENTICATED', 'Account no longer exists');
    return u;
  }

  @Patch('me')
  @ApiOkResponse({ type: UserDto })
  updateMe(@CurrentUser() user: AuthUser, @Body() dto: UpdateMeDto): Promise<UserDto> {
    return this.db.withContext({ userId: user.userId }, (tx) =>
      tx.user.update({
        where: { id: user.userId },
        data: { displayName: dto.displayName },
        select: { id: true, email: true, displayName: true },
      }),
    );
  }
}
