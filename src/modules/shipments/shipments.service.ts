import {
  Injectable,
  NotFoundException,
  Logger,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { StellarService } from '../../common/stellar/stellar.service';
import { CreateShipmentDto } from './dto/create-shipment.dto';
import { ShipmentStatus } from '@prisma/client';

@Injectable()
export class ShipmentsService {
  private readonly logger = new Logger(ShipmentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stellar: StellarService,
  ) {}

  // ----------------------------------------------------------
  // CREATE — persist after tx is confirmed on-chain
  // ----------------------------------------------------------

  /**
   * Saves a shipment record in the database after the buyer has
   * submitted the create_shipment transaction via the frontend.
   * The frontend sends the confirmed txHash back here.
   */
  async create(dto: CreateShipmentDto) {
    const existing = await this.prisma.shipment.findUnique({
      where: { id: dto.shipmentId },
    });
    if (existing) {
      throw new ConflictException(`Shipment ${dto.shipmentId} already exists`);
    }

    // Check for duplicate referenceNumber if provided
    if (dto.referenceNumber) {
      const withRef = await this.prisma.shipment.findUnique({
        where: { referenceNumber: dto.referenceNumber },
      });
      if (withRef) {
        throw new ConflictException(`Shipment with referenceNumber "${dto.referenceNumber}" already exists`);
      }
    }

    const shipment = await this.prisma.shipment.create({
      data: {
        id: dto.shipmentId,
        buyerAddress: dto.buyerAddress,
        supplierAddress: dto.supplierAddress,
        logisticsAddress: dto.logisticsAddress,
        arbiterAddress: dto.arbiterAddress,
        tokenAddress: dto.tokenAddress,
        totalAmount: BigInt(dto.totalAmount),
        txHash: dto.txHash,
        description: dto.description,
        referenceNumber: dto.referenceNumber,
        metadata: dto.metadata,
        tags: dto.tags ?? [],
        milestones: {
          create: dto.milestones.map((m, index) => ({
            milestoneIndex: index,
            name: m.name,
            paymentPercent: m.paymentPercent,
            ...(m.dueAt ? { dueAt: new Date(m.dueAt) } : {}),
          })),
        },
      },
      include: { milestones: true },
    });

    this.logger.log(`Shipment created: ${shipment.id}`);
    return this.serialize(shipment);
  }

  // ----------------------------------------------------------
  // READ
  // ----------------------------------------------------------

  async findAll(filters: {
    buyerAddress?: string;
    supplierAddress?: string;
    status?: ShipmentStatus;
    referenceNumber?: string;
    tags?: string[];
    page?: number;
    limit?: number;
  }) {
    const { buyerAddress, supplierAddress, status, referenceNumber, tags, page = 1, limit = 20 } = filters;

    const where: any = {};
    if (buyerAddress) where.buyerAddress = buyerAddress;
    if (supplierAddress) where.supplierAddress = supplierAddress;
    if (status) where.status = status;
    if (referenceNumber) where.referenceNumber = referenceNumber;
    if (tags && tags.length > 0) {
      where.tags = { hasSome: tags };
    }

    const [shipments, total] = await this.prisma.$transaction([
      this.prisma.shipment.findMany({
        where,
        include: { milestones: { orderBy: { milestoneIndex: 'asc' } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.shipment.count({ where }),
    ]);

    return {
      data: shipments.map(this.serialize),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string) {
    const shipment = await this.prisma.shipment.findUnique({
      where: { id },
      include: {
        milestones: { orderBy: { milestoneIndex: 'asc' } },
        events: { orderBy: { ledger: 'desc' }, take: 20 },
      },
    });
    if (!shipment) throw new NotFoundException(`Shipment ${id} not found`);
    return this.serialize(shipment);
  }

  /**
   * Update shipment metadata (description, referenceNumber, metadata, tags).
   * Only the buyer can update a shipment.
   * Financial fields and addresses are immutable and ignored if provided.
   */
  async update(id: string, buyerAddress: string, dto: any) {
    const shipment = await this.prisma.shipment.findUnique({
      where: { id },
    });

    if (!shipment) {
      throw new NotFoundException(`Shipment ${id} not found`);
    }

    // Verify buyer is the one making the update
    if (shipment.buyerAddress !== buyerAddress) {
      throw new ForbiddenException('Only the shipment buyer can update it');
    }

    // Check for duplicate referenceNumber if being updated
    if (dto.referenceNumber && dto.referenceNumber !== shipment.referenceNumber) {
      const withRef = await this.prisma.shipment.findUnique({
        where: { referenceNumber: dto.referenceNumber },
      });
      if (withRef) {
        throw new ConflictException(`Shipment with referenceNumber "${dto.referenceNumber}" already exists`);
      }
    }

    // Only allow updating descriptive fields (financial/address fields ignored)
    const updateData: any = {};
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.referenceNumber !== undefined) updateData.referenceNumber = dto.referenceNumber;
    if (dto.metadata !== undefined) updateData.metadata = dto.metadata;
    if (dto.tags !== undefined) updateData.tags = dto.tags;

    const updated = await this.prisma.shipment.update({
      where: { id },
      data: updateData,
      include: {
        milestones: { orderBy: { milestoneIndex: 'asc' } },
        events: { orderBy: { ledger: 'desc' }, take: 20 },
      },
    });

    this.logger.log(`Shipment updated: ${id}`);
    return this.serialize(updated);
  }

  // ----------------------------------------------------------
  // SYNC FROM CHAIN — called by EventsService after polling
  // ----------------------------------------------------------

  async syncStatusFromChain(shipmentId: string) {
    try {
      const onChain = await this.stellar.simulateContractCall('get_shipment', [
        // TODO: convert shipmentId to ScVal String
        // nativeToScVal(shipmentId, { type: 'string' })
      ]);

      if (!onChain) return;

      // Map on-chain status to Prisma enum
      const statusMap: Record<string, ShipmentStatus> = {
        Active: ShipmentStatus.ACTIVE,
        Completed: ShipmentStatus.COMPLETED,
        Cancelled: ShipmentStatus.CANCELLED,
      };

      await this.prisma.shipment.update({
        where: { id: shipmentId },
        data: {
          status: statusMap[onChain.status] ?? ShipmentStatus.ACTIVE,
          releasedAmount: BigInt(onChain.released_amount ?? 0),
        },
      });

      this.logger.log(`Synced shipment ${shipmentId} from chain`);
    } catch (error) {
      this.logger.error(`Failed to sync shipment ${shipmentId}`, error.message);
    }
  }

  // ----------------------------------------------------------
  // INTERNAL HELPERS
  // ----------------------------------------------------------

  private serialize(shipment: any) {
    const now = new Date();
    return {
      ...shipment,
      totalAmount: shipment.totalAmount?.toString(),
      releasedAmount: shipment.releasedAmount?.toString(),
      milestones: shipment.milestones?.map((m: any) => {
        // A milestone is overdue if: dueAt < now AND status is not CONFIRMED or RESOLVED
        const isOverdue =
          m.dueAt && 
          m.dueAt < now && 
          m.status !== 'CONFIRMED' && 
          m.status !== 'RESOLVED';

        return {
          ...m,
          paymentReleased: m.paymentReleased?.toString() ?? null,
          isOverdue: Boolean(isOverdue),
        };
      }),
    };
  }
}
