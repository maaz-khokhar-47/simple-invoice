import { Module } from '@nestjs/common';
import { InvoiceImportController } from './import/invoice-import.controller';
import { InvoiceImportService } from './import/invoice-import.service';
import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';

@Module({
  // import controller first so "invoices/import/..." is matched before "invoices/:id/..."
  controllers: [InvoiceImportController, InvoicesController],
  providers: [InvoicesService, InvoiceImportService],
})
export class InvoicesModule {}
