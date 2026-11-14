import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, Length, MaxLength } from 'class-validator';

const trimLower = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toLowerCase() : value);

export class RegisterDto {
  @ApiProperty({ example: 'ada@example.com' })
  @Transform(trimLower)
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({ minLength: 12, maxLength: 128 })
  @IsString()
  @Length(12, 128)
  password!: string;

  @ApiProperty({ example: 'Ada Lovelace' })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 80)
  displayName!: string;
}

export class LoginDto {
  @ApiProperty()
  @Transform(trimLower)
  @IsEmail()
  email!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(128)
  password!: string;
}

export class UserDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() email!: string;
  @ApiProperty() displayName!: string;
}

export class AuthResponseDto {
  @ApiProperty() accessToken!: string;
  @ApiProperty({ type: 'integer', description: 'Access token lifetime in seconds' }) expiresIn!: number;
  @ApiProperty({ type: UserDto }) user!: UserDto;
}
