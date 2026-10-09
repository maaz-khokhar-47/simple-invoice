import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  StreamableFile,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ErrorResponseDto } from '../common/dto/error-response.dto';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { CreateWriteOffDto } from './dto/create-write-off.dto';
import {
  InvoiceDetailDto,
  InvoiceListResponseDto,
} from './dto/invoice-response.dto';
import { InvoiceStatsDto, InvoiceStatsQueryDto } from './dto/invoice-stats.dto';
import { ListInvoicesQueryDto } from './dto/list-invoices-query.dto';
import { UpdateInvoiceStatusDto } from './dto/update-status.dto';
import { InvoicesService } from './invoices.service';

@ApiTags('invoices')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ErrorResponseDto })
@Controller('invoices')
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Get()
  @ApiOperation({
    summary: 'List invoices with search, filter, sort and pagination',
  })
  @ApiOkResponse({ type: InvoiceListResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  list(@Query() query: ListInvoicesQueryDto) {
    return this.invoicesService.list(query);
  }

  // Declared before :id so "stats" isn't treated as an invoice id
  @Get('stats')
  @ApiOperation({
    summary: 'Counts and amounts per status',
    description:
      'Accepts the same keyword/fromDate/toDate filters as the list. Amounts are grouped by currency.',
  })
  @ApiOkResponse({ type: InvoiceStatsDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  stats(@Query() query: InvoiceStatsQueryDto) {
    return this.invoicesService.stats(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single invoice with its items' })
  @ApiOkResponse({ type: InvoiceDetailDto })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'id is not a UUID',
  })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.invoicesService.findOne(id);
  }

  @Post()
  @ApiOperation({
    summary: 'Create a draft invoice. Totals are calculated by the server.',
  })
  @ApiCreatedResponse({ type: InvoiceDetailDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({
    type: ErrorResponseDto,
    description: 'Invoice number already exists',
  })
  create(@Body() dto: CreateInvoiceDto, @CurrentUser() user: AuthUser) {
    return this.invoicesService.create(dto, user.id);
  }

  @Get(':id/pdf')
  @ApiOperation({
    summary: 'Download a paid invoice as PDF',
    description: 'Returns 409 if the invoice is not Paid yet.',
  })
  @ApiProduces('application/pdf')
  @ApiOkResponse({
    description: 'PDF file',
    schema: { type: 'string', format: 'binary' },
  })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({
    type: ErrorResponseDto,
    description: 'Invoice is not Paid',
  })
  async pdf(@Param('id', ParseUUIDPipe) id: string) {
    const { filename, content } = await this.invoicesService.pdf(id);
    return new StreamableFile(content, {
      type: 'application/pdf',
      disposition: `attachment; filename="${filename}"`,
    });
  }

  @Put(':id')
  @ApiOperation({
    summary: 'Edit a Draft invoice',
    description:
      'Takes the same body as create and replaces the invoice details. Totals are recalculated. Only Draft invoices can be edited.',
  })
  @ApiOkResponse({ type: InvoiceDetailDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({
    type: ErrorResponseDto,
    description: 'Invoice is not a Draft, or the invoice number is taken',
  })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateInvoiceDto,
  ) {
    return this.invoicesService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a Draft invoice' })
  @ApiNoContentResponse({ description: 'Deleted' })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({
    type: ErrorResponseDto,
    description: 'Only Draft invoices can be deleted',
  })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.invoicesService.remove(id);
  }

  @Patch(':id/status')
  @ApiOperation({
    summary: 'Change invoice status',
    description:
      'Only Draft -> Pending ("mark as sent") is allowed. Paid is reached by recording payments.',
  })
  @ApiOkResponse({ type: InvoiceDetailDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({
    type: ErrorResponseDto,
    description: 'Transition not allowed from the current status',
  })
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateInvoiceStatusDto,
  ) {
    return this.invoicesService.updateStatus(id, dto);
  }

  @Post(':id/payments')
  @ApiOperation({
    summary: 'Record a payment',
    description:
      'Only for Pending invoices. The amount cannot exceed the balance. The invoice becomes Paid when the balance reaches 0. With writeOffRest, a small gap left by the payment (bank charges, rounding) is written off and the invoice becomes Paid.',
  })
  @ApiCreatedResponse({ type: InvoiceDetailDto })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'Invalid amount or date',
  })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({
    type: ErrorResponseDto,
    description: 'Invoice is still a Draft, already Paid or written off',
  })
  addPayment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreatePaymentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.invoicesService.addPayment(id, dto, user.id);
  }

  @Post(':id/write-off')
  @ApiOperation({
    summary: 'Write off the rest of the balance',
    description:
      'For Pending (and Overdue) invoices that will not be paid: the remaining balance is written off with a reason and the invoice becomes WrittenOff. Payments already received stay. This cannot be undone.',
  })
  @ApiCreatedResponse({ type: InvoiceDetailDto })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'Invalid reason or date, or a missing note for Other',
  })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({
    type: ErrorResponseDto,
    description: 'Invoice is still a Draft, already Paid or written off',
  })
  writeOff(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateWriteOffDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.invoicesService.writeOff(id, dto, user.id);
  }
}
