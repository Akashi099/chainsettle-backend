import {
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { EventsService } from './events.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('events')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Get()
  @ApiOperation({ summary: 'List on-chain events with optional shipment filter' })
  @ApiQuery({ name: 'shipmentId', required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  findAll(
    @Query('shipmentId') shipmentId?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.eventsService.findAll(shipmentId, page, limit);
  }

  // ----------------------------------------------------------
  // ADMIN — Dead-letter queue management
  // ----------------------------------------------------------

  @Get('admin/failed-events')
  @ApiOperation({ summary: '[Admin] List unresolved failed events (DLQ)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  getFailedEvents(
    @CurrentUser() user: any,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    this.requireAdmin(user);
    return this.eventsService.getAdminFailedEvents(page, limit);
  }

  @Post('admin/failed-events/:id/retry')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[Admin] Manually retry a failed event by ID' })
  async retryFailedEvent(@Param('id') id: string, @CurrentUser() user: any) {
    this.requireAdmin(user);
    try {
      await this.eventsService.retryFailedEventById(id);
      return { message: `Failed event ${id} retried and resolved successfully` };
    } catch (error) {
      if ((error as any).code === 'P2025') {
        throw new NotFoundException(`Failed event ${id} not found`);
      }
      throw error;
    }
  }

  private requireAdmin(user: any) {
    if (user?.role !== 'ADMIN') {
      throw new ForbiddenException('Admin access required');
    }
  }
}
