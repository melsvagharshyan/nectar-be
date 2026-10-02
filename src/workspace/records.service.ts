import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { AuthUser } from '../auth/auth.types.js';
import {
  DB,
  type Database,
  type Transaction,
} from '../database/database.module.js';
import { nextId } from '../database/ids.js';
import * as t from '../database/schema.js';
import type {
  ClientDto,
  CompanyDto,
  EmployeeDto,
  PropertyDto,
  RequestDto,
} from './records.dto.js';
import { isOpenStage } from './rules.js';
import { WorkflowService } from './workflow.service.js';
import { WorkspaceService } from './workspace.service.js';
import type { WorkspaceState } from './workspace.types.js';

const COMPANY_PREFIX = { rf: 'RF', am: 'AM' } as const;

function propertyTitle({ type, rooms, area }: PropertyDto) {
  const kind =
    type === 'Квартира' && rooms ? `${rooms}-комн. квартира` : type;
  return `${kind} • ${area} м²`;
}

/** Creating and editing the records each role owns. */
@Injectable()
export class RecordsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly workspace: WorkspaceService,
    private readonly workflow: WorkflowService,
  ) {}

  createClient(user: AuthUser, dto: ClientDto) {
    return this.run(user, async (tx) => {
      const employee = await this.ownEmployee(tx, user, dto.employeeId, 'rf');
      const id = await nextId(tx, 'C', t.clientIdSeq);
      await tx.insert(t.clients).values({
        id,
        publicId: id.replace(/^C-/, 'CL-'),
        companyId: employee.companyId,
        employeeId: employee.id,
        name: dto.name,
        phone: dto.phone,
        email: dto.email,
      });
    });
  }

  updateClient(user: AuthUser, clientId: string, dto: ClientDto) {
    return this.run(user, async (tx) => {
      const client = await this.ownClient(tx, user, clientId);
      const employee = await this.ownEmployee(tx, user, dto.employeeId, 'rf');
      if (employee.companyId !== client.companyId)
        throw new BadRequestException('Сотрудник из другой компании');
      await tx
        .update(t.clients)
        .set({
          name: dto.name,
          phone: dto.phone,
          email: dto.email,
          employeeId: employee.id,
        })
        .where(eq(t.clients.id, client.id));
    });
  }

  createRequest(user: AuthUser, clientId: string, dto: RequestDto) {
    return this.run(user, async (tx) => {
      const client = await this.ownClient(tx, user, clientId);
      this.assertRange(dto);
      await tx.insert(t.requests).values({
        id: await nextId(tx, 'CR', t.requestIdSeq),
        clientId: client.id,
        stage: 'created',
        ...this.requestValues(dto),
      });
    });
  }

  updateRequest(user: AuthUser, requestId: string, dto: RequestDto) {
    return this.run(user, async (tx) => {
      const [request] = await tx
        .select()
        .from(t.requests)
        .where(eq(t.requests.id, requestId))
        .for('update');
      if (!request) throw new NotFoundException('Запрос не найден');
      await this.ownClient(tx, user, request.clientId);
      if (request.stage !== 'created' && !isOpenStage(request.stage))
        throw new BadRequestException('Завершённый запрос нельзя изменить');
      this.assertRange(dto);
      await tx
        .update(t.requests)
        .set(this.requestValues(dto))
        .where(eq(t.requests.id, request.id));
    });
  }

  createProperty(user: AuthUser, dto: PropertyDto) {
    return this.run(user, async (tx) => {
      this.assertPublishable(dto);
      await tx.insert(t.properties).values({
        id: await nextId(tx, 'BR', t.propertyIdSeq),
        companyId: user.companyId!,
        ...this.propertyValues(dto),
      });
    });
  }

  updateProperty(user: AuthUser, propertyId: string, dto: PropertyDto) {
    return this.run(user, async (tx) => {
      const [property] = await tx
        .select()
        .from(t.properties)
        .where(eq(t.properties.id, propertyId))
        .for('update');
      if (
        !property ||
        (user.role !== 'admin' && property.companyId !== user.companyId)
      )
        throw new NotFoundException('Объект не найден');
      if (property.availability === 'sold')
        throw new BadRequestException('Проданный объект нельзя изменить');
      this.assertPublishable(dto);
      const values = this.propertyValues(dto);
      await tx
        .update(t.properties)
        .set(values)
        .where(eq(t.properties.id, property.id));

      if (values.availability !== 'active') {
        await tx.delete(t.drafts).where(eq(t.drafts.propertyId, property.id));
      }
      if (values.availability !== property.availability) {
        const affected = tx
          .select({ id: t.offers.requestId })
          .from(t.offers)
          .where(eq(t.offers.propertyId, property.id));
        await this.workflow.recalcStages(
          tx,
          and(
            inArray(t.requests.id, affected),
            inArray(t.requests.stage, ['in_progress', 'has_offers']),
          ),
        );
      }
    });
  }

  createCompany(user: AuthUser, dto: CompanyDto) {
    return this.run(user, async (tx) => {
      const id = await nextId(tx, COMPANY_PREFIX[dto.kind], t.companyIdSeq);
      await tx
        .insert(t.companies)
        .values({ id, kind: dto.kind, name: dto.name, contact: dto.contact });
    });
  }

  updateCompany(user: AuthUser, companyId: string, dto: CompanyDto) {
    return this.run(user, async (tx) => {
      this.assertCompanyAccess(user, companyId);
      const updated = await tx
        .update(t.companies)
        .set({ name: dto.name, contact: dto.contact })
        .where(eq(t.companies.id, companyId))
        .returning({ id: t.companies.id });
      if (!updated.length) throw new NotFoundException('Компания не найдена');
    });
  }

  createEmployee(user: AuthUser, companyId: string, dto: EmployeeDto) {
    return this.run(user, async (tx) => {
      this.assertCompanyAccess(user, companyId);
      const [company] = await tx
        .select({ id: t.companies.id })
        .from(t.companies)
        .where(eq(t.companies.id, companyId))
        .for('update');
      if (!company) throw new NotFoundException('Компания не найдена');
      const [{ count }] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(t.employees)
        .where(eq(t.employees.companyId, companyId));
      await tx.insert(t.employees).values({
        id: `${companyId}-E${String(count + 1).padStart(2, '0')}`,
        companyId,
        name: dto.name,
        phone: dto.phone,
        active: dto.active,
      });
    });
  }

  updateEmployee(user: AuthUser, employeeId: string, dto: EmployeeDto) {
    return this.run(user, async (tx) => {
      const [employee] = await tx
        .select()
        .from(t.employees)
        .where(eq(t.employees.id, employeeId));
      if (!employee) throw new NotFoundException('Сотрудник не найден');
      this.assertCompanyAccess(user, employee.companyId);
      await tx
        .update(t.employees)
        .set({ name: dto.name, phone: dto.phone, active: dto.active })
        .where(eq(t.employees.id, employee.id));
    });
  }

  private async run(
    user: AuthUser,
    action: (tx: Transaction) => Promise<void>,
  ): Promise<WorkspaceState> {
    await this.db.transaction(action);
    return this.workspace.snapshot(user);
  }

  private assertCompanyAccess(user: AuthUser, companyId: string) {
    if (user.role !== 'admin' && user.companyId !== companyId)
      throw new ForbiddenException('Нет доступа к этой компании');
  }

  /** Employee of the caller's company (any RF company for admins). */
  private async ownEmployee(
    tx: Transaction,
    user: AuthUser,
    employeeId: string,
    kind: 'rf' | 'am',
  ) {
    const [row] = await tx
      .select({ employee: t.employees, kind: t.companies.kind })
      .from(t.employees)
      .innerJoin(t.companies, eq(t.companies.id, t.employees.companyId))
      .where(eq(t.employees.id, employeeId));
    if (
      !row ||
      row.kind !== kind ||
      !row.employee.active ||
      (user.role !== 'admin' && row.employee.companyId !== user.companyId)
    )
      throw new BadRequestException('Выберите активного сотрудника своей компании');
    return row.employee;
  }

  private async ownClient(tx: Transaction, user: AuthUser, clientId: string) {
    const [client] = await tx
      .select()
      .from(t.clients)
      .where(eq(t.clients.id, clientId));
    if (
      !client ||
      (user.role !== 'admin' && client.companyId !== user.companyId)
    )
      throw new NotFoundException('Клиент не найден');
    return client;
  }

  private assertRange(dto: RequestDto) {
    if (dto.budgetMin > dto.budgetMax)
      throw new BadRequestException('Минимальный бюджет больше максимального');
    if (dto.areaMax && dto.areaMin > dto.areaMax)
      throw new BadRequestException('Минимальная площадь больше максимальной');
  }

  private assertPublishable(dto: PropertyDto) {
    if (dto.floor && dto.floors && dto.floor > dto.floors)
      throw new BadRequestException('Этаж не может быть выше этажности');
    if (!dto.publish) return;
    if (!dto.media.length)
      throw new BadRequestException('Добавьте хотя бы одно фото для публикации');
    if (!dto.description)
      throw new BadRequestException('Добавьте публичное описание для публикации');
  }

  private requestValues(dto: RequestDto) {
    return {
      type: dto.type,
      districts: dto.districts,
      budgetMin: dto.budgetMin,
      budgetMax: dto.budgetMax,
      areaMin: dto.areaMin,
      areaMax: dto.areaMax,
      rooms: dto.rooms,
      goal: dto.goal,
      term: dto.term,
      notes: dto.notes,
      market: dto.market,
      repair: dto.repair,
      furniture: dto.furniture,
      parking: dto.parking,
      view: dto.view,
      amenities: dto.amenities,
    };
  }

  private propertyValues(dto: PropertyDto) {
    return {
      availability: dto.publish ? ('active' as const) : ('draft' as const),
      title: propertyTitle(dto),
      type: dto.type,
      district: dto.district,
      price: dto.price,
      area: dto.area,
      rooms: dto.rooms,
      floor: dto.floor,
      floors: dto.floors,
      ceiling: dto.ceiling,
      market: dto.market,
      location: dto.location,
      repair: dto.repair,
      furniture: dto.furniture,
      parking: dto.parking,
      bathroom: dto.bathroom,
      balcony: dto.balcony,
      building: dto.building,
      amenities: dto.amenities,
      description: dto.description,
      privateNotes: dto.privateNotes,
      internalAddress: dto.internalAddress,
      media: dto.media,
    };
  }
}
