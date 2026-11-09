import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
  UseFilters,
} from "@nestjs/common";
import { GrpcMethod } from "@nestjs/microservices";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from "@nestjs/swagger";
import { OpportunityUseCase } from "../application/use-cases/opportunity.use-case";
import {
  CreateOpportunityDto,
  CreateOpportunityDtoSchema,
  QueryOpportunityDto,
  QueryOpportunityDtoSchema,
} from "../application/dtos/opportunity.dto";
import {
  ZodValidationPipe,
  Public,
  JwtAuthGuard,
  RolesGuard,
  Roles,
  AuthenticatedUser,
  CorrelationIdInterceptor,
  GrpcExceptionFilter,
} from "@shared";
import { BookmarkUseCase } from "../application/use-cases/bookmark.use-case";

@ApiTags("Opportunity Catalog (Opportunity Microservice)")
@UseInterceptors(CorrelationIdInterceptor)
@UseFilters(GrpcExceptionFilter)
@Controller("api/v1/opportunities")
export class OpportunityController {
  constructor(
    private readonly opportunityUseCase: OpportunityUseCase,
    private readonly bookmarkUseCase: BookmarkUseCase,
  ) {}

  // ================= gRPC Handlers =================
  @GrpcMethod("OpportunityGrpcService", "ListOpportunities")
  async listGrpc(query: QueryOpportunityDto) {
    // proto3 sends "" / 0 / false for unset fields: normalise to "not set".
    const res = await this.opportunityUseCase.list({
      ...query,
      type: (query.type as string) ? query.type : undefined,
      keyword: query.keyword || undefined,
      applyMode: (query.applyMode as string) ? query.applyMode : undefined,
      fundingLevel: (query.fundingLevel as string) ? query.fundingLevel : undefined,
      cursor: query.cursor || undefined,
      limit: query.limit || 10,
      includeClosed: Boolean(query.includeClosed),
    } as QueryOpportunityDto);
    return { ...res, items: res.items.map((i) => OpportunityUseCase.toGrpcMessage(i)) };
  }

  @GrpcMethod("OpportunityGrpcService", "GetOpportunityById")
  async getByIdGrpc(data: { id: string }) {
    return OpportunityUseCase.toGrpcMessage(
      (await this.opportunityUseCase.getById(data.id)) as Record<string, any>,
    );
  }

  @GrpcMethod("OpportunityGrpcService", "CreateOpportunity")
  async createGrpc(
    data: CreateOpportunityDto & { actorId: string; organizationId?: string },
  ) {
    const { actorId, organizationId, ...dto } = data;
    return this.opportunityUseCase.create(dto, actorId, organizationId);
  }

  // ================= HTTP Handlers =================
  @Public()
  @Get()
  @ApiOperation({
    summary:
      "Tìm kiếm danh sách học bổng và cuộc thi (cursor-based pagination)",
  })
  @ApiResponse({ status: 200, description: "Danh sách cơ hội" })
  @ApiResponse({ status: 400, description: "Tham số bộ lọc không hợp lệ" })
  async list(
    @Query(new ZodValidationPipe(QueryOpportunityDtoSchema))
    query: QueryOpportunityDto,
  ) {
    return this.opportunityUseCase.list(query);
  }

  @Get('organizer/my-opportunities')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ORGANIZER', 'ADMIN')
  @ApiOperation({ summary: 'Lấy danh sách các cuộc thi / học bổng thuộc đơn vị tổ chức của mình (SCHOL-14)' })
  @ApiResponse({ status: 200, description: 'Danh sách cơ hội của đơn vị' })
  async listMyOpportunities(@Req() req: { user: AuthenticatedUser }) {
    return this.opportunityUseCase.listMyOpportunities(req.user);
  }

  @Get("bookmarks/me")
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: "Danh sách cơ hội đã lưu của tôi (OPP-06, đồng bộ bookmark giữa các thiết bị)",
  })
  @ApiResponse({ status: 200, description: "Danh sách opportunityId đã lưu" })
  async listMyBookmarks(@Req() req: { user: AuthenticatedUser }) {
    return this.bookmarkUseCase.listMyBookmarks(req.user.userId);
  }

  @Public()
  @Get(":id")
  @ApiOperation({ summary: "Xem chi tiết học bổng / cuộc thi" })
  @ApiParam({ name: "id", description: "ID định danh cơ hội (UUID)" })
  @ApiResponse({ status: 200, description: "Lấy chi tiết cơ hội thành công" })
  @ApiResponse({ status: 404, description: "Không tìm thấy cơ hội" })
  async getById(@Param("id") id: string) {
    return this.opportunityUseCase.getById(id);
  }

  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ORGANIZER", "ADMIN")
  @ApiOperation({
    summary: "Tạo học bổng hoặc cuộc thi mới (Organizer / Admin)",
  })
  @ApiResponse({ status: 201, description: "Tạo thành công" })
  @ApiResponse({
    status: 400,
    description: "Dữ liệu không hợp lệ (Zod Invariants)",
  })
  @ApiResponse({ status: 401, description: "Chưa xác thực danh tính" })
  @ApiResponse({ status: 403, description: "Không có quyền truy cập" })
  async create(
    @Req() req: { user: AuthenticatedUser },
    @Body(new ZodValidationPipe(CreateOpportunityDtoSchema))
    dto: CreateOpportunityDto,
  ) {
    return this.opportunityUseCase.create(
      dto,
      req.user.userId,
      req.user.organizationId,
    );
  }

  // ================= F14: Bookmark Handlers =================
  @Post(":id/bookmark")
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: "Lưu hoặc bỏ lưu (Bookmark) một học bổng/cuộc thi",
    description:
      "Gửi body { bookmarked: true|false } để đặt trạng thái đích (idempotent, an toàn khi retry). " +
      "Không gửi body: đảo trạng thái hiện tại (tương thích cũ).",
  })
  @ApiParam({ name: "id", description: "ID định danh cơ hội cần lưu (UUID)" })
  @ApiResponse({
    status: 200,
    description: "Cập nhật trạng thái Bookmark thành công",
  })
  @ApiResponse({
    status: 401,
    description: "Chưa xác thực danh tính (Thiếu token)",
  })
  async toggleBookmark(
    @Req() req: { user: AuthenticatedUser },
    @Param("id") opportunityId: string,
    @Body() body?: { bookmarked?: boolean },
  ) {
    const target = typeof body?.bookmarked === "boolean" ? body.bookmarked : undefined;
    return this.bookmarkUseCase.toggleBookmark(req.user.userId, opportunityId, target);
  }

  // ================= WF05 & APP-04: External Registration Marking =================
  @Post(":id/external-mark")
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: "Tự đánh dấu đã nộp hồ sơ tại website nguồn ngoài (FR-APP-04, WF05)",
    description: "Chỉ áp dụng cho cơ hội EXTERNAL. Lưu vào external_registrations, KHÔNG tạo Application record.",
  })
  @ApiParam({ name: "id", description: "ID cơ hội EXTERNAL" })
  @ApiResponse({
    status: 200,
    description: "Cập nhật trạng thái External Registration thành công",
  })
  async toggleExternalMark(
    @Req() req: { user: AuthenticatedUser },
    @Param("id") opportunityId: string,
    @Body() body?: { marked?: boolean },
  ) {
    return this.opportunityUseCase.toggleExternalMark(
      req.user.userId,
      opportunityId,
      body?.marked,
    );
  }

  @Get(":id/external-mark")
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: "Kiểm tra trạng thái tự đánh dấu nộp tại nguồn (FR-APP-04)",
  })
  @ApiParam({ name: "id", description: "ID cơ hội EXTERNAL" })
  async getExternalMarkStatus(
    @Req() req: { user: AuthenticatedUser },
    @Param("id") opportunityId: string,
  ) {
    return this.opportunityUseCase.getExternalMarkStatus(req.user.userId, opportunityId);
  }
}
