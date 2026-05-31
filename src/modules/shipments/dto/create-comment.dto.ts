import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CommentVisibility } from '@prisma/client';

export class CreateCommentDto {
  @ApiProperty({ maxLength: 2000 })
  @IsString()
  @MaxLength(2000)
  body: string;

  @ApiPropertyOptional({ enum: CommentVisibility, default: CommentVisibility.ALL })
  @IsOptional()
  @IsEnum(CommentVisibility)
  visibility?: CommentVisibility;

  @ApiPropertyOptional({ description: 'IPFS CID of an attached file (upload to IPFS first)' })
  @IsOptional()
  @IsString()
  attachmentCid?: string;
}
