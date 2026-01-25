import { SelectQueryBuilder } from "typeorm";

export class DashboardHelper {
  static applyDateRange(
    qb: SelectQueryBuilder<any>,
    column: string,
    from?: Date,
    to?: Date
  ) {
    if (from) qb.andWhere(`${column} >= :from`, { from });
    if (to) qb.andWhere(`${column} <= :to`, { to });
    return qb;
  }

  static getGroupingExpression(
    column: string,
    granularity: "day" | "week" | "month" = "day"
  ) {
    switch (granularity) {
      case "month":
        return `TO_CHAR(${column}, 'YYYY-MM')`;
      case "week":
        return `TO_CHAR(${column}, 'IYYY-IW')`;
      default:
        return `TO_CHAR(${column}, 'YYYY-MM-DD')`;
    }
  }
}
