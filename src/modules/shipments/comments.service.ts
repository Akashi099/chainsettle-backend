import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { CommentVisibility, NotificationType } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateCommentDto } from './dto/create-comment.dto';

@Injectable()
export class CommentsService {
  private readonly logger = new Logger(CommentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  // ----------------------------------------------------------
  // POST /shipments/:id/comments
  // ----------------------------------------------------------

  async create(
    shipmentId: string,
    authorId: string,
    authorAddress: string,
    dto: CreateCommentDto,
  ) {
    const shipment = await this.prisma.shipment.findUnique({
      where: { id: shipmentId },
    });
    if (!shipment) throw new NotFoundException(`Shipment ${shipmentId} not found`);

    if (!this.isParticipant(authorAddress, shipment)) {
      throw new ForbiddenException('Only shipment participants can post comments');
    }

    const comment = await this.prisma.shipmentComment.create({
      data: {
        shipmentId,
        authorId,
        body: dto.body,
        visibility: dto.visibility ?? CommentVisibility.ALL,
        attachmentCid: dto.attachmentCid,
      },
      include: { author: { select: { id: true, stellarAddress: true, name: true } } },
    });

    this.logger.log(`Comment created on shipment ${shipmentId} by ${authorAddress}`);

    // Notify all participants who can see this comment
    await this.notifyParticipants(shipment, comment, authorAddress);

    return comment;
  }

  // ----------------------------------------------------------
  // GET /shipments/:id/comments
  // ----------------------------------------------------------

  async findAll(
    shipmentId: string,
    requesterAddress: string,
    page = 1,
    limit = 20,
  ) {
    const shipment = await this.prisma.shipment.findUnique({
      where: { id: shipmentId },
    });
    if (!shipment) throw new NotFoundException(`Shipment ${shipmentId} not found`);

    const requester = await this.prisma.user.findUnique({
      where: { stellarAddress: requesterAddress },
    });
    const isAdmin = requester?.role === 'ADMIN';

    if (!isAdmin && !this.isParticipant(requesterAddress, shipment)) {
      throw new ForbiddenException('Only shipment participants can read comments');
    }

    const visibilityFilter = this.buildVisibilityFilter(requesterAddress, shipment, isAdmin);

    const where = {
      shipmentId,
      deletedAt: null,
      visibility: { in: visibilityFilter },
    };

    const [comments, total] = await this.prisma.$transaction([
      this.prisma.shipmentComment.findMany({
        where,
        include: { author: { select: { id: true, stellarAddress: true, name: true } } },
        orderBy: { createdAt: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.shipmentComment.count({ where }),
    ]);

    return { data: comments, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  // ----------------------------------------------------------
  // DELETE /shipments/:id/comments/:commentId
  // ----------------------------------------------------------

  async remove(shipmentId: string, commentId: string, requesterId: string, requesterAddress: string) {
    const comment = await this.prisma.shipmentComment.findFirst({
      where: { id: commentId, shipmentId, deletedAt: null },
    });
    if (!comment) throw new NotFoundException(`Comment ${commentId} not found`);

    const requester = await this.prisma.user.findUnique({
      where: { stellarAddress: requesterAddress },
    });
    const isAdmin = requester?.role === 'ADMIN';

    if (comment.authorId !== requesterId && !isAdmin) {
      throw new ForbiddenException('Only the comment author or an admin can delete this comment');
    }

    await this.prisma.shipmentComment.update({
      where: { id: commentId },
      data: { deletedAt: new Date() },
    });

    this.logger.log(`Comment ${commentId} soft-deleted by ${requesterAddress}`);
  }

  // ----------------------------------------------------------
  // HELPERS
  // ----------------------------------------------------------

  private isParticipant(address: string, shipment: any): boolean {
    return [
      shipment.buyerAddress,
      shipment.supplierAddress,
      shipment.logisticsAddress,
      shipment.arbiterAddress,
    ].includes(address);
  }

  private buildVisibilityFilter(
    address: string,
    shipment: any,
    isAdmin: boolean,
  ): CommentVisibility[] {
    if (isAdmin) return [CommentVisibility.ALL, CommentVisibility.BUYER_SUPPLIER, CommentVisibility.INTERNAL];

    const isBuyerOrSupplier =
      address === shipment.buyerAddress || address === shipment.supplierAddress;
    const isInternalParty =
      address === shipment.logisticsAddress || address === shipment.arbiterAddress;

    const filter: CommentVisibility[] = [CommentVisibility.ALL];
    if (isBuyerOrSupplier) filter.push(CommentVisibility.BUYER_SUPPLIER);
    if (isInternalParty) filter.push(CommentVisibility.INTERNAL);
    return filter;
  }

  private async notifyParticipants(shipment: any, comment: any, authorAddress: string) {
    const visibleTo = this.buildVisibilityFilter('', shipment, true)
      .filter((v) => {
        // Determine which addresses can see this visibility level
        if (comment.visibility === CommentVisibility.ALL) return true;
        if (comment.visibility === CommentVisibility.BUYER_SUPPLIER) {
          return v === CommentVisibility.ALL || v === CommentVisibility.BUYER_SUPPLIER;
        }
        // INTERNAL
        return v === CommentVisibility.ALL || v === CommentVisibility.INTERNAL;
      });

    const eligibleAddresses = new Set<string>();

    if (
      comment.visibility === CommentVisibility.ALL ||
      comment.visibility === CommentVisibility.BUYER_SUPPLIER
    ) {
      eligibleAddresses.add(shipment.buyerAddress);
      eligibleAddresses.add(shipment.supplierAddress);
    }
    if (
      comment.visibility === CommentVisibility.ALL ||
      comment.visibility === CommentVisibility.INTERNAL
    ) {
      eligibleAddresses.add(shipment.logisticsAddress);
      eligibleAddresses.add(shipment.arbiterAddress);
    }

    // Don't notify the author
    eligibleAddresses.delete(authorAddress);

    for (const address of eligibleAddresses) {
      await this.notifications.notifyUser(
        address,
        NotificationType.COMMENT_ADDED,
        'New comment on shipment',
        `A new comment has been added to shipment ${shipment.id}.`,
        { shipmentId: shipment.id, commentId: comment.id },
      );
    }
  }
}
