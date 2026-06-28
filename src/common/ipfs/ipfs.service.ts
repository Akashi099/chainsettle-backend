import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import * as FormData from 'form-data';

/**
 * IpfsService
 *
 * Uploads files to IPFS via Pinata's pinning API.
 * Falls back gracefully if keys are not configured (useful in development).
 *
 * Environment variables:
 *   IPFS_GATEWAY_URL  — Public read gateway, e.g. https://gateway.pinata.cloud/ipfs
 *   IPFS_API_KEY      — Pinata API key (JWT or v2 key)
 */
@Injectable()
export class IpfsService {
  private readonly logger = new Logger(IpfsService.name);
  private readonly pinataUrl = 'https://api.pinata.cloud/pinning/pinFileToIPFS';
  private readonly gateway: string;
  private readonly apiKey: string;

  constructor(private readonly config: ConfigService) {
    this.gateway = this.config.get<string>(
      'IPFS_GATEWAY_URL',
      'https://gateway.pinata.cloud/ipfs',
    );
    this.apiKey = this.config.get<string>('IPFS_API_KEY', '');
  }

  /**
   * Uploads a file buffer to IPFS via Pinata.
   *
   * @param fileBuffer  - Raw file bytes
   * @param originalName - Original filename (for Pinata metadata)
   * @param mimeType    - MIME type of the file
   * @returns The IPFS CID (v1, base32 encoded)
   * @throws InternalServerErrorException on upload failure
   */
  async uploadFile(
    fileBuffer: Buffer,
    originalName: string,
    mimeType: string,
  ): Promise<string> {
    if (!this.apiKey) {
      this.logger.warn(
        'IPFS_API_KEY not configured — returning stub CID for development',
      );
      return `bafydev${Buffer.from(originalName).toString('hex').slice(0, 52)}`;
    }

    try {
      const form = new FormData();
      form.append('file', fileBuffer, {
        filename: originalName,
        contentType: mimeType,
      });

      // Optional metadata for Pinata dashboard
      const pinataMetadata = JSON.stringify({ name: originalName });
      form.append('pinataMetadata', pinataMetadata);

      const response = await axios.post<{ IpfsHash: string }>(
        this.pinataUrl,
        form,
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            ...form.getHeaders(),
          },
          maxBodyLength: Infinity,
          timeout: 60_000,
        },
      );

      const cid = response.data.IpfsHash;
      this.logger.log(`File pinned to IPFS: ${cid} (${originalName})`);
      return cid;
    } catch (error) {
      const detail = error.response?.data?.error?.details ?? error.message;
      this.logger.error(`Failed to pin file to IPFS`, detail);
      throw new InternalServerErrorException(
        `IPFS upload failed: ${detail}`,
      );
    }
  }

  /**
   * Returns the full public gateway URL for a given CID.
   *
   * @example getGatewayUrl('bafybeig...') → 'https://gateway.pinata.cloud/ipfs/bafybeig...'
   */
  getGatewayUrl(cid: string): string {
    return `${this.gateway}/${cid}`;
  }

  /**
   * Fetches a file from IPFS by CID and returns its buffer.
   *
   * @param cid - IPFS CID of the file
   * @returns File buffer
   * @throws InternalServerErrorException on fetch failure
   */
  async getFile(cid: string): Promise<Buffer> {
    if (!this.apiKey) {
      this.logger.warn(
        'IPFS_API_KEY not configured — returning empty buffer for development',
      );
      return Buffer.alloc(0);
    }

    try {
      const response = await axios.get(`${this.gateway}/${cid}`, {
        responseType: 'arraybuffer',
        timeout: 60_000,
      });

      this.logger.log(`File fetched from IPFS: ${cid}`);
      return Buffer.from(response.data);
    } catch (error) {
      const detail = error.response?.data?.error?.details ?? error.message;
      this.logger.error(`Failed to fetch file from IPFS`, detail);
      throw new InternalServerErrorException(
        `IPFS fetch failed: ${detail}`,
      );
    }
  }
}
