import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { ContentRelationship } from "src/schema/entities/content_relationships.entity";
import { CourseContent } from "src/schema/entities/course-content.entity";
import { Payment } from "src/schema/entities/payment.entity";
import {
  MasteryStatus,
  UserContentMastery,
} from "src/schema/entities/user-content-mastery.entity";
import { In, Repository } from "typeorm";

@Injectable()
export class MasteryService {
  constructor(
    @InjectRepository(UserContentMastery)
    private masteryRepo: Repository<UserContentMastery>,
    @InjectRepository(CourseContent)
    private contentRepo: Repository<CourseContent>,
    @InjectRepository(Payment)
    private readonly paymentRepo: Repository<Payment>,
    @InjectRepository(ContentRelationship)
    private relationRepo: Repository<ContentRelationship>
  ) { }

  async setupData(txnRef: string): Promise<void> {
    try {
      const paymentData = await this.paymentRepo
        .createQueryBuilder("p")
        .select(["p.course_id AS course_id", "p.user_id AS user_id"])
        .where("p.txn_ref = :txnRef", { txnRef })
        .getRawOne();

      if (!paymentData) {
        throw new BadRequestException("Không tìm thấy thông tin thanh toán.");
      }

      // Update user_content_mastery
      await this.initializeCourseMastery(
        paymentData.user_id,
        paymentData.course_id
      );
    } catch (error) {
      Logger.error(
        "Đã có lỗi trong quá trình thanh toán với mã thanh toán là: ",
        txnRef
      );
      throw new BadRequestException("Đã có lỗi trong quá trình thanh toán");
    }
  }

  async initializeCourseMastery(
    userId: string,
    courseId: string
  ): Promise<void> {
    try {
      const contents = await this.contentRepo.find({
        where: { courses_id: courseId },
        select: ["content_id"],
      });

      if (!contents || contents.length === 0) {
        return;
      }

      const masteryRecords = contents.map((content) => ({
        user_id: userId,
        content_id: content.content_id,
        theta: -1.0,
        certainty: 0.1,
        status: MasteryStatus.UNLOCKED,
        last_updated: new Date(),
      }));

      await this.masteryRepo
        .createQueryBuilder()
        .insert()
        .into(UserContentMastery)
        .values(masteryRecords)
        .orIgnore()
        .execute();
    } catch (error) {
      console.log(`Lỗi khởi tạo Adaptive Mastery: ${error}`);
    }
  }

  async buildAiPayload(
    userId: string,
    targetId: string,
    theta: number
  ) {
    const relations = await this.relationRepo.find({
      where: [{ child_content_id: targetId }, { parent_content_id: targetId }],
      relations: ["parentContent", "childContent"],
    });

    if (!relations.length) return null;

    const relatedIds = new Set<string>([targetId]);
    relations.forEach((r) => {
      relatedIds.add(r.parent_content_id);
      relatedIds.add(r.child_content_id);
    });

    const masteries = await this.masteryRepo.find({
      where: { user_id: userId, content_id: In([...relatedIds]) },
      relations: ["content"],
    });

    return {
      request_id: `req_${Date.now()}`,
      current_context: {
        target_content_id: targetId,
        current_theta: parseFloat(theta.toFixed(2)),
      },
      knowledge_graph_subgraph: relations.map((r) => ({
        source_id: r.parent_content_id,
        source: r.parentContent.title,
        description_source: r.parentContent.description
          ? r.parentContent.description.substring(0, 50).replace(/\n/g, " ")
          : "",
        target_id: r.child_content_id,
        target: r.childContent.title,
        type: r.relation_type,
        description_target: r.childContent.description
          ? r.childContent.description.substring(0, 50).replace(/\n/g, " ")
          : "",
      })),
      user_mastery_profile: masteries.map((m) => ({
        content_id: m.content_id,
        title: m.content?.title || m.content_id,
        theta: m.theta,
        status: m.status,
      })),
    };
  }

  async formatAiSuggestion(aiRawData: any) {
    const coreSuggestion = aiRawData?.suggestion;

    if (!coreSuggestion || !coreSuggestion.TargetID) return null;

    const targetId = coreSuggestion.TargetID;

    const targetContent = await this.contentRepo
      .createQueryBuilder("c")
      .leftJoinAndSelect(
        "c.files",
        "f",
        "f.is_active = true"
      )
      .where("c.content_id = :id", { id: targetId })
      .select([
        "c.content_id",
        "c.title",
        "c.description",
        "c.section_id",
        "c.courses_id",
        "f.file_id",
        "f.file_type",
        "f.filename",
        "f.title",
        "f.order_index",
      ])
      .orderBy("f.order_index", "ASC")
      .getOne();

    if (!targetContent) return null;

    return {
      action: coreSuggestion.Action,
      reason: coreSuggestion.Description,
      targetContent: {
        contentId: targetContent.content_id,
        title: targetContent.title,
        description: targetContent.description
          ? targetContent.description.substring(0, 150) + "..."
          : "",
        sectionId: targetContent.section_id,
        courseId: targetContent.courses_id,
      },
    };
  }
}
