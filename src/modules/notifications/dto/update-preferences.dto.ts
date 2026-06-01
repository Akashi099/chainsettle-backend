import { IsObject } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { NotificationType } from '@prisma/client';

export class UpdatePreferencesDto {
  @ApiProperty({
    description: 'Partial map of NotificationType to channel flags',
    example: { PROOF_SUBMITTED: { inApp: true, email: false } },
  })
  @IsObject()
  preferences: Partial<Record<NotificationType, { inApp: boolean; email: boolean }>>;
}
