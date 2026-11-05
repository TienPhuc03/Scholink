import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import Parser = require('rss-parser');
import { OpportunityType, ApplyMode, FundingLevel } from '../../domain/opportunity.entity';
import {
  OpportunityDocument,
  OpportunityModel,
} from '../../infrastructure/persistence/opportunity.schema';

export interface ConfidenceBreakdown {
  f: number; // Fields completeness (weight 0.35)
  p: number; // Source reliability (weight 0.25)
  d: number; // Date/Timezone clarity (weight 0.25)
  k: number; // Schema/Constraint consistency (weight 0.15)
  score: number; // Total C
}

export interface CrawledRawItem {
  title?: string;
  link?: string;
  sourceUrl?: string;
  creator?: string;
  author?: string;
  organizerName?: string;
  content?: string;
  contentSnippet?: string;
  description?: string;
  isoDate?: string;
  pubDate?: string;
  deadline?: string | Date;
  registerDeadline?: string | Date;
  submitDeadline?: string | Date;
  timezone?: string;
  fundingLevel?: string;
  minGpa?: number;
  requiredIelts?: number;
  competitionMode?: string;
  minTeamSize?: number;
  maxTeamSize?: number;
  benefits?: string;
  requirements?: string;
  tags?: string[];
  coverImageUrl?: string;
  [key: string]: any;
}

export function normalizeText(text: string): string {
  if (!text) return '';
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function calculateSimilarity(str1: string, str2: string): number {
  const norm1 = normalizeText(str1);
  const norm2 = normalizeText(str2);
  if (!norm1 || !norm2) return 0;
  if (norm1 === norm2) return 1.0;

  const words1 = new Set(norm1.split(' '));
  const words2 = new Set(norm2.split(' '));
  const intersection = new Set([...words1].filter((x) => words2.has(x)));
  const union = new Set([...words1, ...words2]);
  if (union.size === 0) return 0;
  return intersection.size / union.size;
}

@Injectable()
export class CrawlerUseCase {
  private readonly logger = new Logger(CrawlerUseCase.name);
  private rssParser = new Parser();

  constructor(
    @InjectModel(OpportunityModel.name)
    private readonly opportunityModel: Model<OpportunityDocument>,
  ) {}

  /**
   * BR14: Tạo dedupKey duy nhất dựa trên loại, tên chuẩn hóa, đơn vị và kỳ/năm
   * Định dạng: `${type.toLowerCase()}:${normalizedTitle}:${normalizedOrganizer}:${year}`
   */
  public generateDedupKey(
    type: string,
    title: string,
    organizer: string,
    deadline?: Date | string | null,
  ): string {
    const normTitle = normalizeText(title).replace(/\s+/g, '_').substring(0, 50);
    const normOrg = normalizeText(organizer).replace(/\s+/g, '_').substring(0, 30);
    let year = new Date().getFullYear().toString();
    if (deadline) {
      const parsedDate = new Date(deadline);
      if (!isNaN(parsedDate.getTime())) {
        year = parsedDate.getFullYear().toString();
      }
    }
    return `${type.toLowerCase()}:${normTitle}:${normOrg}:${year}`;
  }

  /**
   * Mục 12B: Tính toán Confidence Score và Breakdown (F, P, D, K)
   * C = 0.35*F + 0.25*P + 0.25*D + 0.15*K
   */
  public calculateConfidence(
    item: {
      type?: string;
      title?: string;
      organizerName?: string;
      registerDeadline?: Date | null;
      timezone?: string;
      sourceUrl?: string;
      fundingLevel?: string;
      competitionMode?: string;
      minTeamSize?: number;
      maxTeamSize?: number;
    },
    trustLevel = 0.6, // P: 1.0 = official verified, 0.6 = vetted intermediary, 0.2 = aggregator
    isExplicitTime = false,
  ): ConfidenceBreakdown {
    // 1. F (Trọng số 0.35): Tỷ lệ các trường cơ bản hợp lệ trong [type, title, organizer, registerDeadline, timezone, sourceUrl] / 6
    let validFieldsCount = 0;
    if (item.type && (item.type === 'SCHOLARSHIP' || item.type === 'COMPETITION')) validFieldsCount++;
    if (item.title && item.title.trim().length > 3) validFieldsCount++;
    if (item.organizerName && item.organizerName.trim().length > 1) validFieldsCount++;
    if (item.registerDeadline && !isNaN(item.registerDeadline.getTime())) validFieldsCount++;
    if (item.timezone && item.timezone.trim().length > 0) validFieldsCount++;
    if (item.sourceUrl && (item.sourceUrl.startsWith('http://') || item.sourceUrl.startsWith('https://'))) validFieldsCount++;
    const f = Number((validFieldsCount / 6).toFixed(4));

    // 2. P (Trọng số 0.25): Độ tin cậy nguồn
    const p = Number(Math.min(Math.max(trustLevel, 0), 1.0).toFixed(4));

    // 3. D (Trọng số 0.25): Độ rõ ràng của ngày và múi giờ
    let d = 0.0;
    if (!item.registerDeadline || isNaN(item.registerDeadline.getTime())) {
      d = 0.0;
    } else if (isExplicitTime && item.timezone) {
      d = 1.0;
    } else if (item.timezone) {
      d = 0.7; // Chỉ ngày, dùng timezone nguồn đã chốt (BR10)
    } else {
      d = 0.3; // Ngày mơ hồ
    }

    // 4. K (Trọng số 0.15): Kiểm tra logic và schema riêng từng loại
    let kChecksTotal = 0;
    let kChecksPassed = 0;

    // Check 4a: Deadline logic (phải trong tương lai)
    kChecksTotal++;
    if (item.registerDeadline && item.registerDeadline.getTime() > Date.now()) {
      kChecksPassed++;
    }

    // Check 4b: Schema riêng từng loại
    if (item.type === 'SCHOLARSHIP') {
      kChecksTotal++;
      if (item.fundingLevel && ['FULL', 'PARTIAL', 'OTHER', 'FREE_ENTRY'].includes(item.fundingLevel)) {
        kChecksPassed++;
      }
    } else if (item.type === 'COMPETITION') {
      kChecksTotal++;
      if (
        item.competitionMode &&
        ['INDIVIDUAL', 'TEAM'].includes(item.competitionMode) &&
        (item.competitionMode === 'INDIVIDUAL' || (item.minTeamSize && item.maxTeamSize && item.maxTeamSize >= item.minTeamSize))
      ) {
        kChecksPassed++;
      }
    }

    const k = Number((kChecksPassed / Math.max(kChecksTotal, 1)).toFixed(4));

    // Tổng điểm C
    const score = Number((0.35 * f + 0.25 * p + 0.25 * d + 0.15 * k).toFixed(4));

    return { f, p, d, k, score };
  }

  /**
   * CRAWL-03: Trích xuất và chuẩn hóa schema theo từng loại
   * Giữ nguyên dữ liệu gốc trong rawPayload, chuẩn hóa timezone IANA và không đoán mò nếu không chắc chắn.
   */
  public parseOpportunity(
    raw: CrawledRawItem,
    type: OpportunityType,
    sourceConfig?: {
      sourceUrl?: string;
      trustLevel?: number;
      defaultTimezone?: string;
      isTrusted?: boolean;
    },
  ): Partial<OpportunityModel> & { dedupKey: string; confidenceBreakdown: ConfidenceBreakdown } {
    const title = (raw.title || '').trim();
    const sourceUrl = (raw.sourceUrl || raw.link || sourceConfig?.sourceUrl || '').trim();
    const organizerName = (raw.organizerName || raw.creator || raw.author || 'Nguồn Crawl Bên Ngoài').trim();
    const description = (raw.description || raw.contentSnippet || raw.content || '').trim() || 'Chưa có mô tả chi tiết từ nguồn.';

    // Phân tích deadline và timezone (BR10)
    const rawDeadline = raw.registerDeadline || raw.deadline || raw.isoDate || raw.pubDate;
    let registerDeadline: Date | null = null;
    let isExplicitTime = false;

    if (rawDeadline) {
      const parsed = new Date(rawDeadline);
      if (!isNaN(parsed.getTime())) {
        registerDeadline = parsed;
        // Kiểm tra xem chuỗi có định dạng giờ phút cụ thể hay không (e.g. "T15:30" or " 18:00")
        if (typeof rawDeadline === 'string' && (rawDeadline.includes('T') || rawDeadline.includes(':'))) {
          isExplicitTime = true;
        } else {
          // Ngày không có giờ được hiểu là 23:59:59 tại múi giờ nguồn (BR10)
          registerDeadline.setHours(23, 59, 59, 999);
        }
      }
    }

    const timezone = (raw.timezone || sourceConfig?.defaultTimezone || 'Asia/Ho_Chi_Minh').trim();

    // Chuẩn hóa schema riêng từng loại (trường không chắc để trống - CRAWL-03)
    let fundingLevel: FundingLevel | undefined = undefined;
    let minGpa = typeof raw.minGpa === 'number' ? raw.minGpa : 0.0;
    let requiredIelts = typeof raw.requiredIelts === 'number' ? raw.requiredIelts : 0.0;

    let competitionMode: 'INDIVIDUAL' | 'TEAM' | undefined = undefined;
    let minTeamSize: number | undefined = undefined;
    let maxTeamSize: number | undefined = undefined;

    const lowerText = `${title} ${description}`.toLowerCase();

    if (type === 'SCHOLARSHIP') {
      if (raw.fundingLevel && ['FULL', 'PARTIAL', 'OTHER', 'FREE_ENTRY'].includes(raw.fundingLevel)) {
        fundingLevel = raw.fundingLevel as FundingLevel;
      } else {
        const hasFull = lowerText.includes('toàn phần') || lowerText.includes('full scholarship') || lowerText.includes('fully funded');
        const hasPartial = lowerText.includes('bán phần') || lowerText.includes('partial');
        if (hasFull && !hasPartial) {
          fundingLevel = 'FULL';
        } else if (hasPartial && !hasFull) {
          fundingLevel = 'PARTIAL';
        }
      }
    } else if (type === 'COMPETITION') {
      if (raw.competitionMode && ['INDIVIDUAL', 'TEAM'].includes(raw.competitionMode)) {
        competitionMode = raw.competitionMode as 'INDIVIDUAL' | 'TEAM';
      } else if (lowerText.includes('đội thi') || lowerText.includes('nhóm') || lowerText.includes('team')) {
        competitionMode = 'TEAM';
      } else if (lowerText.includes('cá nhân') || lowerText.includes('individual')) {
        competitionMode = 'INDIVIDUAL';
      }

      if (typeof raw.minTeamSize === 'number') minTeamSize = raw.minTeamSize;
      if (typeof raw.maxTeamSize === 'number') maxTeamSize = raw.maxTeamSize;

      if (!minTeamSize && competitionMode === 'TEAM') minTeamSize = 2;
      if (!maxTeamSize && competitionMode === 'TEAM') maxTeamSize = 4;
      if (competitionMode === 'INDIVIDUAL') {
        minTeamSize = 1;
        maxTeamSize = 1;
      }
    }

    // DedupKey theo BR14
    const dedupKey = this.generateDedupKey(type, title, organizerName, registerDeadline);

    // Tính điểm tin cậy Section 12B
    const trustLevel = sourceConfig?.trustLevel ?? (sourceConfig?.isTrusted ? 1.0 : 0.6);
    const confidence = this.calculateConfidence(
      {
        type,
        title,
        organizerName,
        registerDeadline,
        timezone,
        sourceUrl,
        fundingLevel,
        competitionMode,
        minTeamSize,
        maxTeamSize,
      },
      trustLevel,
      isExplicitTime,
    );

    // RÀNG BUỘC NGHIỆP VỤ: Không auto-publish trusted!
    // Mọi cơ hội crawler đưa vào đều ở trạng thái PENDING_REVIEW để Admin duyệt (BR13 / CRAWL-05)
    return {
      title,
      slug: this.generateSlug(title),
      type,
      applyMode: 'EXTERNAL' as ApplyMode, // BR09: Bài crawl mặc định EXTERNAL
      sourceUrl,
      organizerName,
      description,
      benefits: raw.benefits || undefined,
      requirements: raw.requirements || undefined,
      registerDeadline: registerDeadline || new Date(Date.now() + 30 * 86400000), // Fallback mốc tạm nếu thiếu
      submitDeadline: raw.submitDeadline ? new Date(raw.submitDeadline) : undefined,
      timezone,
      fundingLevel,
      minGpa,
      requiredIelts,
      competitionMode,
      minTeamSize,
      maxTeamSize,
      coverImageUrl: raw.coverImageUrl || undefined,
      tags: Array.isArray(raw.tags) ? raw.tags : [],
      status: 'PENDING_REVIEW', // LUÔN LÀ PENDING_REVIEW (Không auto-publish)
      rawPayload: raw, // Lưu nguyên bản gốc để đối chiếu và diff (CRAWL-03, CRAWL-05)
      confidenceScore: confidence.score,
      confidenceBreakdown: {
        f: confidence.f,
        p: confidence.p,
        d: confidence.d,
        k: confidence.k,
        score: confidence.score,
      },
      dedupKey,
    };
  }

  /**
   * CRAWL-04: Tìm kiếm bài trùng lặp mờ (Fuzzy Match) theo BR14
   * Trả về danh sách opportunity IDs có độ tương đồng cao cần Admin xác nhận gộp
   */
  public async findFuzzyMatches(
    title: string,
    organizerName: string,
    type: OpportunityType,
    excludeId?: string,
  ): Promise<string[]> {
    const candidates = await this.opportunityModel
      .find({
        type,
        status: { $in: ['PUBLISHED', 'PENDING_REVIEW'] },
        ...(excludeId ? { id: { $ne: excludeId } } : {}),
      })
      .select('id title organizerName')
      .lean()
      .exec();

    const matches: string[] = [];
    for (const cand of candidates) {
      const titleSim = calculateSimilarity(title, cand.title);
      const orgSim = calculateSimilarity(organizerName, cand.organizerName);

      // Nếu tiêu đề tương đồng >= 75% hoặc cùng đơn vị và tiêu đề tương đồng >= 55%
      if (titleSim >= 0.75 || (orgSim >= 0.6 && titleSim >= 0.55)) {
        matches.push(cand.id);
      }
    }
    return matches;
  }

  /**
   * Ingest mảng các items đã parse hoặc crawl được vào hệ thống (hỗ trợ cả JSON payload và RSS)
   */
  public async ingestItems(
    items: CrawledRawItem[],
    type: OpportunityType,
    sourceConfig?: {
      sourceUrl?: string;
      trustLevel?: number;
      defaultTimezone?: string;
      isTrusted?: boolean;
    },
  ) {
    let added = 0;
    let skippedDuplicates = 0;
    let fuzzyFlagged = 0;
    const ingestedIds: string[] = [];

    for (const rawItem of items) {
      const parsed = this.parseOpportunity(rawItem, type, sourceConfig);

      // 1. Kiểm tra trùng lặp chính xác theo dedupKey hoặc sourceUrl (BR14)
      const existing = await this.opportunityModel.findOne({
        $or: [
          { dedupKey: parsed.dedupKey },
          ...(parsed.sourceUrl ? [{ sourceUrl: parsed.sourceUrl }] : []),
        ],
      });

      if (existing) {
        skippedDuplicates++;
        continue;
      }

      // 2. Kiểm tra trùng lặp mờ (Fuzzy Match - CRAWL-04)
      const fuzzyIds = await this.findFuzzyMatches(parsed.title || '', parsed.organizerName || '', type);
      if (fuzzyIds.length > 0) {
        fuzzyFlagged++;
      }

      const id = `opp_crawl_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
      const doc = new this.opportunityModel({
        ...parsed,
        id,
        candidateMergeIds: fuzzyIds,
        reviewReason: fuzzyIds.length > 0 ? `Phát hiện ${fuzzyIds.length} cơ hội tương đồng mờ (BR14)` : undefined,
      });

      await doc.save();
      added++;
      ingestedIds.push(id);
    }

    return {
      success: true,
      total: items.length,
      added,
      skippedDuplicates,
      fuzzyFlagged,
      ingestedIds,
    };
  }

  /**
   * Chạy crawl thủ công từ RSS URL (CRAWL-02)
   */
  async runManualCrawl(
    sourceUrl: string,
    type: OpportunityType,
    sourceConfig?: { trustLevel?: number; defaultTimezone?: string; isTrusted?: boolean },
  ) {
    this.logger.log(`Bắt đầu crawl từ nguồn: ${sourceUrl} (Type: ${type})`);
    try {
      const feed = await this.rssParser.parseURL(sourceUrl);
      const items: CrawledRawItem[] = feed.items.map((it) => ({
        ...it,
        sourceUrl: it.link,
      }));

      return await this.ingestItems(items, type, {
        sourceUrl,
        ...sourceConfig,
      });
    } catch (err: any) {
      this.logger.error(`Lỗi khi crawl RSS từ ${sourceUrl}: ${err.message}`);
      throw err;
    }
  }

  private generateSlug(title: string): string {
    return (
      title
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') +
      '-' +
      Date.now().toString().slice(-6)
    );
  }
}
