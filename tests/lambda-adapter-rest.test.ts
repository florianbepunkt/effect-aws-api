import { Authorization, Unauthorized } from "./middleware.js";
import { createApiGatewayEvent, createLambdaContext } from "./aws-event-mock/mock-api-gateway-event.js";
import { describe, expect, it } from "vitest";
import { Effect, Layer } from "effect";
import { makeApiLambda, RawLambdaInput } from "../src/lambda-adapter-rest.js";
import { SimpleApiLive, SimpleApiWithoutMiddleware } from "./api-simple.js";

describe("LambdaAdapter", async () => {
  it("Should process get request", async () => {
    const handler = makeApiLambda(SimpleApiLive);
    const event = createApiGatewayEvent({ path: "/" });
    const context = createLambdaContext();
    const resp = await handler(event, context);
    expect(resp).toStrictEqual({
      body: '{"foo":"bar"}',
      headers: {
        "content-length": "13",
        "content-type": "application/json",
      },
      isBase64Encoded: false,
      statusCode: 200,
    });
  });

  it("Should process post request", async () => {
    const handler = makeApiLambda(SimpleApiLive);
    const event = createApiGatewayEvent({
      path: "/foo",
      httpMethod: "POST",
      body: JSON.stringify({ bar: "bar2" }),
    });
    const context = createLambdaContext();
    const resp = await handler(event, context);

    expect(resp).toStrictEqual({
      body: '{"foo":"bar2"}',
      headers: {
        "content-length": "14",
        "content-type": "application/json",
      },
      isBase64Encoded: false,
      statusCode: 200,
    });
  });

  it("Should validate headers", async () => {
    const handler = makeApiLambda(SimpleApiLive);
    const event = createApiGatewayEvent({
      path: "/bar",
      httpMethod: "GET",
    });
    const context = createLambdaContext();
    const resp = await handler(event, context);
    expect(resp.statusCode).toBe(400);
  });

  it("Should pass on headers", async () => {
    const handler = makeApiLambda(SimpleApiLive);
    const event = createApiGatewayEvent({
      path: "/bar",
      httpMethod: "GET",
      headers: { "client-id": "test" },
    });
    const context = createLambdaContext();
    const resp = await handler(event, context);

    expect(resp).toStrictEqual({
      body: '{"foo":"test"}',
      headers: {
        "content-length": "14",
        "content-type": "application/json",
      },
      isBase64Encoded: false,
      statusCode: 200,
    });
  });

  it("Should validate path parameters", async () => {
    const handler = makeApiLambda(SimpleApiLive);
    const event = createApiGatewayEvent({ path: "/foobar/foobarId" });
    const context = createLambdaContext();
    const resp = await handler(event, context);
    expect(resp).toStrictEqual({
      body: '{"foo":"foobarId"}',
      headers: {
        "content-length": "18",
        "content-type": "application/json",
      },
      isBase64Encoded: false,
      statusCode: 200,
    });
  });

  it("Should use authorization middleware", async () => {
    const AuthorizationLive = Layer.effect(
      Authorization,
      Effect.gen(function* () {
        const { event } = yield* RawLambdaInput;
        const authorize = Effect.gen(function* () {
          if (!event.requestContext.authorizer?.foo) return yield* new Unauthorized();
          return {
            accountId: "",
            tenantId: "",
          };
        });

        return Authorization.of(authorize);
      }),
    );

    const handler = makeApiLambda(SimpleApiWithoutMiddleware.pipe(Layer.provide(AuthorizationLive)));
    const event = createApiGatewayEvent({ path: "/" });
    const context = createLambdaContext();
    const resp = await handler(event, context);
    expect(resp.statusCode).toBe(401);

    const event2 = createApiGatewayEvent({ path: "/", requestContext: { authorizer: { foo: "bar" } } });
    const context2 = createLambdaContext();
    const resp2 = await handler(event2, context2);
    expect(resp2.statusCode).toBe(200);
  });

  it.skip("Should handle non-existing routes", async () => {
    const handler = makeApiLambda(SimpleApiLive);
    const event = createApiGatewayEvent({ path: "/non-existing" });
    const context = createLambdaContext();
    const resp = await handler(event, context);
    expect(resp).toStrictEqual({
      body: '{"foo":"bar"}',
      headers: {
        "content-length": "13",
        "content-type": "application/json",
      },
      isBase64Encoded: false,
      statusCode: 200,
    });
  });
});
