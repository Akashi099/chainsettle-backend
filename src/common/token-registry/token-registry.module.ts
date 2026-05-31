import { Global, Module } from '@nestjs/common';
import { TokenRegistryService } from './token-registry.service';

@Global()
@Module({
  providers: [TokenRegistryService],
  exports: [TokenRegistryService],
})
export class TokenRegistryModule {}
