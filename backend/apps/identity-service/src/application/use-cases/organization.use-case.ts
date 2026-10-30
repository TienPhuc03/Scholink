import { Injectable, Inject } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as crypto from 'crypto';
import {
  OrganizationModel,
  OrganizationDocument,
  OrganizationMembershipModel,
  OrganizationMembershipDocument,
} from '../../infrastructure/persistence/organization.schema';
import { IUserRepository, USER_REPOSITORY } from '../../domain/ports/user.repository.port';
import { CreateOrganizationDto, AssignOrganizerDto } from '../dtos/organization.dto';
import { DomainException, ErrorCode } from '@shared';

@Injectable()
export class OrganizationUseCase {
  constructor(
    @InjectModel(OrganizationModel.name) private readonly orgModel: Model<OrganizationDocument>,
    @InjectModel(OrganizationMembershipModel.name) private readonly membershipModel: Model<OrganizationMembershipDocument>,
    @Inject(USER_REPOSITORY) private readonly userRepo: IUserRepository,
  ) {}

  async createOrganization(dto: CreateOrganizationDto) {
    const existing = await this.orgModel.findOne({ name: dto.name }).exec();
    if (existing) {
      throw new DomainException(ErrorCode.STATE_CONFLICT, 'Đơn vị tổ chức với tên này đã tồn tại', 409);
    }

    const orgId = `org_${crypto.randomUUID()}`;
    const org = await this.orgModel.create({
      id: orgId,
      name: dto.name,
      taxCode: dto.taxCode,
      email: dto.email,
      website: dto.website,
      description: dto.description,
      status: 'ACTIVE',
      version: 1,
    });

    return org;
  }

  async listOrganizations() {
    return this.orgModel.find().sort({ createdAt: -1 }).exec();
  }

  async getOrganizationById(id: string) {
    const org = await this.orgModel.findOne({ id }).exec();
    if (!org) {
      throw DomainException.notFound('Đơn vị tổ chức');
    }
    const members = await this.membershipModel.find({ organizationId: id, status: 'ACTIVE' }).exec();
    return {
      org,
      members,
    };
  }

  async assignOrganizer(orgId: string, adminId: string, dto: AssignOrganizerDto) {
    const org = await this.orgModel.findOne({ id: orgId }).exec();
    if (!org) {
      throw DomainException.notFound('Đơn vị tổ chức');
    }

    const user = await this.userRepo.findByEmail(dto.userEmail);
    if (!user) {
      throw DomainException.notFound(`Người dùng với email ${dto.userEmail}`);
    }

    // Upgrade user role to ORGANIZER if still STUDENT
    if (user.role === 'STUDENT') {
      user.changeRole('ORGANIZER');
      await this.userRepo.update(user);
    }

    // Check existing membership
    const existingMem = await this.membershipModel.findOne({ organizationId: orgId, userId: user.id }).exec();
    if (existingMem) {
      existingMem.status = 'ACTIVE';
      existingMem.role = dto.role;
      existingMem.grantedBy = adminId;
      existingMem.grantedAt = new Date();
      await existingMem.save();
      return existingMem;
    }

    const membership = await this.membershipModel.create({
      id: `mem_org_${crypto.randomUUID()}`,
      organizationId: orgId,
      userId: user.id,
      role: dto.role,
      status: 'ACTIVE',
      grantedBy: adminId,
      grantedAt: new Date(),
    });

    return {
      message: `Đã cấp quyền Organizer cho ${user.email} tại đơn vị ${org.name}`,
      membership,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
      },
    };
  }
}
