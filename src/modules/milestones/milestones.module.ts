// milestones.module.ts
import { Module } from '@nestjs/common';
import { MilestonesController } from './milestones.controller';
import { MilestonesService } from './milestones.service';
import { IpfsModule } from '../../common/ipfs/ipfs.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [IpfsModule, NotificationsModule],
  controllers: [MilestonesController],
  providers: [MilestonesService],
  exports: [MilestonesService],
})
export class MilestonesModule {}
