import { Injectable } from "@nestjs/common";
import { IRT_CONFIG } from "src/constants/logic";
import {
  MasteryStatus,
  UserContentMastery,
} from "src/schema/entities/user-content-mastery.entity";

const TIME_DECAY_FACTOR = 0.05; // Mỗi ngày quên 5% nếu không ôn tập
const MAX_PASSIVE_THETA = 0.5; // Xem video chỉ giúp đạt tối đa mức này
const PASSIVE_BOOST = 0.1; // Mỗi lần hoàn thành bài học tăng 0.1
const DECAY_THRESHOLD_DAYS = 3; // Sau 3 ngày không học thì bắt đầu tính decay

@Injectable()
export class MasteryCalculator {
  public calculateExamUpdate(
    currentRecord: UserContentMastery | null,
    questionDifficulty: number,
    isCorrect: boolean
  ): Partial<UserContentMastery> {
    let theta: number;
    let certainty: number;
    let currentStatus = MasteryStatus.UNLOCKED;

    if (currentRecord) {
      const decayed = this.applyTimeDecay(currentRecord);
      theta = decayed.theta;
      certainty = decayed.certainty;
      currentStatus = currentRecord.status;
    } else {
      theta = 0;
      certainty = 0.2;
    }

    const kFactor =
      IRT_CONFIG.BASE_K - certainty * (IRT_CONFIG.BASE_K - IRT_CONFIG.MIN_K);

    const expectedProbability =
      1 / (1 + Math.exp(-(theta - questionDifficulty)));
    const actualScore = isCorrect ? 1 : 0;

    let newTheta = theta + kFactor * (actualScore - expectedProbability);

    newTheta = this.clamp(newTheta, IRT_CONFIG.MIN_THETA, IRT_CONFIG.MAX_THETA);

    let newCertainty = certainty + (1 - certainty) * IRT_CONFIG.CERTAINTY_STEP;

    return this.finalizeResult(newTheta, newCertainty, currentStatus);
  }

  public calculateLearningUpdate(
    currentRecord: UserContentMastery | null,
    completionPercent: number
  ): Partial<UserContentMastery> {
    let theta = currentRecord ? currentRecord.theta : IRT_CONFIG.MIN_THETA;
    let certainty = currentRecord ? currentRecord.certainty : 0.1;

    if (completionPercent < 80) {
      return { theta, certainty, last_updated: new Date() };
    }

    if (theta < MAX_PASSIVE_THETA) {
      theta += PASSIVE_BOOST;
    }

    certainty = certainty + (1 - certainty) * (IRT_CONFIG.CERTAINTY_STEP / 2);

    return this.finalizeResult(
      theta,
      certainty,
      currentRecord?.status || MasteryStatus.UNLOCKED
    );
  }
  private applyTimeDecay(record: UserContentMastery): {
    theta: number;
    certainty: number;
  } {
    const now = new Date();
    const lastUpdate = record.last_updated
      ? new Date(record.last_updated)
      : now;

    const diffTime = Math.abs(now.getTime() - lastUpdate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    let { theta, certainty } = record;

    if (diffDays > DECAY_THRESHOLD_DAYS) {
      const decayAmount = diffDays * TIME_DECAY_FACTOR;

      theta = Math.max(-1, theta - decayAmount);

      certainty = Math.max(0.1, certainty - decayAmount * 2);
    }

    return { theta: record.theta, certainty: record.certainty };
  }

  private clamp(val: number, min: number, max: number) {
    return Math.max(min, Math.min(max, val));
  }

  private finalizeResult(
    theta: number,
    certainty: number,
    currentStatus: MasteryStatus
  ) {
    let newStatus = currentStatus;

    if (theta >= IRT_CONFIG.MASTERED_THRESHOLD) {
      newStatus = MasteryStatus.MASTERED;
    } else if (
      newStatus === MasteryStatus.MASTERED &&
      theta < IRT_CONFIG.MASTERED_THRESHOLD - 0.5
    ) {
      newStatus = MasteryStatus.IN_PROGRESS;
    }

    return {
      theta: parseFloat(theta.toFixed(4)),
      certainty: parseFloat(certainty.toFixed(4)),
      status: newStatus,
      last_updated: new Date(),
    };
  }
}
