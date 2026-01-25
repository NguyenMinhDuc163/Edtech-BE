import {
  Controller,
  Get,
  Delete,
  Query,
  UseGuards,
  Req,
  Param,
  HttpCode,
} from '@nestjs/common';
import { SearchService } from '../services/search.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../common/guards/optional-jwt-auth.guard';

@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get('courses')
  @HttpCode(200)
  @UseGuards(OptionalJwtAuthGuard)
  async searchCourses(@Query() query: any, @Req() req: any) {
    const userId = req.user?.id || null;
    return this.searchService.searchCourses(userId, query);
  }

  @Get('autocomplete')
  @HttpCode(200)
  @UseGuards(OptionalJwtAuthGuard)
  async autocomplete(
    @Query('q') q: string,
    @Query('limit') limit?: number,
    @Req() req?: any,
  ) {
    const userId = req?.user?.id || null;
    return this.searchService.getAutocompleteSuggestions(
      userId,
      q.trim(),
      limit ? Number(limit) : 10,
    );
  }

  @Get('history')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  async getSearchHistory(@Req() req: any) {
    const userId = req.user?.id;
    return this.searchService.getSearchHistory(userId);
  }

  @Delete('history/:id')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  async deleteSearchHistory(@Req() req: any, @Param('id') id: number) {
    const userId = req.user?.id;
    return this.searchService.deleteSearchHistory(userId, id);
  }



}
