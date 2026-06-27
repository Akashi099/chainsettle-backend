import { Controller, Get, Patch, Body, Param, BadRequestException, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('users')
@Controller('users')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class UsersController {
  constructor(private readonly authService: AuthService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get the authenticated user profile' })
  @ApiResponse({ status: 200, description: 'Returns user profile' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  getProfile(@CurrentUser() user: any) {
    return this.authService.getProfile(user.id);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update user profile (name, email)' })
  @ApiResponse({ status: 200, description: 'Profile updated successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 409, description: 'Email already in use' })
  updateProfile(@CurrentUser() user: any, @Body() dto: UpdateProfileDto) {
    return this.authService.updateProfile(user.id, dto);
  }

  @Get(':stellarAddress')
  @ApiOperation({ summary: 'Get public profile by Stellar address' })
  @ApiResponse({ status: 200, description: 'Returns public profile' })
  @ApiResponse({ status: 400, description: 'Invalid Stellar address format' })
  @ApiResponse({ status: 404, description: 'User not found' })
  getPublicProfile(@Param('stellarAddress') stellarAddress: string) {
    if (!/^G[A-Z2-7]{55}$/.test(stellarAddress)) {
      throw new BadRequestException('Invalid Stellar address format');
    }
    return this.authService.getPublicProfile(stellarAddress);
  }
}
