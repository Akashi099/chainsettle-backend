import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotificationType } from '@prisma/client';
import { NotificationsGateway } from './notifications.gateway';
import { WebhooksService } from '../webhooks/webhooks.service';
import { UpdatePreferencesDto } from './dto/update-preferences.dto';

type PreferenceMap = Record<NotificationType, { inApp: boolean; email: boolean }>;

function buildDefaultPreferences(): PreferenceMap {
  return Object.values(NotificationType).reduce((acc, type) => {
    acc[type] = { inApp: true, email: true };
    return acc;
  }, {} as PreferenceMap);
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private transporter: nodemailer.Transporter;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Optional() private readonly gateway: NotificationsGateway,
    @Optional() private readonly webhooks: WebhooksService,
  ) {
    this.transporter = nodemailer.createTransport({
      host: this.config.get('SMTP_HOST'),
      port: this.config.get<number>('SMTP_PORT', 587),
      secure: false,
      auth: {
        user: this.config.get('SMTP_USER'),
        pass: this.config.get('SMTP_PASS'),
      },
    });
  }

  /**
   * Creates an in-app notification for a user (by their Stellar address)
   * and optionally sends an email if they have one registered.
   * Both channels are gated on the user's NotificationPreference record.
   */
  async notifyUser(
    stellarAddress: string,
    type: NotificationType,
    title: string,
    message: string,
    data?: Record<string, any>,
  ) {
    try {
      const user = await this.prisma.user.findUnique({
        where: { stellarAddress },
      });

      if (!user) {
        this.logger.warn(`No user found for address ${stellarAddress} — skipping notification`);
        return;
      }

      const prefs = await this.getOrCreatePreferences(user.id);
      const { inApp, email: emailEnabled } = prefs[type];

      if (!inApp) return;

      const notification = await this.prisma.notification.create({
        data: { userId: user.id, type, title, message, data: data ?? {} },
      });

      if (emailEnabled && user.email) {
        await this.sendEmail(user.email, title, message);
        await this.prisma.notification.update({
          where: { id: notification.id },
          data: { emailSent: true },
        });
      }

      this.gateway?.pushToUser(user.id, notification);

      this.webhooks
        ?.dispatch(type, { notificationId: notification.id, ...(data ?? {}) })
        .catch((err) => this.logger.error('Webhook dispatch error', err.message));

      return notification;
    } catch (error) {
      this.logger.error(`Failed to notify ${stellarAddress}`, error.message);
    }
  }

  async getOrCreatePreferences(userId: string): Promise<PreferenceMap> {
    const record = await this.prisma.notificationPreference.upsert({
      where: { userId },
      create: { userId, preferences: buildDefaultPreferences() },
      update: {},
    });
    return record.preferences as PreferenceMap;
  }

  async updatePreferences(userId: string, dto: UpdatePreferencesDto): Promise<PreferenceMap> {
    const current = await this.getOrCreatePreferences(userId);
    const merged = { ...current, ...dto.preferences };
    const record = await this.prisma.notificationPreference.update({
      where: { userId },
      data: { preferences: merged },
    });
    return record.preferences as PreferenceMap;
  }

  async findForUser(userId: string, unreadOnly = false, page = 1, limit = 20) {
    const where: any = { userId };
    if (unreadOnly) where.read = false;

    const [notifications, total] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.notification.count({ where }),
    ]);

    return { data: notifications, meta: { total, page, limit } };
  }

  async markRead(notificationId: string, userId: string) {
    return this.prisma.notification.updateMany({
      where: { id: notificationId, userId },
      data: { read: true },
    });
  }

  async markAllRead(userId: string) {
    return this.prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    });
  }

  async sendEmail(to: string, subject: string, text: string) {
    try {
      await this.transporter.sendMail({
        from: this.config.get('EMAIL_FROM', 'noreply@chainsetttle.com'),
        to,
        subject: `ChainSettle — ${subject}`,
        text,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #1a1a2e;">ChainSettle</h2>
            <p>${text}</p>
            <hr />
            <small style="color: #888;">You're receiving this because you're a participant on ChainSettle.</small>
          </div>
        `,
      });
      this.logger.log(`Email sent to ${to}: ${subject}`);
    } catch (error) {
      this.logger.error(`Email failed to ${to}`, error.message);
    }
  }
}
