import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Post,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { IapPurchaseService } from '../services/iap-purchase.service';
import { RevenueCatService } from '../services/revenuecat.service';

@Controller('api/webhooks/revenuecat')
export class RevenueCatWebhookController {
  constructor(
    private readonly revenueCatService: RevenueCatService,
    private readonly iapPurchaseService: IapPurchaseService,
  ) {}

  @Post()
  @HttpCode(200)
  async receive(
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-revenuecat-webhook-signature') signature: string | undefined,
    @Req() req: Request & { rawBody?: Buffer },
    @Body() payload: any,
  ) {
    this.revenueCatService.verifyWebhook(
      authorization,
      signature,
      req.rawBody,
    );
    return this.iapPurchaseService.processWebhook(payload);
  }
}
