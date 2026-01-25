import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import { CreateRelationDto } from "src/schema/dtos/create-relation.dto";
import { ContentMappingService } from "src/services/content-mapping.service";

@Controller("content-mapping")
export class ContentMappingController {
  constructor(private readonly mappingService: ContentMappingService) {}

  @Get("graph/:courseId")
  async getCourseGraph(@Param("courseId") courseId: string) {
    return this.mappingService.getCourseGraph(courseId);
  }

  @Get(":contentId")
  async getRelations(@Param("contentId") contentId: string) {
    return this.mappingService.getRelationsByContent(contentId);
  }
  
  @Post()
  async createRelation(@Body() dto: CreateRelationDto) {
    return this.mappingService.createRelation(dto);
  }

  @Delete(":id")
  async deleteRelation(@Param("id") id: string) {
    return this.mappingService.removeRelation(id);
  }
}
