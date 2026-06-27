import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ShipmentStatus } from '@prisma/client';

export class FindAllShipmentsDto {
  @ApiPropertyOptional({ description: 'Filter by buyer wallet address' })
  @IsOptional()
  @IsString()
  buyerAddress?: string;

  @ApiPropertyOptional({ description: 'Filter by supplier wallet address' })
  @IsOptional()
  @IsString()
  supplierAddress?: string;

  @ApiPropertyOptional({ description: 'Filter by shipment status', enum: ShipmentStatus })
  @IsOptional()
  @IsString()
  status?: ShipmentStatus;

  @ApiPropertyOptional({ description: 'Filter by reference number' })
  @IsOptional()
  @IsString()
  referenceNumber?: string;

  @ApiPropertyOptional({ description: 'Comma-separated list of tags to filter by' })
  @IsOptional()
  @IsString()
  tags?: string;

  @ApiPropertyOptional({ description: 'Page number (1-based)', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ description: 'Results per page', default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;

  // New Date Filters
  @ApiPropertyOptional({ 
    description: 'Filter shipments created on or after this ISO date', 
    example: '2026-01-01T00:00:00.000Z' 
  })
  @IsOptional()
  @IsISO8601()
  createdAfter?: string;

  @ApiPropertyOptional({ 
    description: 'Filter shipments created on or before this ISO date', 
    example: '2026-03-31T23:59:59.999Z' 
  })
  @IsOptional()
  @IsISO8601()
  createdBefore?: string;

  @ApiPropertyOptional({ 
    description: 'Filter shipments updated on or after this ISO date', 
    example: '2026-01-01T00:00:00.000Z' 
  })
  @IsOptional()
  @IsISO8601()
  updatedAfter?: string;

  @ApiPropertyOptional({ 
    description: 'Filter shipments updated on or before this ISO date', 
    example: '2026-03-31T23:59:59.999Z' 
  })
  @IsOptional()
  @IsISO8601()
  updatedBefore?: string;
}