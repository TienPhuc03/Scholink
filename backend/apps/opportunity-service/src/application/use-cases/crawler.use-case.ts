import { Injectable, Logger } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import Parser = require("rss-parser");
import { OpportunityType, ApplyMode } from "../../domain/opportunity.entity";
import {
  OpportunityDocument,
  OpportunityModel,
} from "../../infrastructure/persistence/opportunity.schema";

@Injectable()
export class CrawlerUseCase {
  private readonly logger = new Logger(CrawlerUseCase.name);
  private rssParser = new Parser();

  constructor(
    @InjectModel(OpportunityModel.name)
    private readonly opportunityModel: Model<OpportunityDocument>,
  ) {}

  async runManualCrawl(sourceUrl: string, type: OpportunityType) {
    this.logger.log(`Bắt đầu crawl từ nguồn: ${sourceUrl}`);
    const feed = await this.rssParser.parseURL(sourceUrl);

    let added = 0;
    let skipped = 0;

    for (const item of feed.items) {
      const isDuplicate = await this.opportunityModel.findOne({
        $or: [{ sourceUrl: item.link }, { title: item.title, type: type }],
      });

      if (isDuplicate) {
        skipped++;
        continue;
      }

      const registerDeadline = item.isoDate ? new Date(item.isoDate) : null;

      if (!registerDeadline) {
        skipped++;
        continue;
      }

      const opp = new this.opportunityModel({
        id: `opp_crawl_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        title: item.title,
        slug: this.generateSlug(item.title),
        type: type,
        applyMode: "EXTERNAL" as ApplyMode,
        sourceUrl: item.link,
        organizerName: item.creator || "EXTERNAL_SOURCE",
        description: item.contentSnippet || item.content || "N/A",
        registerDeadline: registerDeadline,
        timezone: "UTC",
        status: "PENDING_REVIEW",
      });

      await opp.save();
      added++;
    }

    return { success: true, added, skipped };
  }

  private generateSlug(title: string): string {
    return (
      title.toLowerCase().replace(/[^a-z0-9A-Z]+/g, "-") + "-" + Date.now()
    );
  }
}
