import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { CourseGraphResponse } from "src/schema/dtos/course-graph.dto";
import { CreateRelationDto } from "src/schema/dtos/create-relation.dto";
import {
  ContentRelationship,
  RelationshipType,
} from "src/schema/entities/content_relationships.entity";
import { CourseContent } from "src/schema/entities/course-content.entity";
import { QueryFailedError, Repository } from "typeorm";

@Injectable()
export class ContentMappingService {
  constructor(
    @InjectRepository(ContentRelationship)
    private relationRepo: Repository<ContentRelationship>,
    @InjectRepository(CourseContent)
    private contentRepo: Repository<CourseContent>
  ) {}

  async getRelationsByContent(contentId: string) {
    const prerequisites = await this.relationRepo.find({
      where: {
        child_content_id: contentId,
        relation_type: RelationshipType.PREREQUISITE,
      },
      relations: ["parentContent"],
    });

    const related = await this.relationRepo.find({
      where: [
        {
          child_content_id: contentId,
          relation_type: RelationshipType.RELATED,
        },
        {
          parent_content_id: contentId,
          relation_type: RelationshipType.RELATED,
        },
      ],
      relations: ["parentContent", "childContent"],
    });

    return { prerequisites, related };
  }

  async createRelation(dto: CreateRelationDto) {
    const { parent_content_id, child_content_id, relation_type } = dto;

    if (parent_content_id === child_content_id) {
      throw new BadRequestException(
        "Một bài học không thể là tiền đề của chính nó."
      );
    }

    const [parent, child] = await Promise.all([
      this.contentRepo.findOne({ where: { content_id: parent_content_id } }),
      this.contentRepo.findOne({ where: { content_id: child_content_id } }),
    ]);
    if (!parent || !child)
      throw new NotFoundException("Bài học không tồn tại.");

    const existing = await this.relationRepo.findOne({
      where: { parent_content_id, child_content_id, relation_type },
    });
    if (existing) throw new BadRequestException("Mối quan hệ này đã tồn tại.");

    if (relation_type === RelationshipType.PREREQUISITE) {
      const hasCycle = await this.detectCycle(
        child_content_id,
        parent_content_id
      );
      if (hasCycle) {
        throw new BadRequestException(
          `Phát hiện vòng lặp vô lý: Bài "${child.title}" đang là tiền đề (gián tiếp/trực tiếp) của "${parent.title}". Không thể đảo ngược.`
        );
      }
    }

    const newRelation = this.relationRepo.create({
      parent_content_id,
      child_content_id,
      relation_type,
      weight:
        dto.weight ||
        (relation_type === RelationshipType.PREREQUISITE ? 1.0 : 0.5),
    });

    try {
      return await this.relationRepo.save(newRelation);
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        (error as any).driverError?.code === "23505"
      ) {
        throw new BadRequestException(
          "Mối quan hệ này đã tồn tại (Dữ liệu bị trùng)."
        );
      }

      throw error;
    }
  }

  async removeRelation(id: string) {
    const result = await this.relationRepo.delete(id);
    if (result.affected === 0)
      throw new NotFoundException("Quan hệ không tồn tại");
    return { success: true };
  }

  private async detectCycle(
    startNodeId: string,
    targetNodeId: string,
    visited = new Set<string>()
  ): Promise<boolean> {
    if (startNodeId === targetNodeId) return true;
    if (visited.has(startNodeId)) return false;

    visited.add(startNodeId);

    const relationships = await this.relationRepo.find({
      where: {
        child_content_id: startNodeId,
        relation_type: RelationshipType.PREREQUISITE,
      },
      select: ["parent_content_id"],
    });

    for (const rel of relationships) {
      if (
        await this.detectCycle(rel.parent_content_id, targetNodeId, visited)
      ) {
        return true;
      }
    }
    return false;
  }

  async getCourseGraph(courseId: string): Promise<CourseGraphResponse> {
    const contents = await this.contentRepo.find({
      where: { courses_id: courseId },
      select: ["content_id", "title", "section_id"],
    });

    if (!contents.length) {
      return { allLessons: [], allRelations: [] };
    }

    const contentIds = contents.map((c) => c.content_id);

    const relations = await this.relationRepo
      .createQueryBuilder("r")
      .select(["r.parent_content_id", "r.child_content_id", "r.relation_type"])
      .where("r.parent_content_id IN (:...ids)", { ids: contentIds })
      .andWhere("r.child_content_id IN (:...ids)", { ids: contentIds })
      .getMany();

    const allLessons = contents.map((c) => ({
      id: c.content_id,
      title: c.title,
      sectionId: c.section_id || "",
    }));

    const allRelations = relations.map((r) => ({
      parent_id: r.parent_content_id,
      child_id: r.child_content_id,
      type: r.relation_type,
    }));

    return {
      allLessons,
      allRelations,
    };
  }
}
