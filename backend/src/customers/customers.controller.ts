import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ErrorResponseDto } from '../common/dto/error-response.dto';
import { CustomersService } from './customers.service';
import {
  CustomerSearchQueryDto,
  CustomerSuggestionDto,
} from './dto/customer-search.dto';

@ApiTags('customers')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ErrorResponseDto })
@Controller('customers')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  @ApiOperation({
    summary: 'Suggest customers from previous invoices',
    description: 'Used to autofill the customer fields on the invoice form.',
  })
  @ApiOkResponse({ type: [CustomerSuggestionDto] })
  search(@Query() query: CustomerSearchQueryDto) {
    return this.customersService.search(query.keyword);
  }
}
