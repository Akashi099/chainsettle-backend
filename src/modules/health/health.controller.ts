import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  HealthIndicatorResult,
  PrismaHealthIndicator,
} from '@nestjs/terminus';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { PrismaService } from '../../common/prisma/prisma.service';
import { IpfsService } from '../../common/ipfs/ipfs.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prismaHealth: PrismaHealthIndicator,
    private readonly prisma: PrismaService,
    private readonly ipfsService: IpfsService,
  ) {}

  @Get()
  @HealthCheck()
  @ApiOperation({ summary: 'Check API, database, and IPFS connectivity' })
  check() {
    return this.health.check([
      () => this.prismaHealth.pingCheck('database', this.prisma),
      () => this.ipfsHealthCheck(),
    ]);
  }

  private ipfsHealthCheck(): HealthIndicatorResult {
    const status = this.ipfsService.isHealthy ? 'up' : 'down';
    return { ipfs: { status } };
  }
}
