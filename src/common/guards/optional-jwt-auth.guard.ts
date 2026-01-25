import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { TokenExpiredError } from "jsonwebtoken";

@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard("jwt") {
  handleRequest(err: any, user: any, info: any, context: ExecutionContext) {
    if (info?.message === "No auth token") {
      return null;
    }

    if (err || !user) {
      if (info instanceof TokenExpiredError) {
        throw new UnauthorizedException("Token has expired");
      }

      if (
        info?.message === "invalid token" ||
        info?.message === "jwt malformed"
      ) {
        throw new UnauthorizedException("Invalid token");
      }

      throw err || new UnauthorizedException("Access denied");
    }

    return user;
  }
}
