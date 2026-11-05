import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CrawlerUseCase, CrawledRawItem } from '../application/use-cases/crawler.use-case';
import {
  OpportunityModel,
  OpportunityDocument,
  OpportunityRevisionModel,
  OpportunityRevisionDocument,
} from '../infrastructure/persistence/opportunity.schema';
import { OpportunityType } from '../domain/opportunity.entity';

@Controller('api/v1/admin/opportunities')
export class AdminOpportunityController {
  private readonly logger = new Logger(AdminOpportunityController.name);

  constructor(
    private readonly crawlerUseCase: CrawlerUseCase,
    @InjectModel(OpportunityModel.name)
    private readonly opportunityModel: Model<OpportunityDocument>,
    @InjectModel(OpportunityRevisionModel.name)
    private readonly revisionModel: Model<OpportunityRevisionDocument>,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  private async dispatchNotificationEvent(endpoint: string, payload: any): Promise<void> {
    const notiUrl = process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:3005';
    try {
      await fetch(`${notiUrl}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch(() => {});
    } catch {
      // Failover safe in local/offline test environment
    }
  }

  /**
   * CRAWL-02: Kích hoạt crawl thủ công từ URL nguồn
   */
  @Post('crawl')
  async triggerManualCrawl(
    @Body()
    body: {
      sourceUrl: string;
      type: OpportunityType;
      trustLevel?: number;
      defaultTimezone?: string;
      isTrusted?: boolean;
    },
  ) {
    if (!body.sourceUrl || !body.type) {
      throw new BadRequestException('Vui lòng cung cấp sourceUrl và type (SCHOLARSHIP / COMPETITION)');
    }
    return await this.crawlerUseCase.runManualCrawl(body.sourceUrl, body.type, {
      trustLevel: body.trustLevel,
      defaultTimezone: body.defaultTimezone,
      isTrusted: body.isTrusted,
    });
  }

  /**
   * Ingest mảng các items thô (hỗ trợ nhập dữ liệu hàng loạt từ API bên ngoài / file)
   */
  @Post('ingest')
  async ingestItems(
    @Body()
    body: {
      items: CrawledRawItem[];
      type: OpportunityType;
      sourceConfig?: {
        sourceUrl?: string;
        trustLevel?: number;
        defaultTimezone?: string;
        isTrusted?: boolean;
      };
    },
  ) {
    if (!Array.isArray(body.items) || !body.type) {
      throw new BadRequestException('Dữ liệu không hợp lệ: Cần danh sách items và type');
    }
    return await this.crawlerUseCase.ingestItems(body.items, body.type, body.sourceConfig);
  }

  /**
   * CRAWL-05: Hàng chờ kiểm duyệt (Review Queue)
   * Lấy danh sách các cơ hội PENDING_REVIEW kèm cờ fuzzy match, confidence score
   */
  @Get('review-queue')
  async getReviewQueue(
    @Query('type') type?: OpportunityType,
    @Query('search') search?: string,
    @Query('page') pageStr?: string,
    @Query('limit') limitStr?: string,
    @Query('fuzzyOnly') fuzzyOnly?: string,
  ) {
    const page = Math.max(Number(pageStr) || 1, 1);
    const limit = Math.min(Math.max(Number(limitStr) || 20, 1), 100);
    const skip = (page - 1) * limit;

    const query: Record<string, any> = { status: 'PENDING_REVIEW' };
    if (type) query.type = type;
    if (search && search.trim()) {
      query.title = { $regex: search.trim(), $options: 'i' };
    }
    if (fuzzyOnly === 'true') {
      query.candidateMergeIds = { $exists: true, $not: { $size: 0 } };
    }

    const [items, total] = await Promise.all([
      this.opportunityModel
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      this.opportunityModel.countDocuments(query).exec(),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * CRAWL-05: So sánh dữ liệu cũ / mới (Diff) hoặc so sánh với bản ghi gốc rawPayload
   */
  @Get(':id/diff')
  async getOpportunityDiff(
    @Param('id') id: string,
    @Query('targetId') targetId?: string,
  ) {
    const opp = await this.opportunityModel.findOne({ id }).lean();
    if (!opp) throw new NotFoundException(`Không tìm thấy cơ hội ID: ${id}`);

    let targetOpp: any = null;
    if (targetId) {
      targetOpp = await this.opportunityModel.findOne({ id: targetId }).lean();
      if (!targetOpp) throw new NotFoundException(`Không tìm thấy cơ hội mục tiêu so sánh ID: ${targetId}`);
    }

    return {
      id: opp.id,
      title: opp.title,
      type: opp.type,
      currentParsed: {
        title: opp.title,
        description: opp.description,
        organizerName: opp.organizerName,
        sourceUrl: opp.sourceUrl,
        registerDeadline: opp.registerDeadline,
        timezone: opp.timezone,
        fundingLevel: opp.fundingLevel,
        minGpa: opp.minGpa,
        requiredIelts: opp.requiredIelts,
        competitionMode: opp.competitionMode,
        minTeamSize: opp.minTeamSize,
        maxTeamSize: opp.maxTeamSize,
        tags: opp.tags,
      },
      rawOriginalPayload: opp.rawPayload || null,
      confidenceScore: opp.confidenceScore,
      confidenceBreakdown: opp.confidenceBreakdown,
      candidateMergeIds: opp.candidateMergeIds || [],
      mergeTarget: targetOpp
        ? {
            id: targetOpp.id,
            title: targetOpp.title,
            description: targetOpp.description,
            organizerName: targetOpp.organizerName,
            registerDeadline: targetOpp.registerDeadline,
            timezone: targetOpp.timezone,
            fundingLevel: targetOpp.fundingLevel,
            competitionMode: targetOpp.competitionMode,
            minTeamSize: targetOpp.minTeamSize,
            maxTeamSize: targetOpp.maxTeamSize,
          }
        : null,
    };
  }

  /**
   * CRAWL-05: Sửa thông tin cơ hội trong hàng chờ trước khi duyệt
   */
  @Put(':id')
  async updateCandidate(
    @Param('id') id: string,
    @Body() updateData: Partial<OpportunityModel>,
  ) {
    const opp = await this.opportunityModel.findOne({ id });
    if (!opp) throw new NotFoundException(`Không tìm thấy cơ hội ID: ${id}`);

    // Cho phép sửa các trường schema
    if (updateData.title) opp.title = updateData.title;
    if (updateData.description) opp.description = updateData.description;
    if (updateData.organizerName) opp.organizerName = updateData.organizerName;
    if (updateData.sourceUrl) opp.sourceUrl = updateData.sourceUrl;
    if (updateData.registerDeadline) opp.registerDeadline = new Date(updateData.registerDeadline);
    if (updateData.submitDeadline) opp.submitDeadline = new Date(updateData.submitDeadline);
    if (updateData.timezone) opp.timezone = updateData.timezone;
    if (updateData.fundingLevel) opp.fundingLevel = updateData.fundingLevel;
    if (typeof updateData.minGpa === 'number') opp.minGpa = updateData.minGpa;
    if (typeof updateData.requiredIelts === 'number') opp.requiredIelts = updateData.requiredIelts;
    if (updateData.competitionMode) opp.competitionMode = updateData.competitionMode;
    if (typeof updateData.minTeamSize === 'number') opp.minTeamSize = updateData.minTeamSize;
    if (typeof updateData.maxTeamSize === 'number') opp.maxTeamSize = updateData.maxTeamSize;
    if (Array.isArray(updateData.tags)) opp.tags = updateData.tags;
    if (updateData.coverImageUrl) opp.coverImageUrl = updateData.coverImageUrl;

    await opp.save();
    return opp;
  }

  /**
   * CRAWL-05: Duyệt và Công bố (Approve & Publish)
   * Nghiệm thu:
   * - Không công bố khi chưa đủ schema bắt buộc
   * - Kiểm tra revision/version không ghi đè revision mới hơn
   * - Lưu OpportunityRevision với actor, lý do, trước/sau
   * - Phát sự kiện đồng bộ với Notification Service (NOTI-02)
   */
  @Post(':id/approve')
  async approveOpportunity(
    @Param('id') id: string,
    @Body()
    body?: {
      actorId?: string;
      reason?: string;
      expectedVersion?: number;
      updateFields?: Partial<OpportunityModel>;
    },
  ) {
    const opp = await this.opportunityModel.findOne({ id });
    if (!opp) throw new NotFoundException(`Không tìm thấy cơ hội ID: ${id}`);

    if (opp.status === 'PUBLISHED') {
      return opp; // Idempotent
    }

    // Áp dụng bản cập nhật bổ sung trước khi duyệt (nếu có)
    if (body?.updateFields) {
      Object.assign(opp, body.updateFields);
    }

    // 1. Kiểm tra Optimistic Concurrency ("không ghi đè revision mới hơn")
    if (body?.expectedVersion !== undefined && opp.version !== body.expectedVersion) {
      throw new ConflictException(
        `Xung đột phiên bản: Dữ liệu hiện tại là v${opp.version}, phiên bản gửi lên là v${body.expectedVersion}`,
      );
    }

    // 2. Kiểm tra Schema Bắt Buộc ("không công bố khi chưa đủ schema")
    const missing: string[] = [];
    if (!opp.title?.trim()) missing.push('title');
    if (!opp.description?.trim()) missing.push('description');
    if (!opp.organizerName?.trim()) missing.push('organizerName');
    if (!opp.registerDeadline || isNaN(new Date(opp.registerDeadline).getTime())) missing.push('registerDeadline');
    if (!opp.timezone?.trim()) missing.push('timezone');
    if (opp.applyMode === 'EXTERNAL' && !opp.sourceUrl?.trim()) missing.push('sourceUrl');

    if (opp.type === 'SCHOLARSHIP') {
      if (!opp.fundingLevel || !['FULL', 'PARTIAL', 'OTHER', 'FREE_ENTRY'].includes(opp.fundingLevel)) {
        missing.push('fundingLevel');
      }
    } else if (opp.type === 'COMPETITION') {
      if (!opp.competitionMode || !['INDIVIDUAL', 'TEAM'].includes(opp.competitionMode)) {
        missing.push('competitionMode');
      }
      if (opp.minTeamSize === undefined || opp.minTeamSize === null || opp.minTeamSize < 1) {
        missing.push('minTeamSize');
      }
      if (opp.maxTeamSize === undefined || opp.maxTeamSize === null || opp.maxTeamSize < 1) {
        missing.push('maxTeamSize');
      }
      if (opp.minTeamSize && opp.maxTeamSize && opp.minTeamSize > opp.maxTeamSize) {
        missing.push('minTeamSize <= maxTeamSize');
      }
    }

    if (missing.length > 0) {
      throw new BadRequestException(
        `Không thể công bố cơ hội khi chưa đủ schema bắt buộc: ${missing.join(', ')}`,
      );
    }

    // 3. Tạo OpportunityRevision ghi nhận audit trước/sau, actor, lý do
    const actorId = body?.actorId || 'usr_admin_system';
    const reason = body?.reason || 'Admin duyệt công bố cơ hội từ hàng chờ kiểm duyệt';
    const snapshotBefore = opp.toObject();

    opp.status = 'PUBLISHED';
    opp.reviewedBy = actorId;
    opp.reviewedAt = new Date();
    opp.reviewReason = reason;
    opp.version = (opp.version || 1) + 1;

    await opp.save();

    const revision = new this.revisionModel({
      id: `rev_${opp.id}_v${opp.version}_${Date.now()}`,
      opportunityId: opp.id,
      version: opp.version,
      snapshot: {
        before: snapshotBefore,
        after: opp.toObject(),
      },
      status: 'APPROVED',
      reviewedBy: actorId,
      reason,
    });
    await revision.save();

    // 4. Phát sự kiện tích hợp Notification
    const eventPayload = {
      opportunityId: opp.id,
      title: opp.title,
      type: opp.type,
      deadline: opp.registerDeadline,
      version: opp.version,
      timezone: opp.timezone,
    };
    this.eventEmitter.emit('opportunity.published', eventPayload);
    await this.dispatchNotificationEvent('/api/v1/notifications/events/opportunity-published', eventPayload);

    return opp;
  }

  /**
   * CRAWL-05: Từ chối cơ hội (Reject) kèm lý do và actor
   */
  @Post(':id/reject')
  async rejectOpportunity(
    @Param('id') id: string,
    @Body() body: { actorId?: string; reason: string },
  ) {
    if (!body?.reason?.trim()) {
      throw new BadRequestException('Vui lòng cung cấp lý do từ chối cơ hội');
    }

    const opp = await this.opportunityModel.findOne({ id });
    if (!opp) throw new NotFoundException(`Không tìm thấy cơ hội ID: ${id}`);

    const actorId = body.actorId || 'usr_admin_system';
    const snapshotBefore = opp.toObject();

    opp.status = 'REJECTED';
    opp.reviewedBy = actorId;
    opp.reviewedAt = new Date();
    opp.reviewReason = body.reason;
    opp.version = (opp.version || 1) + 1;

    await opp.save();

    const revision = new this.revisionModel({
      id: `rev_${opp.id}_v${opp.version}_${Date.now()}`,
      opportunityId: opp.id,
      version: opp.version,
      snapshot: {
        before: snapshotBefore,
        after: opp.toObject(),
      },
      status: 'REJECTED',
      reviewedBy: actorId,
      reason: body.reason,
    });
    await revision.save();

    return {
      success: true,
      id: opp.id,
      status: opp.status,
      reason: body.reason,
    };
  }

  /**
   * CRAWL-05: Gộp bài trùng lặp (Merge) vào cơ hội đích
   */
  @Post(':id/merge')
  async mergeOpportunity(
    @Param('id') id: string,
    @Body() body: { targetOpportunityId: string; actorId?: string; reason: string },
  ) {
    if (!body?.targetOpportunityId) {
      throw new BadRequestException('Vui lòng cung cấp targetOpportunityId cần gộp vào');
    }

    const [sourceOpp, targetOpp] = await Promise.all([
      this.opportunityModel.findOne({ id }),
      this.opportunityModel.findOne({ id: body.targetOpportunityId }),
    ]);

    if (!sourceOpp) throw new NotFoundException(`Không tìm thấy cơ hội nguồn ID: ${id}`);
    if (!targetOpp) throw new NotFoundException(`Không tìm thấy cơ hội đích ID: ${body.targetOpportunityId}`);

    const actorId = body.actorId || 'usr_admin_system';
    const reason = body.reason || `Gộp vào cơ hội chuẩn ${targetOpp.id} theo BR14`;

    // 1. Gộp bổ sung tags từ nguồn vào đích (nếu chưa có)
    const existingTags = new Set(targetOpp.tags || []);
    for (const tag of sourceOpp.tags || []) {
      existingTags.add(tag);
    }
    targetOpp.tags = Array.from(existingTags);
    targetOpp.version = (targetOpp.version || 1) + 1;
    await targetOpp.save();

    // 2. Đánh dấu bản ghi nguồn là đã gộp (REJECTED kèm ghi chú gộp)
    sourceOpp.status = 'REJECTED';
    sourceOpp.reviewedBy = actorId;
    sourceOpp.reviewedAt = new Date();
    sourceOpp.reviewReason = reason;
    sourceOpp.version = (sourceOpp.version || 1) + 1;
    await sourceOpp.save();

    // 3. Ghi audit revision cho cả hai
    await Promise.all([
      new this.revisionModel({
        id: `rev_merge_tgt_${targetOpp.id}_${Date.now()}`,
        opportunityId: targetOpp.id,
        version: targetOpp.version,
        snapshot: targetOpp.toObject(),
        status: 'APPROVED',
        reviewedBy: actorId,
        reason: `Gộp nội dung từ cơ hội ${sourceOpp.id}`,
      }).save(),
      new this.revisionModel({
        id: `rev_merge_src_${sourceOpp.id}_${Date.now()}`,
        opportunityId: sourceOpp.id,
        version: sourceOpp.version,
        snapshot: sourceOpp.toObject(),
        status: 'REJECTED',
        reviewedBy: actorId,
        reason,
      }).save(),
    ]);

    return {
      success: true,
      mergedSourceId: sourceOpp.id,
      targetOpportunityId: targetOpp.id,
    };
  }

  /**
   * Gia hạn hạn chót cơ hội (FR-OPP-08 & NOTI-02: gia hạn tính lại nhắc nhở)
   */
  @Post(':id/extend')
  async extendDeadline(
    @Param('id') id: string,
    @Body() body: { newDeadline: string | Date; timezone?: string; reason?: string; actorId?: string },
  ) {
    const opp = await this.opportunityModel.findOne({ id });
    if (!opp) throw new NotFoundException(`Không tìm thấy cơ hội ID: ${id}`);

    const newDate = new Date(body.newDeadline);
    if (isNaN(newDate.getTime()) || newDate.getTime() <= opp.registerDeadline.getTime()) {
      throw new BadRequestException('Hạn đăng ký mới phải hợp lệ và sau hạn đăng ký hiện tại');
    }

    const actorId = body.actorId || 'usr_admin_system';
    const reason = body.reason || 'Admin gia hạn cơ hội';
    const oldDeadline = opp.registerDeadline;

    opp.registerDeadline = newDate;
    if (body.timezone) opp.timezone = body.timezone;
    opp.version = (opp.version || 1) + 1;
    opp.ruleVersion = (opp.ruleVersion || 1) + 1;
    opp.reviewedBy = actorId;
    opp.reviewedAt = new Date();
    opp.reviewReason = reason;
    await opp.save();

    // Ghi audit revision
    await new this.revisionModel({
      id: `rev_ext_${opp.id}_v${opp.version}_${Date.now()}`,
      opportunityId: opp.id,
      version: opp.version,
      snapshot: opp.toObject(),
      status: 'EXTENDED',
      reviewedBy: actorId,
      reason: `${reason} (Từ ${oldDeadline.toISOString()} sang ${newDate.toISOString()})`,
    }).save();

    // Phát sự kiện để Notification Service tính lại toàn bộ nhắc nhở (NOTI-02)
    const eventPayload = {
      opportunityId: opp.id,
      oldDeadline,
      newDeadline: newDate,
      version: opp.version,
      timezone: opp.timezone,
    };
    this.eventEmitter.emit('opportunity.updated', eventPayload);
    await this.dispatchNotificationEvent('/api/v1/notifications/events/opportunity-updated', eventPayload);

    return opp;
  }
}
