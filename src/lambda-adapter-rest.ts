import { Context, Effect, identity, Layer, pipe, Runtime } from "effect";
import {
  HttpApi,
  HttpApiBuilder,
  HttpMiddleware,
  HttpServer,
  HttpServerRequest,
  HttpServerResponse,
} from "@effect/platform";
import { Handler, fromLayer } from "@effect-aws/lambda";
import type {
  APIGatewayProxyEvent,
  APIGatewayProxyHandler,
  APIGatewayProxyResult,
  Context as LambdaContext,
} from "aws-lambda";

export class RawLambdaInput extends Context.Tag("@effect-aws/api-lambda/raw-input")<
  RawLambdaInput,
  { context: LambdaContext; event: APIGatewayProxyEvent }
>() {}

export const makeApiLambdaWithMiddleware = (middleware?: HttpMiddleware.HttpMiddleware) => {
  function makeApiLambda<E>(
    apiLayer: Layer.Layer<HttpApi.Api, E, never | RawLambdaInput>,
  ): Handler<APIGatewayProxyEvent, APIGatewayProxyResult>;
  function makeApiLambda<R, E1, E2>(
    apiLayer: Layer.Layer<HttpApi.Api, E1, R>,
    globalLayer: Layer.Layer<Exclude<R, RawLambdaInput>, E2>,
  ): Handler<APIGatewayProxyEvent, APIGatewayProxyResult>;
  function makeApiLambda<R, E1, E2>(
    apiLayer: Layer.Layer<HttpApi.Api, E1, R>,
    globalLayer?: Layer.Layer<Exclude<R, RawLambdaInput>, E2>,
  ): APIGatewayProxyHandler {
    const app = HttpApiBuilder.httpApp.pipe(
      Effect.flatten,
      middleware ?? identity,
      Effect.catchAllCause((cause) => {
        return HttpServerResponse.text(cause.toString(), { status: 500 });
      }),
    );

    // dependencies
    const HttpLayer = HttpServer.layerContext.pipe(
      Layer.merge(HttpApiBuilder.Router.Live),
      Layer.merge(HttpApiBuilder.Middleware.layer),
    );

    // TODO: I would like to merge HttpLayer into the given runtime and/or default runtime, but compiler errors, no idea why
    const globalRuntime = globalLayer
      ? fromLayer(globalLayer)
      : Promise.resolve(Runtime.defaultRuntime as Runtime.Runtime<R>);

    return async (event, context) => {
      const runPromise = Runtime.runPromise(await globalRuntime);
      const request = pipe(event, restEventToNativeRequest, HttpServerRequest.fromWeb);

      return app.pipe(
        Effect.provide([apiLayer, HttpLayer]), // TODO: See above, move HttpLayer to layer/runtime
        Effect.provideService(HttpServerRequest.HttpServerRequest, request),
        Effect.provideService(RawLambdaInput, { context, event }),
        Effect.map(HttpServerResponse.toWeb),
        Effect.flatMap((response) => Effect.promise(() => fromNativeResponse(response))),
        runPromise,
      );
    };
  }

  return makeApiLambda;
};

export const makeApiLambda = makeApiLambdaWithMiddleware();

const restEventToNativeRequest = (event: APIGatewayProxyEvent): Request => {
  const { httpMethod, headers, body, path, queryStringParameters } = event;

  // Construct the URL
  const protocol = headers?.["X-Forwarded-Proto"] || "https";
  const host = headers?.["Host"] || "localhost/";
  const queryString = new URLSearchParams(
    (queryStringParameters as Record<string, string>) || {},
  ).toString();

  const url = `${protocol}://${host}${path}${queryString ? `?${queryString}` : ""}`;

  // Map headers to Headers object
  const requestHeaders = new Headers();
  for (const [key, value] of Object.entries(headers || {})) {
    if (value) {
      requestHeaders.append(key, value);
    }
  }

  // Return the Request object
  return new Request(url, {
    method: httpMethod,
    headers: requestHeaders,
    body: body || null,
  });
};

const fromNativeResponse = async (response: Response): Promise<APIGatewayProxyResult> => {
  const headers: { [header: string]: string } = {};

  response.headers.forEach((value, key) => {
    headers[key] = value;
  });

  const body = await response.text();

  return {
    statusCode: response.status,
    headers,
    body: body || "",
    isBase64Encoded: false, // Assume the body is not Base64 encoded by default
  };
};
