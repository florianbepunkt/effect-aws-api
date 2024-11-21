import { Authorization, AuthorizationLive } from "./middleware.js";
import { Effect, Layer, Schema as S } from "effect";
import { HttpApi, HttpApiBuilder, HttpApiEndpoint, HttpApiGroup } from "@effect/platform";

export class SimpleApiGroup extends HttpApiGroup.make("root")
  .add(HttpApiEndpoint.get("get", "/").addSuccess(S.Struct({ foo: S.Literal("bar") })))
  .add(
    HttpApiEndpoint.get("getId", "/foobar/:fooId")
      .addSuccess(S.Struct({ foo: S.NonEmptyString }))
      .setPath(S.Struct({ fooId: S.NonEmptyString })),
  )
  .add(
    HttpApiEndpoint.post("post", "/foo")
      .setPayload(S.Struct({ bar: S.NonEmptyString }))
      .addSuccess(S.Struct({ foo: S.NonEmptyString })),
  )
  .add(
    HttpApiEndpoint.get("headerTest", "/bar")
      .addSuccess(S.Struct({ foo: S.NonEmptyString }))
      .setHeaders(S.Struct({ "client-id": S.NonEmptyString })),
  ) {}

export class SimpleApi extends HttpApi.empty.add(SimpleApiGroup).middleware(Authorization) {}

const SimpleApiGroupLive = HttpApiBuilder.group(SimpleApi, "root", (handlers) =>
  Effect.gen(function* () {
    return handlers
      .handle("get", () => Effect.succeed({ foo: "bar" as const }))
      .handle("getId", ({ path }) => Effect.succeed({ foo: path.fooId }))
      .handle("post", ({ payload }) => Effect.succeed({ foo: payload.bar }))
      .handle("headerTest", ({ headers }) => Effect.succeed({ foo: headers["client-id"] }));
  }),
);

export const SimpleApiLive = HttpApiBuilder.api(SimpleApi).pipe(
  Layer.provide([SimpleApiGroupLive, AuthorizationLive]),
);

export const SimpleApiWithoutMiddleware = HttpApiBuilder.api(SimpleApi).pipe(
  Layer.provide(SimpleApiGroupLive),
);
