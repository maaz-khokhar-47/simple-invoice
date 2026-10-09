import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiConsumes,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { AuthUser } from '../../auth/auth.types';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { ErrorResponseDto } from '../../common/dto/error-response.dto';
import { MAX_IMPORT_BYTES, MAX_IMPORT_ROWS } from './import-columns';
import {
  ImportInvoicesDto,
  ImportPreviewDto,
  ImportResultDto,
} from './import.dto';
import { InvoiceImportService } from './invoice-import.service';

const XLSX_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

@ApiTags('invoice import')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ErrorResponseDto })
@Controller('invoices/import')
export class InvoiceImportController {
  constructor(private readonly importService: InvoiceImportService) {}

  @Get('template')
  @ApiOperation({ summary: 'Download the Excel template for bulk import' })
  @ApiProduces(XLSX_TYPE)
  @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  async template() {
    return new StreamableFile(await this.importService.template(), {
      type: XLSX_TYPE,
      disposition: 'attachment; filename="invoice-import-template.xlsx"',
    });
  }

  @Post('preview')
  @ApiOperation({
    summary: 'Check a filled-in template without saving anything',
    description: `Upload the .xlsx as multipart field "file" (max ${MAX_IMPORT_BYTES / 1024 / 1024} MB, ${MAX_IMPORT_ROWS} rows). Every row is validated like POST /invoices and returned with its errors and totals.`,
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiOkResponse({ type: ImportPreviewDto })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'Not an .xlsx file, missing columns, no rows or too many rows',
  })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_IMPORT_BYTES, files: 1 },
    }),
  )
  preview(@UploadedFile() file?: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException(
        'Attach the filled-in template as the "file" field',
      );
    }
    if (!file.originalname.toLowerCase().endsWith('.xlsx')) {
      throw new BadRequestException('Only .xlsx files are supported');
    }
    return this.importService.preview(file.buffer);
  }

  @Post()
  @ApiOperation({
    summary: 'Create the reviewed invoices as Drafts',
    description:
      'Send the valid rows from the preview. Everything is checked again and created in one transaction - all or nothing.',
  })
  @ApiCreatedResponse({ type: ImportResultDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({
    type: ErrorResponseDto,
    description: 'An invoice number already exists',
  })
  commit(@Body() dto: ImportInvoicesDto, @CurrentUser() user: AuthUser) {
    return this.importService.commit(dto, user.id);
  }
}
