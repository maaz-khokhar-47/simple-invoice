import { ApiProperty } from '@nestjs/swagger';

export class UserProfileDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  email: string;

  @ApiProperty()
  fullname: string;
}

export class LoginResponseDto {
  @ApiProperty()
  accessToken: string;

  @ApiProperty({ description: 'Token lifetime in seconds', example: 3600 })
  expiresIn: number;

  @ApiProperty({ type: UserProfileDto })
  user: UserProfileDto;
}
