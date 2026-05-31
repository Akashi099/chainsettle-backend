import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CommentsService } from './comments.service';
import { CreateCommentDto } from './dto/create-comment.dto';

@ApiTags('shipments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('shipments/:id/comments')
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Post a comment on a shipment (participants only)' })
  create(
    @Param('id') shipmentId: string,
    @Body() dto: CreateCommentDto,
    @CurrentUser() user: any,
  ) {
    return this.commentsService.create(shipmentId, user.sub, user.stellarAddress, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List comments on a shipment (visibility-filtered)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  findAll(
    @Param('id') shipmentId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @CurrentUser() user: any = {},
  ) {
    return this.commentsService.findAll(shipmentId, user.stellarAddress, page, limit);
  }

  @Delete(':commentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete a comment (author or admin)' })
  remove(
    @Param('id') shipmentId: string,
    @Param('commentId') commentId: string,
    @CurrentUser() user: any,
  ) {
    return this.commentsService.remove(shipmentId, commentId, user.sub, user.stellarAddress);
  }
}
