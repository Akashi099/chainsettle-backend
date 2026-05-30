// milestones.service.ts
import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { IpfsService } from '../../common/ipfs/ipfs.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MilestoneStatus, NotificationType } from '@prisma/client';

@Injectable()
export class MilestonesService {
  private readonly logger = new Logger(MilestonesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ipfs: IpfsService,
    private readonly notifications: NotificationsService,
  ) {}

  async findByShipment(shipmentId: string) {
    return this.prisma.milestone.findMany({
      where: { shipmentId },
      orderBy: { milestoneIndex: 'asc' },
    });
  }

  async findOne(shipmentId: string, milestoneIndex: number) {
    const milestone = await this.prisma.milestone.findUnique({
      where: { shipmentId_milestoneIndex: { shipmentId, milestoneIndex } },
    });
    if (!milestone) {
      throw new NotFoundException(
        `Milestone ${milestoneIndex} not found on shipment ${shipmentId}`,
      );
    }
    return milestone;
  }

  // ----------------------------------------------------------
  // PROOF SUBMISSION
  // ----------------------------------------------------------

  /**
   * Uploads a proof file to IPFS and persists the resulting CID.
   * Restricted to the shipment's supplierAddress or logisticsAddress.
   *
   * @param shipmentId     - Shipment identifier
   * @param milestoneIndex - 0-based milestone index
   * @param callerAddress  - Stellar address of the authenticated caller
   * @param file           - Uploaded file (from multer)
   * @returns The updated milestone record and the IPFS gateway URL
   */
  async submitProof(
    shipmentId: string,
    milestoneIndex: number,
    callerAddress: string,
    file: Express.Multer.File,
  ) {
    // Fetch the shipment to verify caller is authorized
    const shipment = await this.prisma.shipment.findUnique({
      where: { id: shipmentId },
    });

    if (!shipment) {
      throw new NotFoundException(`Shipment ${shipmentId} not found`);
    }

    const isAuthorized =
      shipment.supplierAddress === callerAddress ||
      shipment.logisticsAddress === callerAddress;

    if (!isAuthorized) {
      throw new ForbiddenException(
        'Only the shipment supplier or logistics provider may submit proof',
      );
    }

    // Ensure the milestone exists before uploading
    const milestone = await this.findOne(shipmentId, milestoneIndex);

    // Upload to IPFS
    const cid = await this.ipfs.uploadFile(
      file.buffer,
      file.originalname,
      file.mimetype,
    );

    // Persist CID + status transition
    const updated = await this.markProofSubmitted(shipmentId, milestoneIndex, cid);

    this.logger.log(
      `Proof submitted for ${shipmentId}[${milestoneIndex}] — CID: ${cid}`,
    );

    // Notify buyer
    await this.notifications.notifyUser(
      shipment.buyerAddress,
      NotificationType.PROOF_SUBMITTED,
      'Proof submitted for review',
      `Milestone ${milestoneIndex} ("${milestone.name}") proof has been uploaded for shipment ${shipmentId}. Please review and confirm.`,
      { shipmentId, milestoneIndex, proofHash: cid },
    );

    return {
      milestone: updated,
      cid,
      gatewayUrl: this.ipfs.getGatewayUrl(cid),
    };
  }

  // ----------------------------------------------------------
  // INTERNAL HELPERS (called by EventsService)
  // ----------------------------------------------------------

  /**
   * Called by EventsService when a proof_submitted event is detected on-chain.
   * Updates the local DB record to reflect the new proof hash and status.
   */
  async markProofSubmitted(
    shipmentId: string,
    milestoneIndex: number,
    proofHash: string,
  ) {
    return this.prisma.milestone.update({
      where: { shipmentId_milestoneIndex: { shipmentId, milestoneIndex } },
      data: {
        proofHash,
        status: MilestoneStatus.PROOF_SUBMITTED,
      },
    });
  }

  /**
   * Called by EventsService when a milestone_confirmed event is detected.
   */
  async markConfirmed(
    shipmentId: string,
    milestoneIndex: number,
    paymentReleased: bigint,
  ) {
    return this.prisma.milestone.update({
      where: { shipmentId_milestoneIndex: { shipmentId, milestoneIndex } },
      data: {
        status: MilestoneStatus.CONFIRMED,
        paymentReleased,
        confirmedAt: new Date(),
      },
    });
  }

  /**
   * Called by EventsService when a dispute_raised event is detected.
   */
  async markDisputed(shipmentId: string, milestoneIndex: number) {
    return this.prisma.milestone.update({
      where: { shipmentId_milestoneIndex: { shipmentId, milestoneIndex } },
      data: { status: MilestoneStatus.DISPUTED },
    });
  }

  /**
   * Called by EventsService when a dispute_resolved event is detected.
   */
  async markResolved(
    shipmentId: string,
    milestoneIndex: number,
    approved: boolean,
    paymentReleased?: bigint,
  ) {
    return this.prisma.milestone.update({
      where: { shipmentId_milestoneIndex: { shipmentId, milestoneIndex } },
      data: {
        status: approved ? MilestoneStatus.RESOLVED : MilestoneStatus.PENDING,
        ...(approved && paymentReleased
          ? { paymentReleased, confirmedAt: new Date() }
          : {}),
      },
    });
  }
}
