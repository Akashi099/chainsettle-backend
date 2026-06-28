import { Controller, Post, Get, Delete, Body, Param, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { WebhooksService } from './webhooks.service';
import { CreateWebhookDto } from './dto/create-webhook.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('webhooks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @Post()
  @ApiOperation({ summary: 'Register a webhook endpoint — returns plaintext secret once' })
  register(@CurrentUser('id') userId: string, @Body() dto: CreateWebhookDto) {
    return this.webhooksService.register(userId, dto);
  }

  @Get()
  @ApiOperation({ summary: "List the authenticated user's webhook endpoints" })
  findAll(@CurrentUser('id') userId: string) {
    return this.webhooksService.findForUser(userId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a webhook endpoint' })
  remove(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.webhooksService.remove(id, userId);
  }

  @Post(':id/rotate-secret')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate the signing secret for a webhook endpoint — returns new plaintext secret once' })
  @ApiResponse({ status: 200, description: 'New plaintext secret returned once' })
  @ApiResponse({ status: 403, description: 'Not the endpoint owner' })
  @ApiResponse({ status: 404, description: 'Endpoint not found' })
  rotateSecret(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.webhooksService.rotateSecret(id, userId);
  }
}
