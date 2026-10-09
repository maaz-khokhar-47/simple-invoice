import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CustomerSuggestionDto } from './dto/customer-search.dto';

const MAX_SUGGESTIONS = 8;

/**
 * Customers are stored on each invoice (see README), so "customers" here are
 * the distinct emails used on previous invoices, with their latest details.
 */
@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async search(keyword?: string): Promise<CustomerSuggestionDto[]> {
    const rows = await this.prisma.invoice.findMany({
      where: keyword
        ? {
            OR: [
              { customerName: { contains: keyword, mode: 'insensitive' } },
              { customerEmail: { contains: keyword, mode: 'insensitive' } },
            ],
          }
        : undefined,
      // newest first, so for each email we keep the most recent details
      orderBy: { createdAt: 'desc' },
      distinct: ['customerEmail'],
      take: MAX_SUGGESTIONS,
      select: {
        customerName: true,
        customerEmail: true,
        customerMobile: true,
        customerAddress: true,
      },
    });

    return rows.map((row) => ({
      fullname: row.customerName,
      email: row.customerEmail,
      mobileNumber: row.customerMobile,
      address: row.customerAddress,
    }));
  }
}
