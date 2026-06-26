// milestones.module.ts
import { Module } from '@nestjs/common';
import { MilestonesController } from './milestones.controller';
import { MilestonesService } from './milestones.service';
import { MilestoneDeadlineJob } from './milestone-deadline.job';
import { DisputeEscalationJob } from './dispute-escalation.job';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [MilestonesController],
  providers: [MilestonesService, MilestoneDeadlineJob, DisputeEscalationJob],
  exports: [MilestonesService],
})
export class MilestonesModule {}
