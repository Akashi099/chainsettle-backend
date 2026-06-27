import { Module, Global } from '@nestjs/common';
import { IpfsService } from './ipfs.service';
import { RedisModule } from '../redis/redis.module';

@Global()
@Module({
  imports: [RedisModule],
  providers: [IpfsService],
  exports: [IpfsService],
})
export class IpfsModule {}
