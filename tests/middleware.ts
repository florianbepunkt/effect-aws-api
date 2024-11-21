import { Context, Effect, Layer, Schema as S } from "effect";
import { HttpApiMiddleware, HttpApiSchema, HttpServerRequest } from "@effect/platform";
import { RawLambdaInput } from "../src/lambda-adapter.js";

export class AuthContext extends S.Class<AuthContext>("AuthContext")({
  accountId: S.NonEmptyString,
  tenantId: S.NonEmptyString,
}) {}

export class CurrentAuthContext extends Context.Tag("CurrentAuthContext")<
  CurrentAuthContext,
  AuthContext
>() {}

export class Unauthorized extends S.TaggedError<Unauthorized>()(
  "Unauthorized",
  {},
  HttpApiSchema.annotations({ status: 401 }),
) {}

export class Authorization extends HttpApiMiddleware.Tag<Authorization>()("Authorization", {
  failure: Unauthorized,
  provides: CurrentAuthContext,
}) {}

export const AuthorizationLive = Layer.effect(
  Authorization,
  Effect.gen(function* () {
    const { event } = yield* RawLambdaInput; // this is the original lambda event that contains the cognito authorizer information

    const authorize = Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest;

      // do something with the event.requestContext

      return {
        accountId: "foo",
        tenantId: "tenantId",
      };
    });

    return Authorization.of(authorize);
  }),
);
