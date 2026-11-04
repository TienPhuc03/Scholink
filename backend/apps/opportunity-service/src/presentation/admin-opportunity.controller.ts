import {
  Controller,
  Post,
  Put,
  Body,
  Param,
  NotFoundException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { CrawlerUseCase } from "../application/use-cases/crawler.use-case";
import {
  OpportunityModel,
  OpportunityDocument,
} from "../infrastructure/persistence/opportunity.schema";
import { OpportunityType } from "../domain/opportunity.entity";

@Controller("api/v1/admin/opportunities")
export class AdminOpportunityController {
  constructor(
    private readonly crawlerUseCase: CrawlerUseCase,
    @InjectModel(OpportunityModel.name)
    private readonly opportunityModel: Model<OpportunityDocument>,
  ) {}

  @Post("crawl")
  async triggerManualCrawl(
    @Body() body: { sourceUrl: string; type: OpportunityType },
  ) {
    return await this.crawlerUseCase.runManualCrawl(body.sourceUrl, body.type);
  }

  @Put(":id/approve")
  async approveOpportunity(
    @Param("id") id: string,
    @Body() updateData: Partial<OpportunityModel>,
  ) {
    const opp = await this.opportunityModel.findOne({ id });
    if (!opp) throw new NotFoundException(`Không tìm thấy cơ hội ID: ${id}`);

    Object.assign(opp, updateData);
    opp.status = "PUBLISHED";

    await opp.save();
    return opp;
  }
}
